/**
 * Gate for every /admin/* route except the login pages (PRD §6 — FC-021).
 *
 * Redirects to /admin/login when the session is not authenticated.
 *
 * The session is checked against the database on every request, not trusted on
 * its own. Without that, a session outlives the account it belongs to: deleting
 * the admin row — or rotating the password after a suspected leak — would leave
 * every existing session working for the rest of its 8 hours, with no way to
 * revoke it. Observed in testing, hence the lookup.
 *
 * Cost is one primary-key lookup per backoffice page view, which is nothing at
 * this traffic level and buys an actual revocation path.
 *
 * No "return to where you were" handling on purpose: /admin is the only
 * protected page, so remembering the target would add a redirect the login
 * flow never reads — and an unused redirect target is exactly the kind of
 * dead path that turns into an open redirect later. Add it back, with
 * same-origin validation, only if a second protected page appears.
 */

var prisma = require('../config/db');

/**
 * Short fingerprint of the stored password hash, kept in the session at login.
 * Rotating the password changes the hash, so the fingerprint stops matching and
 * older sessions fall over. Only a fragment is kept — the session store holds
 * no material worth stealing.
 */
function passwordFingerprint(passwordHash) {
  return require('crypto')
    .createHash('sha256')
    .update(passwordHash)
    .digest('hex')
    .slice(0, 16);
}

function denied(req, res) {
  // Never cache a redirect away from a protected page: on a shared browser the
  // bounce could otherwise be replayed from cache.
  res.setHeader('Cache-Control', 'no-store');

  if (req.session) {
    return req.session.destroy(function () {
      res.redirect('/admin/login');
    });
  }

  return res.redirect('/admin/login');
}

module.exports = async function requireAdminAuth(req, res, next) {
  try {
    if (!req.session || !req.session.adminId) {
      return denied(req, res);
    }

    var admin = await prisma.adminUser.findUnique({
      where: { id: req.session.adminId },
      select: { id: true, username: true, passwordHash: true }
    });

    // Account deleted since login.
    if (!admin) return denied(req, res);

    // Password rotated since login.
    if (req.session.pwFingerprint !== passwordFingerprint(admin.passwordHash)) {
      return denied(req, res);
    }

    req.admin = { id: admin.id, username: admin.username };
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports.passwordFingerprint = passwordFingerprint;
