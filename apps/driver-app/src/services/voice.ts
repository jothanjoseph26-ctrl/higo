import * as Speech from 'expo-speech';
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Platform } from 'react-native';
import { api } from './api';

async function listenForWebTranscript(language: string): Promise<string | null> {
  if (Platform.OS !== 'web') return null;
  const SpeechRecognition =
    (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  return new Promise((resolve) => {
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'pcm' ? 'en-NG' : language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const timeout = setTimeout(() => {
      recognition.abort();
      resolve(null);
    }, 5000);
    recognition.onresult = (event: any) => {
      clearTimeout(timeout);
      resolve(event.results?.[0]?.[0]?.transcript ?? null);
    };
    recognition.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    recognition.onend = () => clearTimeout(timeout);
    recognition.start();
  });
}

export async function promptAndRecordVoice(language: string): Promise<'accept' | 'decline' | 'unclear'> {
  let promptText = 'Say YES to accept or NO to decline.';
  if (language === 'pcm') {
    promptText = 'Say YES to accept or NO to decline.';
  } else if (language === 'ha') {
    promptText = 'Fadi YES don karba ko NO don ki.';
  } else if (language === 'yo') {
    promptText = 'So YES lati gba tabi NO lati ko.';
  }

  try {
    await Speech.speak(promptText, { language });

    // Wait for the speech prompt to finish
    await new Promise((resolve) => setTimeout(resolve, 3500));

    const transcript = await listenForWebTranscript(language);
    if (transcript) {
      const response = await api.request<{ intent: 'accept' | 'decline' | 'unclear' }>({
        method: 'POST',
        url: '/drivers/voice-confirm',
        data: { transcript },
      });
      return response.intent;
    }

    // Native STT is intentionally local-first and not provider-backed in v1.
    // Keep the short recording UX, but do not upload raw audio until a native
    // speech recognizer is available in the app build.
    const { status } = await requestRecordingPermissionsAsync();
    if (status !== 'granted') {
      return 'unclear';
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();

    // Record for 3 seconds
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await recorder.stop();
    const uri = recorder.uri;

    if (!uri) {
      return 'unclear';
    }

    return 'unclear';
  } catch (err) {
    console.error('Voice confirmation service error:', err);
    return 'unclear';
  }
}
