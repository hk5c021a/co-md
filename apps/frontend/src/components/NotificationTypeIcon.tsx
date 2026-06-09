import {
  MdNotifications,
  MdLock,
  MdVisibility,
  MdEdit,
  MdWarning,
  MdPerson,
  MdCheck,
  MdPersonRemove,
} from 'react-icons/md';
import type { Notification } from '../hooks/useApi';

interface NotificationTypeIconProps {
  type: Notification['type'];
  level?: string;
  size?: 'sm' | 'md';
}

export function NotificationTypeIcon({ type, level, size = 'md' }: NotificationTypeIconProps) {
  const cls = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  switch (type) {
    case 'permission-granted':
    case 'permission-changed':
      return level === 'read-only' ? <MdVisibility className={cls} /> : <MdEdit className={cls} />;
    case 'permission-revoked':
      return <MdLock className={cls} />;
    case 'contact-invitation':
      return <MdPerson className={cls} />;
    case 'contact-added':
      return <MdCheck className={cls} />;
    case 'contact-removed':
      return <MdPersonRemove className={cls} />;
    default:
      return <MdNotifications className={cls} />;
  }
}
