/**
 * Backoffice (PRD §4.6, §6, §9 — FC-022, FC-023).
 *
 *   GET  /admin/login    the form
 *   POST /admin/login    bcrypt check, rate limited
 *   POST /admin/logout   ends the session
 *   GET  /admin          the RSVP list, filtered and sorted (protected)
 *   GET  /admin/export.csv  the same list as a spreadsheet (protected)
 *
 * No email sending anywhere: explicitly out of scope (PRD §1.2).
 */

var express = require('express');
var bcrypt = require('bcrypt');
var rateLimit = require('express-rate-limit');
var router = express.Router();

var prisma = require('../config/db');
var requireAdminAuth = require('../middlewares/require-admin-auth');
var guestList = require('../services/guest-list.service');
var csvService = require('../services/csv.service');
var qrcodeService = require('../services/qrcode.service');

/**
 * Abidjan time throughout the backoffice — the organiser's own clock, and the
 * one the venue runs on. Server UTC would put a late-evening confirmation on
 * the following day.
 */
var TIMEZONE = 'Africa/Abidjan';

function formatDateAbidjan(date) {
  return date.toLocaleString('fr-FR', {
    timeZone: TIMEZONE,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/** `2026-09-16`, for the export filename — sorts right in a download folder. */
function horodatageFichier() {
  var parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  return parts;
}

/**
 * A real bcrypt hash of a value nobody knows, used when the username does not
 * exist so the comparison still costs a full KDF round.
 *
 * Generated rather than hardcoded: a hand-written placeholder is not a
 * well-formed hash, and whether bcrypt does the full work on a malformed input
 * or bails out early is not something to depend on — if it bailed out, an
 * unknown username would answer measurably faster and reveal which accounts
 * exist. Costs one hash at startup.
 */
var DUMMY_HASH = bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), 12);

// 5 attempts / 15 min / IP, on the login POST only (PRD §6). Applied to the
// route rather than globally, so a locked-out guesser cannot also take the
// public RSVP form down with them.
var loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count; a successful login should not spend the budget.
  skipSuccessfulRequests: true,
  handler: function (req, res) {
    res.status(429).render('admin/login', {
      error: 'Trop de tentatives. Réessayez dans quelques minutes.',
      username: ''
    });
  }
});

/* ── GET /admin/login ────────────────────────────────────────────────── */
router.get('/admin/login', function (req, res) {
  // Already signed in — no reason to show the form again.
  if (req.session && req.session.adminId) return res.redirect('/admin');

  res.setHeader('Cache-Control', 'no-store');
  res.render('admin/login', { error: null, username: '' });
});

/* ── POST /admin/login ───────────────────────────────────────────────── */
router.post('/admin/login', loginLimiter, async function (req, res, next) {
  try {
    var username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    var password = typeof req.body.password === 'string' ? req.body.password : '';

    res.setHeader('Cache-Control', 'no-store');

    // One message for every failure mode. Saying "unknown user" versus "wrong
    // password" would confirm which accounts exist (PRD §6).
    function reject() {
      return res.status(401).render('admin/login', {
        error: 'Identifiants incorrects.',
        username: username
      });
    }

    if (!username || !password) return reject();

    var admin = await prisma.adminUser.findUnique({ where: { username: username } });

    // Compare against a dummy hash when the user does not exist, so the
    // response takes the same time either way. Returning early would make
    // "unknown user" measurably faster and leak which names are real.
    var hash = admin ? admin.passwordHash : DUMMY_HASH;

    var ok = await bcrypt.compare(password, hash);
    if (!admin || !ok) return reject();

    // In production the cookie is `secure`, so Express will silently refuse to
    // send it over a connection it does not consider HTTPS. Behind a proxy that
    // forgets X-Forwarded-Proto this produces a login that answers 302 but sets
    // no cookie — an endless bounce back to this form with nothing in the logs.
    // Say so plainly instead of leaving it to be guessed at.
    if (process.env.NODE_ENV === 'production' && !req.secure) {
      console.error(
        '[admin] login over a connection seen as insecure: the session cookie ' +
        'will NOT be set. Check that the reverse proxy forwards ' +
        'X-Forwarded-Proto: https.'
      );
    }

    // New session id on privilege change — otherwise a session id planted
    // before login would stay valid after it (session fixation).
    return req.session.regenerate(function (err) {
      if (err) return next(err);

      req.session.adminId = admin.id;
      req.session.adminUsername = admin.username;
      // Lets the guard notice a password rotation and drop older sessions.
      req.session.pwFingerprint = requireAdminAuth.passwordFingerprint(admin.passwordHash);

      req.session.save(function (saveErr) {
        if (saveErr) return next(saveErr);
        res.redirect('/admin');
      });
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /admin/logout ──────────────────────────────────────────────── */
// POST, not GET: a GET logout can be fired by any image tag on any page.
router.post('/admin/logout', function (req, res, next) {
  if (!req.session) return res.redirect('/admin/login');

  req.session.destroy(function (err) {
    if (err) return next(err);
    res.clearCookie('fc.sid');
    res.redirect('/admin/login');
  });
});

/**
 * Loads every confirmation and turns it into a display row. Both the list and
 * the export start here: the filtering that follows is the same function in
 * both cases (services/guest-list.service.js).
 *
 * The whole table is read in one go rather than filtered in SQL. A wedding
 * list is a few hundred rows — the query costs less than the round trips a
 * clever paginated version would need, and it keeps the totals, the filter
 * and the export reading from one identical snapshot.
 */
async function chargerLignes() {
  var rsvps = await prisma.rsvp.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      telephone: true,
      accompagne: true,
      relation: true,
      createdAt: true,
      cardMinioKey: true
    }
  });

  return rsvps.map(guestList.toLigne);
}

/* ── GET /admin ──────────────────────────────────────────────────────── */
router.get('/admin', requireAdminAuth, async function (req, res, next) {
  try {
    var toutes = await chargerLignes();
    var filtres = guestList.parseFiltres(req.query);
    var lignes = guestList.appliquer(toutes, filtres);

    res.setHeader('Cache-Control', 'no-store');
    res.render('admin/dashboard', {
      rsvps: lignes,
      // Totals over the whole list, never over the filtered one: the tiles are
      // the summary and the filter buttons at once (see the service).
      stats: guestList.compterStats(toutes),
      filtres: filtres,
      filtresActifs: guestList.filtresActifs(filtres),
      tris: guestList.TRIS,
      relations: guestList.RELATIONS,
      // Handed to the template so every link keeps the filters in force.
      lien: function (patch, base) { return guestList.construireLien(filtres, patch, base); },
      sensSuivant: function (key) { return guestList.sensSuivant(filtres, key); },
      // Same formatting as the CSV export — one function, so a date can never
      // read one way on screen and another in the file.
      formatDate: formatDateAbidjan,
      adminUsername: req.admin.username
    });
  } catch (err) {
    next(err);
  }
});

/* ── GET /admin/export.csv ───────────────────────────────────────────── */
/**
 * The list as a spreadsheet, with the filters and the sort in force applied —
 * the same query string the page is showing. Exporting the whole table while
 * the screen shows one relation is how a seating plan ends up built from the
 * wrong rows.
 */
router.get('/admin/export.csv', requireAdminAuth, async function (req, res, next) {
  try {
    var filtres = guestList.parseFiltres(req.query);
    var lignes = guestList.appliquer(await chargerLignes(), filtres);

    var entetes = [
      'Prénom', 'Nom', 'Email', 'Téléphone', 'Accompagné', 'Personnes',
      'Relation', 'Confirmé le', 'Carte générée', 'Lien invitation'
    ];

    var corps = lignes.map(function (l) {
      return [
        l.prenom,
        l.nom,
        l.email || '',
        // Grouped rather than raw: a spreadsheet reads "0712345678" as a
        // number and eats the leading zero, which makes the column useless
        // for actually calling anyone.
        l.telephoneFormate,
        l.accompagne ? 'Oui' : 'Non',
        l.personnes,
        l.relationLabel,
        formatDateAbidjan(l.createdAt),
        l.carteGeneree ? 'Oui' : 'Non',
        qrcodeService.invitationUrl(l.id)
      ];
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // `attachment` with an explicit name: without it the browser offers to
    // save "export.csv" at best, and displays the raw text at worst.
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="confirmations-' + horodatageFichier() + '.csv"'
    );

    res.send(csvService.build(entetes, corps));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
