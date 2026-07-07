import { HceLanguage } from './hce.types';

export const SUPPORTED_HCE_LANGUAGES: HceLanguage[] = ['en', 'pcm', 'ha', 'yo', 'ig'];

export const PHRASE_DICTIONARY: Record<string, Record<HceLanguage, string>> = {
  arrived: {
    en: 'I have arrived.',
    pcm: 'I don reach.',
    ha: 'Na iso.',
    yo: 'Mo ti de.',
    ig: 'A bịala m.',
  },
  start_trip: {
    en: 'Start trip.',
    pcm: 'Start trip.',
    ha: 'Fara tafiya.',
    yo: 'Bere irin ajo.',
    ig: 'Bido njem.',
  },
  end_trip: {
    en: 'End trip.',
    pcm: 'End trip.',
    ha: 'Kare tafiya.',
    yo: 'Pari irin ajo.',
    ig: 'Kwụsị njem.',
  },
  traffic: {
    en: 'There is traffic.',
    pcm: 'Traffic dey.',
    ha: 'Akwai cunkoso.',
    yo: 'Ona di.',
    ig: 'E nwere okporo ụzọ juru.',
  },
  collect_cash: {
    en: 'Please collect cash.',
    pcm: 'Collect cash abeg.',
    ha: 'Karbi kudi.',
    yo: 'Gba owo.',
    ig: 'Nara ego.',
  },
  call_passenger: {
    en: 'Call passenger.',
    pcm: 'Call passenger.',
    ha: 'Kira fasinja.',
    yo: 'Pe ero.',
    ig: 'Kpọọ onye njem.',
  },
  cancel: {
    en: 'Cancel ride.',
    pcm: 'Cancel ride.',
    ha: 'Soke tafiya.',
    yo: 'Fagile irin ajo.',
    ig: 'Kagbuo njem.',
  },
  otp_guidance: {
    en: 'We have sent six digits to your phone.',
    pcm: 'We don send six numbers to your phone.',
    ha: 'Mun aika lambobi shida zuwa wayarka.',
    yo: 'A ti fi nomba mefa ranse si foonu re.',
    ig: 'Anyị ezipụla nọmba isii na ekwentị gị.',
  },
  kyc_license: {
    en: "Take a picture of your driver's licence.",
    pcm: 'Snap your driver licence.',
    ha: "Dauki hoton lasisin tukinka.",
    yo: 'Ya foto iwe iwakọ re.',
    ig: 'See foto akwụkwọ ikike ịnya ụgbọala gị.',
  },
  payment_received: {
    en: 'Payment received.',
    pcm: 'Payment don enter.',
    ha: 'An karbi kudi.',
    yo: 'A ti gba owo.',
    ig: 'A natala ụgwọ.',
  },
};

export const VOICE_PACK_MANIFEST = Object.fromEntries(
  Object.keys(PHRASE_DICTIONARY).map((key) => [
    key,
    Object.fromEntries(
      SUPPORTED_HCE_LANGUAGES.map((language) => [
        language,
        {
          key,
          language,
          text: PHRASE_DICTIONARY[key][language],
          audioUrl: null,
        },
      ]),
    ),
  ]),
);

export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findPhraseTranslation(text: string, targetLanguage: HceLanguage) {
  const normalized = normalizeText(text).replace(/[.!?]+$/g, '');
  for (const [key, translations] of Object.entries(PHRASE_DICTIONARY)) {
    const matched = Object.values(translations).some(
      (phrase) => normalizeText(phrase).replace(/[.!?]+$/g, '') === normalized,
    );
    if (matched) {
      return { key, translatedText: translations[targetLanguage] };
    }
  }
  return null;
}
