/**
 * The guest list as the backoffice sees it: labels, search, filters, sorting,
 * and the per-relation breakdown (PRD §4.6, §7).
 *
 * All of it lives here rather than in routes/admin.js because two endpoints
 * have to agree on it exactly — the HTML list and the CSV export. An export
 * that ignores the filter in force is worse than no export: the organiser
 * checks "Ami(e)s de la mariée", downloads, and builds a seating plan from a
 * file that quietly contains everybody.
 *
 * Server-side by design. The browser (public/shared/admin.js) only narrows
 * the rows already rendered, as you type; every filter that changes *which*
 * guests are in play goes through here, so it survives a reload, a shared
 * URL, and a browser with JavaScript off.
 */

/**
 * Relations (PRD §7), in reading order: groom's side first, bride's second,
 * parents before friends — the order a seating plan is built in.
 *
 * Plural labels: these name a group in the breakdown.
 */
var RELATIONS = [
  { key: 'PARENT_MARIE', label: 'Parents du marié', cote: 'marie' },
  { key: 'AMI_MARIE', label: 'Ami(e)s du marié', cote: 'marie' },
  { key: 'PARENT_MARIEE', label: 'Parents de la mariée', cote: 'mariee' },
  { key: 'AMI_MARIEE', label: 'Ami(e)s de la mariée', cote: 'mariee' }
];

// Singular: a table row designates one person.
var RELATION_LABELS = {
  PARENT_MARIE: 'Parent du marié',
  AMI_MARIE: 'Ami(e) du marié',
  PARENT_MARIEE: 'Parent de la mariée',
  AMI_MARIEE: 'Ami(e) de la mariée'
};

var COTE_LABELS = { marie: 'Côté marié', mariee: 'Côté mariée' };

/**
 * Sortable columns. The key is what travels in the URL (`?tri=nom`), `label`
 * feeds the mobile "sort by" select, and `defaut` is the direction a first
 * click on that column should give.
 *
 * Dates default to descending — the newest confirmation is the one being
 * looked for. Everything else reads naturally A→Z.
 */
var TRIS = [
  { key: 'date', label: 'Date de confirmation', defaut: 'desc' },
  { key: 'nom', label: 'Nom', defaut: 'asc' },
  { key: 'email', label: 'Email', defaut: 'asc' },
  { key: 'telephone', label: 'Téléphone', defaut: 'asc' },
  { key: 'accompagne', label: 'Accompagné', defaut: 'desc' },
  { key: 'relation', label: 'Relation', defaut: 'asc' }
];

var TRI_PAR_DEFAUT = 'date';

/**
 * French comparison: "Éric" sorts next to "Eric" and not after "Zoé", and
 * `numeric` keeps phone numbers in a sane order. A raw `<` comparison would
 * sort by code point and scatter every accented name to the end of the list.
 */
var collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** "0712345678" → "07 12 34 56 78" */
function formatPhone(digits) {
  return (String(digits || '').match(/.{1,2}/g) || []).join(' ');
}

/**
 * Normalises for comparison: lowercase, accents removed, anything that is
 * neither letter nor digit collapsed to a single space.
 *
 * Without it "Koffi" would not find "KOFFI", "Ané" would not find "ane", and
 * "07 12" would not find "0712345678" — three failures the organiser reads as
 * "this guest is not in the list", which is exactly the wrong answer at the
 * door.
 *
 * public/shared/admin.js carries the same function for its as-you-type
 * filter. The two must stay identical; that duplication is deliberate (no
 * bundler in this project, PRD §4.1) and is the reason both are commented.
 */
function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritics split out by NFD
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A database row turned into everything the page and the export need, so
 * neither has to reformat anything twice.
 */
function toLigne(rsvp) {
  var telephoneFormate = formatPhone(rsvp.telephone);
  var relationLabel = RELATION_LABELS[rsvp.relation] || rsvp.relation;

  return {
    id: rsvp.id,
    prenom: rsvp.prenom,
    nom: rsvp.nom,
    email: rsvp.email,
    telephone: rsvp.telephone,
    telephoneFormate: telephoneFormate,
    accompagne: rsvp.accompagne,
    relation: rsvp.relation,
    relationLabel: relationLabel,
    carteGeneree: Boolean(rsvp.cardMinioKey),
    createdAt: rsvp.createdAt,
    // Each confirmed guest counts as two when accompanied (PRD §3.1).
    personnes: rsvp.accompagne ? 2 : 1,
    // The haystack both search implementations match against. Both spellings
    // of the number are in it, so "0712" and "07 12" each find the row.
    rechercheTexte: [
      rsvp.prenom,
      rsvp.nom,
      rsvp.email || '',
      rsvp.telephone,
      telephoneFormate,
      relationLabel,
      rsvp.accompagne ? 'accompagné accompagnée avec' : 'seul seule sans'
    ].join(' ')
  };
}

/**
 * Reads the filter state out of the query string, keeping only values that
 * exist. An unknown `?relation=DJ` yields no filter rather than an empty
 * table — a mistyped URL should not look like "nobody confirmed".
 */
function parseFiltres(query) {
  var q = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : '';

  var relation = RELATIONS.some(function (r) { return r.key === query.relation; })
    ? query.relation
    : '';

  var cote = COTE_LABELS[query.cote] ? query.cote : '';

  var tri = TRIS.some(function (t) { return t.key === query.tri; })
    ? query.tri
    : TRI_PAR_DEFAUT;

  // Explicit direction wins; otherwise each column starts the way it reads
  // best (see TRIS).
  var sens = query.sens === 'asc' || query.sens === 'desc'
    ? query.sens
    : TRIS.filter(function (t) { return t.key === tri; })[0].defaut;

  return {
    q: q,
    relation: relation,
    cote: cote,
    accompagne: query.accompagne === '1',
    sansCarte: query.carte === 'manquante',
    tri: tri,
    sens: sens
  };
}

/** True when anything narrows the list — drives the "reset" affordance. */
function filtresActifs(filtres) {
  return Boolean(filtres.q || filtres.relation || filtres.cote ||
    filtres.accompagne || filtres.sansCarte);
}

/**
 * Builds a URL for the list, starting from the filters in force and applying
 * `patch` on top. `null` in the patch clears a key.
 *
 * Every link on the page goes through this: without it, clicking a column
 * header would silently drop the active relation filter, and sorting would
 * feel like it "reset everything".
 */
function construireLien(filtres, patch, base) {
  var etat = Object.assign({}, filtres, patch || {});
  var params = new URLSearchParams();

  if (etat.q) params.set('q', etat.q);
  if (etat.relation) params.set('relation', etat.relation);
  if (etat.cote) params.set('cote', etat.cote);
  if (etat.accompagne) params.set('accompagne', '1');
  if (etat.sansCarte) params.set('carte', 'manquante');

  // Default sort stays out of the URL: a bare /admin and a /admin?tri=date
  // showing the same thing under two addresses helps nobody.
  if (etat.tri && etat.tri !== TRI_PAR_DEFAUT) params.set('tri', etat.tri);
  if (etat.tri && etat.sens) {
    var defaut = TRIS.filter(function (t) { return t.key === etat.tri; })[0];
    if (defaut && etat.sens !== defaut.defaut) params.set('sens', etat.sens);
  }

  var qs = params.toString();
  return (base || '/admin') + (qs ? '?' + qs : '');
}

/** The direction a click on `key` should produce, given the current state. */
function sensSuivant(filtres, key) {
  var colonne = TRIS.filter(function (t) { return t.key === key; })[0];
  if (!colonne) return 'asc';
  if (filtres.tri !== key) return colonne.defaut;
  return filtres.sens === 'asc' ? 'desc' : 'asc';
}

function valeurDeTri(ligne, key) {
  switch (key) {
    // Surname first: an alphabetical guest list is read by family name.
    case 'nom': return ligne.nom + ' ' + ligne.prenom;
    // Guests without an address go last in ascending order rather than
    // forming a block of blanks at the top.
    case 'email': return ligne.email || '\uffff';
    case 'telephone': return ligne.telephone;
    case 'accompagne': return ligne.accompagne ? '1' : '0';
    case 'relation': return ligne.relationLabel;
    default: return null; // date — compared numerically below
  }
}

function trier(lignes, filtres) {
  var facteur = filtres.sens === 'asc' ? 1 : -1;

  return lignes.slice().sort(function (a, b) {
    var ecart;

    if (filtres.tri === 'date') {
      ecart = a.createdAt.getTime() - b.createdAt.getTime();
    } else {
      ecart = collator.compare(valeurDeTri(a, filtres.tri), valeurDeTri(b, filtres.tri));
    }

    // Ties fall back to the date, newest first: two guests with the same
    // surname would otherwise swap places between two identical page loads.
    if (ecart === 0) return b.createdAt.getTime() - a.createdAt.getTime();

    return ecart * facteur;
  });
}

function filtrer(lignes, filtres) {
  // Each word counts separately: "koffi 07" matches the row containing both,
  // in any order.
  var termes = normalise(filtres.q).split(' ').filter(Boolean);

  var cotesParRelation = {};
  RELATIONS.forEach(function (r) { cotesParRelation[r.key] = r.cote; });

  return lignes.filter(function (ligne) {
    if (filtres.relation && ligne.relation !== filtres.relation) return false;
    if (filtres.cote && cotesParRelation[ligne.relation] !== filtres.cote) return false;
    if (filtres.accompagne && !ligne.accompagne) return false;
    if (filtres.sansCarte && ligne.carteGeneree) return false;

    if (termes.length > 0) {
      var foin = normalise(ligne.rechercheTexte);
      return termes.every(function (terme) { return foin.indexOf(terme) !== -1; });
    }

    return true;
  });
}

/** Filter, then sort. The order matters only for speed, not for the result. */
function appliquer(lignes, filtres) {
  return trier(filtrer(lignes, filtres), filtres);
}

/**
 * Totals, always computed over the whole list and never over the filtered
 * one: the tiles are both the summary *and* the filter buttons, and a count
 * that changed when you clicked it would leave no way back to the total.
 */
function compterStats(lignes) {
  var accompagnes = lignes.filter(function (l) { return l.accompagne; }).length;

  var repartition = RELATIONS.map(function (relation) {
    var groupe = lignes.filter(function (l) { return l.relation === relation.key; });

    return {
      key: relation.key,
      label: relation.label,
      cote: relation.cote,
      confirmations: groupe.length,
      personnes: groupe.reduce(function (somme, l) { return somme + l.personnes; }, 0)
    };
  });

  var cotes = Object.keys(COTE_LABELS).map(function (cote) {
    var parts = repartition.filter(function (r) { return r.cote === cote; });

    return {
      key: cote,
      label: COTE_LABELS[cote],
      // Summed from the breakdown rather than recounted, so the two can never
      // disagree.
      personnes: parts.reduce(function (somme, r) { return somme + r.personnes; }, 0)
    };
  });

  return {
    total: lignes.length,
    accompagnes: accompagnes,
    personnes: lignes.length + accompagnes,
    cartesManquantes: lignes.filter(function (l) { return !l.carteGeneree; }).length,
    repartition: repartition,
    cotes: cotes
  };
}

module.exports = {
  RELATIONS: RELATIONS,
  RELATION_LABELS: RELATION_LABELS,
  TRIS: TRIS,
  TRI_PAR_DEFAUT: TRI_PAR_DEFAUT,
  formatPhone: formatPhone,
  normalise: normalise,
  toLigne: toLigne,
  parseFiltres: parseFiltres,
  filtresActifs: filtresActifs,
  construireLien: construireLien,
  sensSuivant: sensSuivant,
  appliquer: appliquer,
  compterStats: compterStats
};
