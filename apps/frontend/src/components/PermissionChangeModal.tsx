import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MdErrorOutline } from 'react-icons/md';
import { Button } from './ui/button';

interface PermissionChangeModalProps {
  type: 'permission-revoked' | 'permission-changed';
  documentTitle: string;
  open: boolean;
}

export function PermissionChangeModal({ type, documentTitle, open }: PermissionChangeModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    setCountdown(5);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (countdown === 0) {
      navigate('/', { replace: true });
      window.location.reload();
    }
  }, [countdown, navigate]);

  if (!open) return null;

  const revoked = type === 'permission-revoked';
  const title = revoked ? t('home.permissionRevoked') : t('home.permissionChanged');
  const message = revoked
    ? t('home.permissionRevokedDesc', { title: documentTitle })
    : t('home.permissionChangedDesc', { title: documentTitle });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="perm-change-title"
        aria-describedby="perm-change-desc"
        className="bg-surface dark:bg-zinc-900 border border-border dark:border-zinc-700 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl text-center"
      >
        <MdErrorOutline
          className={`h-12 w-12 mx-auto mb-4 ${revoked ? 'text-error' : 'text-warning'}`}
        />
        <h2
          id="perm-change-title"
          className="text-lg font-bold text-text-primary dark:text-zinc-100 mb-2"
        >
          {title}
        </h2>
        <p id="perm-change-desc" className="text-sm text-text-secondary dark:text-zinc-400 mb-6">
          {message}
        </p>
        <p className="text-xs text-neutral dark:text-zinc-400 mb-4">
          {t('home.redirectCountdown', { seconds: countdown })}
        </p>
        <Button
          onClick={() => {
            navigate('/', { replace: true });
            window.location.reload();
          }}
          className="w-full"
        >
          {t('home.goHomeNow')}
        </Button>
      </div>
    </div>
  );
}
