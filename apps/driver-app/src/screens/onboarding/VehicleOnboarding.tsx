import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { VehicleType } from '@higo/shared-types';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ScreenShell } from '../../components/ScreenShell';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'VehicleOnboarding'>;

const STEPS = ['plate', 'details', 'confirm'] as const;
type Step = (typeof STEPS)[number];

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: VehicleType.KEKE, label: 'Keke (Tricycle)' },
  { value: VehicleType.CAR, label: 'Car' },
  { value: VehicleType.BIKE, label: 'Bike' },
];

const CURRENT_YEAR = new Date().getFullYear();

export function VehicleOnboarding({ navigation }: Props) {
  const { t } = useTranslation();
  const { driver, updateVehicleProfile } = useDriverAuthStore();
  const [step, setStep] = useState<Step>('plate');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    driver?.vehicleType ?? VehicleType.KEKE,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);

  const validatePlate = (): boolean => {
    const plate = vehiclePlate.trim().toUpperCase();
    if (!plate || plate.length < 3) {
      setError('Enter a valid plate number');
      return false;
    }
    setError(null);
    return true;
  };

  const validateDetails = (): boolean => {
    if (!vehicleModel.trim()) {
      setError('Enter your vehicle model');
      return false;
    }
    if (!vehicleColor.trim()) {
      setError('Enter your vehicle color');
      return false;
    }
    const year = parseInt(vehicleYear, 10);
    if (!vehicleYear.trim() || Number.isNaN(year) || year < 1990 || year > CURRENT_YEAR + 1) {
      setError(`Enter a valid year (1990–${CURRENT_YEAR + 1})`);
      return false;
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    if (step === 'plate') {
      if (!validatePlate()) return;
      setStep('details');
      return;
    }
    if (step === 'details') {
      if (!validateDetails()) return;
      setStep('confirm');
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 'details') setStep('plate');
    else if (step === 'confirm') setStep('details');
  };

  const handleSubmit = async () => {
    if (!validatePlate() || !validateDetails()) return;

    setSubmitting(true);
    setError(null);

    try {
      await updateVehicleProfile({
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
        vehicleModel: vehicleModel.trim(),
        vehicleColor: vehicleColor.trim(),
        vehicleYear: parseInt(vehicleYear, 10),
        vehicleType,
      });
      navigation.reset({
        index: 0,
        routes: [{ name: 'Tab' }],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell
      title="Vehicle Details"
      subtitle="Tell us about your vehicle so passengers can identify you."
    >
      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              i <= stepIndex && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      {step === 'plate' ? (
        <View>
          <Text style={styles.stepTitle}>Step 1 — Plate Number</Text>
          <Input
            label="License Plate"
            placeholder="e.g. ABC-123-XY"
            value={vehiclePlate}
            onChangeText={setVehiclePlate}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      ) : null}

      {step === 'details' ? (
        <View>
          <Text style={styles.stepTitle}>Step 2 — Vehicle Info</Text>
          <Input
            label="Model"
            placeholder="e.g. Toyota Corolla"
            value={vehicleModel}
            onChangeText={setVehicleModel}
          />
          <Input
            label="Color"
            placeholder="e.g. White"
            value={vehicleColor}
            onChangeText={setVehicleColor}
          />
          <Input
            label="Year"
            placeholder={`e.g. ${CURRENT_YEAR}`}
            value={vehicleYear}
            onChangeText={setVehicleYear}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Text style={styles.fieldLabel}>Vehicle Type</Text>
          <View style={styles.typeRow}>
            {VEHICLE_TYPES.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setVehicleType(opt.value)}
                style={[
                  styles.typeChip,
                  vehicleType === opt.value && styles.typeChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    vehicleType === opt.value && styles.typeChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {step === 'confirm' ? (
        <View style={styles.summaryCard}>
          <Text style={styles.stepTitle}>Step 3 — Confirm</Text>
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Plate: </Text>
            {vehiclePlate.trim().toUpperCase()}
          </Text>
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Model: </Text>
            {vehicleModel.trim()}
          </Text>
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Color: </Text>
            {vehicleColor.trim()}
          </Text>
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Year: </Text>
            {vehicleYear}
          </Text>
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Type: </Text>
            {vehicleType.toUpperCase()}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {step !== 'plate' ? (
          <Button
            label="Back"
            onPress={handleBack}
            variant="outline"
            style={styles.backBtn}
          />
        ) : null}
        {step !== 'confirm' ? (
          <Button label="Continue" onPress={handleNext} style={styles.nextBtn} />
        ) : (
          <Button
            label="Save & Continue"
            onPress={() => void handleSubmit()}
            loading={submitting}
            style={styles.nextBtn}
          />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
  },
  progressDotActive: {
    backgroundColor: theme.colors.primaryGreen,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  typeRow: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  typeChip: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: theme.radius.button,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  typeChipActive: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: '#ECFDF3',
  },
  typeChipText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#4B5563',
  },
  typeChipTextActive: {
    color: theme.colors.primaryGreen,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  summaryLine: {
    fontSize: 15,
    color: theme.colors.darkNavy,
    marginBottom: 8,
  },
  summaryLabel: {
    fontWeight: '600',
    color: '#6B7280',
  },
  error: {
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  backBtn: {
    flex: 1,
  },
  nextBtn: {
    flex: 2,
  },
});