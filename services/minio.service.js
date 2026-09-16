/**
 * Object storage for the generated invitation PDFs (PRD §4.4 — FC-015).
 *
 * uploadBuffer / getBuffer are the only two operations the flow needs: the RSVP
 * path writes a card, and /api/card/:id reads it back.
 */

var minioConfig = require('../config/minio');

var PDF_CONTENT_TYPE = 'application/pdf';

/**
 * Makes sure the bucket exists. Called once before the first upload rather than
 * on every write, since a bucket check is a network round trip.
 */
var ensuredBucket = false;

async function ensureBucket() {
  if (ensuredBucket) return;

  var client = minioConfig.getClient();
  var exists = await client.bucketExists(minioConfig.bucket);

  if (!exists) {
    await client.makeBucket(minioConfig.bucket);
  }

  ensuredBucket = true;
}

/**
 * Uploads a buffer and returns the object key it was stored under.
 *
 * @param {Buffer} buffer
 * @param {string} objectKey
 * @param {string} [contentType]
 * @returns {Promise<string>} objectKey
 */
async function uploadBuffer(buffer, objectKey, contentType) {
  if (!Buffer.isBuffer(buffer)) throw new Error('uploadBuffer: buffer is required');
  if (!objectKey) throw new Error('uploadBuffer: objectKey is required');

  await ensureBucket();

  await minioConfig.getClient().putObject(
    minioConfig.bucket,
    objectKey,
    buffer,
    buffer.length,
    { 'Content-Type': contentType || PDF_CONTENT_TYPE }
  );

  return objectKey;
}

/**
 * Reads an object back into a buffer.
 *
 * @param {string} objectKey
 * @returns {Promise<Buffer>}
 */
async function getBuffer(objectKey) {
  if (!objectKey) throw new Error('getBuffer: objectKey is required');

  var stream = await minioConfig.getClient().getObject(minioConfig.bucket, objectKey);

  return new Promise(function (resolve, reject) {
    var chunks = [];
    stream.on('data', function (chunk) { chunks.push(chunk); });
    stream.on('end', function () { resolve(Buffer.concat(chunks)); });
    stream.on('error', reject);
  });
}

/** True when the object exists — used to detect a key that points at nothing. */
async function exists(objectKey) {
  if (!objectKey) return false;

  try {
    await minioConfig.getClient().statObject(minioConfig.bucket, objectKey);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  uploadBuffer: uploadBuffer,
  getBuffer: getBuffer,
  exists: exists,
  isConfigured: minioConfig.isConfigured,
  PDF_CONTENT_TYPE: PDF_CONTENT_TYPE
};
