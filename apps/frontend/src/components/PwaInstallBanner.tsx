import { useTranslation } from 'react-i18next';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { MdDownload, MdClose } from 'react-icons/md';

export function PwaInstallBanner() {
  const { t } = useTranslation();
  const { isInstallable, isInstalled, promptInstall, dismiss } = usePwaInstall();

  if (!isInstallable || isInstalled) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-lg border border-border dark:border-zinc-700 bg-surface dark:bg-zinc-900 px-4 py-3 shadow-card-hover animate-slide-down"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <MdDownload className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary dark:text-zinc-200">
            {t('home.pwaInstallTitle')}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary dark:text-zinc-400">
            {t('home.pwaInstallDesc')}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="flex-shrink-0 p-1 text-neutral dark:text-zinc-500 hover:text-text-primary dark:hover:text-zinc-300 transition-colors"
          aria-label={t('common.close')}
        >
          <MdClose className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={dismiss}
          className="inline-flex items-center justify-center font-medium rounded-sm transition-all min-h-[36px] px-4 text-[13px] border border-border dark:border-zinc-700 bg-transparent text-text-secondary dark:text-zinc-400 hover:bg-surface dark:hover:bg-zinc-800"
        >
          {t('home.pwaLater')}
        </button>
        <button
          onClick={promptInstall}
          className="inline-flex items-center justify-center font-medium rounded-sm transition-all min-h-[36px] px-4 text-[13px] bg-primary text-white hover:bg-primary-600 hover:-translate-y-px hover:shadow-btn-glow"
        >
          {t('home.pwaInstall')}
        </button>
      </div>
    </div>
  );
}
