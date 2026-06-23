import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import pcm from './pcm';
import ha from './ha';
import yo from './yo';
import { getStoredLanguage } from '../services/storage';

const resources = {
  en: { translation: en },
  pcm: { translation: pcm },
  ha: { translation: ha },
  yo: { translation: yo },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function initI18n(): Promise<void> {
  const stored = await getStoredLanguage();
  if (stored && stored in resources) {
    await i18n.changeLanguage(stored);
  }
}

export default i18n;