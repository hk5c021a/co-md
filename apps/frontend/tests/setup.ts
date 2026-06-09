import '@testing-library/jest-dom/vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Minimal i18n init for tests — returns keys as values so assertions can match against key strings
/* oxlint-disable-next-line import/no-named-as-default-member */
i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {},
    },
  },
  interpolation: { escapeValue: false },
});
