/**
 * Calendar file for the wedding (PRD §4.5, §9 — FC-017).
 *
 * One .ics per guest, holding the three stages of the day as three separate
 * events. Pure function: no database, no network, no I/O — building the string
 * is sub-millisecond, so the route generates on demand and stores nothing.
 *
 * Why three events rather than the single 10:00→20:00 block of PRD §9: an event
 * carries exactly one LOCATION, so a single block can only be navigable to one
 * of the three venues. Split, each stage carries its own address and its own
 * coordinates, and every one of them gets directions and an accurate
 * "time to leave" alert. The reminders sit on the first event only, so the
 * guest is not notified three times over.
 *
 * Hand-built rather than pulled from a library, because cross-platform
 * behaviour lives in details a generic builder tends to get wrong:
 *
 *   - CRLF line endings. RFC 5545 §3.1 requires them; iOS refuses files with
 *     bare LF.
 *   - Folding at 75 *octets*, never mid-character. The French text here is full
 *     of accents (2 octets each in UTF-8); folding by JS string length would
 *     split one in half and corrupt the file.
 *   - A real VTIMEZONE plus TZID on the times, rather than bare UTC. The event
 *     is anchored to Abidjan, so a guest whose phone is in another timezone
 *     sees it converted correctly instead of at the wrong hour.
 *   - VALARM carries ACTION, TRIGGER *and* DESCRIPTION. DESCRIPTION is required
 *     for a DISPLAY alarm, and iOS drops alarms that omit it.
 *   - Stable UIDs, so re-downloading updates the existing entries instead of
 *     creating duplicates — guests do re-open their invitation.
 *   - No X-WR-CALNAME. It names a *calendar*, not an event, and on a
 *     single-file import it pushes some clients to create a separate calendar
 *     instead of adding to the guest's own.
 */

var CALENDAR_PRODID = '-//Franckesky et Charlene//Mariage 10-10-2026//FR';

// Hôte public, dérivé de PUBLIC_BASE_URL (voir services/qrcode.service.js).
// Pas de repli codé en dur : qrcode.service valide déjà la variable au
// démarrage, donc l'URL est forcément analysable ici.
var PUBLIC_HOST = new URL(require('./qrcode.service').PUBLIC_BASE_URL).host;

// Côte d'Ivoire is GMT+0 all year and has no daylight saving, which makes the
// VTIMEZONE a single STANDARD block with no transition rule.
var TZID = 'Africa/Abidjan';

var COUPLE = 'Franckesky & Charlène';
var CONTACT = '+225 07 09 89 84 75';
var DRESS_CODE = 'Chic & Élégant — Vert Émeraude, Blanc & Or';

/**
 * The three stages (PRD §2.3).
 *
 * The step name leads each SUMMARY on purpose: a phone's month view truncates
 * around 14 characters, and three titles all starting "Mariage de…" would read
 * as three identical lines.
 *
 * `geo` stays null until real coordinates are supplied. Inventing them would
 * send guests to the wrong place, so GEO and the Apple structured location are
 * simply omitted while it is null — the text address still works.
 */
var STAGES = [
  {
    key: 'civile',
    summary: 'Cérémonie civile — ' + COUPLE,
    start: '20261010T100000',
    end: '20261010T120000',
    venue: 'Mairie de Yopougon',
    address: 'Mairie de Yopougon, Rue P191, Attié, Yopougon, Abidjan',
    // Relevé sur OpenStreetMap : POI `amenity=townhall` (le bâtiment lui-même,
    // pas un centroïde de quartier), confirmé par géocodage inverse.
    geo: { lat: 5.3438879, lon: -4.0674479 }
  },
  {
    key: 'religieuse',
    summary: 'Cérémonie religieuse — ' + COUPLE,
    start: '20261010T133000',
    end: '20261010T153000',
    venue: 'Église CMA de Port-Bouët 2',
    address: 'Église CMA de Port-Bouët 2, Yopougon, Abidjan, Côte d\'Ivoire',
    geo: null
  },
  {
    key: 'reception',
    summary: 'Réception — ' + COUPLE,
    start: '20261010T160000',
    end: '20261010T200000',
    venue: 'Espace Royal KS',
    address: 'Espace Royal KS, Yopougon Millionnaire, Abidjan, Côte d\'Ivoire',
    geo: null
  }
];

// J-7, J-3, J-1 (PRD §4.5), plus a reminder on the morning itself. The PRD asks
// for three; the fourth is a deliberate addition — it is the only one that
// lands late enough to actually get someone out of the door on time.
// Carried by the first stage only, so the guest is not notified three times.
var ALARMS = [
  { trigger: '-P7D', label: 'Dans 7 jours : mariage de ' + COUPLE },
  { trigger: '-P3D', label: 'Dans 3 jours : mariage de ' + COUPLE },
  { trigger: '-P1D', label: 'Demain : mariage de ' + COUPLE },
  { trigger: '-PT2H', label: "C'est aujourd'hui : mariage de " + COUPLE }
];

/**
 * Escapes a text value per RFC 5545 §3.3.11.
 * Backslash first, otherwise it would double-escape the sequences added after.
 * Note colons are *not* escaped in TEXT values.
 */
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Escapes a *parameter* value, which follows different rules to a text value:
 * it is wrapped in double quotes, and RFC 5545 gives no way to escape a quote
 * inside one — so any quote is dropped rather than left to break the parse.
 */
function escapeParam(value) {
  return String(value).replace(/["\r\n]/g, '');
}

/**
 * Folds a content line to 75 octets, continuation lines prefixed with a space.
 *
 * Measured in UTF-8 octets, not characters, and never breaks inside a
 * multi-byte sequence — an accented character split across a fold makes the
 * file unparseable.
 */
function foldLine(line) {
  var bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  var parts = [];
  var offset = 0;
  var limit = 75; // first line: 75 octets

  while (offset < bytes.length) {
    var take = Math.min(limit, bytes.length - offset);

    // Walk back off a continuation byte (10xxxxxx) so we cut on a character
    // boundary rather than through the middle of one.
    if (offset + take < bytes.length) {
      while (take > 0 && (bytes[offset + take] & 0xc0) === 0x80) take--;
    }

    parts.push(bytes.slice(offset, offset + take).toString('utf8'));
    offset += take;
    limit = 74; // continuation lines lose one octet to the leading space
  }

  return parts.join('\r\n ');
}

/** Formats a Date as a UTC timestamp (used for DTSTAMP). */
function toUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Location lines for one stage.
 *
 * With coordinates, the venue becomes tappable: GEO covers the standard case,
 * and X-APPLE-STRUCTURED-LOCATION is what unlocks directions and the
 * "time to leave" alert on iOS. Without them, only the text address is emitted.
 */
function locationLines(stage) {
  var lines = ['LOCATION:' + escapeText(stage.address)];

  if (stage.geo && typeof stage.geo.lat === 'number' && typeof stage.geo.lon === 'number') {
    lines.push('GEO:' + stage.geo.lat + ';' + stage.geo.lon);
    lines.push(
      'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;' +
      'X-ADDRESS="' + escapeParam(stage.address) + '";' +
      'X-APPLE-RADIUS=100;' +
      'X-TITLE="' + escapeParam(stage.venue) + '"' +
      ':geo:' + stage.geo.lat + ',' + stage.geo.lon
    );
  }

  return lines;
}

/** Builds one VEVENT. Alarms are attached only when `withAlarms` is set. */
function buildEvent(stage, guest, domain, now, withAlarms) {
  var description =
    stage.venue + '\n' + stage.address +
    '\n\nProgramme de la journée :\n' +
    STAGES.map(function (s) {
      return '· ' + s.start.slice(9, 11) + 'h' + s.start.slice(11, 13) + ' — ' +
        s.summary.split(' — ')[0] + ' : ' + s.venue;
    }).join('\n') +
    '\n\nCode vestimentaire : ' + DRESS_CODE +
    '\nContact : ' + CONTACT +
    '\n\nVotre invitation : https://' + domain + '/invitation/' + guest.id;

  var lines = [
    'BEGIN:VEVENT',
    // Stable per guest *and* per stage: a second download updates the entries
    // instead of adding duplicates alongside them.
    'UID:mariage-fc-' + guest.id + '-' + stage.key + '@' + domain,
    'DTSTAMP:' + toUtcStamp(now),
    'CREATED:' + toUtcStamp(now),
    'LAST-MODIFIED:' + toUtcStamp(now),
    'DTSTART;TZID=' + TZID + ':' + stage.start,
    'DTEND;TZID=' + TZID + ':' + stage.end,
    'SUMMARY:' + escapeText(stage.summary)
  ];

  lines = lines.concat(locationLines(stage));

  lines.push(
    'DESCRIPTION:' + escapeText(description),
    'URL:https://' + domain + '/invitation/' + guest.id,
    // Standard property (RFC 5545 §3.8.4.2): several clients surface a contact
    // of their own, where otherwise it only lived inside the description.
    'CONTACT:' + escapeText(COUPLE + ', ' + CONTACT),
    // The guest's card, attached to the event: from their calendar they land
    // back on their own PDF without hunting for the original link.
    'ATTACH;FMTTYPE=application/pdf:https://' + domain + '/api/card/' + guest.id,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    // Outlook does not always infer availability from TRANSP; this states it.
    'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
    'SEQUENCE:0',
    'CLASS:PUBLIC'
  );

  if (withAlarms) {
    ALARMS.forEach(function (alarm) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        // RELATED=START is the default, but stating it removes any ambiguity
        // for parsers that would otherwise resolve against DTEND.
        'TRIGGER;RELATED=START:' + alarm.trigger,
        'DESCRIPTION:' + escapeText(alarm.label),
        'END:VALARM'
      );
    });
  }

  lines.push('END:VEVENT');
  return lines;
}

/**
 * Builds the .ics for one guest: three events, reminders on the first.
 *
 * @param {{id: string, prenom?: string, nom?: string}} guest
 * @param {{now?: Date, domain?: string}} [options]
 * @returns {string} the complete calendar file
 */
function buildIcs(guest, options) {
  if (!guest || !guest.id) throw new Error('buildIcs: guest.id is required');

  var settings = options || {};
  // Même source que les QR codes : une seule variable pour l'URL publique,
  // sinon le lien du .ics et celui du QR peuvent diverger.
  var domain = settings.domain || PUBLIC_HOST;
  var now = settings.now || new Date();

  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:' + CALENDAR_PRODID,
    'CALSCALE:GREGORIAN',
    // PUBLISH marks these as published events rather than meeting requests,
    // which stops clients from rendering accept/decline buttons that would
    // compete with the site's own RSVP.
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:' + TZID,

    'BEGIN:VTIMEZONE',
    'TZID:' + TZID,
    'X-LIC-LOCATION:' + TZID,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0000',
    'TZOFFSETTO:+0000',
    'TZNAME:GMT',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  STAGES.forEach(function (stage, index) {
    lines = lines.concat(buildEvent(stage, guest, domain, now, index === 0));
  });

  lines.push('END:VCALENDAR');

  // CRLF throughout, including the final line — some parsers drop a trailing
  // line that has no terminator.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Filename offered to the browser. ASCII only, to survive every mobile client. */
function icsFilename() {
  return 'mariage-franckesky-charlene.ics';
}

module.exports = {
  buildIcs: buildIcs,
  icsFilename: icsFilename,
  escapeText: escapeText,
  escapeParam: escapeParam,
  foldLine: foldLine,
  TZID: TZID,
  STAGES: STAGES,
  ALARMS: ALARMS
};
