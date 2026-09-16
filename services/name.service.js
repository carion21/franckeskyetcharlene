/**
 * Normalisation de la casse des noms d'invités.
 *
 * Le formulaire est rempli au téléphone, souvent en MAJUSCULES ou tout en
 * minuscules. Le nom ressort ensuite à trois endroits où la casse se voit :
 * la carte PDF imprimée, le titre de la page d'invitation (et son aperçu de
 * partage), et le dashboard admin. Normaliser à l'écriture évite de répéter
 * la règle dans chaque gabarit.
 *
 * Volontairement conservateur : on corrige la casse, on ne réécrit pas le nom.
 * Les accents, apostrophes et traits d'union sont préservés tels quels.
 */

// Séparateurs qui ouvrent un nouveau mot. L'apostrophe compte : « N'GUESSAN »
// doit donner « N'Guessan », pas « N'guessan ». Les deux formes d'apostrophe
// sont acceptées — les claviers mobiles produisent souvent la typographique.
var WORD_BOUNDARY = /([\s\-'’])/;

// Particules qui restent en minuscules à l'intérieur d'un nom, jamais en tête :
// « Jean de la Croix », mais « De Souza » si le nom commence par là.
var PARTICLES = ['de', 'du', 'des', 'da', 'di', 'le', 'la', 'les', 'van', 'von', 'der', 'den', 'et'];

// Préfixes écossais/irlandais où la lettre suivante se capitalise aussi :
// « mcdonald » → « McDonald », « o'brien » → « O'Brien » (via WORD_BOUNDARY).
var MAC_PREFIX = /^(mc)(.+)$/;

/**
 * Vrai si le mot porte une casse interne délibérée qu'il ne faut pas écraser.
 * « McDonald », « DeSouza » : l'invité a tapé quelque chose de précis, on le
 * laisse. On ne teste que les mots ni tout-majuscules ni tout-minuscules.
 */
function hasDeliberateCase(word) {
  if (word === word.toLowerCase()) return false;
  if (word === word.toUpperCase()) return false;
  return /[a-zà-öø-ÿ][A-ZÀ-ÖØ-Þ]/.test(word);
}

function capitaliseWord(word, isFirst) {
  if (!word) return word;
  if (hasDeliberateCase(word)) return word;

  var lower = word.toLowerCase();

  if (!isFirst && PARTICLES.indexOf(lower) !== -1) return lower;

  var mac = lower.match(MAC_PREFIX);
  if (mac) return 'Mc' + mac[2].charAt(0).toUpperCase() + mac[2].slice(1);

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * « JEAN-MARC N'GUESSAN » → « Jean-Marc N'Guessan »
 * « marie de la croix »   → « Marie de la Croix »
 *
 * Les espaces multiples sont réduits, mais la ponctuation interne est gardée
 * intacte : le split conserve les séparateurs pour pouvoir les réinsérer.
 */
function formatName(value) {
  var trimmed = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  var isFirst = true;

  return trimmed.split(WORD_BOUNDARY).map(function (chunk) {
    // Les séparateurs capturés reviennent tels quels et n'avancent pas la
    // position : « de » après un tiret reste une particule interne.
    if (WORD_BOUNDARY.test(chunk) && chunk.length === 1) return chunk;

    var out = capitaliseWord(chunk, isFirst);
    isFirst = false;
    return out;
  }).join('');
}

module.exports = {
  formatName: formatName
};
