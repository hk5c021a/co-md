import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToken } from './useToken';
import { tokenStore } from '../lib/tokenStore';
import { API_BASE, apiFetch } from '../lib/apiClient';
import { preHashPassword, generatePbkdf2Salt } from '../lib/crypto';
import type { ApiErrorData } from '../lib/validation';
import type { User, Permission, Notification, Contact } from '../types/models';

export type { User, Permission, Notification, Contact };

export class ApiError extends Error {
  constructor(
    public code: string | undefined,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(data: { error?: ApiErrorData }, fallbackMessage: string): ApiError {
    return new ApiError(data.error?.code, data.error?.message || fallbackMessage);
  }
}

// ═══ Auth API hooks ═══

interface LoginRequest {
  identifier: string;
  passwordHash: string;
  pbkdf2Salt?: string;
  captchaId?: string;
  captchaAnswer?: number;
}

interface RegisterRequest {
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  confirmPasswordHash: string;
  pbkdf2Salt: string;
  captchaId: string;
  captchaAnswer: number;
}

interface AuthDataResponse {
  success: true;
  data: {
    user: { id: string; username: string; email: string; phone: string };
    session: { id: string; expiresAt: string };
    accessToken: string;
    refreshToken: string;
  };
}

export function useLogin() {
  const { setAuthenticated, broadcastLogin } = useToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentials,
          fingerprint: tokenStore.getFingerprint(),
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw ApiError.fromResponse(data, 'Login failed');
      }
      // Ensure Worker is initialized (derive encryption key) before storing tokens.
      // The Worker's INIT handler derives the key from fingerprint; this must
      // complete before STORE_RT can encrypt the refresh token.
      await tokenStore.init();
      // Persist tokens via Worker (RT encrypted to IndexedDB).
      // Key material = passwordHash + pbkdf2Salt — the Worker derives its
      // AES-GCM key from this, making the RT irrecoverable without the password.
      if (credentials.passwordHash && credentials.pbkdf2Salt) {
        await tokenStore.storeTokens(data.data.accessToken, data.data.refreshToken, {
          passwordHash: credentials.passwordHash,
          pbkdf2Salt: credentials.pbkdf2Salt,
        });
      } else {
        await tokenStore.storeTokens(data.data.accessToken, data.data.refreshToken);
      }
      tokenStore.accessToken = data.data.accessToken;
      return data as AuthDataResponse;
    },
    onSuccess: () => {
      setAuthenticated(true);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      // Broadcast login to OTHER tabs — uses ignoreNextBroadcast guard to
      // prevent the same tab from re-running initAuth.
      broadcastLogin();
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (credentials: RegisterRequest) => {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!data.success) {
        throw ApiError.fromResponse(data, 'Registration failed');
      }
      // After register, login to get tokens
      return data as AuthDataResponse;
    },
  });
}

export function useLogout() {
  const { logout } = useToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/api/auth/logout', {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Logout failed');
      }
      return data;
    },
    onSuccess: () => {
      logout();
      queryClient.clear();
    },
    // Network failure or server error shouldn't block the user from logging out.
    // Always safe to clear local tokens — worst case user logs in again.
    onError: () => {
      logout();
      queryClient.clear();
    },
  });
}

// ═══ User ═══

export function useUser() {
  const { isAuthenticated } = useToken();

  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await apiFetch('/api/users/me');
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch user');
      }
      return data.data as User;
    },
    enabled: isAuthenticated,
  });
}

// ═══ Permission API hooks ═══

interface DocumentPermission {
  id: string;
  title: string;
  ownerId: string;
}

export function useDocumentPermissions(documentId: string) {
  const { isAuthenticated } = useToken();

  return useQuery({
    queryKey: ['permissions', documentId],
    queryFn: async () => {
      const response = await apiFetch(`/api/permissions/${documentId}/permissions`);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch permissions');
      }
      return data.data as Permission[];
    },
    enabled: isAuthenticated && !!documentId,
  });
}

interface GrantPermissionRequest {
  userId: string;
  level: 'read-only' | 'read-write' | 'revoked';
}

export function useGrantPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      permissions,
    }: {
      documentId: string;
      permissions: GrantPermissionRequest[];
    }) => {
      const response = await apiFetch(`/api/permissions/${documentId}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ permissions }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to grant permissions');
      }
      return data;
    },
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['permissions', documentId] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    },
  });
}

export function useRevokePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      permissionId,
    }: {
      documentId: string;
      permissionId: string;
    }) => {
      const response = await apiFetch(
        `/api/permissions/${documentId}/permissions/${permissionId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to revoke permission');
      }
      return data;
    },
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['permissions', documentId] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    },
  });
}

// ═══ Notification API hooks ═══

export function useNotifications() {
  const { isAuthenticated } = useToken();

  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await apiFetch('/api/notifications');
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch notifications');
      }
      return data.data?.items as Notification[] ?? data.data as Notification[];
    },
    enabled: isAuthenticated,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiFetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to mark notification as read');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to mark all notifications as read');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiFetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to delete notification');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ═══ Contact API hooks ═══

export function useContacts() {
  const { isAuthenticated } = useToken();

  return useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const response = await apiFetch('/api/contacts');
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch contacts');
      }
      return data.data?.items as Contact[] ?? data.data as Contact[];
    },
    enabled: isAuthenticated,
  });
}

// TODO(low-priority): Refactor useSearchUsers to useQuery for built-in cache
// dedup + debounce. Currently a mutation because ContactSearch.tsx triggers
// searches via .mutate() on keystroke. Migration plan:
//   1. Add a `searchQuery` state (string) + `enabled` toggle in ContactSearch
//   2. Replace useMutation with useQuery(key: ['user-search', query], enabled: !!query)
//   3. Use `staleTime: 30_000` to avoid re-fetching on remount
//   4. Keep `debounce` on the input before setting `searchQuery` state
// This is non-blocking — the mutation pattern works correctly; useQuery would
// add automatic dedup when multiple components search the same term.
export function useSearchUsers() {
  return useMutation({
    mutationFn: async (query: string) => {
      const response = await apiFetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to search users');
      }
      return data.data?.items as Contact[] ?? data.data as Contact[];
    },
  });
}

export function useSendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteeId: string) => {
      const response = await apiFetch('/api/contacts/invitations', {
        method: 'POST',
        body: JSON.stringify({ inviteeId }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to send invitation');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiFetch(`/api/contacts/invitations/${invitationId}/accept`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to accept invitation');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiFetch(`/api/contacts/invitations/${invitationId}/decline`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to decline invitation');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useRemoveContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      const response = await apiFetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to remove contact');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ═══ User Settings API hooks ═══

interface UpdateProfileRequest {
  username?: string;
  email?: string;
  phone?: string;
}

interface ChangePasswordApiRequest {
  oldPasswordHash: string;
  newPasswordHash: string;
  newPbkdf2Salt: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: UpdateProfileRequest) => {
      const response = await apiFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to update profile');
      }
      return data.data as User;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (passwords: { currentPassword: string; newPassword: string; identifier: string }) => {
      // Fetch per-user PBKDF2 salt using the user's identifier (email/username), not the password
      let oldSalt = 'co-md-pbkdf2-salt-v1';
      try {
        const saltRes = await fetch(`${API_BASE}/api/auth/salt?identifier=${encodeURIComponent(passwords.identifier)}`);
        const saltData = await saltRes.json();
        if (saltData?.data?.salt) {
          oldSalt = saltData.data.salt;
        }
      } catch { /* network down — use legacy salt; server will reject on mismatch */ }
      // New password uses a fresh random salt for client-side pre-hashing.
      // The backend generates its own per-user salt server-side for storage.
      let newSalt = oldSalt;
      try {
        newSalt = generatePbkdf2Salt();
      } catch { /* fall back to legacy */ }

      const [oldPasswordHash, newPasswordHash] = await Promise.all([
        preHashPassword(passwords.currentPassword, oldSalt),
        preHashPassword(passwords.newPassword, newSalt),
      ]);

      const body: ChangePasswordApiRequest = { oldPasswordHash, newPasswordHash, newPbkdf2Salt: newSalt };
      const response = await apiFetch('/api/users/me/password', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to change password');
      }
      return data;
    },
  });
}

/**
 * Lightweight current-password check — returns true/false without mutating state.
 * Used by SettingsTab for real-time async validation on the old-password field.
 */
export function useVerifyPassword() {
  return useMutation({
    mutationFn: async (passwordHash: string) => {
      const response = await apiFetch('/api/users/me/verify-password', {
        method: 'POST',
        body: JSON.stringify({ passwordHash }),
      });
      const data = await response.json();
      if (!data.success) throw new Error('Verification failed');
      return data.data.valid as boolean;
    },
  });
}
