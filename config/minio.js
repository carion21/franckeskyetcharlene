/**
 * MinIO client, built from the environment (PRD §5, §6 — FC-015).
 * Credentials come from .env only — never hardcoded, never logged.
 */

var Minio = require('minio');

var endPoint = process.env.MINIO_ENDPOINT || '';
var port = parseInt(process.env.MINIO_PORT || '443', 10);

// 443 means TLS. Anything else is treated as plain HTTP unless MINIO_USE_SSL
// says otherwise, which keeps local dev on :9000 working out of the box.
var useSSL = process.env.MINIO_USE_SSL
  ? process.env.MINIO_USE_SSL === 'true'
  : port === 443;

var bucket = process.env.MINIO_BUCKET || '';

function isConfigured() {
  return Boolean(
    endPoint &&
    bucket &&
    process.env.MINIO_ACCESS_KEY &&
    process.env.MINIO_SECRET_KEY
  );
}

var client = null;

function getClient() {
  if (!isConfigured()) {
    throw new Error('MinIO is not configured — check MINIO_* in .env');
  }

  if (!client) {
    client = new Minio.Client({
      endPoint: endPoint,
      port: port,
      useSSL: useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY
    });
  }

  return client;
}

module.exports = {
  getClient: getClient,
  isConfigured: isConfigured,
  bucket: bucket,
  endPoint: endPoint,
  port: port,
  useSSL: useSSL
};
