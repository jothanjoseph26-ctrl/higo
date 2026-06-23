import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Alert, Pressable } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../../components/Button';
import { enqueueJob } from '../../services/jobQueue';
import { theme } from '../../theme';

interface Course {
  id: string;
  title: string;
  videoUrl: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

const COURSES: Course[] = [
  {
    id: 'course_safety',
    title: 'Module 1: Driver Safety Standards',
    videoUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    question: 'What is the maximum allowed speed limit inside residential estates?',
    options: ['A. 50 km/h', 'B. 30 km/h', 'C. 20 km/h'],
    correctAnswerIndex: 2, // C
  },
  {
    id: 'course_customer',
    title: 'Module 2: Customer Hospitality in Pidgin',
    videoUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    question: 'How you suppose greet passenger when dey enter your Keke/Car?',
    options: ['A. Say nothing, just drive', 'B. Greet dem politely (e.g. Welcome to HiGo)', 'C. Ask dem for money first'],
    correctAnswerIndex: 1, // B
  },
];

export function TrainingModule() {
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const videoRef = useRef<Video | null>(null);

  useEffect(() => {
    void loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      const raw = await AsyncStorage.getItem('@higo/driver/training_completed');
      if (raw) {
        setCompletedCourses(JSON.parse(raw) as string[]);
      }
    } catch {}
  };

  const handleVideoPlaybackUpdate = (status: any) => {
    if (status.didJustFinish) {
      // Video completed, trigger quiz
      setShowQuiz(true);
    }
  };

  const handleSubmitQuiz = async () => {
    if (selectedOption === null || !activeCourse) return;

    if (selectedOption === activeCourse.correctAnswerIndex) {
      Alert.alert('Correct Answer!', 'You have completed this training module.', [
        {
          text: 'OK',
          onPress: async () => {
            const next = [...completedCourses, activeCourse.id];
            setCompletedCourses(next);
            await AsyncStorage.setItem('@higo/driver/training_completed', JSON.stringify(next));

            // Sync training progress in job queue
            await enqueueJob('training_progress', {
              courseId: activeCourse.id,
              completedAt: new Date().toISOString(),
            });

            // Reset
            setActiveCourse(null);
            setShowQuiz(false);
            setSelectedOption(null);
          },
        },
      ]);
    } else {
      Alert.alert('Wrong Answer', 'Please review the video and try again.');
      setSelectedOption(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Safety Training</Text>

      {/* Active Course / Video Player */}
      {activeCourse ? (
        <View style={styles.activeWrap}>
          <Text style={styles.activeTitle}>{activeCourse.title}</Text>
          {!showQuiz ? (
            <Video
              ref={videoRef}
              source={{ uri: activeCourse.videoUrl }}
              style={styles.videoPlayer}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              onPlaybackStatusUpdate={handleVideoPlaybackUpdate}
            />
          ) : (
            <View style={styles.quizCard}>
              <Text style={styles.quizHeader}>Module Assessment</Text>
              <Text style={styles.questionText}>{activeCourse.question}</Text>
              <View style={styles.optionsWrap}>
                {activeCourse.options.map((opt, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => setSelectedOption(idx)}
                    style={[
                      styles.optionBtn,
                      selectedOption === idx && styles.selectedOptionBtn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selectedOption === idx && styles.selectedOptionText,
                      ]}
                    >
                      {opt}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Button
                label="Submit Answer"
                onPress={handleSubmitQuiz}
                disabled={selectedOption === null}
                style={styles.submitBtn}
              />
            </View>
          )}
          <Button
            label="Cancel Training"
            onPress={() => {
              setActiveCourse(null);
              setShowQuiz(false);
              setSelectedOption(null);
            }}
            variant="secondary"
            style={styles.cancelBtn}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {COURSES.map((course) => {
            const isCompleted = completedCourses.includes(course.id);
            return (
              <View key={course.id} style={styles.courseCard}>
                <View style={styles.courseHeader}>
                  <Text style={styles.courseTitle}>{course.title}</Text>
                  {isCompleted && <Text style={styles.completedBadge}>✓ COMPLETED</Text>}
                </View>
                <Button
                  label={isCompleted ? 'Re-watch Video' : 'Start Module'}
                  onPress={() => {
                    setActiveCourse(course);
                    setShowQuiz(false);
                    setSelectedOption(null);
                  }}
                  variant={isCompleted ? 'outline' : 'primary'}
                />
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGrey,
  },
  content: {
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  activeWrap: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    ...theme.shadow.sm,
  },
  activeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  videoPlayer: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
    borderRadius: 8,
  },
  quizCard: {
    marginTop: theme.spacing.md,
  },
  quizHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.accentOrange,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  optionsWrap: {
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  optionBtn: {
    backgroundColor: '#F3F4F6',
    padding: theme.spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedOptionBtn: {
    backgroundColor: '#EEFBF3',
    borderColor: theme.colors.primaryGreen,
  },
  optionText: {
    fontSize: 14,
    color: theme.colors.darkNavy,
  },
  selectedOptionText: {
    color: theme.colors.primaryGreen,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: theme.spacing.sm,
  },
  cancelBtn: {
    marginTop: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.md,
  },
  courseCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    ...theme.shadow.sm,
  },
  courseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    flex: 1,
    marginRight: 8,
  },
  completedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
  },
});
