#!/usr/bin/env node
/**
 * Découpe l'image des alliances pour servir de fond au hero de /v1 :
 * public/images/alliance.jpeg → public/images/alliance-hero.jpg
 *
 *   node scripts/build-alliance-hero.js
 *
 * Script ponctuel, comme build-og-image.js : le résultat est commité, le site
 * n'en dépend pas à l'exécution. À relancer si l'image source change.
 *
 * Trois raisons de recadrer plutôt que d'utiliser le fichier tel quel :
 *
 *   1. La source porte un monogramme doré en haut de plaque qui n'est pas
 *      celui des mariés — des lettres approximatives, reste de la génération
 *      de l'image. Affiché en plein hero, juste au-dessus de
 *      « Franckesky & Charlène », il contredit la page entière.
 *   2. Autour de la plaque, la source montre une nappe en mosaïque, des
 *      fleurs, des stylos et des pièces. Sur un hero large, ce pourtour
 *      déborde des deux côtés et ramène une deuxième scène dont la page n'a
 *      que faire.
 *   3. Le marbre vide sous les alliances, lui, est utile : c'est là que
 *      viennent se poser les prénoms et le compte à rebours.
 *
 * Le cadrage part donc juste sous le monogramme et descend jusqu'à la bordure
 * basse de la plaque, bord à bord.
 */

var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var ROOT = path.join(__dirname, '..');
var SOURCE = path.join(ROOT, 'public', 'images', 'alliance.jpeg');
var OUT = path.join(ROOT, 'public', 'images', 'alliance-hero.jpg');

// Coordonnées relevées sur la source (1024×1024) :
//   plaque       x 182→845   y 175→848
//   monogramme   x 470→560   y 230→315
//   alliances    x 340→700   y 360→560
// Le cadrage garde le liseré doré de la plaque sur les côtés : c'est lui qui
// fait lire le fond comme une carte posée sur la page, et non comme une image
// coupée net. Deux pixels sont pris à l'intérieur du bord, pour qu'aucune
// frange de la nappe en mosaïque ne subsiste.
var CROP = { x: 184, y: 324, width: 660, height: 522 };

(async function () {
  var source = fs.readFileSync(SOURCE).toString('base64');

  var browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  var page = await browser.newPage();

  try {
    await page.setViewport({ width: CROP.width, height: CROP.height, deviceScaleFactor: 1 });

    // L'image est décalée en négatif derrière une fenêtre de la taille du
    // cadrage : la capture d'écran fait le découpage, sans dépendance native.
    await page.setContent(
      '<body style="margin:0;overflow:hidden">' +
      '<img src="data:image/jpeg;base64,' + source + '" ' +
      'style="position:absolute;left:' + -CROP.x + 'px;top:' + -CROP.y + 'px;width:1024px">' +
      '</body>',
      { waitUntil: 'load' }
    );

    var buffer = await page.screenshot({
      type: 'jpeg',
      // 90 plutôt que 88 : le marbre est une surface lisse, où les artefacts
      // de compression se voient plus que sur une photo.
      quality: 90,
      clip: { x: 0, y: 0, width: CROP.width, height: CROP.height }
    });

    fs.writeFileSync(OUT, buffer);
    console.log('Fond du hero écrit : %s (%d×%d, %d Ko)',
      path.relative(ROOT, OUT), CROP.width, CROP.height, Math.round(buffer.length / 1024));
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(function (err) {
  console.error('Échec : ' + err.message);
  process.exitCode = 1;
});
