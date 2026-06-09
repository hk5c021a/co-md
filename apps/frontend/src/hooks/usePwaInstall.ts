import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PWA_DISMISSED_KEY = 'co_md_pwa_dismissed';
const PWA_DISMISSED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Check localStorage — don't show banner if dismissed within TTL
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      const ts = localStorage.getItem(PWA_DISMISSED_KEY);
      if (ts) {
        const parsed = parseInt(ts, 10);
        if (!isNaN(parsed)) return Date.now() - parsed < PWA_DISMISSED_TTL;
      }
    } catch { /* localStorage unavailable */ }
    return false;
  });
  const [isInstallable, setIsInstallable] = useState(false);
  // Detect standalone mode on mount (iOS & PWA)
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const installed = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsInstallable(false);
    return outcome;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setIsInstallable(false);
    try { localStorage.setItem(PWA_DISMISSED_KEY, String(Date.now())); } catch {}
  }, []);

  return { isInstallable: isInstallable && !isDismissed, isInstalled, promptInstall, dismiss };
}
