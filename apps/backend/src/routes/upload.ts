import { Hono } from 'hono';
import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { auditLog } from '../lib/audit.js';
import { and, asc, eq, count, sum } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { documentFiles } from '../db/schema.js';
import { uploadToStorage, deleteFromStorage } from '../lib/storage.js';
import { logger } from '../lib/logger.js';

const app = new Hono();
app.use('/*', authMiddleware);

// Magic bytes for content-based MIME validation
type MagicBytesRule = number[] | { header: number[]; offset: number; subheader: number[] };
const MAGIC_BYTES: Record<string, MagicBytesRule> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': {
    header: [0x52, 0x49, 0x46, 0x46], // 'RIFF'
    offset: 8,
    subheader: [0x57, 0x45, 0x42, 0x50], // 'WEBP'
  },
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const expected = MAGIC_BYTES[mimeType];
  // Reject unknown MIME types — only explicitly whitelisted types are accepted.
  // This prevents attackers from bypassing validation by sending unlisted types.
  if (!expected) return false;
  if (Array.isArray(expected)) {
    for (let i = 0; i < expected.length; i++) {
      if (buffer[i] !== expected[i]) return false;
    }
    return true;
  }
  // Extended check with offset (e.g. WebP)
  const ext = expected as { header: number[]; offset: number; subheader: number[] };
  for (let i = 0; i < ext.header.length; i++) {
    if (buffer[i] !== ext.header[i]) return false;
  }
  for (let i = 0; i < ext.subheader.length; i++) {
    if (buffer[ext.offset + i] !== ext.subheader[i]) return false;
  }
  return true;
}

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_SIZE = Number(process.env.UPLOAD_MAX_SIZE) || 10 * 1024 * 1024; // 10MB default
const MAX_FILES_PER_DOC = Number(process.env.UPLOAD_MAX_FILES_PER_DOC) || 50;
const MAX_STORAGE_PER_USER = Number(process.env.UPLOAD_MAX_STORAGE_PER_USER) || 100 * 1024 * 1024; // 100MB

// Upload image for a document
app.post('/', async (c: Context) => {
  try {
    const user = c.get('user');
    const form = await c.req.formData();
    const file = form.get('file') as File | null;
    const documentId = form.get('documentId') as string | null;

    if (!file) {
      return c.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing file' } },
        400
      );
    }
    if (!documentId) {
      return c.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing documentId' } },
        400
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid file type' },
        },
        400
      );
    }
    if (file.size > MAX_SIZE) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'File too large (max 10MB)' },
        },
        400
      );
    }

    // Read file buffer once for both magic byte validation and upload
    const buf = Buffer.from(await file.arrayBuffer());

    if (!validateMagicBytes(buf, file.type)) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'File content does not match claimed type' },
        },
        400
      );
    }

    // Check user has write access to the document
    const owner = await db.query.documents.findFirst({
      where: (docs, { eq, and }) => and(eq(docs.id, documentId), eq(docs.ownerId, user.id)),
    });
    const perm = owner
      ? null
      : await db.query.permissions.findFirst({
          where: (perms, { eq, and }) =>
            and(
              eq(perms.documentId, documentId),
              eq(perms.userId, user.id),
              eq(perms.level, 'read-write')
            ),
        });
    if (!owner && !perm) {
      return c.json(
        {
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'No write access to this document' },
        },
        403
      );
    }

    // ── Upload quotas ──
    const docCount = await db
      .select({ count: count() })
      .from(documentFiles)
      .where(eq(documentFiles.documentId, documentId));
    if (docCount[0].count >= MAX_FILES_PER_DOC) {
      return c.json(
        {
          success: false,
          error: {
            code: 'LIMIT_EXCEEDED',
            message: `Document has reached maximum ${MAX_FILES_PER_DOC} files`,
          },
        },
        400
      );
    }

    if (process.env.UPLOAD_MAX_STORAGE_PER_USER) {
      const userSize = await db
        .select({ total: sum(documentFiles.size) })
        .from(documentFiles)
        .where(eq(documentFiles.userId, user.id));
      const currentTotal = Number(userSize[0]?.total || 0);
      if (currentTotal + file.size > MAX_STORAGE_PER_USER) {
        return c.json(
          {
            success: false,
            error: { code: 'QUOTA_EXCEEDED', message: 'User storage quota exceeded' },
          },
          400
        );
      }
    }

    // Detect duplicate filename within the same document; generate unique fileName
    const existing = await db
      .select({ fileName: documentFiles.fileName })
      .from(documentFiles)
      .where(and(eq(documentFiles.documentId, documentId), eq(documentFiles.fileName, file.name)))
      .orderBy(asc(documentFiles.createdAt));

    let fileName = file.name;
    if (existing.length > 0) {
      const base = file.name.replace(/(\.[^.]+)$/, '');
      const ext = file.name.match(/(\.[^.]+)$/)?.[1] || '';
      let i = 1;
      const used = new Set(existing.map((e) => e.fileName));
      while (used.has(fileName)) {
        fileName = `${base}-${i}${ext}`;
        i++;
      }
    }

    const objectKey = `uploads/${user.id}/${documentId}/${randomUUID().slice(0, 8)}/${fileName}`;

    // Upload to RustFS via S3-compatible API
    try {
      await uploadToStorage(objectKey, buf, file.type);
    } catch (e) {
      logger.error('Storage upload failed', e);
      return c.json(
        {
          success: false,
          error: { code: 'UPLOAD_FAILED', message: 'Storage service unavailable' },
        },
        502
      );
    }

    // Insert record — if DB insert fails, clean up the S3 object
    const id = randomUUID();
    try {
      await db.insert(documentFiles).values({
        id,
        documentId,
        userId: user.id,
        objectKey,
        fileName,
        mimeType: file.type,
        size: file.size,
      });
    } catch (dbErr) {
      logger.error('DB insert after upload failed, cleaning up S3 object', dbErr);
      try {
        await deleteFromStorage(objectKey);
      } catch (cleanupErr) {
        logger.error('Failed to clean up orphaned S3 object', cleanupErr);
      }
      return c.json(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to save file record' },
        },
        500
      );
    }

    auditLog('file.upload', {
      'audit.user_id': user.id,
      'audit.resource_type': 'document',
      'audit.resource_id': documentId,
      'audit.size': file.size,
    });

    return c.json(
      {
        success: true,
        data: {
          url: `/api/files/${objectKey}`,
          filename: fileName,
          size: file.size,
          contentType: file.type,
        },
      },
      201
    );
  } catch (err) {
    logger.error('Upload error', err);
    return c.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Upload failed' } },
      500
    );
  }
});

export default app;
