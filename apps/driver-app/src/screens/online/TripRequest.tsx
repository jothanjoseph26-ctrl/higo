import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTripStore } from '../../stores/tripStore';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { promptAndRecordVoice } from '../../services/voice';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'TripRequest'>;

export function TripRequest({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useDriverAuthStore();
  const { incomingRequest, countdown, acceptTrip, declineTrip } = useTripStore();

  useEffect(() => {
    if (!incomingRequest) {
      navigation.navigate('Tab');
    }
  }, [incomingRequest, navigation]);

  if (!incomingRequest) return null;

  const handleVoiceConfirm = async () => {
    const lang = user?.preferredLanguage || 'en';
    const intent = await promptAndRecordVoice(lang);
    if (intent === 'accept') {
      await acceptTrip(incomingRequest.tripId);
      navigation.navigate('Navigation');
    } else if (intent === 'decline') {
      await declineTrip(incomingRequest.tripId, 'manual');
      navigation.navigate('Tab');
    } else {
      Alert.alert('Voice Command Unclear', 'Say YES to accept or NO to decline.');
    }
  };

  const handleAccept = async () => {
    await acceptTrip(incomingRequest.tripId);
    navigation.navigate('Navigation');
  };

  const handleDecline = async () => {
    await declineTrip(incomingRequest.tripId, 'manual');
    navigation.navigate('Tab');
  };

  const fareNaira = (incomingRequest.fare / 100).toFixed(2);

  return (
    <ScreenShell title="New Trip Request" subtitle="Incoming ride match request">
      <View style={styles.card}>
        <View style={styles.ringContainer}>
          <Text style={styles.countdown}>{countdown}</Text>
          <Text style={styles.seconds}>seconds left</Text>
        </View>

        <View style={styles.details}>
          <Text style={styles.label}>Passenger</Text>
          <Text style={styles.value}>{incomingRequest.passengerName || 'Anonymous'}</Text>
          <Text style={styles.subValue}>Rating: ⭐ {incomingRequest.passengerRating.toFixed(1)}</Text>

          <View style={styles.divider} />

          <Text style={styles.label}>Fare</Text>
          <Text style={styles.fare}>NGN {fareNaira}</Text>
          {incomingRequest.surgeMultiplier > 1 && (
            <Text style={styles.surge}>Surge: {incomingRequest.surgeMultiplier}x</Text>
          )}

          <View style={styles.divider} />

          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.value}>{incomingRequest.pickupAddress}</Text>

          <Text style={styles.label}>Destination</Text>
          <Text style={styles.value}>{incomingRequest.destinationAddress}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Accept Offer" onPress={handleAccept} />
        <Button label="Decline Offer" onPress={handleDecline} variant="secondary" />
        <Button
          label="🎙️ Confirm by Voice"
          onPress={handleVoiceConfirm}
          variant="outline"
          style={styles.voiceBtn}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadow.sm,
  },
  ringContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 6,
    borderColor: theme.colors.accentOrange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  countdown: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  seconds: {
    fontSize: 10,
    color: '#6B7280',
  },
  details: {
    width: '100%',
  },
  label: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginTop: theme.spacing.xs,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.xs,
  },
  subValue: {
    fontSize: 13,
    color: '#4B5563',
  },
  fare: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
  },
  surge: {
    fontSize: 12,
    color: theme.colors.accentOrange,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: theme.spacing.sm,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  voiceBtn: {
    borderColor: theme.colors.primaryGreen,
  },
});
