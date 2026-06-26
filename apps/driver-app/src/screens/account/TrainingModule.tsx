import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, Alert, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../../components/Button';
import { enqueueJob } from '../../services/jobQueue';
import { theme } from '../../theme';

interface Course {
  id: string;
  title: string;
  icon: string;
  duration: string;
  content: string[];
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

const COURSES: Course[] = [
  {
    id: 'course_safety',
    title: 'Driver Safety Standards',
    icon: '🛡️',
    duration: '8 min',
    content: [
      'Always perform a pre-trip vehicle check: tyres, brakes, lights, and fuel level.',
      'Obey Abuja speed limits: 80 km/h on expressways, 50 km/h on major roads, 30 km/h in estates.',
      'Never use your phone while driving. Use hands-free voice commands for HiGo app actions.',
      'Wear your seatbelt and ensure passengers buckle up before moving.',
      'Report accidents or hazards immediately via the in-app SOS button.',
      'Take mandatory 15-minute breaks after every 4 hours of continuous driving.',
    ],
    question: 'What is the maximum allowed speed inside residential estates in Abuja?',
    options: ['A. 50 km/h', 'B. 30 km/h', 'C. 20 km/h'],
    correctAnswerIndex: 1,
  },
  {
    id: 'course_etiquette',
    title: 'Passenger Etiquette & Hospitality',
    icon: '🤝',
    duration: '6 min',
    content: [
      'Greet every passenger warmly: "Welcome to HiGo!" sets a positive tone.',
      'Confirm the destination before starting — repeat the address to avoid wrong turns.',
      'Keep the vehicle clean, odour-free, and at a comfortable temperature.',
      'Offer to help with luggage if the passenger needs assistance.',
      'Maintain polite conversation but respect passengers who prefer silence.',
      'Never ask for cash outside the app. All payments go through HiGo for your protection.',
      'If a passenger is unhappy, stay calm and offer to contact HiGo Support from the app.',
    ],
    question: 'How should you greet a passenger when they enter your vehicle?',
    options: [
      'A. Say nothing, just drive',
      'B. Greet them politely (e.g. "Welcome to HiGo")',
      'C. Ask for payment in cash first',
    ],
    correctAnswerIndex: 1,
  },
  {
    id: 'course_abuja_zones',
    title: 'Navigating Abuja Zones',
    icon: '🗺️',
    duration: '10 min',
    content: [
      'Central Business District (CBD): High demand 7–10 AM and 4–7 PM. Use Nnamdi Azikiwe Expressway access.',
      'Gwarinpa & Life Camp: Popular residential zones. Watch for school-run traffic 7–8 AM.',
      'Wuse & Maitama: Premium fares. Know alternate routes via Aminu Kano Crescent.',
      'Kubwa & Nyanya axis: Longer trips, higher earnings. Check fuel before accepting.',
      'Airport runs (Nnamdi Azikwe Int\'l): Confirm flight time; allow 45 min buffer for drop-offs.',
      'Surge zones appear in green on the HiGo map — position yourself nearby during peak hours.',
      'Avoid Jabi Lake road during Friday prayers (12–2 PM) and Sunday evenings.',
    ],
    question: 'When are surge fares most likely in Abuja CBD?',
    options: [
      'A. Midnight to 4 AM',
      'B. 7–10 AM and 4–7 PM weekdays',
      'C. Only on public holidays',
    ],
    correctAnswerIndex: 1,
  },
];

export function TrainingModule() {
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  useEffect(() => {
    void loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      const raw = await AsyncStorage.getItem('@higo/driver/training_completed');
      if (raw) {
        setCompletedCourses(JSON.parse(raw) as string[]);
      }
    } catch {
      // ignore
    }
  };

  const handleStartQuiz = () => {
    setShowQuiz(true);
  };

  const handleSubmitQuiz = async () => {
    if (selectedOption === null || !activeCourse) return;

    if (selectedOption === activeCourse.correctAnswerIndex) {
      Alert.alert('Correct!', 'You have completed this training module.', [
        {
          text: 'OK',
          onPress: async () => {
            const next = [...completedCourses, activeCourse.id];
            setCompletedCourses(next);
            await AsyncStorage.setItem('@higo/driver/training_completed', JSON.stringify(next));

            await enqueueJob('training_progress', {
              courseId: activeCourse.id,
              completedAt: new Date().toISOString(),
            });

            setActiveCourse(null);
            setShowQuiz(false);
            setSelectedOption(null);
          },
        },
      ]);
    } else {
      Alert.alert('Wrong Answer', 'Review the lesson content and try again.');
      setSelectedOption(null);
    }
  };

  const completedCount = completedCourses.length;
  const totalCount = COURSES.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Safety Training</Text>
      <Text style={styles.progress}>
        {completedCount}/{totalCount} modules completed
      </Text>

      {activeCourse ? (
        <View style={styles.activeWrap}>
          <Text style={styles.activeTitle}>
            {activeCourse.icon} {activeCourse.title}
          </Text>
          <Text style={styles.duration}>{activeCourse.duration} read</Text>

          {!showQuiz ? (
            <>
              <View style={styles.lessonCard}>
                {activeCourse.content.map((point, idx) => (
                  <View key={idx} style={styles.lessonPoint}>
                    <Text style={styles.lessonBullet}>•</Text>
                    <Text style={styles.lessonText}>{point}</Text>
                  </View>
                ))}
              </View>
              <Button
                label="Take Assessment Quiz"
                onPress={handleStartQuiz}
                style={styles.quizStartBtn}
              />
            </>
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
            label="Back to Modules"
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
                  <Text style={styles.courseIcon}>{course.icon}</Text>
                  <View style={styles.courseInfo}>
                    <Text style={styles.courseTitle}>{course.title}</Text>
                    <Text style={styles.courseDuration}>{course.duration}</Text>
                  </View>
                  {isCompleted && <Text style={styles.completedBadge}>✓ DONE</Text>}
                </View>
                <Text style={styles.coursePreview} numberOfLines={2}>
                  {course.content[0]}
                </Text>
                <Button
                  label={isCompleted ? 'Review Module' : 'Start Module'}
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
  },
  progress: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
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
  },
  duration: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  lessonCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  lessonPoint: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 8,
  },
  lessonBullet: {
    fontSize: 14,
    color: theme.colors.primaryGreen,
    fontWeight: '700',
  },
  lessonText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.darkNavy,
    lineHeight: 20,
  },
  quizStartBtn: {
    marginBottom: theme.spacing.sm,
  },
  quizCard: {
    marginTop: theme.spacing.sm,
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
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  courseIcon: {
    fontSize: 28,
  },
  courseInfo: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  courseDuration: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  completedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
  },
  coursePreview: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
});