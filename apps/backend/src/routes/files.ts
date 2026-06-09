import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { authMiddleware } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { documentFiles } from '../db/schema.js';
import { getFromStorage } from '../lib/storage.js';
import { logger } from '../lib/logger.js';

const app = new Hono();
app.use('/*', authMiddleware);

// Proxy file download from RustFS via S3-compatible API
// Access: file uploader OR document owner OR document collaborator
app.get('/:objectKey{.+}', async (c: Context) => {
  try {
    const user = c.get('user');
    const objectKey = c.req.param('objectKey') as string;

    // Find the file record
    const file = await db.query.documentFiles.findFirst({
      where: (df, { eq }) => eq(df.objectKey, objectKey),
    });
    if (!file) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'File not found' } },
        404
      );
    }

    // Check access: file uploader, document owner, or collaborator
    if (file.userId !== user.id) {
      const doc = await db.query.documents.findFirst({
        where: (docs, { eq }) => eq(docs.id, file.documentId),
      });
      const isOwner = doc && doc.ownerId === user.id;
      const isCollaborator =
        !isOwner &&
        (await db.query.permissions.findFirst({
          where: (perms, { eq, and, ne }) =>
            and(
              eq(perms.documentId, file.documentId),
              eq(perms.userId, user.id),
              ne(perms.level, 'revoked')
            ),
        }));
      if (!isOwner && !isCollaborator) {
        return c.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
          403
        );
      }
    }

    // Fetch from RustFS via S3 SDK
    try {
      const s3Res = await getFromStorage(objectKey);
      const nodeStream = s3Res.Body as Readable | null;
      if (!nodeStream) {
        return c.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'File not found in storage' } },
          404
        );
      }
      return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': file.contentType,
          'Content-Length': String(file.size),
          'Content-Disposition': 'inline',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (e) {
      logger.error('Storage download failed', e);
      return c.json(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Storage service unavailable' },
        },
        502
      );
    }
  } catch (err) {
    logger.error('File download error', err);
    return c.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Download failed' } },
      500
    );
  }
});

export default app;
