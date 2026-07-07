import { api } from './api';

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

export async function voiceBookingFromTranscript(transcript: string) {
  return api.request<{
    destination: string | null;
    lat: number | null;
    lng: number | null;
    vehicleType: string | null;
    confidence: number;
    resolvedAddress: string | null;
    fallback?: string;
  }>({
    method: 'POST',
    url: '/hce/voice-booking',
    data: { transcript },
  });
}

export async function getVoicePackPhrase(language: string, key: string) {
  return api.request<{ text: string; audioUrl: string | null }>({
    method: 'GET',
    url: `/hce/voice-pack/${language}/${key}`,
  });
}

export async function updateHceLanguagePreference(languageCode: string) {
  return api.request({
    method: 'PUT',
    url: '/hce/language-preference',
    data: { languageCode },
  });
}
