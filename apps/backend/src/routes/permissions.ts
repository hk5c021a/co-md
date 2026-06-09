import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { permissionService, PermissionError } from '../services/index.js';
import { documentRepository, permissionRepository } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

const permissionLevelSchema = z.enum(['read-only', 'read-write', 'revoked']);

const grantPermissionSchema = z.object({
  userId: z.string().uuid(),
  level: permissionLevelSchema,
});

const batchGrantPermissionSchema = z.object({
  permissions: z.array(
    z.object({
      userId: z.string().uuid(),
      level: permissionLevelSchema,
    })
  ),
});

const app = new Hono();

// Apply auth middleware to all routes
app.use('/*', authMiddleware);

// Get permissions between current user and a contact (must be before /:id routes)
app.get('/contact/:contactUserId', async (c: Context) => {
  try {
    const user = c.get('user');
    const contactUserId = c.req.param('contactUserId') as string;

    // Get all documents owned by current user
    const ownedDocs = await documentRepository.findByOwnerId(user.id);
    // Get permissions the current user has granted
    const myPermissions = await permissionRepository.findByUserId(user.id);
    // Get permissions the contact has granted to current user
    const grantedToMe = await permissionRepository.findByGrantedBy(contactUserId);

    const results: Array<{
      permissionId: string;
      documentId: string;
      documentTitle: string;
      level: string;
      isOwner: boolean;
    }> = [];

    // Files owned by current user that are shared with contact
    for (const doc of ownedDocs) {
      const perm = await permissionRepository.findByDocumentAndUser(doc.id, contactUserId);
      if (perm) {
        results.push({
          permissionId: perm.id,
          documentId: doc.id,
          documentTitle: doc.title,
          level: perm.level,
          isOwner: true,
        });
      }
    }

    // Files where current user has permission (granted by contact)
    const sharedWithMe = myPermissions.filter((p) => p.grantedBy === contactUserId);
    for (const perm of sharedWithMe) {
      if (!results.find((r) => r.permissionId === perm.id)) {
        const doc = await documentRepository.findById(perm.documentId);
        if (doc) {
          results.push({
            permissionId: perm.id,
            documentId: doc.id,
            documentTitle: doc.title,
            level: perm.level,
            isOwner: false,
          });
        }
      }
    }

    return c.json({ success: true, data: results });
  } catch (err) {
    logger.error('Error fetching contact permissions:', err);
    return c.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch permissions' } },
      500
    );
  }
});

// Get user's permissions across all documents (must be before /:id routes)
app.get('/me/permissions', async (c: Context) => {
  try {
    const user = c.get('user');
    const permissions = await permissionService.getMyPermissions(user.id);

    return c.json({
      success: true,
      data: permissions,
    });
  } catch (err) {
    logger.error('Error fetching user permissions:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch permissions' },
      },
      500
    );
  }
});

// Get all permissions for a document (owner only)
app.get('/:id/permissions', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;

    const permissions = await permissionService.getDocumentPermissions(documentId, user.id);

    return c.json({
      success: true,
      data: permissions,
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'ACCESS_DENIED'
          ? 403
          : err.code === 'NOT_FOUND' ||
              err.code === 'DOCUMENT_NOT_FOUND' ||
              err.code === 'USER_NOT_FOUND'
            ? 404
            : 400
      );
    }
    logger.error('Error fetching permissions:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch permissions' },
      },
      500
    );
  }
});

// Grant or update permissions (batch)
app.post('/:id/permissions', async (c: Context) => {
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

    const validated = batchGrantPermissionSchema.parse(body);

    const permissions = await permissionService.batchGrant({
      documentId,
      permissions: validated.permissions,
      grantedBy: user.id,
    });

    return c.json({
      success: true,
      data: permissions.map((p) => ({
        userId: p.userId,
        success: true,
        level: p.level,
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: process.env.NODE_ENV === 'production' ? 'Invalid input' : err.message,
          },
        },
        400
      );
    }
    if (err instanceof PermissionError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'ACCESS_DENIED'
          ? 403
          : err.code === 'NOT_FOUND' ||
              err.code === 'DOCUMENT_NOT_FOUND' ||
              err.code === 'USER_NOT_FOUND'
            ? 404
            : 400
      );
    }
    logger.error('Error granting permissions:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to grant permissions' },
      },
      500
    );
  }
});

// Revoke permission
app.delete('/:id/permissions/:permissionId', async (c: Context) => {
  try {
    const user = c.get('user');
    const permissionId = c.req.param('permissionId') as string;

    await permissionService.revoke(permissionId, user.id);

    return c.json({
      success: true,
      data: { message: 'Permission revoked successfully' },
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'ACCESS_DENIED'
          ? 403
          : err.code === 'NOT_FOUND' ||
              err.code === 'DOCUMENT_NOT_FOUND' ||
              err.code === 'USER_NOT_FOUND'
            ? 404
            : 400
      );
    }
    logger.error('Error revoking permission:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke permission' },
      },
      500
    );
  }
});

// Leave document (current user revokes own permission)
app.post('/:id/leave', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;

    await permissionService.leaveDocument(documentId, user.id);

    return c.json({
      success: true,
      data: { message: 'Left document successfully' },
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        404
      );
    }
    logger.error('Error leaving document:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to leave document' },
      },
      500
    );
  }
});

// Check access to a document
app.get('/:id/access', async (c: Context) => {
  try {
    const user = c.get('user');
    const documentId = c.req.param('id') as string;
    const query = c.req.query();
    const requiredLevels = query.levels
      ? query.levels.split(',')
      : ['read-only', 'read-write', 'owner'];

    const hasAccess = await permissionService.checkAccess(documentId, user.id, requiredLevels);
    const level = await permissionService.getPermissionLevel(documentId, user.id);

    return c.json({
      success: true,
      data: {
        hasAccess,
        level,
      },
    });
  } catch (err) {
    logger.error('Error checking access:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to check access' },
      },
      500
    );
  }
});

export default app;
