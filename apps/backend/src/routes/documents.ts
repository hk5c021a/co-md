import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { documentService, DocumentError } from '../services/index.js';
import { pageSchema, createDocumentSchema, updateDocumentSchema } from '@co-md/shared';
import { logger } from '../lib/logger.js';

const app = new Hono();

// Apply auth middleware to all routes
app.use('/*', authMiddleware);

// Get all documents for the current user
app.get('/', async (c: Context) => {
  try {
    const user = c.get('user');
    const { limit, offset } = pageSchema.parse(c.req.query());
    const result = await documentService.getAllForUser(user.id, limit, offset);

    return c.json({
      success: true,
      data: { items: result.items, total: result.total, limit, offset },
    });
  } catch (err) {
    logger.error('Error fetching documents:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch documents' },
      },
      500
    );
  }
});

// Check if document name already exists for current user
app.get('/check-name', async (c: Context) => {
  try {
    const user = c.get('user');
    const title = c.req.query('title');
    const excludeId = c.req.query('excludeId');

    if (!title || title.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Title query parameter is required' },
        },
        400
      );
    }

    // Validate input lengths to prevent resource exhaustion
    if (title.length > 255) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Title too long (max 255 characters)' },
        },
        400
      );
    }

    const exists = await documentService.checkNameDuplicate(
      user.id,
      title.trim(),
      excludeId || undefined
    );

    return c.json({
      success: true,
      data: { exists },
    });
  } catch (err) {
    logger.error('Error checking document name:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to check document name' },
      },
      500
    );
  }
});

// Get document by ID
app.get('/:id', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;

    const hasAccess = await documentService.hasAccess(documentId, user.id);
    if (!hasAccess) {
      return c.json(
        {
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'You do not have access to this document' },
        },
        403
      );
    }

    const doc = await documentService.getById(documentId);

    if (!doc) {
      return c.json(
        {
          success: false,
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: doc,
    });
  } catch (err) {
    logger.error('Error fetching document:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch document' },
      },
      500
    );
  }
});

// Copy document
app.post('/:id/copy', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;

    // Check source document exists and user has at least read access
    const hasAccess = await documentService.hasAccess(documentId, user.id);
    if (!hasAccess) {
      return c.json(
        {
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'You do not have access to this document' },
        },
        403
      );
    }

    const sourceDoc = await documentService.getById(documentId);
    if (!sourceDoc) {
      return c.json(
        {
          success: false,
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        },
        404
      );
    }

    const copiedDoc = await documentService.create({
      title: `Copy of ${sourceDoc.title}`,
      content: sourceDoc.content,
      ownerId: user.id,
    });

    return c.json(
      {
        success: true,
        data: copiedDoc,
      },
      201
    );
  } catch (err) {
    if (err instanceof DocumentError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.code === 'ACCESS_DENIED' ? 403 : 400
      );
    }
    logger.error('Error copying document:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to copy document' },
      },
      500
    );
  }
});

// Create document
app.post('/', async (c: Context) => {
  try {
    const user = c.get('user');
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { success: false, error: { code: 'INVALID_JSON', message: 'Invalid request body' } },
        400
      );
    }
    const validated = createDocumentSchema.parse(body);

    const doc = await documentService.create({
      title: validated.title,
      content: validated.content,
      ownerId: user.id,
    });

    return c.json(
      {
        success: true,
        data: doc,
      },
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              process.env.NODE_ENV === 'production' ? 'Invalid input' : (err as Error).message,
          },
        },
        400
      );
    }
    if (err instanceof DocumentError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'ACCESS_DENIED' ? 403 : 400
      );
    }
    logger.error('Error creating document:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create document' },
      },
      500
    );
  }
});

// Update document
app.patch('/:id', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { success: false, error: { code: 'INVALID_JSON', message: 'Invalid request body' } },
        400
      );
    }
    const validated = updateDocumentSchema.parse(body);

    const doc = await documentService.update(documentId, user.id, {
      title: validated.title,
      content: validated.content,
    });

    return c.json({
      success: true,
      data: doc,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              process.env.NODE_ENV === 'production' ? 'Invalid input' : (err as Error).message,
          },
        },
        400
      );
    }
    if (err instanceof DocumentError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'ACCESS_DENIED' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400
      );
    }
    logger.error('Error updating document:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update document' },
      },
      500
    );
  }
});

// Delete document
app.delete('/:id', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;

    await documentService.delete(documentId, user.id);

    return c.json({
      success: true,
      data: { message: 'Document deleted successfully' },
    });
  } catch (err) {
    if (err instanceof DocumentError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'ACCESS_DENIED' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400
      );
    }
    logger.error('Error deleting document:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete document' },
      },
      500
    );
  }
});

// Get document sync state (for Yjs)
app.get('/:id/sync', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;

    const hasAccess = await documentService.hasAccess(documentId, user.id);
    if (!hasAccess) {
      return c.json(
        {
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'You do not have access to this document' },
        },
        403
      );
    }

    const doc = await documentService.getById(documentId);

    if (!doc) {
      return c.json(
        {
          success: false,
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        documentId: doc.id,
        version: doc.version,
        update: null,
      },
    });
  } catch (err) {
    logger.error('Error getting document sync state:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get document sync state' },
      },
      500
    );
  }
});

// Submit document sync update (from Yjs)
app.post('/:id/sync', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { success: false, error: { code: 'INVALID_JSON', message: 'Invalid request body' } },
        400
      );
    }

    const hasAccess = await documentService.hasAccess(documentId, user.id, ['owner', 'read-write']);
    if (!hasAccess) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this document' },
        },
        403
      );
    }

    const schema = z.object({
      update: z.unknown(),
      version: z.string().optional(),
    });

    const validated = schema.parse(body);

    // In a full implementation, Yjs updates would be applied here
    // For now, we acknowledge the update
    const doc = await documentService.getById(documentId);

    if (!doc) {
      return c.json(
        {
          success: false,
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        },
        404
      );
    }

    // Update document to increment version for conflict detection
    const updated = await documentService.update(documentId, user.id, {
      version: String(Date.now()),
    });

    return c.json({
      success: true,
      data: {
        documentId,
        version: updated.version,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              process.env.NODE_ENV === 'production' ? 'Invalid input' : (err as Error).message,
          },
        },
        400
      );
    }
    if (err instanceof DocumentError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'ACCESS_DENIED' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400
      );
    }
    logger.error('Error syncing document:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to sync document' },
      },
      500
    );
  }
});

export default app;
