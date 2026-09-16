#!/usr/bin/env node
/**
 * Génère l'image de partage (Open Graph) : public/images/og-cover.jpg
 *
 *   node scripts/build-og-image.js
 *
 * Script ponctuel — l'image produite est commitée, le site n'en dépend pas à
 * l'exécution. À relancer si la photo du couple ou la date changent.
 *
 * Pourquoi une image dédiée plutôt que la photo telle quelle : la photo est en
 * portrait (843×1264) alors que WhatsApp et Facebook attendent du 1200×630.
 * Livrée brute, elle serait recadrée par la plateforme, au petit bonheur — en
 * pratique sur le torse du marié, sans les visages ni les prénoms.
 */

var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var ROOT = path.join(__dirname, '..');
var FONT_DIR = path.join(ROOT, 'assets', 'fonts');
var PHOTO = path.join(ROOT, 'public', 'images', 'couple.jpeg');
var OUT = path.join(ROOT, 'public', 'images', 'og-cover.jpg');

// Format de référence des aperçus de lien.
var WIDTH = 1200;
var HEIGHT = 630;

function b64(file) {
  return fs.readFileSync(path.join(FONT_DIR, file)).toString('base64');
}

function buildHtml() {
  var photo = fs.readFileSync(PHOTO).toString('base64');

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Great Vibes'; font-style: normal; font-weight: 400; font-display: block;
    src: url('data:font/woff2;base64,${b64('GreatVibes-Regular.woff2')}') format('woff2');
  }
  @font-face {
    font-family: 'Cormorant'; font-style: normal; font-weight: 600; font-display: block;
    src: url('data:font/woff2;base64,${b64('Cormorant-SemiBold.woff2')}') format('woff2');
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; }
  .cover { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #046241; }

  /* Photo ancrée haut : les visages sont dans le tiers supérieur, un cadrage
     centré les couperait sur un format aussi large. */
  .photo {
    position: absolute; inset: 0;
    background-image: url('data:image/jpeg;base64,${photo}');
    background-size: cover; background-position: center 18%;
  }
  /* Voile dégradé depuis la gauche : le couple reste lisible à droite,
     le texte repose sur une zone assez dense à gauche. */
  .veil {
    position: absolute; inset: 0;
    background:
      linear-gradient(90deg, rgba(2,56,35,.95) 0%, rgba(2,56,35,.86) 42%, rgba(2,56,35,.42) 68%, rgba(2,56,35,.30) 100%),
      linear-gradient(180deg, rgba(2,56,35,.30), rgba(2,56,35,.55));
  }

  .frame { position: absolute; top: 26px; left: 26px; right: 26px; bottom: 26px; border: 2px solid #C9A227; }
  .frame-in { position: absolute; top: 34px; left: 34px; right: 34px; bottom: 34px; border: 1px solid rgba(201,162,39,.5); }

  .content { position: absolute; top: 0; bottom: 0; left: 84px; width: 620px;
             display: flex; flex-direction: column; justify-content: center; }

  .eyebrow { font-family: 'Cormorant', serif; font-weight: 600; font-variant: small-caps;
             font-size: 25px; letter-spacing: .3em; color: #E4C766; margin: 0 0 14px; }
  .names   { font-family: 'Great Vibes', cursive; font-size: 86px; line-height: 1.05;
             color: #FDFBF6; margin: 0; }
  .rule    { width: 190px; height: 2px; background: #C9A227; margin: 26px 0; }
  .date    { font-family: 'Cormorant', serif; font-weight: 600; font-variant: small-caps;
             font-size: 30px; letter-spacing: .22em; color: #FDFBF6; margin: 0; }
  .place   { font-family: 'Cormorant', serif; font-weight: 600; font-variant: small-caps;
             font-size: 21px; letter-spacing: .2em; color: #E4C766; margin: 12px 0 0; }
</style></head>
<body>
  <div class="cover">
    <div class="photo"></div>
    <div class="veil"></div>
    <div class="frame"></div>
    <div class="frame-in"></div>
    <div class="content">
      <p class="eyebrow">Invitation au mariage</p>
      <p class="names">Franckesky<br>&amp; Charl&egrave;ne</p>
      <div class="rule"></div>
      <p class="date">Samedi 10 Octobre 2026</p>
      <p class="place">Abidjan, C&ocirc;te d'Ivoire</p>
    </div>
  </div>
</body></html>`;
}

(async function () {
  var browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  var page = await browser.newPage();

  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(buildHtml(), { waitUntil: 'load' });
    await page.evaluate(function () { return document.fonts.ready; });

    // JPEG plutôt que PNG : l'image est photographique, et certains clients de
    // messagerie ignorent un aperçu trop lourd.
    var buffer = await page.screenshot({
      type: 'jpeg',
      quality: 88,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    });

    fs.writeFileSync(OUT, buffer);
    console.log('Image de partage écrite : %s (%d Ko)', path.relative(ROOT, OUT), Math.round(buffer.length / 1024));
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(function (err) {
  console.error('Échec : ' + err.message);
  process.exitCode = 1;
});
