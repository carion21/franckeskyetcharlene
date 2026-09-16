/**
 * Invitation page and its downloads (PRD §9, §4.3 — FC-018, FC-019).
 *
 *   GET /invitation/:id   the guest-facing page
 *   GET /api/card/:id     the PDF, regenerated if missing
 *   GET /api/ics/:id      the calendar file
 *
 * The id is a UUID and is the only thing guarding this page (PRD §3.1), so the
 * routes deliberately expose nothing beyond the guest's own name.
 */

var express = require('express');
var router = express.Router();

var prisma = require('../config/db');
var cardService = require('../services/card.service');
var icsService = require('../services/ics.service');
var minioService = require('../services/minio.service');
var qrcodeService = require('../services/qrcode.service');
var pdfService = require('../services/pdf.service');

// Rejects anything that isn't a UUID before it reaches the database.
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findRsvp(id) {
  if (!UUID_RE.test(id || '')) return null;
  return prisma.rsvp.findUnique({ where: { id: id } });
}

/* ── GET /invitation/:id ─────────────────────────────────────────────── */
router.get('/invitation/:id', async function (req, res, next) {
  try {
    // 1. Unknown id → 404.
    var rsvp = await findRsvp(req.params.id);
    if (!rsvp) return next();

    // 2. No stored card → rebuild it now, before rendering the page, so the
    //    download button works on the very first click.
    if (!rsvp.cardMinioKey) {
      var key = await cardService.generateAndStoreCard(rsvp);
      if (key) rsvp.cardMinioKey = key;
    }

    // 3. First visit → the page attempts the .ics download by itself, then the
    //    flag flips so later visits stay quiet. The button is always there
    //    regardless, because mobile browsers routinely block the auto-trigger.
    var autoIcs = rsvp.icsDeclenche === false;

    if (autoIcs) {
      try {
        await prisma.rsvp.update({
          where: { id: rsvp.id },
          data: { icsDeclenche: true }
        });
      } catch (err) {
        // Not worth failing the page over — worst case the guest gets the
        // automatic download twice.
        console.warn('[invitation] could not set icsDeclenche: %s', err.message);
      }
    }

    var qrDataUri = await qrcodeService.toDataUri(rsvp.id, 320);

    res.render('invitation', {
      rsvp: rsvp,
      autoIcs: autoIcs,
      qrDataUri: qrDataUri,
      invitationUrl: qrcodeService.invitationUrl(rsvp.id),
      // Absolute base for the Open Graph image: crawlers and messaging apps
      // never resolve a relative og:image.
      baseUrl: qrcodeService.PUBLIC_BASE_URL,
      dateMariage: pdfService.WEDDING_LABEL,
      cardAvailable: Boolean(rsvp.cardMinioKey)
    });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/card/:id ───────────────────────────────────────────────── */
router.get('/api/card/:id', async function (req, res, next) {
  try {
    var rsvp = await findRsvp(req.params.id);
    if (!rsvp) return next();

    var buffer = await cardService.getOrCreateCardBuffer(rsvp);

    if (!buffer) {
      return res.status(503).json({
        success: false,
        message: "La carte n'a pas pu être générée. Merci de réessayer dans un instant."
      });
    }

    var filename = 'invitation-' + slugify(rsvp.prenom + '-' + rsvp.nom) + '.pdf';

    res.setHeader('Content-Type', minioService.PDF_CONTENT_TYPE);
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Content-Length', buffer.length);
    // The card only changes if the guest's name does; let the browser keep it,
    // but privately — this is a personal document.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/card/:id/apercu ────────────────────────────────────────── */
/**
 * Preview image of the card, for display on the invitation page.
 *
 * Served as an image rather than embedding the PDF, because mobile browsers
 * routinely refuse to render a PDF inline and start a download instead.
 */
router.get('/api/card/:id/apercu', async function (req, res, next) {
  try {
    var rsvp = await findRsvp(req.params.id);
    if (!rsvp) return next();

    var key = pdfService.previewObjectKey(rsvp.id);
    var buffer = null;

    try {
      buffer = await minioService.getBuffer(key);
    } catch (err) {
      // No preview stored yet (or the card predates previews): rebuild both.
      await cardService.generateAndStoreCard(rsvp);
      try {
        buffer = await minioService.getBuffer(key);
      } catch (retryErr) {
        console.warn('[preview] unavailable for %s: %s', rsvp.id, retryErr.message);
      }
    }

    // No preview is not an error — the page shows the QR fallback instead.
    if (!buffer) return res.status(404).end();

    res.setHeader('Content-Type', pdfService.PREVIEW_CONTENT_TYPE);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/ics/:id ────────────────────────────────────────────────── */
router.get('/api/ics/:id', async function (req, res, next) {
  try {
    var rsvp = await findRsvp(req.params.id);
    if (!rsvp) return next();

    var ics = icsService.buildIcs(rsvp);
    var filename = icsService.icsFilename();

    // charset matters: the description carries accented French, and iOS will
    // mis-decode it without an explicit charset.
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8; method=PUBLISH');
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Content-Length', Buffer.byteLength(ics, 'utf8'));
    res.setHeader('Cache-Control', 'no-store');
    res.send(ics);
  } catch (err) {
    next(err);
  }
});

/* ── helpers ─────────────────────────────────────────────────────────── */

/** ASCII-safe filename fragment, so headers stay clean whatever the name. */
function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'invitation';
}

/**
 * Content-Disposition with both a plain filename and the RFC 5987 form.
 * Kept ASCII-only here, but the pair is what every mobile browser expects.
 */
function contentDisposition(filename) {
  return 'attachment; filename="' + filename + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename);
}

module.exports = router;
