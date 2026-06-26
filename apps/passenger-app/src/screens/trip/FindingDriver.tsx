import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { TriviaCard, TriviaQuestion } from '../../components/TriviaCard';
import { Button } from '../../components/Button';
import { CancellationFeeModal } from '../../components/CancellationFeeModal';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TripStatus } from '@higo/shared-types';

type Props = NativeStackScreenProps<RootStackParamList, 'FindingDriver'>;

export function FindingDriver({ navigation }: Props) {
  const { t } = useTranslation();
  const {
    currentTrip,
    status,
    pointsEarned,
    addTriviaPoints,
    cancelTrip,
    clearTripState,
    tripError,
    clearTripError,
  } = useTripStore();
  
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Load and shuffle questions on mount
  useEffect(() => {
    try {
      const allQuestions = require('../../assets/trivia/naija-trivia.json') as TriviaQuestion[];
      // Fisher-Yates Shuffle
      const shuffled = [...allQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setQuestions(shuffled);
    } catch (e) {
      console.warn('Failed to load trivia questions', e);
    }
  }, []);

  // Monitor trip status updates via socket subscription/state changes
  useEffect(() => {
    if (status === TripStatus.MATCHED) {
      navigation.replace('DriverEnRoute');
    }
  }, [status, navigation]);

  useEffect(() => {
    if (!status && tripError) {
      Alert.alert('No Drivers Found', tripError, [
        {
          text: 'Try Again',
          onPress: () => {
            clearTripError();
            clearTripState();
            navigation.navigate('Main', { screen: 'HomeTab' });
          },
        },
      ]);
    }
  }, [status, tripError, navigation, clearTripError, clearTripState]);

  const handleAnswer = async (correct: boolean) => {
    if (correct) {
      await addTriviaPoints(5);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // Re-shuffle if we reach the end
      const shuffled = [...questions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setQuestions(shuffled);
      setCurrentIdx(0);
    }
  };

  const handleCancelBooking = () => {
    if (!currentTrip) return;
    setShowCancelModal(true);
  };

  const confirmCancelBooking = async () => {
    try {
      setCancelling(true);
      await cancelTrip('Passenger cancelled during search');
      clearTripState();
      setShowCancelModal(false);
      navigation.navigate('Main', { screen: 'HomeTab' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unable to cancel trip.';
      Alert.alert('Cancellation Failed', message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ScreenShell title={t('booking.findingDriver')} scroll={true}>
      <View style={styles.searchingCard}>
        <ActivityIndicator size="large" color={theme.colors.accentOrange} />
        <Text style={styles.waitText}>Contacting nearest drivers. Please hold on...</Text>
        <Text style={styles.pointsLabel}>Earned this wait: +{pointsEarned} HiGo points</Text>
      </View>

      <Text style={styles.triviaHeader}>🧠 Play Naija Trivia while you wait</Text>

      {questions.length > 0 && (
        <TriviaCard
          question={questions[currentIdx]}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      )}

      <Button
        label="Cancel Request"
        onPress={handleCancelBooking}
        variant="outline"
        style={styles.cancelBtn}
      />

      <CancellationFeeModal
        visible={showCancelModal}
        onConfirm={() => void confirmCancelBooking()}
        onDismiss={() => setShowCancelModal(false)}
        loading={cancelling}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  searchingCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  waitText: {
    marginTop: theme.spacing.sm,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  pointsLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
  },
  triviaHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  cancelBtn: {
    marginTop: theme.spacing.md,
    borderColor: theme.colors.error,
    marginBottom: 40,
  },
});
