import * as Speech from 'expo-speech';
import { api } from './api';

export type DriverSmartIntent =
  | 'arrived'
  | 'traffic'
  | 'call_passenger'
  | 'cancel'
  | 'collect_cash'
  | 'start_trip'
  | 'end_trip'
  | 'navigate';

export const DRIVER_SMART_ACTIONS: Array<{
  intent: DriverSmartIntent;
  label: string;
  phraseKey: string;
  localCommand: string;
}> = [
  { intent: 'arrived', label: 'I Have Arrived', phraseKey: 'arrived', localCommand: 'I have arrived' },
  { intent: 'traffic', label: 'Traffic', phraseKey: 'traffic', localCommand: 'traffic' },
  { intent: 'call_passenger', label: 'Call Passenger', phraseKey: 'call_passenger', localCommand: 'call passenger' },
  { intent: 'cancel', label: 'Cancel', phraseKey: 'cancel', localCommand: 'cancel ride' },
  { intent: 'collect_cash', label: 'Collect Cash', phraseKey: 'collect_cash', localCommand: 'collect cash' },
  { intent: 'start_trip', label: 'Start Trip', phraseKey: 'start_trip', localCommand: 'start trip' },
  { intent: 'end_trip', label: 'End Trip', phraseKey: 'end_trip', localCommand: 'end trip' },
  { intent: 'navigate', label: 'Navigate', phraseKey: 'navigate', localCommand: 'navigate' },
];

export async function speakVoicePack(language: string, key: string): Promise<void> {
  const phrase = await api.request<{ text: string; audioUrl: string | null }>({
    method: 'GET',
    url: `/hce/voice-pack/${language}/${key}`,
  });
  await Speech.speak(phrase.text, { language });
}

export async function extractDriverIntent(command: string, tripId?: string) {
  return api.request<{ intent: string; confidence: number; source: string }>({
    method: 'POST',
    url: '/drivers/voice-confirm',
    data: { command, tripId },
  });
}

export async function translateMessage(text: string, targetLanguage: string) {
  return api.request<{
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
    provider: string;
    cacheHit?: boolean;
    fallbackUsed?: boolean;
  }>({
    method: 'POST',
    url: '/hce/translate',
    data: { text, targetLanguage },
  });
}

export async function updateHceLanguagePreference(languageCode: string) {
  return api.request({
    method: 'PUT',
    url: '/hce/language-preference',
    data: { languageCode },
  });
}
