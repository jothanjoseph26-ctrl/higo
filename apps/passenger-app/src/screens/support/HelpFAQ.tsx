import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  { q: 'How do I book a Keke ride?', a: 'Tap the "Where to?" bar on the home screen, select your destination, choose a vehicle type (HiGo Keke, Car, or Bike), select a payment method, and request!' },
  { q: 'What is a Shared Keke ride?', a: 'Shared rides allow you to share a Keke with other passengers traveling in the same direction, saving you up to 30% of the normal fare.' },
  { q: 'How does Naija Trivia work?', a: 'Naija Trivia challenges you with questions about Nigerian culture, history, geography, and sports while you wait. Every correct answer awards you +5 HiGo points!' },
  { q: 'Is my payment secure?', a: 'Yes! All cashless card and bank transactions are securely processed via the Paystack React Native SDK, ensuring industry-grade encryption.' },
  { q: 'What should I do in an emergency?', a: 'Tap the 🚨 SOS button on the home screen or active trip overlay. This immediately alerts our security team and broadcasts your live location to your emergency contacts.' },
];

export function HelpFAQ() {
  return (
    <ScreenShell title="Help & FAQs" subtitle="Find answers to common questions">
      <ScrollView contentContainerStyle={styles.container}>
        {FAQS.map((faq, idx) => (
          <View key={idx} style={styles.card}>
            <Text style={styles.question}>❓ {faq.q}</Text>
            <Text style={styles.answer}>{faq.a}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  question: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.xs,
  },
  answer: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
});
export default HelpFAQ;
