import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SavedPlace, SavedPlaceLabel } from '@higo/shared-types';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { getSavedPlaces, setSavedPlaces } from '../../services/api';
import { api } from '../../services/api';

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
];

const PLACE_CONFIG: Array<{ label: SavedPlaceLabel; title: string; icon: string }> = [
  { label: 'home', title: 'Home', icon: '🏠' },
  { label: 'work', title: 'Work', icon: '💼' },
];

const AUTOCOMPLETE_DEBOUNCE_MS = 350;

function isMapsMock(): boolean {
  if (Platform.OS === 'web') return true;
  return process.env.EXPO_PUBLIC_MAPS_MOCK === 'true';
}

function filterLocalSuggestions(text: string): PlaceSuggestion[] {
  if (text.trim() === '') return LOCAL_SUGGESTIONS;
  return LOCAL_SUGGESTIONS.filter((item) =>
    item.description.toLowerCase().includes(text.toLowerCase()),
  );
}

function placeForLabel(places: SavedPlace[], label: SavedPlaceLabel): SavedPlace | undefined {
  return places.find((p) => p.label === label);
}

export function SavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLabel, setActiveLabel] = useState<SavedPlaceLabel | null>(null);
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>(LOCAL_SUGGESTIONS);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSavedPlaces();
      setPlaces(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unable to load saved places.';
      Alert.alert('Load Failed', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  useEffect(() => {
    if (!activeLabel) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (isMapsMock()) {
      setSuggestions(filterLocalSuggestions(searchText));
      setIsSearching(false);
      return;
    }

    const trimmed = searchText.trim();
    if (trimmed.length < 2) {
      setSuggestions(LOCAL_SUGGESTIONS);
      setIsSearching(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsSearching(true);

    debounceRef.current = setTimeout(() => {
      void api
        .placesAutocomplete(trimmed)
        .then((result) => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions(
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
          setSuggestions(filterLocalSuggestions(trimmed));
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
  }, [activeLabel, searchText]);

  const openEditor = (label: SavedPlaceLabel) => {
    const existing = placeForLabel(places, label);
    setActiveLabel(label);
    setSearchText(existing?.address ?? '');
    setSuggestions(LOCAL_SUGGESTIONS);
  };

  const closeEditor = () => {
    setActiveLabel(null);
    setSearchText('');
    setSuggestions(LOCAL_SUGGESTIONS);
  };

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    if (!activeLabel) return;

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
      Alert.alert('Invalid place', 'Please pick a suggestion with a valid location.');
      return;
    }

    const next: SavedPlace = {
      label: activeLabel,
      address,
      lat,
      lng,
    };

    setPlaces((prev) => {
      const filtered = prev.filter((p) => p.label !== activeLabel);
      return [...filtered, next];
    });
    closeEditor();
  };

  const clearPlace = (label: SavedPlaceLabel) => {
    setPlaces((prev) => prev.filter((p) => p.label !== label));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await setSavedPlaces(places);
      setPlaces(saved);
      Alert.alert('Saved', 'Your home and work places were updated.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unable to save places.';
      Alert.alert('Save Failed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell
      title="Saved Places"
      subtitle="Set home and work for faster bookings"
      scroll={!activeLabel}
    >
      {PLACE_CONFIG.map((config) => {
        const saved = placeForLabel(places, config.label);
        return (
          <View key={config.label} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>{config.icon}</Text>
              <View style={styles.cardDetails}>
                <Text style={styles.cardTitle}>{config.title}</Text>
                <Text style={styles.cardAddress}>
                  {saved?.address ?? 'Not set — tap Edit to add'}
                </Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <Button
                label="Edit"
                onPress={() => openEditor(config.label)}
                variant="outline"
                style={styles.smallBtn}
              />
              {saved ? (
                <Button
                  label="Clear"
                  onPress={() => clearPlace(config.label)}
                  variant="outline"
                  style={styles.smallBtn}
                />
              ) : null}
            </View>
          </View>
        );
      })}

      {activeLabel ? (
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>
            Set {activeLabel === 'home' ? 'Home' : 'Work'} address
          </Text>
          <Input
            label="Search address"
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Start typing an address..."
          />
          {isSearching ? <Text style={styles.searching}>Searching...</Text> : null}
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.description}
            keyboardShouldPersistTaps="handled"
            style={styles.suggestionList}
            renderItem={({ item }) => (
              <Pressable style={styles.suggestion} onPress={() => void selectSuggestion(item)}>
                <Text style={styles.suggestionText}>{item.description}</Text>
              </Pressable>
            )}
          />
          <Button label="Cancel" onPress={closeEditor} variant="outline" />
        </View>
      ) : (
        <Button
          label="Save Places"
          onPress={() => void handleSave()}
          loading={saving || loading}
          style={styles.saveBtn}
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  cardIcon: {
    fontSize: 28,
    marginRight: theme.spacing.md,
  },
  cardDetails: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  cardAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  smallBtn: {
    flex: 1,
  },
  editor: {
    marginTop: theme.spacing.md,
    marginBottom: 40,
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  searching: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: theme.spacing.sm,
  },
  suggestionList: {
    maxHeight: 220,
    marginBottom: theme.spacing.md,
  },
  suggestion: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.input,
    padding: theme.spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  suggestionText: {
    fontSize: 14,
    color: theme.colors.darkNavy,
  },
  saveBtn: {
    marginTop: theme.spacing.md,
    marginBottom: 40,
  },
});

export default SavedPlaces;