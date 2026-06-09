import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import documentsRoute from '../../src/routes/documents.js';
import type { ApiResponse } from '../helpers.js';

const { mockDocument } = vi.hoisted(() => {
  const d = {
    id: 'doc-123',
    title: 'Test Document',
    content: { text: 'Hello' },
    ownerId: 'test-user-id',
    version: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    mockDocument: d,
  };
});

// Mock auth middleware to bypass JWT verification
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set('user', { id: 'test-user-id' });
    await next();
  },
}));

vi.mock('../../src/services/index.js', () => ({
  documentService: {
    getAllForUser: vi.fn().mockResolvedValue({ items: [mockDocument], total: 1 }),
    getById: vi.fn().mockResolvedValue(mockDocument),
    create: vi.fn().mockResolvedValue(mockDocument),
    update: vi.fn().mockResolvedValue({ ...mockDocument, title: 'Updated' }),
    delete: vi.fn().mockResolvedValue(undefined),
    hasAccess: vi.fn().mockResolvedValue(true),
  },
  DocumentError: class DocumentError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'DocumentError';
      this.code = code;
    }
  },
}));

function createApp() {
  const app = new Hono();
  app.route('/api/documents', documentsRoute);
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

describe('Documents Routes Integration', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('GET /api/documents', () => {
    it('should return list of documents', async () => {
      const resp = await makeRequest(app, '/api/documents');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items.length).toBe(1);
      expect(data.data.items[0].title).toBe('Test Document');
    });
  });

  describe('GET /api/documents/:id', () => {
    it('should return document when user has access', async () => {
      const resp = await makeRequest(app, '/api/documents/doc-123');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('doc-123');
    });

    it('should return 403 when user has no access', async () => {
      const { documentService } = await import('../../src/services/index.js');
      vi.mocked(documentService.hasAccess).mockResolvedValueOnce(false);

      const resp = await makeRequest(app, '/api/documents/private-doc');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('ACCESS_DENIED');
    });

    it('should return 404 when document not found', async () => {
      const { documentService } = await import('../../src/services/index.js');
      vi.mocked(documentService.getById).mockResolvedValueOnce(null);

      const resp = await makeRequest(app, '/api/documents/nonexistent');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('DOCUMENT_NOT_FOUND');
    });
  });

  describe('POST /api/documents', () => {
    it('should create document with valid data', async () => {
      const resp = await makeRequest(app, '/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Doc', content: { text: 'Hello' } }),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Test Document');
    });

    it('should reject empty title', async () => {
      const resp = await makeRequest(app, '/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title: '' }),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing title', async () => {
      const resp = await makeRequest(app, '/api/documents', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/documents/:id', () => {
    it('should update document title', async () => {
      const resp = await makeRequest(app, '/api/documents/doc-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated' }),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Updated');
    });

    it('should reject empty title', async () => {
      const resp = await makeRequest(app, '/api/documents/doc-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: '' }),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('should delete document', async () => {
      const resp = await makeRequest(app, '/api/documents/doc-123', {
        method: 'DELETE',
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('deleted');
    });
  });

  describe('GET /api/documents/:id/sync', () => {
    it('should return sync state', async () => {
      const resp = await makeRequest(app, '/api/documents/doc-123/sync');
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.documentId).toBe('doc-123');
      expect(data.data.version).toBe('0');
    });
  });

  describe('POST /api/documents/:id/sync', () => {
    it('should accept sync update', async () => {
      const resp = await makeRequest(app, '/api/documents/doc-123/sync', {
        method: 'POST',
        body: JSON.stringify({ update: {} }),
      });
      const data = (await resp.json()) as ApiResponse;

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.documentId).toBe('doc-123');
    });
  });
});
