/**
 * Admin session (PRD §6 — FC-020).
 *
 * Stored in MySQL rather than in memory: an in-memory store loses every session
 * on restart, and would not survive more than one process.
 *
 * Cookie hardening, all three non-negotiable per PRD §6:
 *   httpOnly  — JavaScript can never read the session cookie
 *   secure    — HTTPS only, enabled in production (see note below)
 *   sameSite  — 'strict', so the cookie is not sent on cross-site requests.
 *               This is also what makes CSRF a non-issue for /admin/*: a form
 *               posted from another origin arrives with no session at all.
 */

var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);

// `secure: true` requires HTTPS. On a local http://localhost run the browser
// would silently drop the cookie and login would appear to fail for no reason,
// so it follows NODE_ENV and is documented here rather than hardcoded.
var isProduction = process.env.NODE_ENV === 'production';

// Eight hours: long enough to work through a guest list in one sitting, short
// enough that an unattended browser does not stay authenticated overnight.
var MAX_AGE_MS = 8 * 60 * 60 * 1000;

function buildStore() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the session store');
  }

  var url = new URL(process.env.DATABASE_URL);

  return new MySQLStore({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    // The table is created on first use, alongside the Prisma-managed schema.
    createDatabaseTable: true,
    // Purge expired sessions rather than letting the table grow forever.
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: MAX_AGE_MS
  });
}

function buildSessionMiddleware() {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required — see .env.example');
  }

  return session({
    name: 'fc.sid', // not the default 'connect.sid': no free hint about the stack
    secret: process.env.SESSION_SECRET,
    store: buildStore(),
    resave: false,
    // Don't persist a row for every anonymous visitor — only once something is
    // actually stored in the session (i.e. after login).
    saveUninitialized: false,
    rolling: true, // active use keeps the session alive
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: MAX_AGE_MS,
      path: '/'
    }
  });
}

module.exports = {
  buildSessionMiddleware: buildSessionMiddleware,
  isProduction: isProduction,
  MAX_AGE_MS: MAX_AGE_MS
};
