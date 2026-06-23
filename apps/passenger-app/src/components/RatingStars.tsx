import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { theme } from '../theme';

interface RatingStarsProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  size?: number;
  interactive?: boolean;
}

export function RatingStars({
  rating,
  onRatingChange,
  size = 32,
  interactive = true,
}: RatingStarsProps) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.container}>
      {stars.map((star) => {
        const isActive = star <= rating;
        return (
          <Pressable
            key={star}
            disabled={!interactive}
            onPress={() => onRatingChange?.(star)}
            style={styles.star}
          >
            <Text style={{ fontSize: size, color: isActive ? '#FFB000' : '#D1D5DB' }}>
              ★
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  star: {
    padding: 4,
  },
});
