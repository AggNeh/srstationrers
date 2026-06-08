/**
 * storage.js — S3-compatible object storage abstraction.
 *
 * Works with any S3-API provider: Cloudflare R2 (recommended), AWS S3,
 * Backblaze B2, Wasabi, MinIO, DigitalOcean Spaces.
 *
 * Configuration via env vars:
 *   STORAGE_ENDPOINT        - service endpoint URL (e.g. https://<accountid>.r2.cloudflarestorage.com)
 *   STORAGE_ACCESS_KEY_ID   - access key
 *   STORAGE_SECRET_KEY      - secret key
 *   STORAGE_BUCKET          - bucket name
 *   STORAGE_PUBLIC_URL      - public base URL (custom domain or r2.dev URL)
 *   STORAGE_REGION          - optional, defaults to 'auto' (right for R2)
 *
 * If unset, the upload route falls back to writing files to local disk
 * (useful in dev, fragile in production on ephemeral filesystems).
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const ENDPOINT = process.env.STORAGE_ENDPOINT;
const ACCESS_KEY = process.env.STORAGE_ACCESS_KEY_ID;
const SECRET_KEY = process.env.STORAGE_SECRET_KEY;
const BUCKET = process.env.STORAGE_BUCKET;
const PUBLIC_URL = (process.env.STORAGE_PUBLIC_URL || '').replace(/\/$/, '');
const REGION = process.env.STORAGE_REGION || 'auto';

let _client;

function isConfigured() {
  return !!(ENDPOINT && ACCESS_KEY && SECRET_KEY && BUCKET && PUBLIC_URL);
}

function client() {
  if (!isConfigured()) {
    throw new Error('Object storage is not configured. Set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_KEY, STORAGE_BUCKET and STORAGE_PUBLIC_URL.');
  }
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
      // R2 requires path-style addressing
      forcePathStyle: true,
    });
  }
  return _client;
}

/**
 * Upload a buffer to object storage.
 * @returns {Promise<string>} the public URL of the stored object
 */
async function uploadBuffer(key, buffer, contentType) {
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${PUBLIC_URL}/${key}`;
}

async function deleteObject(key) {
  if (!isConfigured()) return;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (e) { /* swallow — best-effort delete */ }
}

/**
 * Given a stored URL, derive the bucket key (used when deleting a removed image).
 */
function keyFromUrl(url) {
  if (!PUBLIC_URL || !url || !url.startsWith(PUBLIC_URL)) return null;
  return url.slice(PUBLIC_URL.length + 1);
}

module.exports = { isConfigured, uploadBuffer, deleteObject, keyFromUrl, PUBLIC_URL };
