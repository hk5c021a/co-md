import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Navigate } from 'react-router-dom';
import { useUser, useLogout } from '../hooks/useApi';
import { useToken } from '../hooks/useToken';
import { useThemeStore, useLanguageStore } from '../store/index';
import { useNotificationSocket } from '../hooks/useNotificationSocket';
import { tokenStore } from '../lib/tokenStore';
import { useToast } from '../components/ui/toast';
import { PwaInstallBanner } from '../components/PwaInstallBanner';
import { NotificationBell } from '../components/NotificationBell';
import { NotificationCenter } from '../components/NotificationCenter';
import { PageSpinner } from '../components/ui/spinner';
import { FilesTab } from '../components/home/FilesTab';
import { ContactsTab } from '../components/home/ContactsTab';
import { SettingsTab } from '../components/home/SettingsTab';
import {
  MdLightMode,
  MdDarkMode,
  MdTranslate,
  MdLogout,
  MdMenu,
  MdClose,
  MdDescription,
  MdPeople,
  MdSettings,
  MdArrowBack,
} from 'react-icons/md';

type MainTab = 'files' | 'contacts';

export function UserHomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, isAuthLoading } = useToken();
  const { data: user, isLoading } = useUser();
  const logout = useLogout();
  const { theme, setTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();
  const { addToast } = useToast();

  // Notification WebSocket — auto-refresh queries + toast for real-time feedback
  useNotificationSocket((msg) => {
    switch (msg.type) {
      case 'permission-granted':
        addToast(t('home.permissionGrantedToast', { title: msg.data.documentTitle }), 'success');
        break;
      case 'permission-changed':
        addToast(t('home.permissionChangedToast', { title: msg.data.documentTitle }), 'info');
        break;
      case 'permission-revoked':
        addToast(t('home.permissionRevokedToast', { title: msg.data.documentTitle }), 'warning');
        break;
      case 'contact-invitation':
        addToast(
          t('home.invitationFrom', { name: msg.data.inviterUsername || '' }),
          'info'
        );
        break;
      case 'contact-added':
        addToast(
          t('home.invitationAccepted'),
          'success'
        );
        break;
      case 'contact-removed':
        addToast(
          t('home.contactRemovedToast', { name: msg.data.removerUsername || '' }),
          'warning'
        );
        break;
    }
  });

  const [activeTab, setActiveTab] = useState<MainTab>('files');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string>();

  if (isAuthLoading || isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // Logout API failed — clear local state anyway
      tokenStore.clearAccess();
    }
    navigate('/login', { replace: true });
  };

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => {
    const next = language === 'zh' ? 'en' : 'zh';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  const handleNavigate = (tab: string) => {
    if (tab === 'files' || tab === 'contacts') {
      setActiveTab(tab);
    }
  };

  const handleFileSelect = (documentId: string) => {
    setActiveFileId(documentId);
    navigate(`/editor/${documentId}`);
  };

  const tabs: { key: MainTab; icon: React.ReactNode; label: string }[] = [
    { key: 'files', icon: <MdDescription className="h-4 w-4" />, label: t('home.files') },
    { key: 'contacts', icon: <MdPeople className="h-4 w-4" />, label: t('home.contacts') },
  ];

  return (
    <div className="min-h-dvh bg-bg dark:bg-zinc-950">
      <a href="#main-content" className="skip-to-main">
        {t('common.skipToMain')}
      </a>
      <h1 className="sr-only">
        {t('common.appName')} — {t('home.myWorkspace')}
      </h1>
      {/* Navigation Bar — single row, responsive */}
      <header className="bg-surface/80 dark:bg-zinc-900/80 backdrop-blur border-b border-border dark:border-zinc-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center gap-1 sm:gap-2">
          {/* Logo */}
          <button
            onClick={() => navigate('/')}
            className="hover:opacity-80 transition-opacity shrink-0"
          >
            <img src="/logo.svg" alt={t('common.appName')} className="h-7 w-7 sm:h-9 sm:w-9" />
          </button>

          {/* Tabs — icon+label on desktop, icon-only on mobile */}
          <nav className="flex items-center ml-2 sm:ml-4" role="tablist" aria-label={t('home.myWorkspace')}>
            {tabs.map(({ key, icon, label }) => (
              <button
                key={key}
                role="tab"
                id={`tab-${key}`}
                aria-selected={activeTab === key}
                aria-controls={`panel-${key}`}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-4 h-14 text-[15px] font-medium border-b-2 transition-colors shrink-0 ${
                  activeTab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary dark:text-zinc-400 hover:text-primary-700 dark:hover:text-zinc-300'
                }`}
              >
                {icon}
                <span className="hidden sm:inline text-[15px]">{label}</span>
              </button>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1 min-w-1" />

          {/* Language & Theme — icon-only on mobile, icon+label on desktop */}
          <button
            onClick={toggleLanguage}
            className="p-1.5 sm:p-2 text-text-secondary dark:text-zinc-400 hover:text-primary-700 dark:hover:text-zinc-300 transition-colors shrink-0 flex items-center gap-1"
            aria-label={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
            title={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
          >
            <MdTranslate className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="text-[13px] font-medium hidden sm:inline">
              {language === 'zh' ? t('home.chinese') : t('home.english')}
            </span>
          </button>

          <button
            onClick={toggleTheme}
            className="p-1.5 sm:p-2 text-text-secondary dark:text-zinc-400 hover:text-primary-700 dark:hover:text-zinc-300 transition-colors shrink-0"
            aria-label={theme === 'light' ? t('home.dark') : t('home.light')}
            title={theme === 'light' ? t('home.dark') : t('home.light')}
          >
            {theme === 'light' ? (
              <MdLightMode className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <MdDarkMode className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </button>

          <NotificationBell onOpenCenter={() => setShowNotifications(true)} />

          {/* Desktop-only: user avatar + name + settings + logout */}
          <div className="hidden md:flex items-center gap-1 ml-1">
            <div
              className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white font-medium text-[13px] shrink-0"
              aria-hidden="true"
            >
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="text-[14px] font-medium text-text-primary dark:text-zinc-200 max-w-[100px] truncate">
              {user?.username}
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 text-text-secondary dark:text-zinc-400 hover:text-primary-700 dark:hover:text-zinc-300 transition-colors shrink-0"
              aria-label={t('home.settings')}
            >
              <MdSettings className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 text-text-secondary dark:text-zinc-400 hover:text-error transition-colors shrink-0"
              aria-label={t('home.logout')}
            >
              <MdLogout className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-text-secondary dark:text-zinc-400 hover:text-primary-700 dark:hover:text-zinc-300 transition-colors md:hidden shrink-0"
            aria-label={mobileMenuOpen ? t('common.close') : t('home.myWorkspace')}
          >
            {mobileMenuOpen ? <MdClose className="h-5 w-5" /> : <MdMenu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Menu — user info, quick actions, settings, logout */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border dark:border-zinc-800 px-4 py-2 bg-bg dark:bg-zinc-900 animate-expand-down">
            <div className="flex items-center gap-3 py-2 mb-2 border-b border-border dark:border-zinc-800">
              <div
                className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-medium text-[15px]"
                aria-hidden="true"
              >
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="text-[15px] font-medium text-text-primary dark:text-zinc-200 flex-1">
                {user?.username}
              </span>
              {/* Quick lang/theme in menu header */}
              <button
                onClick={() => { toggleLanguage(); setMobileMenuOpen(false); }}
                className="p-1.5 rounded-full bg-surface dark:bg-zinc-800 border border-border dark:border-zinc-700 text-text-primary dark:text-zinc-200"
                aria-label={language === 'zh' ? t('home.switchToEnglish') : t('home.switchToChinese')}
              >
                <MdTranslate className="h-4 w-4" />
              </button>
              <button
                onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
                className="p-1.5 rounded-full bg-surface dark:bg-zinc-800 border border-border dark:border-zinc-700 text-text-primary dark:text-zinc-200"
                aria-label={theme === 'light' ? t('home.dark') : t('home.light')}
              >
                {theme === 'light' ? <MdLightMode className="h-4 w-4" /> : <MdDarkMode className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => {
                setShowSettings(true);
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 w-full py-2 text-[15px] text-text-primary dark:text-zinc-200 hover:bg-surface dark:hover:bg-zinc-800"
            >
              <MdSettings className="h-4 w-4" />
              {t('home.settings')}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full py-2 text-[15px] text-error dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <MdLogout className="h-4 w-4" />
              {t('home.logout')}
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-4">
        {activeTab === 'files' && (
          <div role="tabpanel" id="panel-files" aria-labelledby="tab-files">
            <FilesTab onFileSelect={handleFileSelect} activeFileId={activeFileId} />
          </div>
        )}

        {activeTab === 'contacts' && (
          <div role="tabpanel" id="panel-contacts" aria-labelledby="tab-contacts">
            <ContactsTab />
          </div>
        )}
      </main>

      {/* Settings Overlay */}
      {showSettings && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('home.settings')}
          className="fixed inset-0 z-50 overflow-y-auto bg-bg dark:bg-zinc-950 animate-slide-in-right"
        >
          <div className="max-w-2xl mx-auto px-4 py-6">
            <button
              onClick={() => setShowSettings(false)}
              className="inline-flex items-center gap-1 whitespace-nowrap text-[15px] text-primary hover:text-primary-700 mb-6"
              aria-label={t('editor.back')}
            >
              <MdArrowBack className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('editor.back')}</span>
            </button>
            <SettingsTab />
          </div>
        </div>
      )}

      {/* PWA Install Banner */}
      <PwaInstallBanner />

      {/* Notification Center Overlay */}
      <NotificationCenter isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
    </div>
  );
}
