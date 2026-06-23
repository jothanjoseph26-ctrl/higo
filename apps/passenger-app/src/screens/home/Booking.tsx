import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, FlatList, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { useLocationStore } from '../../stores/locationStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Booking'>;

interface PlaceSuggestion {
  description: string;
  lat: number;
  lng: number;
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

export function Booking({ navigation }: Props) {
  const { t } = useTranslation();
  const { userLocation } = useLocationStore();
  const { setPickup, setDestination, pickup, destination } = useTripStore();

  const [pickupText, setPickupText] = useState(pickup?.address || 'Current Location');
  const [destText, setDestText] = useState(destination?.address || '');
  const [activeField, setActiveField] = useState<'pickup' | 'destination'>('destination');
  const [filteredSuggestions, setFilteredSuggestions] = useState<PlaceSuggestion[]>(LOCAL_SUGGESTIONS);

  const handleTextChange = (text: string, field: 'pickup' | 'destination') => {
    if (field === 'pickup') {
      setPickupText(text);
    } else {
      setDestText(text);
    }
    setActiveField(field);

    if (text.trim() === '') {
      setFilteredSuggestions(LOCAL_SUGGESTIONS);
    } else {
      const filtered = LOCAL_SUGGESTIONS.filter((item) =>
        item.description.toLowerCase().includes(text.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    }
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    const latlng = { lat: suggestion.lat, lng: suggestion.lng, address: suggestion.description };
    if (activeField === 'pickup') {
      setPickup(latlng);
      setPickupText(suggestion.description);
    } else {
      setDestination(latlng);
      setDestText(suggestion.description);
    }
  };

  const handleProceed = () => {
    // If pickup is Current Location and hasn't been set explicitly
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
      // Fallback: select the first match or default to Jabi Lake Mall
      const fallback = LOCAL_SUGGESTIONS[5];
      setDestination({
        lat: fallback.lat,
        lng: fallback.lng,
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

      <Text style={styles.suggestionsHeader}>Landmarks suggestions</Text>
      
      <FlatList
        data={filteredSuggestions}
        keyExtractor={(item) => item.description}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleSelectSuggestion(item)}
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
