/**
 * Invitation card → PDF (PRD §4.4 — FC-014).
 *
 * Renders views/card-template.ejs with a guest's data and returns an A5 PDF
 * buffer. Takes plain data in and gives a buffer back, so it can be exercised
 * without MinIO or Prisma.
 *
 * Two things carry the print quality:
 *   - the four woff2 faces are read once and inlined as base64, because headless
 *     Chromium has none of them installed and would silently fall back to
 *     Georgia, wrecking the design;
 *   - the QR is inlined as SVG, so it stays vector in the PDF instead of being
 *     rasterised through an <img>.
 *
 * Performance: Chromium is launched once and reused. Launching per request adds
 * roughly a second of pure startup to every RSVP.
 */

var fs = require('fs');
var path = require('path');
var ejs = require('ejs');
var puppeteer = require('puppeteer');

var qrcodeService = require('./qrcode.service');

var TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'card-template.ejs');
var FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

var WEDDING_LABEL = 'Samedi 10 Octobre 2026';

// A5 (148 × 210 mm) expressed in CSS pixels at 96dpi — the card's natural size.
var CARD_PX = { width: 559, height: 794 };

// ── Polices, lues une seule fois ──────────────────────────────────────────
var fontsCache = null;

function loadFonts() {
  if (fontsCache) return fontsCache;

  function read(file) {
    return fs.readFileSync(path.join(FONT_DIR, file)).toString('base64');
  }

  fontsCache = {
    greatVibes: read('GreatVibes-Regular.woff2'),
    cormorantGaramond: read('CormorantGaramond-Variable.woff2'),
    cormorantGaramondItalic: read('CormorantGaramond-Italic.woff2'),
    cormorant: read('Cormorant-SemiBold.woff2')
  };
  return fontsCache;
}

// ── Chromium partagé ──────────────────────────────────────────────────────
var browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
    });

    // A crashed browser must not poison every later render.
    browserPromise = browserPromise.then(function (browser) {
      browser.on('disconnected', function () { browserPromise = null; });
      return browser;
    }).catch(function (err) {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

/**
 * Starts Chromium and pre-reads the fonts, so the first real render doesn't
 * carry the start-up cost. Safe to call more than once.
 */
async function warmUp() {
  loadFonts();
  await getBrowser();
}

async function closeBrowser() {
  if (!browserPromise) return;

  var pending = browserPromise;
  browserPromise = null;

  try {
    var browser = await pending;
    await browser.close();
  } catch (err) {
    // Already gone — nothing to clean up.
  }
}

/**
 * Renders the card HTML for a guest. Exported on its own so the markup can be
 * inspected (or previewed in a browser) without spinning up Chromium.
 *
 * @param {{id: string, nom: string, prenom: string}} guest
 */
async function renderHtml(guest) {
  if (!guest || !guest.id) throw new Error('renderHtml: guest.id is required');

  var qrSvg = await qrcodeService.toSvg(guest.id);

  return ejs.renderFile(TEMPLATE_PATH, {
    nom: guest.nom || '',
    prenom: guest.prenom || '',
    dateMariage: WEDDING_LABEL,
    qrSvg: qrSvg,
    fonts: loadFonts()
  });
}

/**
 * Renders the card once and returns both the print PDF and a PNG preview.
 *
 * The preview exists because embedding a PDF in the page is unreliable: mobile
 * Safari and Chrome frequently refuse to display one inline and start a
 * download instead, which is a hostile thing to happen on page load. An <img>
 * renders everywhere. Both come out of a single page render, so the preview
 * costs a screenshot rather than a second full pass.
 *
 * @param {{id: string, nom: string, prenom: string}} guest
 * @returns {Promise<{pdf: Buffer, preview: Buffer}>}
 */
async function generateCardAssets(guest) {
  var html = await renderHtml(guest);
  var browser = await getBrowser();
  var page = await browser.newPage();

  try {
    // The card is 148mm × 210mm, i.e. 559 × 794 CSS px at 96dpi — the viewport
    // has to match, or the screenshot clips the card instead of capturing it.
    // 1.3× device scale lands the output near 727px, retina-sharp for the
    // 360px box it is displayed in, without rendering pixels nobody sees.
    await page.setViewport({ width: CARD_PX.width, height: CARD_PX.height, deviceScaleFactor: 1.3 });

    // Everything is inlined, so nothing is fetched — no network wait needed.
    await page.setContent(html, { waitUntil: 'load' });

    // setContent resolves before the embedded faces are ready; without this the
    // first render can still come out in the fallback serif.
    await page.evaluate(function () { return document.fonts.ready; });

    var pdf = await page.pdf({
      width: '148mm',
      height: '210mm',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    // WebP at 90 rather than PNG: visually indistinguishable on this artwork
    // but ~60 KB instead of ~860 KB, which matters on a phone over mobile data.
    var preview = await page.screenshot({
      type: 'webp',
      quality: 90,
      clip: { x: 0, y: 0, width: CARD_PX.width, height: CARD_PX.height }
    });

    return {
      pdf: Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf),
      preview: Buffer.isBuffer(preview) ? preview : Buffer.from(preview)
    };
  } finally {
    await page.close();
  }
}

/**
 * Renders the guest's card and returns it as an A5 PDF buffer.
 *
 * @param {{id: string, nom: string, prenom: string}} guest
 * @returns {Promise<Buffer>}
 */
async function generateCardPdf(guest) {
  var assets = await generateCardAssets(guest);
  return assets.pdf;
}

/** Object key used for this guest's card in MinIO. */
function cardObjectKey(id) {
  return 'cards/' + id + '.pdf';
}

/** Object key for the preview image shown on the invitation page. */
function previewObjectKey(id) {
  return 'previews/' + id + '.webp';
}

var PREVIEW_CONTENT_TYPE = 'image/webp';

module.exports = {
  generateCardPdf: generateCardPdf,
  generateCardAssets: generateCardAssets,
  previewObjectKey: previewObjectKey,
  PREVIEW_CONTENT_TYPE: PREVIEW_CONTENT_TYPE,
  warmUp: warmUp,
  renderHtml: renderHtml,
  cardObjectKey: cardObjectKey,
  closeBrowser: closeBrowser,
  WEDDING_LABEL: WEDDING_LABEL
};
