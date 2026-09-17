#!/usr/bin/env node
/**
 * Réécrit l'URL publique dans les fichiers qui ne peuvent pas la lire à
 * l'exécution : les balises Open Graph des landings statiques et de la page
 * d'invitation.
 *
 *   node scripts/set-public-url.js                     # depuis PUBLIC_BASE_URL
 *   node scripts/set-public-url.js https://exemple.tld # explicitement
 *
 * Pourquoi ce script existe : les services (QR, .ics) lisent `PUBLIC_BASE_URL`
 * à l'exécution, mais une balise `og:image` doit porter une URL **absolue** en
 * dur — les robots des messageries ne résolvent pas un chemin relatif. Sans ce
 * script, changer de domaine obligerait à retrouver ces URL à la main dans
 * quatre fichiers, et en oublier une passe inaperçu jusqu'à ce qu'un aperçu
 * WhatsApp sorte sans image.
 *
 * À relancer après tout changement de `PUBLIC_BASE_URL`.
 */

require('dotenv').config();

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

// views/invitation.ejs n'est plus listée : ses balises Open Graph sont rendues
// à partir de `PUBLIC_BASE_URL` au moment de la requête, elle n'a donc plus
// d'URL en dur à réécrire. Seules les landings statiques en gardent.
var TARGETS = [
  'views/accueil.html',
  'public/v1/index.html',
  'public/v2/index.html',
  'public/v3/index.html'
];

// Reconnaît n'importe quelle URL absolue déjà présente sur ces attributs, quel
// que soit le domaine : le script reste utilisable après plusieurs bascules.
var PATTERNS = [
  { re: /(<meta property="og:url" content=")https?:\/\/[^"]*(")/g, kind: 'og:url' },
  { re: /(<meta property="og:image" content=")https?:\/\/[^"/]*(\/[^"]*")/g, kind: 'og:image' },
  { re: /(<meta name="twitter:image" content=")https?:\/\/[^"/]*(\/[^"]*")/g, kind: 'twitter:image' }
];

function main() {
  var base = (process.argv[2] || process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

  if (!base) {
    console.error('PUBLIC_BASE_URL absent : définissez-le dans .env ou passez-le en argument.');
    process.exitCode = 1;
    return;
  }

  try {
    new URL(base);
  } catch (err) {
    console.error('URL invalide : ' + base);
    process.exitCode = 1;
    return;
  }

  console.log('URL publique : ' + base);
  var total = 0;

  TARGETS.forEach(function (relative) {
    var file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) {
      console.warn('  ignoré (absent) : ' + relative);
      return;
    }

    var source = fs.readFileSync(file, 'utf8');
    var updated = source;
    var count = 0;

    PATTERNS.forEach(function (pattern) {
      updated = updated.replace(pattern.re, function (match, before, after) {
        count++;
        // og:url ne porte que le domaine ici ; les autres gardent leur chemin.
        return pattern.kind === 'og:url'
          ? before + base + resolvePath(relative) + after
          : before + base + after;
      });
    });

    if (updated !== source) {
      fs.writeFileSync(file, updated);
      total += count;
      console.log('  %s — %d URL mises à jour', relative, count);
    } else {
      console.log('  %s — déjà à jour', relative);
    }
  });

  console.log(total + ' URL réécrites.');
  console.log('Pensez à regénérer l\'aperçu si la photo a changé : node scripts/build-og-image.js');
}

/** Chemin propre à chaque landing pour og:url ; vide ailleurs. */
function resolvePath(relative) {
  var match = relative.match(/public\/(v[123])\//);
  return match ? '/' + match[1] : '';
}

main();
