/**
 * QR code generation for the invitation card (PRD §4.2, §4.4 — FC-012).
 *
 * The QR encodes the public invitation URL, which is also where the printed
 * card points on the day itself. Pure functions: no database, no network.
 */

var QRCode = require('qrcode');

/**
 * Public base URL every generated link points at: the printed QR codes, the
 * .ics URL and the Open Graph previews.
 *
 * Read once at startup from PUBLIC_BASE_URL and validated here rather than
 * defaulted to a production host. A card printed against the wrong domain is
 * unrecoverable once it is on paper, so a missing or malformed value has to
 * stop the boot loudly instead of silently producing plausible-looking QR
 * codes that point somewhere else.
 *
 * Outside production the value is optional and falls back to the local server,
 * so a dev run needs no configuration.
 */
var PUBLIC_BASE_URL = resolvePublicBaseUrl();

function resolvePublicBaseUrl() {
  // Trailing slashes are stripped: every caller concatenates "/invitation/…".
  var raw = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PUBLIC_BASE_URL is required in production (e.g. https://franckeskyetcharlene.example.com). ' +
        'Without it the printed QR codes would point at the wrong host.'
      );
    }
    return 'http://localhost:' + (process.env.PORT || '3000');
  }

  var parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error('PUBLIC_BASE_URL is not a valid absolute URL: "' + raw + '"');
  }

  // A scheme-less value ("franckeskyetcharlene.com") parses as neither http nor
  // https and would produce a QR no phone can open.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      'PUBLIC_BASE_URL must start with http:// or https:// (got "' + parsed.protocol + '")'
    );
  }

  // A path on the base ("…/fr") would silently break every generated link.
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('PUBLIC_BASE_URL must be an origin without a path (got "' + parsed.pathname + '")');
  }

  return parsed.origin;
}

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
