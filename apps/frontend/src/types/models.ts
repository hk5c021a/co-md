// Shared domain model types
//
// NOTE: These types represent the JSON-serialized API response shapes.
// They differ from @collab/shared entities in two ways:
// 1. Date fields are `string` (ISO 8601) — the wire format after JSON.stringify.
// 2. Some types include denormalized nested objects (e.g. Permission.user)
//    that are assembled by the backend API layer, not present in DB entities.
//
// When adding new fields, ensure they match the actual API response shape.
// Consider generating these from the OpenAPI spec in the future.

export interface User {
  id: string;
  username: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  documentId: string;
  userId: string;
  level: 'read-only' | 'read-write' | 'revoked';
  grantedBy: string;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; username: string; email: string };
  grantedByUser?: { id: string; username: string };
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'permission-granted'
    | 'permission-revoked'
    | 'permission-changed'
    | 'contact-invitation'
    | 'contact-added'
    | 'contact-removed';
  content: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface Contact {
  id: string;
  username: string;
  email: string;
  phone: string;
  addedAt: string;
}

export interface OnlineUser {
  clientId: number;
  name: string;
  color: string;
}
