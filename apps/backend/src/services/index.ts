export { authService, AuthError } from './AuthService.js';
export type { RegisterData, LoginData, AuthResult } from './AuthService.js';

export {
  userCache,
  permissionCache,
} from './CacheService.js';

export { documentService, DocumentError } from './DocumentService.js';
export type { CreateDocumentData, UpdateDocumentData } from './DocumentService.js';

export { permissionService, PermissionError } from './PermissionService.js';
export type {
  PermissionLevel,
  GrantPermissionData,
  BatchGrantPermissionData,
  UpdatePermissionData,
} from './PermissionService.js';

export { contactService, ContactError } from './ContactService.js';
export type { SearchUsersResult } from './ContactService.js';

export { notificationService, NotificationError } from './NotificationService.js';

export { userService, UserError } from './UserService.js';
export type { UpdateProfileData, ChangePasswordData } from './UserService.js';

export { emailService } from './EmailService.js';
