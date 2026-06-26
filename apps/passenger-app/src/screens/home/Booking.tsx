import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, FlatList, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { useLocationStore } from '../../stores/locationStore';
import { api } from '../../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Booking'>;

interface PlaceSuggestion {
  description: string;
  placeId?: string;
  lat?: number;
  lng?: number;
}

const LOCAL_SUGGESTIONS: PlaceSuggestion[] = [
  { description: 'Federal Secretariat, Central Business District, Abuja', lat: 9.0631, lng: 7.4913 },
  { description: 'Transcorp Hilton, Maitama, Abuja', lat: 9.0772, lng: 7.4936 },
  { description: 'Wuse Market, Wuse II, Abuja', lat: 9.0694, lng: 7.4647 },
  { description: 'Garki Mall, Garki Area 11, Abuja', lat: 9.0345, lng: 7.4859 },
  { description: 'Nnamdi Azikiwe International Airport, Abuja', lat: 9.0067, lng: 7.2631 },
  { description: 'Jabi Lake Mall, Jabi, Abuja', lat: 9.0792, lng: 7.4206 },
  { description: 'Aso Rock Presidential Villa, Abuja', lat: 9.0673, lng: 7.5312 },
];

const AUTOCOMPLETE_DEBOUNCE_MS = 350;

function isMapsMock(): boolean {
  if (Platform.OS === 'web') return true;
  return process.env.EXPO_PUBLIC_MAPS_MOCK === 'true';
}

function filterLocalSuggestions(text: string): PlaceSuggestion[] {
  if (text.trim() === '') {
    return LOCAL_SUGGESTIONS;
  }
  return LOCAL_SUGGESTIONS.filter((item) =>
    item.description.toLowerCase().includes(text.toLowerCase()),
  );
}

export function Booking({ navigation }: Props) {
  const { t } = useTranslation();
  const { userLocation } = useLocationStore();
  const { setPickup, setDestination, pickup, destination } = useTripStore();

  const [pickupText, setPickupText] = useState(pickup?.address || 'Current Location');
  const [destText, setDestText] = useState(destination?.address || '');
  const [activeField, setActiveField] = useState<'pickup' | 'destination'>('destination');
  const [filteredSuggestions, setFilteredSuggestions] = useState<PlaceSuggestion[]>(LOCAL_SUGGESTIONS);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const activeText = activeField === 'pickup' ? pickupText : destText;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (isMapsMock()) {
      setFilteredSuggestions(filterLocalSuggestions(activeText));
      setIsSearching(false);
      return;
    }

    const trimmed = activeText.trim();
    if (trimmed.length < 2) {
      setFilteredSuggestions(LOCAL_SUGGESTIONS);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const requestId = ++requestIdRef.current;

    debounceRef.current = setTimeout(() => {
      void api
        .placesAutocomplete(trimmed)
        .then((result) => {
          if (requestId !== requestIdRef.current) return;
          setFilteredSuggestions(
            result.suggestions.length > 0
              ? result.suggestions.map((suggestion) => ({
                  description: suggestion.description,
                  placeId: suggestion.placeId,
                }))
              : filterLocalSuggestions(trimmed),
          );
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setFilteredSuggestions(filterLocalSuggestions(trimmed));
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setIsSearching(false);
          }
        });
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [activeText]);

  const handleTextChange = (text: string, field: 'pickup' | 'destination') => {
    if (field === 'pickup') {
      setPickupText(text);
    } else {
      setDestText(text);
    }
    setActiveField(field);
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    let lat = suggestion.lat;
    let lng = suggestion.lng;
    let address = suggestion.description;

    if (!isMapsMock() && suggestion.placeId) {
      try {
        const details = await api.placesDetails(suggestion.placeId);
        lat = details.lat;
        lng = details.lng;
        address = details.description;
      } catch {
        Alert.alert('Error', 'Unable to resolve that place. Please try another.');
        return;
      }
    }

    if (lat == null || lng == null) {
      Alert.alert('Error', 'Unable to resolve that place. Please try another.');
      return;
    }

    const latlng = { lat, lng, address };
    if (activeField === 'pickup') {
      setPickup(latlng);
      setPickupText(address);
    } else {
      setDestination(latlng);
      setDestText(address);
    }
  };

  const handleProceed = () => {
    if (!pickup) {
      if (userLocation) {
        setPickup({
          lat: userLocation.lat,
          lng: userLocation.lng,
          address: 'Current Location (GPS)',
        });
      } else {
        Alert.alert('Error', 'Unable to determine current location. Please select a pickup location.');
        return;
      }
    }

    if (!destination && destText.trim() === '') {
      Alert.alert('Error', 'Please select a destination.');
      return;
    }

    if (!destination) {
      const fallback = LOCAL_SUGGESTIONS[5];
      setDestination({
        lat: fallback.lat!,
        lng: fallback.lng!,
        address: fallback.description,
      });
    }

    navigation.navigate('RideOptions');
  };

  return (
    <ScreenShell title="Book a Ride" scroll={false}>
      <View style={styles.inputCard}>
        <Input
          label={t('booking.pickupLabel')}
          placeholder={t('booking.pickupPlaceholder')}
          value={pickupText}
          onChangeText={(text) => handleTextChange(text, 'pickup')}
          onFocus={() => setActiveField('pickup')}
        />
        <Input
          label={t('booking.destLabel')}
          placeholder={t('booking.destPlaceholder')}
          value={destText}
          onChangeText={(text) => handleTextChange(text, 'destination')}
          onFocus={() => setActiveField('destination')}
          autoFocus={true}
        />
      </View>

      <Text style={styles.suggestionsHeader}>
        {isSearching ? 'Searching places…' : 'Place suggestions'}
      </Text>

      <FlatList
        data={filteredSuggestions}
        keyExtractor={(item) => item.placeId ?? item.description}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void handleSelectSuggestion(item)}
            style={styles.suggestionRow}
          >
            <Text style={styles.suggestionIcon}>📍</Text>
            <Text style={styles.suggestionText}>{item.description}</Text>
          </Pressable>
        )}
        style={styles.list}
      />

      <Button
        label={t('common.continue')}
        onPress={handleProceed}
        style={styles.proceedBtn}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  inputCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
    marginBottom: theme.spacing.md,
  },
  suggestionsHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: theme.spacing.sm,
  },
  list: {
    flex: 1,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionIcon: {
    fontSize: 16,
    marginRight: theme.spacing.sm,
  },
  suggestionText: {
    fontSize: 15,
    color: theme.colors.dark,
    flex: 1,
  },
  proceedBtn: {
    marginTop: theme.spacing.md,
    marginBottom: 20,
  },
});