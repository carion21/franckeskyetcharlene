#!/usr/bin/env node
/**
 * Découpe la nature morte des alliances pour servir de fond au hero de /v2 :
 * public/images/flatlay.jpeg → public/images/flatlay-hero.jpg (+ .webp)
 *
 *   node scripts/build-flatlay-hero.js
 *
 * Script ponctuel, comme build-alliance-hero.js : le résultat est commité, le
 * site n'en dépend pas à l'exécution. À relancer si la source change.
 *
 * La source est une scène composée — satin, roses, eucalyptus, carton
 * d'invitation, alliances sur marbre : une mise en scène, pas un instantané.
 * C'est le registre de /v2, dont la lecture est découpée en actes annoncés.
 *
 * Trois raisons de recadrer plutôt que d'utiliser le fichier tel quel :
 *
 *   1. Le carton porte un monogramme « R & J » en calligraphie dorée, qui
 *      n'est pas celui des mariés. Affiché en plein hero, sous
 *      « Franckesky & Charlène », il contredit la page entière. Le cadrage
 *      s'arrête donc avant les lettres, et ne garde du carton que sa tranche
 *      vierge — il se lit toujours comme une invitation posée là.
 *   2. Les prénoms, la date et le compte à rebours occupent la bande 35 %→65 %
 *      du hero (mesuré en 390×844 et en 1440×900). Le cadrage remonte donc les
 *      alliances dans le tiers haut et laisse le marbre vide sous elles : le
 *      texte se pose sur une surface calme, pas sur les anneaux.
 *   3. Le bas de la source (cristaux épars) n'apporte rien une fois voilé.
 *
 * Le fichier sorti fait 548×1200 : le cadrage de 852 px de haut, prolongé de
 * 348 px de marbre uni. Ce rapport de 0,457 n'est pas décoratif — il est
 * calculé pour le `cover` du hero, cf. EXTENSION plus bas.
 *
 * À noter : /v3 continue de servir public/images/couple.jpeg. La photo réelle
 * des mariés reste donc en ligne, sur une version et une seule.
 */

var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var ROOT = path.join(__dirname, '..');
var SOURCE = path.join(ROOT, 'public', 'images', 'flatlay.jpeg');
var OUT_JPEG = path.join(ROOT, 'public', 'images', 'flatlay-hero.jpg');
var OUT_WEBP = path.join(ROOT, 'public', 'images', 'flatlay-hero.webp');

var SOURCE_WIDTH = 731;

// Coordonnées relevées sur la source (731×1280) :
//   roses        x 100→660  y 150→450
//   alliances    x 165→490  y 600→790
//   carton       x 450→731  y 500→930
//   « R »        x 615→731  y 655→720     — première lettre du monogramme
// La limite droite est posée à 556, soit 59 px avant le « R » : la marge
// absorbe le halo doré de la lettre, invisible sur une capture mais bien
// présent une fois l'image agrandie en `cover`.
var CROP = { x: 8, y: 420, width: 548, height: 852 };

// Le fichier sorti est plus haut que le cadrage : 348 px de marbre uni sont
// ajoutés sous lui, et c'est ce prolongement qui donne sa hauteur au 548×1200.
//
// Pourquoi : le hero est en `cover`. À 548×852 (rapport 0,64), un téléphone en
// 390×844 (0,46) cale l'image sur la HAUTEUR et rogne 28 % de sa largeur —
// l'alliance de droite se retrouvait coupée par le bord de l'écran. À 548×1200
// (0,457), le rapport passe juste sous celui du téléphone : l'image se cale sur
// la largeur, et les deux anneaux tiennent entiers dans le cadre. Le cadrage
// lui-même n'a pas pu être allongé vers le haut : cela aurait fait redescendre
// les alliances dans la bande de texte.
//
// Le prolongement est invisible : la couleur est relevée sur les 30 dernières
// lignes du marbre de la source, rgb(191,178,168), et le voile du hero couvre
// cette zone à plus de 85 % d'émeraude.
var EXTENSION = { height: 348, color: '191, 178, 168' };

(async function () {
  var source = fs.readFileSync(SOURCE).toString('base64');

  var browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  var page = await browser.newPage();

  var height = CROP.height + EXTENSION.height;

  try {
    await page.setViewport({ width: CROP.width, height: height, deviceScaleFactor: 1 });

    // L'image est décalée en négatif derrière une fenêtre de la taille du
    // cadrage : la capture d'écran fait le découpage, sans dépendance native.
    // Le prolongement est posé dessous, avec 40 px de recouvrement en fondu
    // pour qu'aucune ligne ne marque la jonction.
    await page.setContent(
      '<body style="margin:0;overflow:hidden;background:rgb(' + EXTENSION.color + ')">' +
      '<img src="data:image/jpeg;base64,' + source + '" ' +
      'style="position:absolute;left:' + -CROP.x + 'px;top:' + -CROP.y + 'px;width:' + SOURCE_WIDTH + 'px">' +
      '<div style="position:absolute;left:0;right:0;top:' + (CROP.height - 40) + 'px;bottom:0;' +
      'background:linear-gradient(to bottom, rgba(' + EXTENSION.color + ',0) 0px, rgb(' + EXTENSION.color + ') 40px)"></div>' +
      '</body>',
      { waitUntil: 'load' }
    );

    var clip = { x: 0, y: 0, width: CROP.width, height: height };

    // 90 : le marbre et le satin sont des surfaces lisses, où les artefacts de
    // compression se voient plus que sur une photo texturée.
    var jpeg = await page.screenshot({ type: 'jpeg', quality: 90, clip: clip });
    // Variante servie en premier par `image-set()`, au même cadrage.
    var webp = await page.screenshot({ type: 'webp', quality: 86, clip: clip });

    fs.writeFileSync(OUT_JPEG, jpeg);
    fs.writeFileSync(OUT_WEBP, webp);
    console.log('Fond du hero /v2 écrit : %s (%d×%d, %d Ko) et %s (%d Ko)',
      path.relative(ROOT, OUT_JPEG), CROP.width, height, Math.round(jpeg.length / 1024),
      path.relative(ROOT, OUT_WEBP), Math.round(webp.length / 1024));
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(function (err) {
  console.error('Échec : ' + err.message);
  process.exitCode = 1;
});
