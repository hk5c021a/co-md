import { pgTable, text, timestamp, boolean, jsonb, index, unique, integer } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  pbkdf2Salt: text('pbkdf2_salt').default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token').notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  tokenFamilyId: text('token_family_id'),
  revoked: boolean('revoked').default(false),
  deviceInfo: text('device_info'),
  bindingHash: text('binding_hash'),
  bindingPlatform: text('binding_platform'),
  bindingCores: integer('binding_cores'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
  accessTokenIdx: unique('sessions_access_token_idx').on(table.accessToken),
}));

// Password Reset Tokens table
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('password_reset_tokens_user_id_idx').on(table.userId),
  expiresAtIdx: index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
}));

// Folders table
export const folders = pgTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentFolderId: text('parent_folder_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull(),
}, (table) => ({
  ownerIdIdx: index('folders_owner_id_idx').on(table.ownerId),
  parentFolderIdIdx: index('folders_parent_folder_id_idx').on(table.parentFolderId),
}));

// Documents table
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: jsonb('content'),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentFolderId: text('parent_folder_id'),
  version: text('version').notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull(),
}, (table) => ({
  ownerIdIdx: index('documents_owner_id_idx').on(table.ownerId),
  updatedAtIdx: index('documents_updated_at_idx').on(table.updatedAt),
  parentFolderIdIdx: index('documents_parent_folder_id_idx').on(table.parentFolderId),
  contentIdx: index('documents_content_idx').using('gin', table.content),
}));

// Contacts table (bidirectional relationship)
export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contactUserId: text('contact_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdContactUserIdIdx: unique('contacts_user_id_contact_user_id_idx').on(table.userId, table.contactUserId),
  userIdIdx: index('contacts_user_id_idx').on(table.userId),
}));

// Contact Invitations table
export const contactInvitations = pgTable('contact_invitations', {
  id: text('id').primaryKey(),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  inviteeId: text('invitee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // pending, accepted, declined, expired
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  inviteeIdStatusIdx: index('contact_invitations_invitee_id_status_idx').on(table.inviteeId, table.status),
  expiresAtIdx: index('contact_invitations_expires_at_idx').on(table.expiresAt),
}));

// Permissions table
export const permissions = pgTable('permissions', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  level: text('level').notNull(), // read-only, read-write, revoked
  grantedBy: text('granted_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull(),
}, (table) => ({
  documentIdUserIdIdx: unique('permissions_document_id_user_id_idx').on(table.documentId, table.userId),
  userIdIdx: index('permissions_user_id_idx').on(table.userId),
}));

// Notifications table
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // permission-granted, permission-revoked, permission-changed, contact-invitation, contact-added
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdReadIdx: index('notifications_user_id_read_idx').on(table.userId, table.read),
}));

// Document files (uploaded images)
export const documentFiles = pgTable('document_files', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  documentIdIdx: index('document_files_document_id_idx').on(table.documentId),
}));

// ── Inferred types (used by repositories) ──
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ContactInvitation = typeof contactInvitations.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type DocumentFile = typeof documentFiles.$inferSelect;
