import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KycDocType, KYCStatus } from '@higo/shared-types';
import { Button } from '../../components/Button';
import { DocUploadCard } from '../../components/DocUploadCard';
import { OcrFieldsForm } from '../../components/OcrFieldsForm';
import { ScreenShell } from '../../components/ScreenShell';
import { api } from '../../services/api';
import { useQueueStore } from '../../stores/queueStore';
import { KYC_DOC_ORDER } from '../../utils/kyc';
import { compressImage } from '../../services/ocr';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'KYCUpload'>;

// Normalized shape shared by the web input, expo-image-picker, and
// expo-document-picker paths.
type Asset = {
  uri: string;
  fileName?: string;
  type?: string;
  fileSize?: number;
};

export function KYCUpload({ navigation, route }: Props) {
  const { t } = useTranslation();
  const addJob = useQueueStore((s) => s.add);
  const initialDoc = route.params?.docType ?? KYC_DOC_ORDER[0];
  const [selectedDoc, setSelectedDoc] = useState<KycDocType>(initialDoc);
  const [picked, setPicked] = useState<Asset | null>(null);
  const [ocrFields, setOcrFields] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [hasOcrResponse, setHasOcrResponse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickDocumentWeb = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        setPicked({
          uri: objectUrl,
          fileName: file.name,
          type: file.type,
          fileSize: file.size,
        });
      }
    };
    input.click();
  };

  const setPickedFromImage = (asset: ImagePicker.ImagePickerAsset) => {
    setPicked({
      uri: asset.uri,
      fileName: asset.fileName ?? undefined,
      type: asset.mimeType ?? 'image/jpeg',
      fileSize: asset.fileSize ?? undefined,
    });
  };

  const pickFromCamera = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      setError('Camera permission is required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedFromImage(result.assets[0]);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedFromImage(result.assets[0]);
    }
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const doc = result.assets[0];
      setPicked({
        uri: doc.uri,
        fileName: doc.name,
        type: doc.mimeType ?? 'application/pdf',
        fileSize: doc.size ?? undefined,
      });
    }
  };

  const pickDocument = () => {
    if (Platform.OS === 'web') {
      pickDocumentWeb();
      return;
    }
    // Android alerts show at most 3 buttons; rely on cancelable there and
    // only add an explicit cancel button on iOS.
    Alert.alert(
      t('kyc.pickDocument'),
      undefined,
      [
        { text: 'Camera', onPress: pickFromCamera },
        { text: 'Gallery', onPress: pickFromGallery },
        { text: 'PDF', onPress: pickPdf },
        ...(Platform.OS === 'ios'
          ? [{ text: t('common.cancel'), style: 'cancel' as const }]
          : []),
      ],
      { cancelable: true },
    );
  };

  const handleUpload = async () => {
    if (!picked?.uri) {
      setError('Select a document first');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const mimeType = picked.type ?? 'image/jpeg';
      const compressedUri = mimeType.includes('pdf')
        ? picked.uri
        : await compressImage(picked.uri);
      const fileName =
        picked.fileName ??
        `kyc-${selectedDoc}.${mimeType.includes('pdf') ? 'pdf' : 'jpg'}`;
      const file = {
        uri: compressedUri,
        name: fileName,
        type: mimeType,
      };

      const result = await api.uploadKyc(selectedDoc, file);
      
      if (result.ocrFields && Object.keys(result.ocrFields).length > 0) {
        setOcrFields(result.ocrFields);
        setHasOcrResponse(true);
      } else {
        navigation.navigate('DocumentStatus');
      }
    } catch (err) {
      await addJob('kyc_upload', {
        docType: selectedDoc,
        file: {
          uri: picked.uri,
          name: picked.fileName ?? `kyc-${selectedDoc}.jpg`,
          type: picked.type ?? 'image/jpeg',
        },
      });
      setError(
        err instanceof Error
          ? `${err.message} — queued for retry when online`
          : t('common.error'),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmOcr = () => {
    // Driver confirmed OCR corrections, redirect to DocumentStatus
    navigation.navigate('DocumentStatus');
  };

  return (
    <ScreenShell
      title={t('kyc.uploadTitle')}
      subtitle={t('kyc.uploadSubtitle')}
    >
      <View style={styles.list}>
        {KYC_DOC_ORDER.map((doc) => (
          <DocUploadCard
            key={doc}
            docKey={doc}
            selected={selectedDoc === doc}
            onPress={() => {
              setSelectedDoc(doc);
              setPicked(null);
              setOcrFields({});
              setHasOcrResponse(false);
            }}
          />
        ))}
      </View>

      <Button
        label={picked ? picked.fileName ?? 'Photo selected' : t('kyc.pickDocument')}
        onPress={pickDocument}
        variant="outline"
      />

      {hasOcrResponse && (
        <>
          <OcrFieldsForm fields={ocrFields} onChange={setOcrFields} />
          <Button
            label={t('kyc.ocrConfirm')}
            onPress={handleConfirmOcr}
            style={styles.uploadBtn}
          />
        </>
      )}

      {!hasOcrResponse && (
        <Button
          label={uploading ? t('kyc.uploading') : t('kyc.upload')}
          onPress={handleUpload}
          loading={uploading}
          disabled={!picked}
          style={styles.uploadBtn}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={t('kyc.documentStatus')}
        onPress={() => navigation.navigate('DocumentStatus')}
        variant="outline"
        style={styles.statusBtn}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: {
    marginBottom: theme.spacing.md,
  },
  uploadBtn: {
    marginTop: theme.spacing.md,
  },
  statusBtn: {
    marginTop: theme.spacing.sm,
  },
  error: {
    marginTop: theme.spacing.md,
    color: theme.colors.error,
    fontSize: 14,
  },
});