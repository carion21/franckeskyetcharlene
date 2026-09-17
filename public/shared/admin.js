/* ═══════════════════════════════════════════════════════════════════════
   Comportements du backoffice (/admin/*).

   Deux enrichissements progressifs, chacun optionnel : la page reste
   entièrement utilisable sans JavaScript.

   1. Œil « afficher le mot de passe » sur la page de connexion. Le bouton
      est créé ici et non dans le template : sans JS il ne serait qu'un
      bouton mort qui ne fait rien.
   2. Recherche à la frappe dans la liste des confirmations, et cohérence des
      liens qui l'entourent.

   Les filtres, le tri et l'export sont, eux, entièrement serveur (voir
   services/guest-list.service.js) : ce sont de vrais liens et un vrai
   formulaire GET, qui fonctionnent sans JavaScript, se partagent par URL et
   survivent à un rechargement. Seule la recherche est doublée ici, parce que
   les lignes sont déjà dans la page : un aller-retour par frappe coûterait
   plus qu'il ne rapporte.

   Pas de bundler, pas d'inline (CSP stricte, cf. app.js) : un seul fichier
   chargé par les deux pages, chacune n'activant que ce qui la concerne.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Œil du mot de passe ───────────────────────────────────────────── */

  // Deux tracés distincts plutôt qu'un seul barré en CSS : l'état « masqué »
  // doit rester lisible même quand les couleurs sont forcées (mode contraste
  // élevé), où une barre en pseudo-élément disparaîtrait.
  var EYE_SHOW =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M1.6 12S5.3 5.4 12 5.4 22.4 12 22.4 12 18.7 18.6 12 18.6 1.6 12 1.6 12Z"/>' +
    '<circle cx="12" cy="12" r="3.1"/></svg>';

  var EYE_HIDE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M9.9 5.7A8.9 8.9 0 0 1 12 5.4c6.7 0 10.4 6.6 10.4 6.6a19 19 0 0 1-3.2 4.1"/>' +
    '<path d="M6.5 7.6A19 19 0 0 0 1.6 12S5.3 18.6 12 18.6a9.8 9.8 0 0 0 4.2-.9"/>' +
    '<path d="M10.1 10.2a3.1 3.1 0 0 0 4.3 4.3"/>' +
    '<path d="m3 3 18 18"/></svg>';

  function setupPasswordToggle(control) {
    var input = control.querySelector('input');
    if (!input) return;

    var button = document.createElement('button');
    button.type = 'button'; // sinon il soumettrait le formulaire
    button.className = 'field__toggle';
    button.setAttribute('aria-controls', input.id || '');
    button.innerHTML = EYE_SHOW;

    function render(visible) {
      input.type = visible ? 'text' : 'password';
      button.innerHTML = visible ? EYE_HIDE : EYE_SHOW;
      // aria-pressed dit l'état du bouton, aria-label dit ce qu'il fera :
      // les deux ensemble se lisent correctement sur tous les lecteurs.
      button.setAttribute('aria-pressed', visible ? 'true' : 'false');
      button.setAttribute(
        'aria-label',
        visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
      );
    }

    button.addEventListener('click', function () {
      var visible = button.getAttribute('aria-pressed') === 'true';

      // Changer `type` replace le curseur en fin de champ sur plusieurs
      // navigateurs. On mémorise la sélection pour la restaurer : sinon
      // corriger une faute au milieu du mot de passe devient impossible.
      var start = input.selectionStart;
      var end = input.selectionEnd;

      render(!visible);

      input.focus();
      try {
        if (start !== null) input.setSelectionRange(start, end);
      } catch (err) {
        // `setSelectionRange` refuse certains types de champ selon le
        // navigateur : le champ garde alors le focus, c'est suffisant.
      }
    });

    // Un mot de passe laissé en clair à l'écran après l'envoi n'a aucune
    // raison d'y rester — et le champ est repeuplé vide en cas d'erreur.
    if (input.form) {
      input.form.addEventListener('submit', function () { render(false); });
    }

    render(false);
    control.appendChild(button);
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-password-toggle]'),
    setupPasswordToggle
  );

  /* ── Recherche dans la liste ───────────────────────────────────────── */

  /**
   * Normalise pour la comparaison : minuscules, accents retirés, et tout ce
   * qui n'est ni lettre ni chiffre réduit à une espace.
   *
   * Sans cela « Koffi » ne trouverait pas « KOFFI », « Ané » ne trouverait
   * pas « ane », et « 07 12 » ne trouverait pas « 0712345678 » — trois
   * échecs que l'organisateur lirait comme « l'invité n'est pas dans la
   * liste », ce qui est exactement l'erreur à éviter à l'entrée de la salle.
   */
  function normalise(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // marques diacritiques isolées par NFD
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Barre d'outils de la liste : recherche à la frappe, et cohérence des
   * liens autour.
   *
   * Le serveur sait tout faire seul (filtres, tri, recherche, export) et
   * reste l'autorité — voir services/guest-list.service.js. Ce qui est
   * ajouté ici est le confort : filtrer pendant la frappe sans recharger.
   *
   * D'où la partie la moins évidente du fichier : dès que le texte tapé
   * n'est plus celui que le serveur a reçu, tous les liens de la page
   * (tuiles de filtre, en-têtes de tri, export, réinitialisation) doivent
   * repartir avec ce texte-là. Sans cela, cliquer « Export CSV » après avoir
   * tapé trois lettres téléchargerait la liste entière, et personne ne s'en
   * apercevrait avant le plan de table.
   */
  function setupToolbar(form) {
    var input = form.querySelector('[data-search-input]');
    var count = form.querySelector('[data-search-count]');
    var submit = form.querySelector('[data-toolbar-submit]');
    var empty = document.querySelector('[data-search-empty]');
    var tableWrap = document.querySelector('.table-wrap');
    var rows = Array.prototype.slice.call(document.querySelectorAll('[data-search-text]'));

    if (!input) return;

    // Valeur déjà appliquée par le serveur : c'est le point de départ, et ce
    // qui permet de savoir si la saisie en cours diverge de la page affichée.
    var valeurServeur = input.value;

    // Chaque ligne porte son texte cherchable, assemblé côté serveur (nom,
    // téléphone sous ses deux formes, email, relation). On le normalise une
    // fois pour toutes : refaire le travail à chaque frappe ferait ramer la
    // saisie sur un téléphone bas de gamme.
    var haystacks = rows.map(function (row) {
      return normalise(row.getAttribute('data-search-text'));
    });

    // Total de la page telle que le serveur l'a rendue. Si un filtre est déjà
    // actif, c'est bien ce sous-ensemble que la recherche affine.
    var total = rows.length;

    function pluralise(n) {
      return n + ' ' + (n > 1 ? 'confirmations' : 'confirmation');
    }

    /** Réécrit `q` dans un href, en conservant tout le reste de l'URL. */
    function avecRecherche(href, valeur) {
      var url = new URL(href, window.location.origin);

      if (valeur) url.searchParams.set('q', valeur);
      else url.searchParams.delete('q');

      return url.pathname + (url.search ? url.search : '');
    }

    var liens = Array.prototype.slice.call(
      document.querySelectorAll('.stat--lien, .breakdown__side, .table__sort, [data-export]')
    ).map(function (a) {
      return { element: a, href: a.getAttribute('href') };
    });

    function synchroniserLiens(valeur) {
      liens.forEach(function (lien) {
        lien.element.setAttribute('href', avecRecherche(lien.href, valeur));
      });
    }

    function apply() {
      // Les mots comptent séparément : « koffi 07 » trouve la ligne qui
      // contient les deux, quel que soit leur ordre.
      var terms = normalise(input.value).split(' ').filter(Boolean);
      var visible = 0;

      rows.forEach(function (row, i) {
        var hay = haystacks[i];
        var match = terms.every(function (term) { return hay.indexOf(term) !== -1; });

        row.classList.toggle('is-filtered-out', !match);
        if (match) visible += 1;
      });

      if (count) {
        count.textContent = visible === total
          ? pluralise(total)
          : pluralise(visible) + ' sur ' + total;
      }

      if (empty) empty.hidden = visible !== 0 || total === 0;
      // Le cadre du tableau vide laisserait une bande blanche sous le message.
      if (tableWrap && total > 0) tableWrap.hidden = visible === 0;

      synchroniserLiens(input.value.trim());
    }

    input.addEventListener('input', apply);

    // Échap vide le champ : le réflexe attendu quand on veut revenir à la
    // liste complète sans viser la croix du champ `type="search"`.
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && input.value !== '') {
        event.preventDefault();
        input.value = '';
        apply();
      }
    });

    // Entrée ne recharge la page que si le serveur a autre chose à dire —
    // c'est-à-dire si un filtre serveur devait changer. Tant que la recherche
    // ne fait que masquer des lignes déjà là, recharger ne montrerait rien de
    // plus et ferait clignoter la page.
    form.addEventListener('submit', function (event) {
      if (input.value.trim() === valeurServeur.trim()) event.preventDefault();
    });

    // Changer le tri demande vraiment au serveur : c'est lui qui ordonne.
    Array.prototype.forEach.call(form.querySelectorAll('[data-auto-submit]'), function (select) {
      select.addEventListener('change', function () { form.submit(); });
    });

    // Le bouton « Filtrer » n'existe que pour les navigateurs sans JS ; ici il
    // ferait doublon avec une recherche déjà instantanée.
    if (submit) submit.hidden = true;

    // Le navigateur peut avoir restauré une valeur au retour arrière : on part
    // de l'état réel du champ, pas de l'état supposé vide.
    apply();
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-toolbar]'),
    setupToolbar
  );
})();
