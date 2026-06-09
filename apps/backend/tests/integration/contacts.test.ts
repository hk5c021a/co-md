import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import contactsRoute from '../../src/routes/contacts.js';
import type { ApiResponse } from '../helpers.js';

const { mockContact, mockInvitation, mockOutgoingInvitation, mockSearchResult } = vi.hoisted(
  () => ({
    mockContact: {
      id: 'contact-1',
      userId: 'test-user-id',
      contactUserId: 'user-456',
      createdAt: new Date(),
    },
    mockInvitation: {
      id: 'inv-123',
      inviterId: 'user-789',
      inviteeId: 'test-user-id',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    },
    mockOutgoingInvitation: {
      id: 'inv-456',
      inviterId: 'test-user-id',
      inviteeId: 'user-789',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    },
    mockSearchResult: {
      id: 'user-456',
      username: 'john_doe',
      email: 'john@example.com',
      phone: '+8613800138000',
    },
  })
);

// Mock auth middleware to bypass JWT verification
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set('user', { id: 'test-user-id' });
    await next();
  },
}));

vi.mock('../../src/services/index.js', () => ({
  contactService: {
    searchUsers: vi.fn().mockResolvedValue([mockSearchResult]),
    getContacts: vi.fn().mockResolvedValue({ items: [mockContact], total: 1 }),
    sendInvitation: vi.fn().mockResolvedValue({
      id: 'inv-new',
      inviterId: 'test-user-id',
      inviteeId: 'user-456',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000),
    }),
    getPendingInvitations: vi.fn().mockResolvedValue([mockInvitation]),
    acceptInvitation: vi.fn().mockResolvedValue(undefined),
    declineInvitation: vi.fn().mockResolvedValue(undefined),
    removeContact: vi.fn().mockResolvedValue(undefined),
    getOutgoingInvitations: vi.fn().mockResolvedValue([mockOutgoingInvitation]),
  },
  ContactError: class ContactError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'ContactError';
      this.code = code;
    }
  },
}));

function createApp() {
  const app = new Hono();
  app.route('/api/contacts', contactsRoute);
  return app;
}

function makeRequest(app: Hono, path: string, options: RequestInit = {}) {
  return app.request(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer mock-token',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

describe('Contacts Routes Integration', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('GET /api/contacts/search', () => {
    it('should return search results for valid query', async () => {
      const resp = await makeRequest(app, '/api/contacts/search?q=john');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
      expect(data.data[0].username).toBe('john_doe');
    });

    it('should return 400 when query is missing', async () => {
      const resp = await makeRequest(app, '/api/contacts/search');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when query is empty', async () => {
      const resp = await makeRequest(app, '/api/contacts/search?q=');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/contacts', () => {
    it('should return contact list', async () => {
      const resp = await makeRequest(app, '/api/contacts');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items.length).toBe(1);
    });
  });

  describe('DELETE /api/contacts/:id', () => {
    it('should remove a contact', async () => {
      const resp = await makeRequest(app, '/api/contacts/user-456', {
        method: 'DELETE',
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('removed');
    });

    it('should return 404 when not a contact', async () => {
      const { contactService, ContactError } = await import('../../src/services/index.js');
      vi.mocked(contactService.removeContact).mockRejectedValueOnce(
        new ContactError('NOT_CONTACT', 'This user is not your contact')
      );

      const resp = await makeRequest(app, '/api/contacts/user-999', {
        method: 'DELETE',
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/contacts/invitations', () => {
    it('should return pending invitations', async () => {
      const resp = await makeRequest(app, '/api/contacts/invitations');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });
  });

  describe('POST /api/contacts/invitations', () => {
    it('should send an invitation', async () => {
      const resp = await makeRequest(app, '/api/contacts/invitations', {
        method: 'POST',
        body: JSON.stringify({ inviteeId: '00000000-0000-0000-0000-000000000456' }),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBeDefined();
    });

    it('should reject missing inviteeId', async () => {
      const resp = await makeRequest(app, '/api/contacts/invitations', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/contacts/invitations/:id/accept', () => {
    it('should accept an invitation', async () => {
      const resp = await makeRequest(app, '/api/contacts/invitations/inv-123/accept', {
        method: 'POST',
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('accepted');
    });
  });

  describe('POST /api/contacts/invitations/:id/decline', () => {
    it('should decline an invitation', async () => {
      const resp = await makeRequest(app, '/api/contacts/invitations/inv-123/decline', {
        method: 'POST',
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('declined');
    });
  });

  describe('GET /api/contacts/invitations/outgoing', () => {
    it('should return outgoing invitations', async () => {
      const resp = await makeRequest(app, '/api/contacts/invitations/outgoing');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBe(1);
    });
  });
});
