#!/usr/bin/env node
/**
 * Décompte des réponses à la question d'accueil.
 *
 *   node scripts/landing-votes.js
 *
 * Volontairement hors du backoffice : cet arbitrage regarde les mariés, pas
 * les invités, et le dashboard sert au suivi des confirmations. Une ligne de
 * commande suffit à trancher une fois.
 *
 * Rappel des partis pris (README, « Les trois partis pris ») :
 *   v1 Pellicule     flux continu, sections enchaînées
 *   v2 Quatre Actes  lecture ponctuée, chaque acte annoncé
 *   v3 Fil Doré      ligne unique qui se remplit au scroll
 */

require('dotenv').config();

var prisma = require('../config/db');

var LABELS = {
  v1: 'Pellicule     — « D\'un seul souffle »',
  v2: 'Quatre Actes  — « Acte par acte »',
  v3: 'Fil Doré      — « En suivant le fil »'
};

async function main() {
  var rows = await prisma.landingVote.groupBy({
    by: ['version'],
    _count: { version: true }
  });

  var counts = { v1: 0, v2: 0, v3: 0 };
  rows.forEach(function (row) {
    if (counts[row.version] !== undefined) counts[row.version] = row._count.version;
  });

  var total = counts.v1 + counts.v2 + counts.v3;

  if (!total) {
    console.log('Aucune réponse enregistrée pour le moment.');
    return;
  }

  console.log('%d réponse(s)\n', total);

  Object.keys(LABELS).forEach(function (version) {
    var count = counts[version];
    var share = Math.round((count / total) * 100);
    // Barre proportionnelle : un décompte se lit plus vite qu'il ne se compare.
    var bar = new Array(Math.round(share / 4) + 1).join('█');
    console.log(
      '  %s  %s  %s %s%%',
      version,
      LABELS[version],
      String(count).padStart(4),
      String(share).padStart(3)
    );
    console.log('       %s', bar);
  });

  var leader = Object.keys(counts).reduce(function (best, version) {
    return counts[version] > counts[best] ? version : best;
  }, 'v1');

  console.log('\nEn tête : %s', leader);
  console.log('Pour figer ce choix : railway variables --set "LANDING_VERSION=%s"', leader);
}

main()
  .catch(function (err) {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(function () {
    return prisma.$disconnect();
  });
