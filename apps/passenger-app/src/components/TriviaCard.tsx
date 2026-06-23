import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { theme } from '../theme';

export interface TriviaQuestion {
  id: number;
  question: string;
  options: string[];
  answerIndex: number;
  category: string;
}

interface TriviaCardProps {
  question: TriviaQuestion;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}

export function TriviaCard({ question, onAnswer, onNext }: TriviaCardProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const handleSelect = (idx: number) => {
    if (answered) return;
    setSelectedIdx(idx);
    setAnswered(true);
    const correct = idx === question.answerIndex;
    onAnswer(correct);
  };

  const handleNext = () => {
    setSelectedIdx(null);
    setAnswered(false);
    onNext();
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.categoryBadge}>{question.category}</Text>
        <Text style={styles.pointsText}>+5 points per correct answer</Text>
      </View>

      <Text style={styles.questionText}>{question.question}</Text>

      <View style={styles.optionsContainer}>
        {question.options.map((option, idx) => {
          let optionStyle = styles.optionBtn;
          let textStyle = styles.optionText;

          if (answered) {
            if (idx === question.answerIndex) {
              optionStyle = [styles.optionBtn, styles.correctOption];
              textStyle = [styles.optionText, styles.correctText];
            } else if (idx === selectedIdx) {
              optionStyle = [styles.optionBtn, styles.incorrectOption];
              textStyle = [styles.optionText, styles.incorrectText];
            } else {
              optionStyle = [styles.optionBtn, styles.disabledOption];
            }
          }

          return (
            <Pressable
              key={idx}
              onPress={() => handleSelect(idx)}
              disabled={answered}
              style={optionStyle}
            >
              <Text style={textStyle}>{option}</Text>
            </Pressable>
          );
        })}
      </View>

      {answered && (
        <Pressable onPress={handleNext} style={styles.nextBtn}>
          <Text style={styles.nextText}>Next Trivia Question ➡️</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
    marginVertical: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  categoryBadge: {
    backgroundColor: 'rgba(255, 122, 0, 0.1)',
    color: theme.colors.accentOrange,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  pointsText: {
    fontSize: 12,
    color: theme.colors.primaryGreen,
    fontWeight: '600',
  },
  questionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  optionsContainer: {
    gap: 10,
  },
  optionBtn: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: theme.radius.input,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  optionText: {
    fontSize: 15,
    color: theme.colors.dark,
    fontWeight: '500',
  },
  correctOption: {
    borderColor: theme.colors.success,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
  },
  correctText: {
    color: theme.colors.success,
    fontWeight: '700',
  },
  incorrectOption: {
    borderColor: theme.colors.error,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  incorrectText: {
    color: theme.colors.error,
    fontWeight: '700',
  },
  disabledOption: {
    opacity: 0.6,
    backgroundColor: '#F3F4F6',
  },
  nextBtn: {
    backgroundColor: theme.colors.darkNavy,
    borderRadius: theme.radius.button,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  nextText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
