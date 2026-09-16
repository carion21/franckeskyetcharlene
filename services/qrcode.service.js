/**
 * QR code generation for the invitation card (PRD §4.2, §4.4 — FC-012).
 *
 * The QR encodes the public invitation URL, which is also where the printed
 * card points on the day itself. Pure functions: no database, no network.
 */

var QRCode = require('qrcode');

// Public base URL the QR points at. Overridable so staging/local runs don't
// bake a production URL into a card that gets printed.
var PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://franckeskyetcharlene.geasscorp.com')
  .replace(/\/+$/, '');

// Error correction Q (~25%) rather than M: this code gets printed, handled and
// scanned in a venue, so it has to survive a scuff or a thumb over a corner.
var ERROR_CORRECTION_LEVEL = 'Q';

// Quiet zone in modules. The spec asks for 4; below that, scanners struggle.
var QUIET_ZONE = 4;

function invitationUrl(id) {
  if (!id) throw new Error('invitationUrl: missing id');
  return PUBLIC_BASE_URL + '/invitation/' + encodeURIComponent(id);
}

/**
 * QR as SVG markup, meant to be inlined directly into the card template.
 *
 * Inlined SVG stays vector through Puppeteer's PDF export, so the code is
 * razor-sharp at any print size. An <img src="data:image/png"> would be
 * rasterised instead — visibly softer once printed.
 */
function toSvg(id) {
  return QRCode.toString(invitationUrl(id), {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION_LEVEL,
    margin: QUIET_ZONE,
    color: { dark: '#000000', light: '#FFFFFF' }
  });
}

/**
 * QR as a PNG data URI — for on-screen previews and any consumer that needs a
 * bitmap. 600px keeps it sharp on high-density displays.
 */
function toDataUri(id, size) {
  return QRCode.toDataURL(invitationUrl(id), {
    errorCorrectionLevel: ERROR_CORRECTION_LEVEL,
    margin: QUIET_ZONE,
    width: size || 600,
    color: { dark: '#000000', light: '#FFFFFF' }
  });
}

module.exports = {
  invitationUrl: invitationUrl,
  toSvg: toSvg,
  toDataUri: toDataUri,
  PUBLIC_BASE_URL: PUBLIC_BASE_URL
};
