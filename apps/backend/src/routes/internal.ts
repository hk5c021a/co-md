import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { permissionService } from '../services/index.js';
import { internalAuthMiddleware } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const app = new Hono();

// Protect internal endpoints with a shared secret
app.use('/*', internalAuthMiddleware);

// GET /api/internal/documents/:id/permission/:userId
// Returns the permission level for a given document+user pair.
// Used by the WebSocket server to authorize document connections.
app.get('/documents/:id/permission/:userId', async (c: Context) => {
  const documentId = c.req.param('id') ?? '';
  const userId = c.req.param('userId') ?? '';

  if (!documentId || !userId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing documentId or userId' } },
      400
    );
  }

  try {
    const level = await permissionService.getPermissionLevel(documentId, userId);
    return c.json({ success: true, data: { level } });
  } catch {
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to check permission' },
      },
      500
    );
  }
});

const syncSchema = z.object({
  update: z.string().optional(),
  content: z.object({ yjsUpdate: z.string() }).optional(),
});

// GET /api/internal/documents/:id/sync
// Returns persisted Yjs document state for initial load.
app.get('/documents/:id/sync', async (c: Context) => {
  const documentId = c.req.param('id') ?? '';
  if (!documentId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing documentId' } },
      400
    );
  }

  try {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      columns: { content: true },
    });
    if (!doc) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    return c.json({ success: true, data: { content: doc.content } });
  } catch {
    return c.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch document state' } },
      500
    );
  }
});

// POST /api/internal/documents/:id/sync
// Persists Yjs document state when the last WebSocket client disconnects.
app.post('/documents/:id/sync', async (c: Context) => {
  const documentId = c.req.param('id') ?? '';
  if (!documentId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing documentId' } },
      400
    );
  }

  try {
    const body = await c.req.json();
    const validated = syncSchema.parse(body);
    // Accept both flat { update: "..." } and nested { content: { yjsUpdate: "..." } }
    const yjsUpdate = validated.update || validated.content?.yjsUpdate || null;
    if (yjsUpdate) {
      await db
        .update(documents)
        .set({
          content: { yjsUpdate, syncedAt: new Date().toISOString() },
          version: String(Date.now()),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
    }
    return c.json({ success: true });
  } catch {
    return c.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to sync document' } },
      500
    );
  }
});

export default app;
