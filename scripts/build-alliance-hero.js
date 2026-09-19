#!/usr/bin/env node
/**
 * Découpe l'image des alliances pour servir de fond au hero de /v1 :
 * public/images/alliance-bokeh.jpeg → public/images/alliance-hero.jpg (+ .webp)
 *
 *   node scripts/build-alliance-hero.js
 *
 * Script ponctuel, comme build-og-image.js : le résultat est commité, le site
 * n'en dépend pas à l'exécution. À relancer si l'image source change.
 *
 * La source est une photo d'alliances posées sur des pétales de roses, avec
 * un bokeh doré en flou tout autour : douce, continue, sans arête — le même
 * registre que la bande-film de /v1, où les sections s'enchaînent sans
 * rupture. (L'ancienne plaque de marbre vert public/images/alliance.jpeg
 * reste dans le dossier sans plus être utilisée. Le voile clair sous
 * gypsophiles qui occupait ce même fichier avant n'est plus sur disque, mais
 * reste récupérable dans l'historique git.)
 *
 * build-og-image.js repart du fichier produit ici pour og-alliance.jpg :
 * relancer les deux scripts à la suite, dans cet ordre.
 *
 * Deux raisons de recadrer plutôt que d'utiliser le fichier tel quel :
 *
 *   1. La source est un portrait 735×1284 aux angles arrondis, avec une frange
 *      blanche dans les coins et une tache rose en bas à droite. Servie telle
 *      quelle, ces bords se lisent comme un défaut d'export.
 *   2. Le voile flou SOUS les alliances est utile : c'est là que viennent se
 *      poser les prénoms et le compte à rebours sur les écrans larges et
 *      courts, où la plaque descend jusqu'à 66 % du hero.
 *
 * Le cadrage sort donc un 660×522 paysage — exactement le format de l'ancien
 * fond. C'est délibéré : toute la géométrie du hero de /v1 est calée sur ce
 * rapport (`background-size`, masque de fondu, 79.1vw), et la conserver évite
 * de recalculer ces nombres. Changer le rapport ici oblige à reprendre
 * .hero__photo dans public/v1/styles.css.
 */

var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var ROOT = path.join(__dirname, '..');
var SOURCE = path.join(ROOT, 'public', 'images', 'alliance-bokeh.jpeg');
var OUT_JPEG = path.join(ROOT, 'public', 'images', 'alliance-hero.jpg');
var OUT_WEBP = path.join(ROOT, 'public', 'images', 'alliance-hero.webp');

var SOURCE_WIDTH = 717;

// Coordonnées relevées sur la source (717×1280, alliances sur pétales de
// roses et bokeh doré) :
//   alliances    x 70→620   y 530→800
// Le cadrage laisse ~60 px au-dessus des anneaux (le bokeh flou) et descend
// ~190 px sous eux, centré horizontalement sur les deux anneaux.
var CROP = { x: 15, y: 470, width: 660, height: 522 };

// Fondu latéral cuit dans le fichier, vers --emerald-light — la couleur que
// .hero__photo porte en `background-color`, donc ce que l'image a derrière et
// à côté d'elle. Sur grand écran, l'image est plafonnée en hauteur et ne fait
// plus toute la largeur : sans ce fondu, ses deux bords verticaux se lisent
// comme un rectangle collé sur la page. L'ancienne plaque n'avait pas ce
// défaut, son liseré doré faisait la bordure.
//
// Pourquoi ici et pas en CSS : le fondu bas du hero est déjà un `mask-image`,
// et superposer un second masque demanderait `mask-composite`, dont l'absence
// dégrade en « aucun fondu du tout ». Fondu vers une couleur opaque plutôt que
// vers la transparence : le JPEG n'a pas de canal alpha, et le voile du hero
// couvre l'image et son entourage de la même façon — deux surfaces de même
// couleur sous le même voile restent de même couleur.
var FADE = { width: 150, color: '6, 118, 79' };

(async function () {
  var source = fs.readFileSync(SOURCE).toString('base64');

  var browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  var page = await browser.newPage();

  try {
    await page.setViewport({ width: CROP.width, height: CROP.height, deviceScaleFactor: 1 });

    // L'image est décalée en négatif derrière une fenêtre de la taille du
    // cadrage : la capture d'écran fait le découpage, sans dépendance native.
    var fade = function (side) {
      return '<div style="position:absolute;top:0;bottom:0;' + side + ':0;width:' + FADE.width + 'px;' +
        'background:linear-gradient(to ' + (side === 'left' ? 'right' : 'left') + ',' +
        'rgb(' + FADE.color + ') 0%, rgba(' + FADE.color + ',0) 100%)"></div>';
    };

    await page.setContent(
      '<body style="margin:0;overflow:hidden">' +
      '<img src="data:image/jpeg;base64,' + source + '" ' +
      'style="position:absolute;left:' + -CROP.x + 'px;top:' + -CROP.y + 'px;width:' + SOURCE_WIDTH + 'px">' +
      fade('left') + fade('right') +
      '</body>',
      { waitUntil: 'load' }
    );

    var clip = { x: 0, y: 0, width: CROP.width, height: CROP.height };

    // 90 plutôt que 88 : le fond est un dégradé lisse, où les artefacts de
    // compression se voient plus que sur une photo texturée.
    var jpeg = await page.screenshot({ type: 'jpeg', quality: 90, clip: clip });
    // Le WebP est la variante servie en premier par `image-set()` — même
    // cadrage au pixel près, donc les limites de `background-size` et le
    // masque du hero restent valables pour les deux fichiers.
    var webp = await page.screenshot({ type: 'webp', quality: 86, clip: clip });

    fs.writeFileSync(OUT_JPEG, jpeg);
    fs.writeFileSync(OUT_WEBP, webp);
    console.log('Fond du hero /v1 écrit : %s (%d×%d, %d Ko) et %s (%d Ko)',
      path.relative(ROOT, OUT_JPEG), CROP.width, CROP.height, Math.round(jpeg.length / 1024),
      path.relative(ROOT, OUT_WEBP), Math.round(webp.length / 1024));
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(function (err) {
  console.error('Échec : ' + err.message);
  process.exitCode = 1;
});
