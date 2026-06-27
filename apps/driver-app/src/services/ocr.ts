import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { KycDocType, KycUploadResponse } from '@higo/shared-types';
import { api } from './api';

export async function compressImage(uri: string): Promise<string> {
  // expo-image-manipulator is native-only; web blob URLs work as-is.
  if (Platform.OS === 'web') {
    return uri;
  }

  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },
    );
    return manipResult.uri;
  } catch (err) {
    console.error('Image compression failed, using original URI', err);
    return uri;
  }
}

export async function uploadKycDocument(
  docType: KycDocType,
  uri: string,
  fileName?: string,
  mimeType = 'image/jpeg',
): Promise<KycUploadResponse> {
  const compressedUri = await compressImage(uri);
  return api.uploadKyc(docType, {
    uri: compressedUri,
    name: fileName || `${docType}.jpg`,
    type: mimeType,
  });
}