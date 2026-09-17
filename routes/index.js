var path = require('path');
var express = require('express');
var rateLimit = require('express-rate-limit');
var router = express.Router();

var prisma = require('../config/db');

var PUBLIC_DIR = path.join(__dirname, '..', 'public');

// The three landings are plain static pages (PRD §4.1) — no view engine here.
// Paths are resolved once at startup into a fixed lookup, so no filesystem path
// is ever assembled from request data: the route only serves what is listed.
var LANDINGS = {
  v1: path.join(PUBLIC_DIR, 'v1', 'index.html'),
  v2: path.join(PUBLIC_DIR, 'v2', 'index.html'),
  v3: path.join(PUBLIC_DIR, 'v3', 'index.html')
};

var VERSIONS = Object.keys(LANDINGS);

/**
 * Page d'accueil : la question à trois réponses qui oriente vers une version.
 *
 * Rangée dans `views/` et non dans `public/` alors qu'elle est statique :
 * `express.static` est monté avant ce routeur, donc un fichier laissé dans
 * `public/accueil/` serait servi en direct sur /accueil — court-circuitant le
 * cookie et `LANDING_VERSION`, et rouvrant la question une fois l'arbitrage
 * tranché. Sa feuille de style vit dans `public/shared/`, avec les autres
 * assets partagés.
 */
var WELCOME_PAGE = path.join(__dirname, '..', 'views', 'accueil.html');

/**
 * Cookie portant la réponse déjà donnée.
 *
 * Il sert deux fois : ne pas reposer la question à quelqu'un qui revient, et
 * ne pas recompter sa voix. C'est un garde-fou de confort, pas une garantie —
 * la seule façon de vraiment verrouiller serait d'identifier le visiteur, ce
 * qui coûterait une donnée personnelle pour un sondage de goût.
 */
var CHOICE_COOKIE = 'landing';
var CHOICE_COOKIE_MAX_AGE = 180 * 24 * 60 * 60 * 1000; // au-delà du mariage

/**
 * Version imposée, une fois l'arbitrage tranché.
 *
 * Tant qu'elle est vide, `/` pose la question. Dès qu'elle vaut v1/v2/v3, `/`
 * sert directement cette version : la question s'éteint sans qu'il faille
 * retoucher au code la veille de l'envoi des invitations.
 */
var FORCED_VERSION = (function () {
  var raw = String(process.env.LANDING_VERSION || '').trim();
  if (!raw) return null;
  if (VERSIONS.indexOf(raw) === -1) {
    throw new Error(
      'LANDING_VERSION doit valoir v1, v2 ou v3 (reçu "' + raw + '")'
    );
  }
  return raw;
})();

// Explicit routes so /v1 works as well as /v1/.
VERSIONS.forEach(function (version) {
  var file = LANDINGS[version];

  router.get('/' + version, function (req, res, next) {
    res.sendFile(file, function (err) {
      if (err) next(err);
    });
  });
});

/* ── GET / ───────────────────────────────────────────────────────────── */
router.get('/', function (req, res, next) {
  // 1. Arbitrage tranché : plus de question, on sert la version retenue.
  if (FORCED_VERSION) return res.redirect('/' + FORCED_VERSION);

  // 2. Déjà répondu : on le renvoie là où il était sans le réinterroger.
  var previous = req.cookies && req.cookies[CHOICE_COOKIE];
  if (VERSIONS.indexOf(previous) !== -1) return res.redirect('/' + previous);

  // 3. Première visite : la question.
  res.sendFile(WELCOME_PAGE, function (err) {
    if (err) next(err);
  });
});

/* ── POST /api/landing-choice ──────────────────────────────────────── */
/**
 * Enregistre la réponse et redirige vers la version correspondante.
 *
 * POST puis redirection (et non un lien) parce que c'est une écriture : un GET
 * qui écrit se rejouerait à chaque préchargement de navigateur et gonflerait le
 * décompte tout seul. La page fonctionne sans JavaScript, c'est un formulaire.
 */
var choiceLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20, // large pour une famille derrière une même connexion, étroit pour un script
  standardHeaders: true,
  legacyHeaders: false
});

// Le corps est déjà analysé globalement par app.js, mais le parseur est répété
// ici : sans lui, un réordonnancement des middlewares ferait échouer le vote en
// silence — `req.body` vide, version jugée invalide, simple redirection vers
// `/`. Un second passage ne coûte rien, express.urlencoded ne réanalyse pas un
// corps déjà lu.
router.post('/api/landing-choice', choiceLimiter, express.urlencoded({ extended: false, limit: '1kb' }), async function (req, res, next) {
  try {
    var version = String((req.body && req.body.version) || '');
    if (VERSIONS.indexOf(version) === -1) return res.redirect('/');

    var alreadyVoted = req.cookies && VERSIONS.indexOf(req.cookies[CHOICE_COOKIE]) !== -1;

    // Le cookie est posé dans tous les cas : c'est lui qui évite de reposer la
    // question au prochain passage.
    res.cookie(CHOICE_COOKIE, version, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: CHOICE_COOKIE_MAX_AGE,
      path: '/'
    });

    if (!alreadyVoted) {
      try {
        await prisma.landingVote.create({ data: { version: version } });
      } catch (err) {
        // Un vote perdu ne doit jamais coûter sa page au visiteur : le sondage
        // est secondaire, l'accès à la landing ne l'est pas.
        console.warn('[landing-choice] vote non enregistré : %s', err.message);
      }
    }

    res.redirect('/' + version);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
