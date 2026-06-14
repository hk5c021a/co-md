import type {
  User,
  Session,
  Document,
  Contact,
  ContactInvitation,
  Permission,
  Notification,
} from '../entities/index.js';

// Standard API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Auth endpoints
export interface RegisterRequest {
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterResponse {
  user: Omit<User, 'passwordHash'>;
  session: Omit<Session, 'accessToken' | 'refreshTokenHash'>;
}

export interface LoginRequest {
  identifier: string; // username, email, or phone
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'passwordHash'>;
  session: Omit<Session, 'refreshTokenHash'>;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdateProfileRequest {
  username?: string;
  email?: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

// Document endpoints
export interface CreateDocumentRequest {
  title: string;
  content?: unknown;
}

export interface UpdateDocumentRequest {
  title?: string;
  content?: unknown;
}

export interface DocumentResponse {
  document: Document;
}

// Permission endpoints
export interface GrantPermissionRequest {
  userId: string;
  level: 'read-only' | 'read-write';
}

export interface BatchGrantPermissionRequest {
  permissions: GrantPermissionRequest[];
}

export interface PermissionResponse {
  permission: Permission;
}

export interface PermissionChangeMessage {
  type: 'permission-change';
  data: {
    documentId: string;
    level: 'read-only' | 'read-write' | 'revoked';
  };
}

export interface DocumentDeleteMessage {
  type: 'document-deleted';
  data: {
    documentId: string;
    documentTitle: string;
  };
}

// Contact endpoints
export interface SearchUsersRequest {
  query: string;
}

export interface SearchUsersResponse {
  users: Array<Omit<User, 'passwordHash'>>;
}

export interface SendInvitationRequest {
  inviteeId: string;
}

export interface InvitationResponse {
  invitation: ContactInvitation;
}

export interface AcceptInvitationRequest {
  invitationId: string;
}

export interface ContactResponse {
  contact: Contact;
}

export interface ContactsListResponse {
  contacts: Array<{
    contact: Omit<Contact, 'userId'>;
    user: Omit<User, 'passwordHash'>;
  }>;
}

// Notification endpoints
export interface NotificationResponse {
  notification: Notification;
}

export interface NotificationsListResponse {
  notifications: Notification[];
}

export interface MarkNotificationReadRequest {
  notificationId: string;
}

// WebSocket message types
export interface WSMessage {
  type: string;
  data?: unknown;
}

export interface WSDocumentUpdate {
  type: 'doc-update';
  data: {
    docId: string;
    update: Uint8Array;
    version: string;
  };
}

export interface WSAwarenessUpdate {
  type: 'awareness-update';
  data: {
    docId: string;
    update: Uint8Array;
  };
}
