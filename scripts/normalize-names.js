#!/usr/bin/env node
/**
 * Reprise de la casse des noms déjà enregistrés.
 *
 *   node scripts/normalize-names.js            # simulation, n'écrit rien
 *   node scripts/normalize-names.js --apply    # applique les changements
 *
 * La normalisation est faite à l'écriture depuis routes/rsvp.js, mais les RSVP
 * enregistrés avant cette règle gardent la casse d'origine — souvent tout en
 * majuscules. Ce script les rattrape.
 *
 * Simulation par défaut : la casse d'un nom propre est un sujet sensible, et
 * relire la liste avant d'écrire coûte moins cher que de corriger après coup.
 *
 * Idempotent : relancer sur une base déjà normalisée ne change rien. Les
 * cartes PDF déjà générées, elles, portent l'ancienne casse — voir la note en
 * fin d'exécution.
 */

require('dotenv').config();

var prisma = require('../config/db');
var formatName = require('../services/name.service').formatName;

async function main() {
  var apply = process.argv.indexOf('--apply') !== -1;

  var guests = await prisma.rsvp.findMany({
    select: { id: true, prenom: true, nom: true },
    orderBy: { createdAt: 'asc' }
  });

  var changes = guests
    .map(function (guest) {
      return {
        id: guest.id,
        avant: guest.prenom + ' ' + guest.nom,
        prenom: formatName(guest.prenom),
        nom: formatName(guest.nom)
      };
    })
    .filter(function (change) {
      return change.avant !== change.prenom + ' ' + change.nom;
    });

  console.log('%d RSVP en base, %d à corriger.', guests.length, changes.length);

  if (!changes.length) return;

  changes.forEach(function (change) {
    console.log('  %s  →  %s %s', change.avant, change.prenom, change.nom);
  });

  if (!apply) {
    console.log('\nSimulation : rien n\'a été écrit. Relancez avec --apply pour appliquer.');
    return;
  }

  // Séquentiel et non transactionnel à dessein : la liste se compte en
  // centaines, et si une ligne échoue les précédentes restent corrigées —
  // relancer le script reprend simplement là où il en était.
  var written = 0;
  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];
    await prisma.rsvp.update({
      where: { id: change.id },
      data: { prenom: change.prenom, nom: change.nom }
    });
    written++;
  }

  console.log('\n%d RSVP mis à jour.', written);
  console.log(
    'Les cartes PDF déjà stockées gardent l\'ancienne casse : supprimez leur ' +
    'cardMinioKey pour forcer une regénération à la prochaine visite.'
  );
}

main()
  .catch(function (err) {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(function () {
    return prisma.$disconnect();
  });
