import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { TriviaCard, TriviaQuestion } from '../../components/TriviaCard';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';

export function NaijaTrivia() {
  const { t } = useTranslation();
  const { triviaPoints, addTriviaPoints, hydrateTriviaPoints } = useTripStore();
  
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    void hydrateTriviaPoints();

    try {
      const allQuestions = require('../../assets/trivia/naija-trivia.json') as TriviaQuestion[];
      const shuffled = [...allQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setQuestions(shuffled);
    } catch (e) {
      console.warn('Failed to load trivia questions', e);
    }
  }, [hydrateTriviaPoints]);

  const handleAnswer = async (correct: boolean) => {
    if (correct) {
      await addTriviaPoints(5);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setCurrentIdx(0);
    }
  };

  return (
    <ScreenShell title={t('trip.triviaTitle')} subtitle={`Total Points accumulated: ${triviaPoints} pts`} scroll={true}>
      {questions.length > 0 && (
        <TriviaCard
          question={questions[currentIdx]}
          onAnswer={handleAnswer}
          onNext={handleNext}
        />
      )}
    </ScreenShell>
  );
}
export default NaijaTrivia;
