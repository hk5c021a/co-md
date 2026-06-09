import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdNotifications, MdCheck, MdClose, MdDelete } from 'react-icons/md';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useAcceptInvitation,
  useDeclineInvitation,
} from '../hooks/useApi';
import { getNotificationDisplayText, formatRelativeTime } from '../lib/notification';
import type { Notification } from '../hooks/useApi';
import { Button } from './ui/button';
import { Temporal } from '../lib/temporal';
import { NotificationTypeIcon } from './NotificationTypeIcon';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'unread' | 'permission' | 'contact';

function isInvitationExpired(notification: Notification): boolean {
  try {
    const expiresAt = notification.metadata?.expiresAt as string;
    if (!expiresAt) return false;
    return Temporal.Instant.compare(Temporal.Instant.from(expiresAt), Temporal.Now.instant()) < 0;
  } catch {
    return false;
  }
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const { data: notifications = [], isLoading } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 200);
  };

  useEffect(() => {
    if (!isOpen) return;
    setClosing(false);
    const timer = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      first?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen]);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();

  const filteredNotifications = useMemo(() => {
    let result = notifications;
    switch (filter) {
      case 'unread':
        result = result.filter((n) => !n.read);
        break;
      case 'permission':
        result = result.filter(
          (n) =>
            n.type === 'permission-granted' ||
            n.type === 'permission-revoked' ||
            n.type === 'permission-changed'
        );
        break;
      case 'contact':
        result = result.filter(
          (n) => n.type === 'contact-invitation' || n.type === 'contact-added'
        );
        break;
    }
    return result;
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = (notificationId: string) => {
    markRead.mutate(notificationId);
  };

  const handleDelete = (notificationId: string) => {
    deleteNotification.mutate(notificationId);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(notificationId);
      return next;
    });
  };

  const [invitationState, setInvitationState] = useState<
    Record<string, 'accepting' | 'accepted' | 'declining' | 'declined'>
  >({});

  const handleAcceptInvitation = (notification: Notification) => {
    const invitationId = notification.metadata?.invitationId as string;
    if (!invitationId) return;
    setInvitationState((prev) => ({ ...prev, [notification.id]: 'accepting' }));
    acceptInvitation.mutate(invitationId, {
      onSuccess: () => {
        setInvitationState((prev) => ({ ...prev, [notification.id]: 'accepted' }));
        handleMarkAsRead(notification.id);
      },
      onError: () => {
        setInvitationState((prev) => {
          const next = { ...prev };
          delete next[notification.id];
          return next;
        });
      },
    });
  };

  const handleDeclineInvitation = (notification: Notification) => {
    const invitationId = notification.metadata?.invitationId as string;
    if (!invitationId) return;
    setInvitationState((prev) => ({ ...prev, [notification.id]: 'declining' }));
    declineInvitation.mutate(invitationId, {
      onSuccess: () => {
        setInvitationState((prev) => ({ ...prev, [notification.id]: 'declined' }));
        handleMarkAsRead(notification.id);
      },
      onError: () => {
        setInvitationState((prev) => {
          const next = { ...prev };
          delete next[notification.id];
          return next;
        });
      },
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    for (const id of selected) {
      deleteNotification.mutate(id);
    }
    setSelected(new Set());
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  if (!isOpen && !closing) return null;

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('home.allFilter') },
    { key: 'unread', label: t('home.unreadFilter') },
    { key: 'permission', label: t('home.permissionFilter') },
    { key: 'contact', label: t('home.contactFilter') },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-zinc-900/50 animate-fade-in"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-title"
        className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-bg dark:bg-zinc-900 flex flex-col ${closing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}
      >
        {/* Header */}
        <div className="p-4 border-b dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2
              id="notification-title"
              className="text-lg font-semibold text-text-primary dark:text-zinc-100"
            >
              {t('home.notifications')}
            </h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-primary-50 dark:bg-zinc-950/30 text-primary-700 dark:text-zinc-400 text-sm rounded-full">
                {t('home.unreadCount', { count: unreadCount })}
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-primary-50 dark:hover:bg-zinc-800 rounded-full text-text-secondary dark:text-zinc-400"
            aria-label={t('home.closeNotifications')}
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-2 border-b dark:border-zinc-800 flex gap-1.5 flex-wrap">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                filter === key
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface dark:bg-zinc-800 hover:bg-primary-50 dark:hover:bg-primary-600 text-primary-600 dark:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-text-secondary dark:text-zinc-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
              <p className="mt-2 text-sm">{t('home.loadingNotifications')}</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-text-secondary dark:text-zinc-400">
              <div>
                <MdNotifications className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">
                  {filter === 'unread'
                    ? t('home.noUnreadNotifications')
                    : filter === 'permission'
                      ? t('home.noNotificationsHint')
                      : filter === 'contact'
                        ? t('home.noNotificationsHint')
                        : t('home.noNotifications')}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y dark:divide-primary-700">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-surface dark:hover:bg-zinc-800 transition-colors flex items-start gap-3 ${
                    !notification.read ? 'bg-primary-50/50 dark:bg-zinc-950/10' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(notification.id)}
                    onChange={() => toggleSelect(notification.id)}
                    className="mt-1 rounded border-border dark:border-zinc-700 text-primary-600 focus:ring-primary"
                    aria-label={t('home.deleteNotification')}
                  />
                  <span className="mt-0.5 text-text-secondary dark:text-zinc-400">
                    <NotificationTypeIcon
                      type={notification.type}
                      level={
                        (notification.metadata as Record<string, unknown> | undefined)?.level as
                          | string
                          | undefined
                      }
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary dark:text-zinc-100 whitespace-pre-wrap">
                      {getNotificationDisplayText(notification, t)}
                    </p>
                    <p className="text-xs text-text-secondary dark:text-zinc-400 mt-1">
                      {formatRelativeTime(notification.createdAt, t)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {notification.type === 'contact-invitation' &&
                      (() => {
                        const state = invitationState[notification.id];
                        // Persisted status in metadata (survives page refresh).
                        // Set by the backend when the invitation is accepted/declined.
                        const savedStatus = notification.metadata?.invitationStatus as string | undefined;
                        const expired = isInvitationExpired(notification);

                        if (state === 'accepted' || savedStatus === 'accepted') {
                          return (
                            <span className="text-xs text-success dark:text-success-400 font-medium">
                              {t('home.invitationAccepted')}
                            </span>
                          );
                        }
                        if (state === 'declined' || savedStatus === 'declined') {
                          return (
                            <span className="text-xs text-text-secondary dark:text-zinc-400 font-medium">
                              {t('home.invitationDeclined')}
                            </span>
                          );
                        }
                        if (savedStatus === 'expired' || expired) {
                          return (
                            <span className="text-xs text-error dark:text-error-400 font-medium">
                              {t('home.invitationExpired')}
                            </span>
                          );
                        }

                        const busy = state === 'accepting' || state === 'declining';
                        return (
                          <>
                            <button
                              onClick={() => handleAcceptInvitation(notification)}
                              disabled={busy}
                              className="px-2.5 py-1 bg-success text-white text-xs hover:bg-success-700 disabled:opacity-50"
                            >
                              {state === 'accepting' ? t('common.loading') : t('common.confirm')}
                            </button>
                            <button
                              onClick={() => handleDeclineInvitation(notification)}
                              disabled={busy}
                              className="px-2.5 py-1 bg-primary-50 dark:bg-primary-600 text-primary-700 dark:text-zinc-300 text-xs hover:bg-primary-300 dark:hover:bg-primary disabled:opacity-50"
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        );
                      })()}
                    {notification.type !== 'contact-invitation' && (
                      <>
                        {!notification.read && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="p-1.5 hover:bg-primary-50 dark:hover:bg-primary-600 rounded-full text-neutral hover:text-primary"
                            title={t('home.markAsRead')}
                            aria-label={t('home.markAsRead')}
                          >
                            <MdCheck className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="p-1.5 hover:bg-primary-50 dark:hover:bg-primary-600 rounded-full text-neutral hover:text-error"
                          title={t('home.deleteNotification')}
                          aria-label={t('home.deleteNotification')}
                        >
                          <MdDelete className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t dark:border-zinc-800 bg-bg dark:bg-zinc-950 flex gap-2">
          {selected.size > 0 ? (
            <Button variant="destructive" onClick={deleteSelected} className="flex-1">
              {t('home.deleteSelected')} ({selected.size})
            </Button>
          ) : (
            unreadCount > 0 && (
              <Button
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="flex-1"
              >
                {markAllRead.isPending ? t('home.marking') : t('home.markAllRead')}
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
