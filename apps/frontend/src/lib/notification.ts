import type { TFunction } from 'i18next';
import type { Notification } from '../hooks/useApi';
import { Temporal } from './temporal';

function levelLabel(level: string | undefined, t: TFunction): string {
  switch (level) {
    case 'read-only': return t('home.readOnly');
    case 'read-write': return t('home.readWrite');
    case 'revoked': return t('home.permissionRevoked');
    default: return level || t('home.readOnly');
  }
}

export function getNotificationDisplayText(notification: Notification, t: TFunction): string {
  const meta = notification.metadata as Record<string, unknown> | undefined;

  switch (notification.type) {
    case 'permission-granted':
      return t('home.notificationPermissionGranted', { title: meta?.documentTitle ?? '?', level: levelLabel(meta?.level as string | undefined, t) });
    case 'permission-revoked':
      return t('home.notificationPermissionRevoked', { title: meta?.documentTitle ?? '?' });
    case 'permission-changed':
      return t('home.notificationPermissionChanged', { title: meta?.documentTitle ?? '?', level: levelLabel(meta?.level as string | undefined, t) });
    case 'contact-invitation':
      return t('home.notificationContactInvitation', { username: meta?.inviterUsername ?? '?' });
    case 'contact-added':
      return t('home.notificationContactAdded', { username: meta?.contactUsername ?? '?' });
    case 'contact-removed':
      return t('home.notificationContactRemoved', { username: meta?.removerUsername ?? '?' });
    default:
      return notification.content;
  }
}

export function formatRelativeTime(dateStr: string, t: TFunction): string {
  let date: Temporal.Instant;
  try {
    date = Temporal.Instant.from(dateStr);
  } catch {
    return dateStr || '—';
  }
  const now = Temporal.Now.instant();
  const diff = now.since(date);
  const minutes = diff.total('minutes');
  const hours = diff.total('hours');
  const days = diff.total('days');

  if (minutes < 1) return t('home.justNow');
  if (minutes < 60) return t('home.minutesAgo', { n: Math.floor(minutes) });
  if (hours < 24) return t('home.hoursAgo', { n: Math.floor(hours) });
  if (days < 7) return t('home.daysAgo', { n: Math.floor(days) });
  return date.toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate().toString();
}

export function groupNotificationsByDate(
  notifications: Notification[],
  t: TFunction
): { label: string; items: Notification[] }[] {
  const now = Temporal.Now.zonedDateTimeISO();
  const today = now.toPlainDate();
  const yesterday = today.subtract({ days: 1 });

  const todayItems: Notification[] = [];
  const yesterdayItems: Notification[] = [];
  const earlierItems: Notification[] = [];

  for (const n of notifications) {
    let nd;
    try {
      nd = Temporal.Instant.from(n.createdAt)
        .toZonedDateTimeISO(Temporal.Now.timeZoneId())
        .toPlainDate();
    } catch {
      nd = Temporal.Now.zonedDateTimeISO().toPlainDate();
    }
    const cmpToday = Temporal.PlainDate.compare(nd, today);
    const cmpYesterday = Temporal.PlainDate.compare(nd, yesterday);

    if (cmpToday >= 0) {
      todayItems.push(n);
    } else if (cmpYesterday >= 0) {
      yesterdayItems.push(n);
    } else {
      earlierItems.push(n);
    }
  }

  const groups: { label: string; items: Notification[] }[] = [];
  if (todayItems.length > 0) groups.push({ label: t('home.today'), items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ label: t('home.yesterday'), items: yesterdayItems });
  if (earlierItems.length > 0) groups.push({ label: t('home.earlier'), items: earlierItems });
  return groups;
}
