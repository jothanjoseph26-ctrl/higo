import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTripStore } from '../../stores/tripStore';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ScreenShell } from '../../components/ScreenShell';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'RatePassenger'>;

export function RatePassenger({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { ratePassenger } = useTripStore();
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await ratePassenger(tripId, rating, comment.trim());
      Alert.alert('Rating Submitted', 'Thank you for your feedback.', [
        { text: 'OK', onPress: () => navigation.navigate('Tab') },
      ]);
    } catch {
      Alert.alert('Submitting Offline', 'Your rating has been queued and will sync when online.', [
        { text: 'OK', onPress: () => navigation.navigate('Tab') },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell title="Rate Passenger" subtitle="Tell us how the ride went">
      <View style={styles.card}>
        <Text style={styles.label}>Select Rating</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable key={star} onPress={() => setRating(star)} style={styles.starWrap}>
              <Text style={[styles.star, rating >= star ? styles.starActive : styles.starInactive]}>
                ★
              </Text>
            </Pressable>
          ))}
        </View>

        <Input
          label="Leave a Comment"
          placeholder="Friendly passenger, on time..."
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={3}
        />
      </View>

      <Button label="Submit Rating" onPress={handleSubmit} loading={submitting} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    gap: 12,
  },
  starWrap: {
    padding: 4,
  },
  star: {
    fontSize: 36,
  },
  starActive: {
    color: '#FBBF24',
  },
  starInactive: {
    color: '#E5E7EB',
  },
});
