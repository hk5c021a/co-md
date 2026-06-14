// ── Notification channel constants ──
export const NOTIFICATION_CHANNEL_PREFIX = 'user:';
export const NOTIFICATION_CHANNEL_SUFFIX = ':notifications';

// User entity
export interface User {
  id: string;
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

// Session entity
export interface Session {
  id: string;
  userId: string;
  accessToken: string;
  refreshTokenHash: string;
  deviceInfo?: string;
  createdAt: Date;
  expiresAt: Date;
}

// Password Reset Token entity
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

// Document entity
export interface Document {
  id: string;
  title: string;
  content: unknown; // CRDT Y.Doc serialized state
  ownerId: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

// Contact entity (bidirectional relationship)
export interface Contact {
  id: string;
  userId: string;
  contactUserId: string;
  createdAt: Date;
}

// Contact Invitation entity
export type ContactInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface ContactInvitation {
  id: string;
  inviterId: string;
  inviteeId: string;
  status: ContactInvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

// Permission entity
export type PermissionLevel = 'read-only' | 'read-write' | 'revoked';

export interface Permission {
  id: string;
  documentId: string;
  userId: string;
  level: PermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Notification entity
export type NotificationType =
  | 'permission-granted'
  | 'permission-revoked'
  | 'permission-changed'
  | 'contact-invitation'
  | 'contact-added'
  | 'contact-removed'
  | 'document-deleted';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  content: string;
  metadata?: unknown;
  read: boolean;
  createdAt: Date;
}
