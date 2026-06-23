import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { api } from './api';

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

    // Request permissions and start recording
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      return 'unclear';
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    // Record for 3 seconds
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();

    if (!uri) {
      return 'unclear';
    }

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: 'voice_command.m4a',
      type: 'audio/m4a',
    } as unknown as Blob);

    const response = await api.request<{ intent: 'accept' | 'decline' | 'unclear' }>({
      method: 'POST',
      url: '/drivers/voice-confirm',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.intent;
  } catch (err) {
    console.error('Voice confirmation service error:', err);
    return 'unclear';
  }
}
