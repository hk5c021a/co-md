import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { logger } from './logger.js';

const BUCKET = process.env.RUSTFS_BUCKET || 'collab-files';

let _s3: S3Client | null = null;

// NOTE: S3Client is created once and cached in _s3. Credential rotation requires a
// service restart — the client reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / endpoint
// only at initialization. To enable hot-reload, a rotation-signal mechanism (e.g.
// file-watch, SIGHUP handler) would need to null _s3 so the next call re-creates it.
function getS3(): S3Client {
  const endpoint = process.env.RUSTFS_ENDPOINT || 'http://localhost:9000';
  const accessKey = process.env.RUSTFS_ACCESS_KEY;
  const secretKey = process.env.RUSTFS_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error(
      '[storage] Missing required env vars: RUSTFS_ACCESS_KEY and/or RUSTFS_SECRET_KEY'
    );
  }
  if (!_s3) {
    _s3 = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      maxAttempts: 3,
    });
  }
  return _s3;
}

export async function ensureBucket() {
  try {
    await getS3().send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    try {
      await getS3().send(new CreateBucketCommand({ Bucket: BUCKET }));
      logger.info(`Created bucket: ${BUCKET}`);
    } catch (e) {
      logger.error(`Failed to create bucket: ${BUCKET}`, e);
    }
  }
}

export async function uploadToStorage(key: string, body: Buffer, contentType: string) {
  return getS3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getFromStorage(key: string) {
  return getS3().send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

export async function deleteFromStorage(key: string) {
  return getS3().send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}
