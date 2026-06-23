import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { TriviaCard, TriviaQuestion } from '../../components/TriviaCard';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { api } from '../../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TripStatus } from '@higo/shared-types';

type Props = NativeStackScreenProps<RootStackParamList, 'FindingDriver'>;

export function FindingDriver({ navigation }: Props) {
  const { t } = useTranslation();
  const { currentTrip, status, pointsEarned, addTriviaPoints, setStatus, setCurrentTrip } = useTripStore();
  
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

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

  const handleCancelBooking = async () => {
    if (!currentTrip) return;
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel this request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        onPress: async () => {
          try {
            await api.cancelTrip(currentTrip.id, { reason: 'Passenger cancelled during search' });
            setStatus(null);
            setCurrentTrip(null);
            navigation.navigate('Main', { screen: 'HomeTab' });
          } catch (e: any) {
            Alert.alert('Cancellation Failed', e.message || 'Unable to cancel trip.');
          }
        },
      },
    ]);
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
