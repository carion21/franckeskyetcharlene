/**
 * POST /api/rsvp — the critical path (PRD §9, §3.1 — FC-016).
 *
 * Order matters here: dedupe by email before creating anything, and treat card
 * generation as best-effort so a Puppeteer or MinIO failure never costs the
 * guest their confirmation.
 */

var express = require('express');
var router = express.Router();

var prisma = require('../config/db');
var qrcodeService = require('../services/qrcode.service');
var cardService = require('../services/card.service');

// The four values the Rsvp.relation column accepts (PRD §7).
var RELATIONS = ['PARENT_MARIE', 'AMI_MARIE', 'PARENT_MARIEE', 'AMI_MARIEE'];

var MAX = { nom: 80, prenom: 80, email: 160, telephone: 30 };

// Deliberately permissive: the RFC grammar is far broader than any practical
// regex, and rejecting a guest's real address is worse than accepting an odd
// one. Confirms there is a local part, an @, and a dotted domain.
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Server-side validation — authoritative, regardless of what the client checked
 * (PRD §6). Returns a field → message map; empty means valid.
 */
function validate(body) {
  var errors = {};

  var prenom = asString(body.prenom);
  var nom = asString(body.nom);
  var email = asString(body.email);
  var telephone = asString(body.telephone);
  var relation = asString(body.relation);

  if (!prenom) errors.prenom = 'Champ requis';
  else if (prenom.length > MAX.prenom) errors.prenom = 'Prénom trop long';

  if (!nom) errors.nom = 'Champ requis';
  else if (nom.length > MAX.nom) errors.nom = 'Nom trop long';

  if (!email) errors.email = 'Champ requis';
  else if (email.length > MAX.email) errors.email = 'Email trop long';
  else if (!EMAIL_RE.test(email)) errors.email = 'Email invalide';

  if (!telephone) errors.telephone = 'Champ requis';
  else if (telephone.length > MAX.telephone) errors.telephone = 'Numéro trop long';

  if (!relation) errors.relation = 'Merci de préciser';
  else if (RELATIONS.indexOf(relation) === -1) errors.relation = 'Valeur inattendue';

  // Anything other than a real boolean true counts as "not accompanied".
  if (typeof body.accompagne !== 'boolean') errors.accompagne = 'Merci de préciser';

  return errors;
}

router.post('/api/rsvp', async function (req, res, next) {
  try {
    var body = req.body || {};
    var errors = validate(body);

    // 1. Validation failure — echo the submitted values back so the form can be
    //    repopulated without the guest retyping anything (PRD §3.1).
    if (Object.keys(errors).length) {
      return res.status(400).json({
        success: false,
        message: 'Merci de compléter les champs indiqués.',
        errors: errors,
        values: {
          prenom: asString(body.prenom),
          nom: asString(body.nom),
          email: asString(body.email),
          telephone: asString(body.telephone),
          relation: asString(body.relation),
          accompagne: body.accompagne === true
        }
      });
    }

    var email = asString(body.email).toLowerCase();

    // 2. Already confirmed → hand back the existing card. Not an error: the
    //    guest simply arrives at the invitation they already have.
    var existing = await prisma.rsvp.findUnique({ where: { email: email } });

    if (existing) {
      return res.json({
        success: true,
        alreadyConfirmed: true,
        id: existing.id,
        invitationUrl: '/invitation/' + existing.id,
        message: 'Vous avez déjà confirmé votre présence.'
      });
    }

    // 3. Create the RSVP (Prisma generates the UUID).
    var rsvp;
    try {
      rsvp = await prisma.rsvp.create({
        data: {
          prenom: asString(body.prenom),
          nom: asString(body.nom),
          email: email,
          telephone: asString(body.telephone),
          relation: asString(body.relation),
          accompagne: body.accompagne === true
        }
      });
    } catch (err) {
      // Two simultaneous submissions of the same address: the unique index is
      // the real guard, so treat the loser as an "already confirmed" too.
      if (err.code === 'P2002') {
        var winner = await prisma.rsvp.findUnique({ where: { email: email } });
        if (winner) {
          return res.json({
            success: true,
            alreadyConfirmed: true,
            id: winner.id,
            invitationUrl: '/invitation/' + winner.id,
            message: 'Vous avez déjà confirmé votre présence.'
          });
        }
      }
      throw err;
    }

    // 4–7. QR → PDF → MinIO, started but deliberately *not* awaited.
    //
    // Generating the card takes about 330 ms; storing it costs another ~2.5 s
    // of network round trips to MinIO and the database. Making the guest wait
    // for that puts the response at ~3.7 s, past the 1–3 s the PRD asks for
    // (§4.2) — and they gain nothing by waiting, because the card is not
    // delivered in this response.
    //
    // This is exactly the path PRD §3.1 already describes: a generation that
    // fails must not block the guest, and /invitation/:id rebuilds the card on
    // demand. A card that is merely *late* lands in the same case as one that
    // failed, and is handled by the same code.
    //
    // generateAndStoreCard never rejects (it logs and returns null), so there
    // is no unhandled rejection to guard against here.
    cardService.generateAndStoreCard(rsvp);

    // 8. Confirmed immediately — the guest is not kept waiting on storage.
    return res.json({
      success: true,
      alreadyConfirmed: false,
      id: rsvp.id,
      invitationUrl: '/invitation/' + rsvp.id
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.validate = validate;
module.exports.RELATIONS = RELATIONS;
module.exports.qrcodeService = qrcodeService;
