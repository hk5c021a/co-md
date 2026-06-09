import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from '../../src/components/NotificationBell';

// Mock hooks - using factory pattern for ESM compatibility
const mockUseNotifications = vi.fn();
const mockUseMarkNotificationRead = vi.fn();
const mockUseMarkAllNotificationsRead = vi.fn();

vi.mock('../../src/hooks/useApi', () => ({
  useNotifications: () => mockUseNotifications(),
  useMarkNotificationRead: () => mockUseMarkNotificationRead(),
  useMarkAllNotificationsRead: () => mockUseMarkAllNotificationsRead(),
}));

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
}

// Helper: click the bell button to open dropdown
function openDropdown() {
  const btn = screen.getByLabelText('home.notifications');
  fireEvent.click(btn);
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNotifications.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseMarkNotificationRead.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseMarkAllNotificationsRead.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it('renders bell button with aria-label', () => {
    renderBell();
    expect(screen.getByLabelText('home.notifications')).toBeTruthy();
  });

  it('shows unread count when there are unread notifications', () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: '1',
          userId: 'user-1',
          type: 'contact-invitation' as const,
          content: 'Test notification',
          metadata: {},
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    renderBell();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows count badge when unread notifications exist', () => {
    mockUseNotifications.mockReturnValue({
      data: Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        userId: 'user-1',
        type: 'contact-invitation' as const,
        content: `Notification ${i}`,
        metadata: {},
        read: false,
        createdAt: new Date().toISOString(),
      })),
      isLoading: false,
    });

    renderBell();
    // Badge shows exact count up to 99, then '99+' when >= 100
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('shows 99+ when unread count is 100 or more', () => {
    mockUseNotifications.mockReturnValue({
      data: Array.from({ length: 110 }, (_, i) => ({
        id: String(i),
        userId: 'user-1',
        type: 'contact-invitation' as const,
        content: `Notification ${i}`,
        metadata: {},
        read: false,
        createdAt: new Date().toISOString(),
      })),
      isLoading: false,
    });

    renderBell();
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('does not show badge when there are no unread notifications', () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: '1',
          userId: 'user-1',
          type: 'contact-invitation' as const,
          content: 'Test notification',
          metadata: {},
          read: true,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    renderBell();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('opens dropdown when bell is clicked', () => {
    renderBell();
    openDropdown();
    expect(screen.getByText('home.notifications')).toBeTruthy();
  });

  it('shows loading skeletons when notifications are loading', () => {
    mockUseNotifications.mockReturnValue({
      data: [],
      isLoading: true,
    });

    renderBell();
    openDropdown();
    // Loading state renders skeleton UI with animate-pulse
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no notifications', () => {
    renderBell();
    openDropdown();
    expect(screen.getByText('home.noNotifications')).toBeTruthy();
  });
});

describe('NotificationBell Content', () => {
  it('displays notification content via i18n template', () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: '1',
          userId: 'user-1',
          type: 'permission-granted' as const,
          content: 'You have been granted access',
          metadata: { documentTitle: 'My Doc' },
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    renderBell();
    openDropdown();

    expect(screen.getByText('home.notificationPermissionGranted')).toBeTruthy();
  });

  it('shows permission-revoked notification text', () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: '1',
          userId: 'user-1',
          type: 'permission-revoked' as const,
          content: 'Access revoked',
          metadata: { documentTitle: 'My Doc' },
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    renderBell();
    openDropdown();

    expect(screen.getByText('home.notificationPermissionRevoked')).toBeTruthy();
  });

  it('shows contact-invitation notification text', () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: '1',
          userId: 'user-1',
          type: 'contact-invitation' as const,
          content: 'New invitation',
          metadata: { inviterUsername: 'alice' },
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    renderBell();
    openDropdown();

    expect(screen.getByText('home.notificationContactInvitation')).toBeTruthy();
  });
});
