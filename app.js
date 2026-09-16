require('dotenv').config();

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');

var sessionConfig = require('./config/session');

var indexRouter = require('./routes/index');
var rsvpRouter = require('./routes/rsvp');
var cardRouter = require('./routes/card');
var adminRouter = require('./routes/admin');

var app = express();

// Behind a reverse proxy in production, so req.ip reflects the real client
// (the login rate limit counts per IP) and `secure` cookies are recognised
// over the proxy's TLS termination.
if (sessionConfig.isProduction) {
  app.set('trust proxy', 1);
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Announcing the stack buys nothing and helps anyone shopping for Express CVEs.
app.disable('x-powered-by');

/**
 * Security headers (PRD §5, §6).
 *
 * The CSP is strict — no 'unsafe-inline' anywhere — which is only possible
 * because every page serves its CSS and JS from files (PRD §4.1 forbids inline
 * style and script blocks). If an inline handler ever creeps in it will be
 * blocked, and that is the intended outcome: it is the same rule that stops an
 * injected <script> from running.
 */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      // GSAP + ScrollTrigger, pinned with SRI in the landing pages.
      'script-src': ["'self'", 'https://cdnjs.cloudflare.com'],
      // Les polices sont servies par l'application (`public/fonts/`) : plus
      // aucune origine tierce n'est nécessaire pour le style ni pour les
      // fichiers de police. Ce qui n'est pas autorisé ne peut pas fuir.
      'style-src': ["'self'"],
      'font-src': ["'self'", 'data:'],
      // data: covers the QR shown on the invitation page.
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      // The .ics auto-download uses a hidden same-origin iframe.
      'frame-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': []
    }
  },
  // The invitation page is personal; its URL must not leak through Referer.
  referrerPolicy: { policy: 'no-referrer' },
  // Only meaningful over HTTPS; browsers ignore it on plain http in dev.
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
  crossOriginEmbedderPolicy: false
}));

app.use(logger('dev'));
// The RSVP payload is a handful of short fields — a tight cap keeps a large
// body from ever reaching the parser.
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());
/**
 * `redirect: false` : sans lui, `express.static` voit le dossier `public/v1`
 * et répond 301 vers `/v1/` AVANT que la route explicite de `routes/index.js`
 * ne soit consultée. Le lien que l'invité reçoit sur WhatsApp est `/v1` : il
 * payait donc un aller-retour de plus, et `GET /` en payait deux (302 → 301 →
 * 200). En 3G lent, chaque aller-retour coûte environ deux secondes avant le
 * premier octet de HTML.
 *
 * Les polices ont une empreinte stable et un nom de fichier versionné par leur
 * contenu : un cache long évite de les retélécharger à chaque visite. Le reste
 * garde `max-age=0` — les assets ne portent pas de hash et doivent pouvoir
 * changer au déploiement suivant.
 */
app.use(express.static(path.join(__dirname, 'public'), {
  redirect: false,
  setHeaders: function (res, filePath) {
    if (/\.woff2?$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Session only on /admin/* — a guest confirming their presence has no reason
// to be given a session cookie, and it keeps the store free of anonymous rows.
app.use('/admin', sessionConfig.buildSessionMiddleware());

app.use('/', indexRouter);
app.use('/', rsvpRouter);
app.use('/', cardRouter);
app.use('/', adminRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);

  // API callers get JSON — an HTML error page would surface as an unreadable
  // blob in the RSVP form's status line.
  if (req.path.indexOf('/api/') === 0) {
    return res.json({
      success: false,
      message: err.status === 404
        ? 'Introuvable.'
        : 'Une erreur est survenue. Merci de réessayer.'
    });
  }

  res.render('error');
});

module.exports = app;
