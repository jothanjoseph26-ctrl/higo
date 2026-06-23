import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
} from 'react-native-image-picker';
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

  const pickDocument = () => {
    Alert.alert(t('kyc.pickDocument'), undefined, [
      {
        text: 'Camera',
        onPress: async () => {
          const result = await launchCamera({
            mediaType: 'photo',
            quality: 0.7,
            maxWidth: 1600,
            maxHeight: 1600,
          });
          if (result.assets?.[0]) setPicked(result.assets[0]);
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const result = await launchImageLibrary({
            mediaType: 'photo',
            quality: 0.7,
            maxWidth: 1600,
            maxHeight: 1600,
          });
          if (result.assets?.[0]) setPicked(result.assets[0]);
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleUpload = async () => {
    if (!picked?.uri) {
      setError('Select a document first');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const compressedUri = await compressImage(picked.uri);
      const file = {
        uri: compressedUri,
        name: picked.fileName ?? `kyc-${selectedDoc}.jpg`,
        type: 'image/jpeg',
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
        fileUri: picked.uri,
        fileName: picked.fileName ?? `kyc-${selectedDoc}.jpg`,
        mimeType: 'image/jpeg',
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