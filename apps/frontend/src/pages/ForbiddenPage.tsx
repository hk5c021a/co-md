import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useThemeStore, useLanguageStore } from '../store/index';
import { MdLightMode, MdDarkMode, MdTranslate, MdSecurity, MdArrowBack } from 'react-icons/md';

export function ForbiddenPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => {
    const next = language === 'zh' ? 'en' : 'zh';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg dark:bg-zinc-950 px-4">
      <a href="#main-content" className="skip-to-main">
        {t('common.skipToMain')}
      </a>
      {/* Header controls */}
      <div className="fixed top-4 right-4 flex gap-2 z-10">
        <button
          onClick={toggleLanguage}
          className="p-2 rounded-full bg-surface dark:bg-zinc-900 border border-border dark:border-zinc-700 flex items-center gap-1"
          aria-label={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
        >
          <MdTranslate className="h-5 w-5" />
          <span className="text-[13px] font-medium">
            {language === 'zh' ? t('home.chinese') : t('home.english')}
          </span>
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-surface dark:bg-zinc-900 border border-border dark:border-zinc-700"
          aria-label={theme === 'light' ? t('home.dark') : t('home.light')}
        >
          {theme === 'light' ? (
            <MdLightMode className="h-5 w-5" />
          ) : (
            <MdDarkMode className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Content */}
      <main id="main-content" className="max-w-md w-full text-center p-8">
        <div className="mb-6 flex justify-center">
          <div className="p-4 rounded-full bg-error/10 dark:bg-error/20">
            <MdSecurity className="h-16 w-16 text-error dark:text-error" />
          </div>
        </div>
        <h1 className="text-6xl font-bold font-display tracking-tight text-text-primary dark:text-zinc-100 mb-4">
          403
        </h1>
        <h2 className="text-xl font-semibold text-primary-700 dark:text-zinc-300 mb-2">
          {t('error.forbiddenTitle')}
        </h2>
        <p className="text-text-secondary dark:text-zinc-400 mb-8">{t('error.forbiddenDesc')}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="inline-flex items-center gap-2 whitespace-nowrap px-6 py-3 bg-primary hover:bg-primary-600 text-white font-semibold text-[15px] rounded-sm hover:-translate-y-px hover:shadow-btn-glow transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12"
        >
          <MdArrowBack className="h-4 w-4 shrink-0" />
          <span>{t('error.backToHome')}</span>
        </button>
      </main>
    </div>
  );
}
