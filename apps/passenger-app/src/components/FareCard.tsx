import React from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { theme } from '../theme';
import { VehicleType } from '@higo/shared-types';

interface FareOption {
  type: VehicleType;
  name: string;
  emoji: string;
  etaMin: number;
}

interface FareCardProps {
  baseFare: number; // in kobo
  selectedType: VehicleType;
  onSelectType: (type: VehicleType) => void;
  isShared: boolean;
  onToggleShared: (shared: boolean) => void;
}

const OPTIONS: FareOption[] = [
  { type: VehicleType.KEKE, name: 'HiGo Keke', emoji: '🛺', etaMin: 3 },
  { type: VehicleType.CAR, name: 'HiGo Car', emoji: '🚗', etaMin: 5 },
  { type: VehicleType.BIKE, name: 'HiGo Bike', emoji: '🏍️', etaMin: 2 },
];

export function FareCard({
  baseFare,
  selectedType,
  onSelectType,
  isShared,
  onToggleShared,
}: FareCardProps) {
  
  const calculateFare = (type: VehicleType, shared: boolean) => {
    let multiplier = 1.0;
    if (type === VehicleType.CAR) multiplier = 1.8;
    if (type === VehicleType.BIKE) multiplier = 0.8;
    if (shared) multiplier *= 0.7; // 30% discount for shared
    
    const fareInNaira = (baseFare * multiplier) / 100;
    return `₦${fareInNaira.toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Available Rides</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {OPTIONS.map((opt) => {
          const isSelected = selectedType === opt.type;
          return (
            <Pressable
              key={opt.type}
              onPress={() => onSelectType(opt.type)}
              style={[styles.card, isSelected && styles.selectedCard]}
            >
              <Text style={styles.emoji}>{opt.emoji}</Text>
              <Text style={[styles.name, isSelected && styles.selectedText]}>{opt.name}</Text>
              <Text style={styles.eta}>{opt.etaMin} mins away</Text>
              <Text style={[styles.price, isSelected && styles.selectedPrice]}>
                {calculateFare(opt.type, opt.type === VehicleType.KEKE ? isShared : false)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedType === VehicleType.KEKE && (
        <Pressable
          onPress={() => onToggleShared(!isShared)}
          style={[styles.sharedRow, isShared && styles.sharedActive]}
        >
          <View style={styles.sharedContent}>
            <Text style={[styles.sharedTitle, isShared && styles.sharedActiveText]}>
              👥 Shared Keke Ride
            </Text>
            <Text style={styles.sharedSubtitle}>
              Share ride with others going your direction for 30% discount.
            </Text>
          </View>
          <View style={[styles.checkbox, isShared && styles.checkboxChecked]} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.md,
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  list: {
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  card: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
    width: 110,
    backgroundColor: '#fff',
  },
  selectedCard: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: 'rgba(11, 110, 79, 0.05)',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.dark,
  },
  selectedText: {
    color: theme.colors.primaryGreen,
  },
  eta: {
    fontSize: 11,
    color: '#6B7280',
    marginVertical: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  selectedPrice: {
    color: theme.colors.primaryGreen,
  },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: theme.spacing.md,
    backgroundColor: '#F9FAFB',
  },
  sharedActive: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: 'rgba(11, 110, 79, 0.05)',
  },
  sharedContent: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  sharedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: 2,
  },
  sharedActiveText: {
    color: theme.colors.primaryGreen,
  },
  sharedSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  checkboxChecked: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: theme.colors.primaryGreen,
  },
});
