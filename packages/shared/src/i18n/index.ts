// Translation keys for i18n support

export const authKeys = {
  'auth:usernameRequired': 'Username is required',
  'auth:emailRequired': 'Email is required',
  'auth:emailInvalid': 'Invalid email format',
  'auth:phoneRequired': 'Phone number is required',
  'auth:phoneInvalid': 'Invalid phone number',
  'auth:passwordRequired': 'Password is required',
  'auth:passwordMinLength': 'Password must be at least 12 characters',
  'auth:passwordComplexity': 'Password must contain uppercase, lowercase, number, and special character',
  'auth:passwordsDoNotMatch': 'Passwords do not match',
  'auth:usernameTaken': 'This username is already taken',
  'auth:emailTaken': 'This email is already registered',
  'auth:phoneTaken': 'This phone number is already registered',
  'auth:invalidCredentials': 'Invalid username, email, phone, or password',
  'auth:accountLocked': 'Account is temporarily locked',
  'auth:sessionExpired': 'Session has expired, please log in again',
  'auth:sessionForced': 'Your account has been signed in from another device',
  'auth:passwordResetSent': 'Password reset instructions have been sent to your email',
  'auth:passwordResetInvalid': 'Invalid or expired password reset token',
  'auth:passwordResetSuccess': 'Your password has been reset successfully',
} as const;

export const documentKeys = {
  'document:titleRequired': 'Document title is required',
  'document:titleTooLong': 'Document title is too long',
  'document:notFound': 'Document not found',
  'document:forbidden': 'You do not have permission to access this document',
  'document:createSuccess': 'Document created successfully',
  'document:updateSuccess': 'Document saved',
  'document:deleteSuccess': 'Document deleted',
  'document:moveSuccess': 'Document moved',
  'document:copySuccess': 'Document copied',
} as const;

export const folderKeys = {
  'folder:nameRequired': 'Folder name is required',
  'folder:nameTooLong': 'Folder name is too long',
  'folder:notFound': 'Folder not found',
  'folder:forbidden': 'You do not have permission to access this folder',
  'folder:createSuccess': 'Folder created',
  'folder:deleteSuccess': 'Folder deleted',
  'folder:invalidName': 'Folder name contains invalid characters',
} as const;

export const permissionKeys = {
  'permission:granted': 'You have been granted {level} access to "{documentTitle}"',
  'permission:revoked': 'Your access to "{documentTitle}" has been revoked',
  'permission:changed': 'Your access to "{documentTitle}" has been changed to {level}',
  'permission:ownerRequired': 'Only the document owner can modify permissions',
  'permission:notFound': 'Permission not found',
} as const;

export const contactKeys = {
  'contact:invitationSent': 'Invitation sent to {username}',
  'contact:invitationReceived': '{username} wants to connect with you',
  'contact:invitationExpired': 'This invitation has expired',
  'contact:invitationAccepted': 'You are now connected with {username}',
  'contact:invitationDeclined': 'Invitation declined',
  'contact:removed': '{username} has been removed from your contacts',
  'contact:notFound': 'Contact not found',
  'contact:searchNoResults': 'No users found matching "{query}"',
} as const;

export const notificationKeys = {
  'notification:permissionGranted': 'Permission granted',
  'notification:permissionRevoked': 'Permission revoked',
  'notification:permissionChanged': 'Permission changed',
  'notification:contactInvitation': 'New contact invitation',
  'notification:contactAdded': 'Contact added',
} as const;

export const commonKeys = {
  'common:loading': 'Loading...',
  'common:error': 'An error occurred',
  'common:retry': 'Try again',
  'common:cancel': 'Cancel',
  'common:confirm': 'Confirm',
  'common:save': 'Save',
  'common:delete': 'Delete',
  'common:edit': 'Edit',
  'common:close': 'Close',
  'common:search': 'Search',
  'common:noResults': 'No results found',
  'common:unauthorized': 'Please log in to continue',
  'common:forbidden': 'You do not have permission to perform this action',
  'common:notFound': 'Resource not found',
  'common:serverError': 'Server error, please try again later',
  'common:rateLimited': 'Too many requests, please try again later',
} as const;

export type AuthKeys = typeof authKeys;
export type DocumentKeys = typeof documentKeys;
export type FolderKeys = typeof folderKeys;
export type PermissionKeys = typeof permissionKeys;
export type ContactKeys = typeof contactKeys;
export type NotificationKeys = typeof notificationKeys;
export type CommonKeys = typeof commonKeys;
