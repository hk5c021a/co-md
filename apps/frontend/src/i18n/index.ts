import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './zh';
import en from './en';

const savedLang = typeof window !== 'undefined' ? localStorage.getItem('language-storage') : null;

let defaultLang = 'zh';
if (savedLang) {
  try {
    const parsed = JSON.parse(savedLang);
    if (parsed?.state?.language) {
      defaultLang = parsed.state.language;
    }
  } catch {}
}

/* oxlint-disable-next-line import/no-named-as-default-member */
i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: defaultLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

// Sync HTML lang attribute and page title on language change
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  document.title =
    lng === 'zh'
      ? 'CO-MD — 实时协同 Markdown 编辑器'
      : 'CO-MD — Real-time Collaborative Markdown Editor';
  const desc = document.querySelector('meta[name="description"]');
  if (desc)
    desc.setAttribute(
      'content',
      lng === 'zh'
        ? '在线实时协同 Markdown 编辑器，支持语法高亮、实时预览与团队共享。'
        : 'Real-time collaborative Markdown editor with syntax highlighting, live preview, and team sharing.'
    );
});

export default i18n;
