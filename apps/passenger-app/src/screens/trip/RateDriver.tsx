import React, { useState } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { RatingStars } from '../../components/RatingStars';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { api } from '../../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RateDriver'>;

export function RateDriver({ navigation }: Props) {
  const { t } = useTranslation();
  const { currentTrip, clearTripState } = useTripStore();
  
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!currentTrip) {
      clearTripState();
      navigation.replace('Main', { screen: 'HomeTab' });
      return;
    }

    setSubmitting(true);
    try {
      await api.rateDriver(currentTrip.id, { rating, comment });
      Alert.alert('Thank You!', 'Your rating has been recorded successfully.', [
        {
          text: 'Proceed to Home',
          onPress: () => {
            clearTripState();
            navigation.replace('Main', { screen: 'HomeTab' });
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('Submission Failed', e.message || 'Unable to record rating.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell title={t('trip.rateTitle')} subtitle={t('trip.rateSubtitle')} scroll={false}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🛺</Text>
        <RatingStars
          rating={rating}
          onRatingChange={setRating}
          size={40}
        />

        <Input
          placeholder={t('trip.commentPlaceholder')}
          value={comment}
          onChangeText={setComment}
          multiline={true}
          style={styles.commentInput}
          editable={!submitting}
        />

        <Button
          label={t('trip.submitRating')}
          onPress={handleSubmit}
          loading={submitting}
          style={styles.submitBtn}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emoji: {
    fontSize: 64,
    marginBottom: theme.spacing.lg,
  },
  commentInput: {
    height: 100,
    textAlignVertical: 'top',
    marginTop: theme.spacing.lg,
    width: '100%',
  },
  submitBtn: {
    marginTop: theme.spacing.lg,
    width: '100%',
  },
});
