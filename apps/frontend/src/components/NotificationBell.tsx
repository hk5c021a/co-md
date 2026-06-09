import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MdNotifications } from 'react-icons/md';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../hooks/useApi';
import {
  getNotificationDisplayText,
  formatRelativeTime,
  groupNotificationsByDate,
} from '../lib/notification';
import type { Notification } from '../hooks/useApi';
import { NotificationTypeIcon } from './NotificationTypeIcon';

interface NotificationBellProps {
  onNotificationClick?: (notification: Notification) => void;
  onOpenCenter?: () => void;
}

export function NotificationBell({ onNotificationClick, onOpenCenter }: NotificationBellProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const grouped = useMemo(() => groupNotificationsByDate(notifications, t), [notifications, t]);

  const handleClick = async (notification: Notification) => {
    if (!notification.read) {
      await markRead.mutateAsync(notification.id);
    }

    switch (notification.type) {
      case 'permission-granted':
      case 'permission-revoked':
      case 'permission-changed':
      case 'contact-invitation':
      case 'contact-added':
      case 'contact-removed':
        onOpenCenter?.();
        break;
      default:
        onOpenCenter?.();
    }

    onNotificationClick?.(notification);
    setIsOpen(false);
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markAllRead.mutateAsync();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-primary-600 dark:text-zinc-300 hover:bg-primary-50 dark:hover:bg-zinc-800 transition-colors"
        aria-label={t('home.notifications')}
        aria-expanded={isOpen}
      >
        <MdNotifications className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-5 h-5 px-1 bg-error text-white text-[11px] rounded-full flex items-center justify-center leading-none">
            {unreadCount >= 100 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            className="absolute right-0 mt-2 w-80 bg-bg dark:bg-zinc-900 border border-border dark:border-zinc-800 max-h-96 overflow-hidden flex flex-col z-50 animate-slide-down"
            role="region"
            aria-label={t('home.notifications')}
          >
            <div className="p-3 border-b border-border dark:border-zinc-800 flex items-center justify-between">
              <h2 className="font-semibold text-text-primary dark:text-zinc-100 text-sm">
                {t('home.notifications')}
              </h2>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={markAllRead.isPending}
                    className="text-xs text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    {t('home.markAllRead')}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    onOpenCenter?.();
                  }}
                  className="text-xs text-text-secondary hover:text-primary-700 dark:text-zinc-400 dark:hover:text-primary-200"
                >
                  {t('home.viewAll')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 3 }, (_, i) => ({ id: `skel-${i}` })).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 animate-pulse">
                      <div className="w-5 h-5 bg-primary/10 dark:bg-primary/20 rounded mt-0.5" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-primary/10 dark:bg-primary/20 rounded w-3/4" />
                        <div className="h-2.5 bg-primary/5 dark:bg-primary/10 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : grouped.length === 0 ? (
                <div className="flex items-center justify-center min-h-[160px] p-6 text-center text-text-secondary dark:text-zinc-400">
                  <div>
                    <MdNotifications className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('home.noNotifications')}</p>
                    <p className="text-xs mt-1 opacity-70">{t('home.noNotificationsHint')}</p>
                  </div>
                </div>
              ) : (
                <div>
                  {grouped.map((group) => (
                    <div key={group.label}>
                      <div className="px-3 py-1.5 bg-bg dark:bg-zinc-950 text-xs font-medium text-text-secondary dark:text-zinc-400 sticky top-0">
                        {group.label}
                      </div>
                      <div className="divide-y divide-primary-100 dark:divide-primary-700">
                        {group.items.map((notification) => (
                          <div
                            key={notification.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleClick(notification)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleClick(notification);
                              }
                            }}
                            className={`p-3 hover:bg-surface dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                              !notification.read ? 'bg-primary-50 dark:bg-zinc-950/20' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 text-text-secondary dark:text-zinc-400">
                                <NotificationTypeIcon
                                  type={notification.type}
                                  level={
                                    (notification.metadata as Record<string, unknown> | undefined)
                                      ?.level as string | undefined
                                  }
                                />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-text-primary dark:text-zinc-100">
                                  {getNotificationDisplayText(notification, t)}
                                </p>
                                <p className="text-xs text-text-secondary dark:text-zinc-400 mt-1">
                                  {formatRelativeTime(notification.createdAt, t)}
                                </p>
                              </div>
                              {!notification.read && (
                                <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
