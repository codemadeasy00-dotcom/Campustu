// Photo storage. Two drivers with the same three functions: save / remove / urlFor.
//   - local disk (default, for your own PC)
//   - S3-compatible bucket (when S3_BUCKET is set): Supabase Storage, Cloudflare R2, AWS S3...
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');

const useS3 = Boolean(config.s3.bucket);

// ---------- S3 driver ----------
let s3, S3Cmds;
if (useS3) {
  S3Cmds = require('@aws-sdk/client-s3');
  s3 = new S3Cmds.S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    forcePathStyle: true, // required by Supabase and most S3-compatible hosts
    credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
  });
}

// ---------- Local driver ----------
const root = path.resolve(config.uploadDir);
function resolveKey(key) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key'); // never escape the folder
  return full;
}

async function save(key, buffer) {
  if (useS3) {
    await s3.send(new S3Cmds.PutObjectCommand({
      Bucket: config.s3.bucket, Key: key, Body: buffer,
      ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable',
    }));
    return;
  }
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
}

async function remove(key) {
  if (useS3) {
    await s3.send(new S3Cmds.DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    return;
  }
  await fs.rm(resolveKey(key), { force: true });
}

const urlFor = (key) => (useS3 ? `${config.s3.publicBaseUrl}/${key}` : `${config.publicBaseUrl}/uploads/${key}`);

module.exports = { root, useS3, save, remove, urlFor };
