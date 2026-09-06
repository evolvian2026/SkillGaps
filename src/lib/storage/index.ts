import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for resumes.
 *
 * S3-compatible in production (AWS S3, Supabase Storage, MinIO). Falls back to
 * the local filesystem when no bucket is configured, so development and CI do
 * not need a bucket — the interface is identical either way, and no code above
 * this module knows which is in use.
 *
 * Files are never served directly: reads go through a short-lived signed URL.
 */

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

const SIGNED_URL_TTL_SECONDS = 300;
const LOCAL_ROOT = path.join(process.cwd(), ".storage");

function bucket(): string | null {
  return process.env.S3_BUCKET || null;
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION ?? "ap-south-1",
      // Set for Supabase Storage, MinIO and other S3-compatible endpoints.
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
      ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return client;
}

export function isRemoteStorage(): boolean {
  return bucket() !== null;
}

/**
 * Keys are namespaced by tenant and user and carry a random component, so one
 * student's key is never guessable from another's and a bucket listing stays
 * legible during an incident.
 */
export function resumeKey(tenantId: string, userId: string, fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().slice(0, 10) || ".bin";
  return `resumes/${tenantId}/${userId}/${randomUUID()}${ext}`;
}

function localPath(key: string): string {
  // Defence in depth: a traversal in the key must not escape the store.
  const resolved = path.resolve(LOCAL_ROOT, key);
  if (!resolved.startsWith(path.resolve(LOCAL_ROOT) + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredObject> {
  const name = bucket();
  if (name) {
    await s3().send(
      new PutObjectCommand({
        Bucket: name,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Resumes are personal data; never leave them world-readable.
        ACL: "private",
      }),
    );
  } else {
    const file = localPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  return { key, sizeBytes: body.byteLength };
}

export async function getObject(key: string): Promise<Buffer> {
  const name = bucket();
  if (!name) return readFile(localPath(key));

  const result = await s3().send(
    new GetObjectCommand({ Bucket: name, Key: key }),
  );
  const chunks: Buffer[] = [];
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Permanently removes an object. Used by the retention sweep. */
export async function deleteObject(key: string): Promise<void> {
  const name = bucket();
  if (name) {
    await s3().send(new DeleteObjectCommand({ Bucket: name, Key: key }));
    return;
  }
  await rm(localPath(key), { force: true });
}

/**
 * A short-lived download URL.
 *
 * Returns null on local storage: there is no signing authority, and the app
 * serves those bytes through an authenticated route instead. Callers must
 * handle null rather than assuming a URL always exists.
 */
export async function signedDownloadUrl(key: string): Promise<string | null> {
  const name = bucket();
  if (!name) return null;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: name, Key: key }), {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}

/** How long a resume is kept before the retention sweep purges it. */
export function resumeRetentionDays(): number {
  const configured = Number(process.env.RESUME_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : 180;
}

export function resumeRetainUntil(from = new Date()): Date {
  return new Date(from.getTime() + resumeRetentionDays() * 86_400_000);
}
