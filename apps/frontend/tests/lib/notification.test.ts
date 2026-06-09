import { describe, it, expect } from 'vitest';
import {
  getNotificationDisplayText,
  formatRelativeTime,
  groupNotificationsByDate,
} from '../../src/lib/notification';

// Minimal TFunction mock that returns i18n key + args for assertion
function mockT(key: string, vars?: Record<string, unknown>): string {
  if (vars) {
    return `${key}(${JSON.stringify(vars)})`;
  }
  return key;
}

describe('getNotificationDisplayText', () => {
  const t = mockT;

  it('returns permission-granted text with level', () => {
    const text = getNotificationDisplayText(
      {
        id: '1',
        userId: 'u1',
        type: 'permission-granted',
        content: 'raw content',
        metadata: { documentTitle: 'My Doc', level: 'read-write' },
        read: false,
        createdAt: new Date().toISOString(),
      },
      t
    );
    expect(text).toContain('home.notificationPermissionGranted');
    expect(text).toContain('My Doc');
    expect(text).toContain('home.readWrite');
  });

  it('returns permission-revoked text', () => {
    const text = getNotificationDisplayText(
      {
        id: '2',
        userId: 'u1',
        type: 'permission-revoked',
        content: '',
        metadata: { documentTitle: 'Secret Doc' },
        read: false,
        createdAt: new Date().toISOString(),
      },
      t
    );
    expect(text).toContain('home.notificationPermissionRevoked');
    expect(text).toContain('Secret Doc');
  });

  it('returns permission-changed text', () => {
    const text = getNotificationDisplayText(
      {
        id: '3',
        userId: 'u1',
        type: 'permission-changed',
        content: '',
        metadata: { documentTitle: 'Doc', level: 'read-only' },
        read: false,
        createdAt: new Date().toISOString(),
      },
      t
    );
    expect(text).toContain('home.notificationPermissionChanged');
  });

  it('returns contact-invitation text', () => {
    const text = getNotificationDisplayText(
      {
        id: '4',
        userId: 'u1',
        type: 'contact-invitation',
        content: '',
        metadata: { inviterUsername: 'alice' },
        read: false,
        createdAt: new Date().toISOString(),
      },
      t
    );
    expect(text).toContain('home.notificationContactInvitation');
    expect(text).toContain('alice');
  });

  it('returns contact-added text', () => {
    const text = getNotificationDisplayText(
      {
        id: '5',
        userId: 'u1',
        type: 'contact-added',
        content: '',
        metadata: { contactUsername: 'bob' },
        read: false,
        createdAt: new Date().toISOString(),
      },
      t
    );
    expect(text).toContain('home.notificationContactAdded');
    expect(text).toContain('bob');
  });

  it('returns contact-removed text', () => {
    const text = getNotificationDisplayText(
      {
        id: '6',
        userId: 'u1',
        type: 'contact-removed',
        content: '',
        metadata: { removerUsername: 'charlie' },
        read: false,
        createdAt: new Date().toISOString(),
      },
      t
    );
    expect(text).toContain('home.notificationContactRemoved');
  });

  it('falls back to raw content for unknown types', () => {
    const text = getNotificationDisplayText(
      {
        id: '7',
        userId: 'u1',
        type: 'unknown-type' as any,
        content: 'Raw notification text',
        metadata: {},
        read: false,
        createdAt: new Date().toISOString(),
      },
      t
    );
    expect(text).toBe('Raw notification text');
  });
});

describe('formatRelativeTime', () => {
  const t = mockT;

  it('returns justNow for recent timestamps', () => {
    const now = new Date().toISOString();
    const text = formatRelativeTime(now, t);
    expect(text).toBe('home.justNow');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const text = formatRelativeTime(fiveMinAgo, t);
    expect(text).toContain('home.minutesAgo');
  });

  it('returns hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const text = formatRelativeTime(threeHoursAgo, t);
    expect(text).toContain('home.hoursAgo');
  });

  it('returns days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    const text = formatRelativeTime(twoDaysAgo, t);
    expect(text).toContain('home.daysAgo');
  });

  it('returns raw string for invalid date', () => {
    const text = formatRelativeTime('invalid-date', t);
    expect(text).toBe('invalid-date');
  });
});

describe('groupNotificationsByDate', () => {
  const t = mockT;

  it('groups today items', () => {
    const items = [
      {
        id: '1',
        userId: 'u1',
        type: 'permission-granted' as const,
        content: '',
        metadata: {},
        read: false,
        createdAt: new Date().toISOString(),
      },
    ];
    const groups = groupNotificationsByDate(items, t);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toContain('home.today');
  });

  it('groups yesterday items', () => {
    const yesterday = new Date(Date.now() - 86400 * 1000).toISOString();
    const items = [
      {
        id: '2',
        userId: 'u1',
        type: 'permission-revoked' as const,
        content: '',
        metadata: {},
        read: false,
        createdAt: yesterday,
      },
    ];
    const groups = groupNotificationsByDate(items, t);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toContain('home.yesterday');
  });

  it('groups earlier items', () => {
    const lastWeek = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const items = [
      {
        id: '3',
        userId: 'u1',
        type: 'contact-added' as const,
        content: '',
        metadata: {},
        read: false,
        createdAt: lastWeek,
      },
    ];
    const groups = groupNotificationsByDate(items, t);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toContain('home.earlier');
  });
});
