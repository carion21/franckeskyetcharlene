#!/usr/bin/env node
/**
 * Génère les images de partage (Open Graph) :
 *
 *   public/images/og-cover.jpg      la photo du couple — /v3, /invitation
 *   public/images/og-alliance.jpg   les alliances sur pétales — /v1
 *   public/images/og-flatlay.jpg    la nature morte alliances+carton — /v2
 *
 *   node scripts/build-og-image.js
 *
 * Script ponctuel — les images produites sont commitées, le site n'en dépend
 * pas à l'exécution. À relancer si une image source ou la date change.
 *
 * Pourquoi des images dédiées plutôt que les photos telles quelles : elles sont
 * en portrait (843×1264) ou carrées (1024×1024) alors que WhatsApp et Facebook
 * attendent du 1200×630. Livrées brutes, elles seraient recadrées par la
 * plateforme, au petit bonheur — en pratique sur le torse du marié, sans les
 * visages ni les prénoms.
 *
 * Chaque version a son aperçu de lien dédié, assorti à ce que montre son hero
 * — /v2 ne montre la photo du couple nulle part (cf. build-flatlay-hero.js),
 * son aperçu ne doit donc pas la montrer non plus. Les trois variantes
 * partagent le même gabarit : même cadre doré, mêmes prénoms, même date.
 * Seuls changent l'image de fond et la façon de la poser — une photo se
 * laisse recadrer en plein cadre, une plaque gravée non : elle a des bords,
 * et on les voit.
 */

var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var ROOT = path.join(__dirname, '..');
var FONT_DIR = path.join(ROOT, 'assets', 'fonts');
var IMAGES = path.join(ROOT, 'public', 'images');

var VARIANTES = [
  {
    // Photo du couple, en plein cadre, ancrée haut : les visages sont dans le
    // tiers supérieur, un cadrage centré les couperait sur un format aussi large.
    source: 'couple.jpeg',
    sortie: 'og-cover.jpg',
    fond: 'background-size: cover; background-position: center 18%;',
    // Voile dégradé depuis la gauche : le couple reste lisible à droite,
    // le texte repose sur une zone assez dense à gauche.
    voile:
      'linear-gradient(90deg, rgba(2,56,35,.95) 0%, rgba(2,56,35,.86) 42%, rgba(2,56,35,.42) 68%, rgba(2,56,35,.30) 100%),' +
      'linear-gradient(180deg, rgba(2,56,35,.30), rgba(2,56,35,.55))'
  },
  {
    // Les alliances : le recadrage déjà fait pour le hero. Posée entière à
    // droite plutôt que recadrée en plein cadre — calée sur la hauteur, le
    // 660×522 occupe 796 px des 1200, et les deux anneaux tiennent dedans.
    // Agrandie davantage, l'image perdait l'anneau de droite hors cadre.
    source: 'alliance-hero.jpg',
    sortie: 'og-alliance.jpg',
    fond: 'background-size: auto 100%; background-position: right top;',
    // Voile plus franc à gauche, presque rien à droite : les anneaux doivent
    // rester nets, le texte a besoin d'un fond calme.
    voile:
      'linear-gradient(90deg, rgba(2,56,35,.96) 0%, rgba(2,56,35,.90) 40%, rgba(2,56,35,.30) 66%, rgba(2,56,35,.12) 100%),' +
      'linear-gradient(180deg, rgba(2,56,35,.22), rgba(2,56,35,.42))'
  },
  {
    // La nature morte de /v2 (déjà recadrée pour son hero, 548×1200 : roses en
    // frange haute, alliances et carton d'invitation dans le tiers supérieur,
    // marbre uni en dessous — cf. build-flatlay-hero.js). `cover` remplit toute
    // la largeur du gabarit sans rogner horizontalement (1200/548 = 630/1200 à
    // peu de chose près), donc pas d'anneau perdu sur un bord. `14%` cale la
    // fenêtre verticale sur les alliances plutôt que sur le marbre du bas.
    source: 'flatlay-hero.jpg',
    sortie: 'og-flatlay.jpg',
    fond: 'background-size: cover; background-position: center 14%;',
    voile:
      'linear-gradient(90deg, rgba(2,56,35,.95) 0%, rgba(2,56,35,.86) 42%, rgba(2,56,35,.42) 68%, rgba(2,56,35,.30) 100%),' +
      'linear-gradient(180deg, rgba(2,56,35,.30), rgba(2,56,35,.55))'
  }
];

// Format de référence des aperçus de lien.
var WIDTH = 1200;
var HEIGHT = 630;

function b64(file) {
  return fs.readFileSync(path.join(FONT_DIR, file)).toString('base64');
}

function buildHtml(variante) {
  var photo = fs.readFileSync(path.join(IMAGES, variante.source)).toString('base64');

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

  .photo {
    position: absolute; inset: 0;
    background-image: url('data:image/jpeg;base64,${photo}');
    background-repeat: no-repeat;
    ${variante.fond}
  }
  .veil {
    position: absolute; inset: 0;
    background: ${variante.voile};
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

    for (var i = 0; i < VARIANTES.length; i++) {
      var variante = VARIANTES[i];
      var out = path.join(IMAGES, variante.sortie);

      await page.setContent(buildHtml(variante), { waitUntil: 'load' });
      await page.evaluate(function () { return document.fonts.ready; });

      // JPEG plutôt que PNG : l'image est photographique, et certains clients
      // de messagerie ignorent un aperçu trop lourd.
      var buffer = await page.screenshot({
        type: 'jpeg',
        quality: 88,
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
      });

      fs.writeFileSync(out, buffer);
      console.log('Image de partage écrite : %s (%d Ko)', path.relative(ROOT, out), Math.round(buffer.length / 1024));
    }
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(function (err) {
  console.error('Échec : ' + err.message);
  process.exitCode = 1;
});
