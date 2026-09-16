/**
 * Card generation pipeline: QR → PDF → MinIO → cardMinioKey.
 *
 * These are steps 4–7 of PRD §9. They run both at RSVP time and again, lazily,
 * from /invitation/:id when the first attempt failed — so they live here rather
 * than in either route.
 *
 * pdf.service and minio.service stay free of Prisma; this is the only piece
 * that knows about all three.
 */

var prisma = require('../config/db');
var pdfService = require('./pdf.service');
var minioService = require('./minio.service');

/**
 * Generations currently running, keyed by rsvp id.
 *
 * POST /api/rsvp starts one without waiting for it, so the guest can land on
 * /invitation/:id while it is still in flight. That page regenerates when the
 * card is missing — without this, both would build and upload the same card at
 * the same time. A second caller joins the running job instead.
 */
var inFlight = new Map();

/**
 * Card generations run one at a time.
 *
 * Rendering a card drives a headless Chromium and pushes ~180 KB of HTML
 * through the DevTools protocol. Left unbounded, several confirmations arriving
 * close together start that many renders at once, and the contention shows up
 * in *everyone's* response time — measured at 2.3–4.2 s per RSVP under a burst,
 * against ~0.5 s with a single render in flight.
 *
 * Guests confirm over weeks rather than all at once, so a queue of one costs
 * nothing in practice and removes the pathological case entirely.
 */
var queue = Promise.resolve();

function generateAndStoreCard(rsvp) {
  if (!rsvp || !rsvp.id) return Promise.resolve(null);

  // Already being generated (the RSVP route started it and the invitation page
  // asked for it too) — join that job instead of queueing a duplicate.
  var running = inFlight.get(rsvp.id);
  if (running) return running;

  var job = queue
    .then(function () { return runGeneration(rsvp); })
    .finally(function () { inFlight.delete(rsvp.id); });

  // The queue must not stop on a failed job; runGeneration already swallows its
  // own errors, but chaining defensively keeps one bad card from wedging the
  // rest for the whole life of the process.
  queue = job.catch(function () { return null; });

  inFlight.set(rsvp.id, job);
  return job;
}

/**
 * Generates the guest's card, stores it, and records the object key.
 *
 * Never throws: a failure here must not break the guest's path (PRD §3.1). The
 * caller carries on and the card is regenerated on demand at /invitation/:id.
 *
 * @param {{id: string, nom: string, prenom: string}} rsvp
 * @returns {Promise<string|null>} the object key, or null if generation failed
 */
async function runGeneration(rsvp) {
  try {
    var assets = await pdfService.generateCardAssets(rsvp);
    var objectKey = pdfService.cardObjectKey(rsvp.id);

    await minioService.uploadBuffer(assets.pdf, objectKey, minioService.PDF_CONTENT_TYPE);

    // The preview is a convenience, not the deliverable: if it fails to upload,
    // the card itself is still stored and the page falls back to the QR.
    try {
      await minioService.uploadBuffer(
        assets.preview,
        pdfService.previewObjectKey(rsvp.id),
        pdfService.PREVIEW_CONTENT_TYPE
      );
    } catch (previewErr) {
      console.warn('[card] preview upload failed for %s: %s', rsvp.id, previewErr.message);
    }

    await prisma.rsvp.update({
      where: { id: rsvp.id },
      data: { cardMinioKey: objectKey }
    });

    return objectKey;
  } catch (err) {
    // Logged, not rethrown — see above.
    console.error('[card] generation failed for rsvp %s: %s', rsvp && rsvp.id, err.message);
    return null;
  }
}

/**
 * Returns the card PDF for a guest, generating it first if it is missing.
 *
 * Also covers the case where cardMinioKey points at an object that is no longer
 * in the bucket: the key alone is not proof the file exists.
 *
 * @param {object} rsvp
 * @returns {Promise<Buffer|null>}
 */
async function getOrCreateCardBuffer(rsvp) {
  if (rsvp.cardMinioKey) {
    try {
      return await minioService.getBuffer(rsvp.cardMinioKey);
    } catch (err) {
      console.warn('[card] key %s unreadable, regenerating: %s', rsvp.cardMinioKey, err.message);
    }
  }

  var objectKey = await generateAndStoreCard(rsvp);
  if (!objectKey) return null;

  try {
    return await minioService.getBuffer(objectKey);
  } catch (err) {
    console.error('[card] re-read failed after regeneration: %s', err.message);
    return null;
  }
}

module.exports = {
  generateAndStoreCard: generateAndStoreCard,
  getOrCreateCardBuffer: getOrCreateCardBuffer
};
