/* ═══════════════════════════════════════════════════════════════════════
   Logique commune aux trois landings : compte à rebours et formulaire RSVP.

   Pourquoi ici et pas dans chaque `vN/animations.js` (cf. FC-007) :
   la chorégraphie de scroll diffère réellement d'une version à l'autre et
   reste donc propre à chacune, mais ce comportement-ci est identique aux
   trois. Le chemin RSVP est le cœur métier (PRD §4.2) — le tripler
   obligerait à corriger trois fois le même bug en Phase 4.

   Pas de bundler : le module s'expose sur `window.WeddingRSVP`.
   ═══════════════════════════════════════════════════════════════════════ */

window.WeddingRSVP = (function () {
  'use strict';

  var RSVP_ENDPOINT = '/api/rsvp';

  /**
   * Durée minimale d'affichage de l'état « Envoi… ».
   *
   * La création du RSVP répond en ~300 ms : la génération de la carte est
   * volontairement lancée sans être attendue (voir routes/rsvp.js). Sans ce
   * plancher, le spinner n'existerait qu'un éclair et l'invité verrait le
   * bouton passer d'un coup au résultat — il doute alors que quoi que ce soit
   * ait été envoyé. 700 ms suffisent à voir le tour complet du spinner sans
   * donner l'impression d'attendre.
   */
  var MIN_LOADING_MS = 700;

  /** Laisse s'écouler ce qu'il reste du plancher d'attente depuis `startedAt`. */
  function holdLoading(startedAt) {
    var remaining = MIN_LOADING_MS - (Date.now() - startedAt);
    if (remaining <= 0) return Promise.resolve();
    return new Promise(function (resolve) { window.setTimeout(resolve, remaining); });
  }

  /* ── Numéro de téléphone ───────────────────────────────────────────── */

  // Numéro mobile ivoirien : 10 chiffres sur les préfixes 01, 05 et 07,
  // groupés par deux à la lecture. Mêmes règles que le serveur, qui reste
  // l'autorité (PRD §6) — ici c'est uniquement pour le retour immédiat.
  var PHONE_DIGITS = 10;
  var PHONE_PREFIXES = ['01', '05', '07'];

  function phoneError(digits) {
    if (!digits) return 'Champ requis';
    // Dès que les deux premiers chiffres sont posés, on sait si le préfixe est
    // valide : inutile d'attendre les dix pour le signaler.
    if (digits.length >= 2 && PHONE_PREFIXES.indexOf(digits.slice(0, 2)) === -1) {
      return 'Le numéro doit commencer par 01, 05 ou 07';
    }
    if (digits.length !== PHONE_DIGITS) return 'Le numéro doit contenir 10 chiffres';
    return null;
  }

  function phoneDigits(value) {
    return String(value || '').replace(/[^0-9]/g, '').slice(0, PHONE_DIGITS);
  }

  /** "0712345678" → "07 12 34 56 78" */
  function formatPhone(value) {
    return (phoneDigits(value).match(/.{1,2}/g) || []).join(' ');
  }

  /**
   * Met en forme le numéro pendant la frappe.
   *
   * Le curseur est repositionné à la main : réécrire `value` le renvoie sinon
   * en fin de champ, ce qui rend toute correction au milieu du numéro
   * impossible. On compte les chiffres à gauche du curseur et on le replace
   * après le même chiffre une fois les espaces réinsérés.
   */
  function attachPhoneMask(input) {
    if (!input) return;

    function apply() {
      var before = input.value;
      var caret = input.selectionStart;
      var digitsBeforeCaret = phoneDigits(before.slice(0, caret)).length;

      var formatted = formatPhone(before);
      if (formatted === before) return;

      input.value = formatted;

      var pos = 0;
      var seen = 0;
      while (pos < formatted.length && seen < digitsBeforeCaret) {
        if (/[0-9]/.test(formatted[pos])) seen++;
        pos++;
      }
      // Se placer après l'espace plutôt qu'avant, pour que la frappe continue
      // naturellement au début d'un nouveau groupe.
      if (formatted[pos] === ' ') pos++;

      try { input.setSelectionRange(pos, pos); } catch (err) { /* champ non sélectionnable */ }
    }

    input.addEventListener('input', apply);
    // Un collage arrive parfois avant l'événement input sur certains mobiles.
    input.addEventListener('paste', function () { window.setTimeout(apply, 0); });
  }

  /* ── Filet de sécurité des révélations ─────────────────────────────── */

  /**
   * Rien ne doit rester invisible une fois passé sous les yeux de l'invité.
   *
   * La chorégraphie révèle chaque bloc avec `gsap.from(..., opacity: 0)` : GSAP
   * pose donc `opacity: 0` en ligne tout de suite et ne le relâche qu'au
   * déclenchement du ScrollTrigger. Ces déclencheurs sont posés `once: true` —
   * s'ils sont tués ou recalculés au mauvais moment (redimensionnement pendant
   * une animation, scroll très rapide de haut en bas puis retour), le bloc
   * n'est jamais révélé et reste à `opacity: 0` DÉFINITIVEMENT.
   *
   * Reproduit : 10 allers-retours haut/bas rapides puis 390 → 1280 → 390 laisse
   * le lien WhatsApp et le pied de page invisibles sur /v1 et /v2. Le lien
   * WhatsApp est le seul recours de l'invité qui n'arrive pas à remplir le
   * formulaire : le perdre, c'est un appel au couple.
   *
   * Ce balayage ne devine rien : il ne touche qu'un élément déjà entré dans le
   * viewport depuis plus que la durée d'une révélation, et jamais un élément
   * masqué volontairement par `hidden`. Il retire les styles en ligne posés par
   * GSAP, ce qui rend l'élément à son état CSS — visible.
   */
  // Les ENFANTS animés comptent autant que leurs conteneurs : sur /v2 le lever
  // d'acte anime `.act__name` et `[data-act-rule]` à l'intérieur d'un
  // `[data-act-head]` qui, lui, reste visible. Surveiller le seul parent
  // laissait « CLÔTURE » invisible indéfiniment.
  var REVEALABLE = '[data-reveal],[data-field],[data-submit],[data-act-head],' +
                   '.act__name,[data-act-rule],[data-numeral],' +
                   '[data-dot],[data-split],.hero__rule,' +
                   '.hero__place,.countdown,.done__link';
  // Les révélations durent 0,5 à 0,9 s : au-delà de 1,1 s dans le viewport, un
  // élément encore invisible n'est plus « en train d'apparaître », il est perdu.
  var GRACE_MS = 1100;

  function initRevealGuard() {
    var seenAt = new WeakMap();

    function sweep() {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var now = Date.now();

      Array.prototype.forEach.call(document.querySelectorAll(REVEALABLE), function (node) {
        if (node.hasAttribute('hidden')) return;          // masqué à dessein
        if (node.closest('[hidden]')) return;

        var box = node.getBoundingClientRect();
        var entered = box.top < vh && box.bottom > 0;
        if (!entered) { seenAt.delete(node); return; }

        var first = seenAt.get(node);
        if (!first) { seenAt.set(node, now); return; }
        if (now - first < GRACE_MS) return;

        var computed = window.getComputedStyle(node);
        if (parseFloat(computed.opacity) > 0.01 && computed.visibility !== 'hidden') return;

        // Rendre l'élément à son état CSS : c'est le JS qui l'avait masqué.
        node.style.opacity = '';
        node.style.visibility = '';
        node.style.transform = '';
        node.style.translate = '';
        node.style.scale = '';
        node.style.rotate = '';
      });
    }

    var pending = null;
    function schedule() {
      if (pending) return;
      pending = window.setTimeout(function () { pending = null; sweep(); }, 250);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('load', schedule);
    // Un balayage de fin de parcours : l'invité qui s'arrête en bas de page a
    // droit à une page entière, même s'il n'a plus rien à faire défiler. Une
    // seconde de période borne la correction à ~2 s après l'arrivée du bloc.
    window.setInterval(sweep, 1000);
    schedule();
  }

  /* ── Compte à rebours ──────────────────────────────────────────────── */
  function initCountdown() {
    var root = document.querySelector('[data-countdown]');
    if (!root) return;

    var target = new Date(root.getAttribute('data-countdown')).getTime();
    if (isNaN(target)) return;

    var passedNote = document.querySelector('[data-countdown-passed]');
    var slots = {
      days: root.querySelector('[data-cd="days"]'),
      hours: root.querySelector('[data-cd="hours"]'),
      minutes: root.querySelector('[data-cd="minutes"]'),
      seconds: root.querySelector('[data-cd="seconds"]')
    };

    if (!slots.days) return;

    function pad(value) { return String(value).padStart(2, '0'); }

    var timer = window.setInterval(tick, 1000);
    tick();

    function tick() {
      var remaining = target - Date.now();

      if (remaining <= 0) {
        root.hidden = true;
        if (passedNote) passedNote.hidden = false;
        window.clearInterval(timer);
        return;
      }

      var seconds = Math.floor(remaining / 1000);
      slots.days.textContent = pad(Math.floor(seconds / 86400));
      slots.hours.textContent = pad(Math.floor(seconds / 3600) % 24);
      slots.minutes.textContent = pad(Math.floor(seconds / 60) % 60);
      slots.seconds.textContent = pad(seconds % 60);
    }
  }

  /* ── Formulaire RSVP ───────────────────────────────────────────────── */
  function initForm(options) {
    var settings = options || {};
    var onDone = typeof settings.onDone === 'function' ? settings.onDone : null;

    var form = document.querySelector('[data-rsvp-form]');
    if (!form) return;

    var status = form.querySelector('[data-form-status]');
    var button = form.querySelector('[data-submit]');
    var buttonLabel = form.querySelector('[data-submit-label]');
    var done = document.querySelector('[data-rsvp-done]');
    var defaultLabel = buttonLabel ? buttonLabel.textContent : 'Confirmer ma présence';

    attachPhoneMask(form.elements.telephone);
    watchPhone();

    function showError(name, show, message) {
      var node = form.querySelector('[data-error-for="' + name + '"]');
      if (node) {
        if (message) node.textContent = message;
        node.hidden = !show;
      }

      var input = form.elements[name];
      if (input && input.setAttribute) {
        input.setAttribute('aria-invalid', show ? 'true' : 'false');
      }
    }

    /**
     * Contrôle du numéro pendant la frappe.
     *
     * Le préfixe est signalé dès le deuxième chiffre — attendre la soumission
     * pour dire « mauvais préfixe » oblige à ressaisir dix chiffres. En
     * revanche la longueur n'est reprochée qu'une fois le champ quitté : la
     * signaler pendant la frappe afficherait une erreur à chaque caractère.
     */
    function watchPhone() {
      var input = form.elements.telephone;
      if (!input) return;

      input.addEventListener('input', function () {
        var digits = phoneDigits(input.value);
        var prefixWrong = digits.length >= 2 &&
          PHONE_PREFIXES.indexOf(digits.slice(0, 2)) === -1;

        if (prefixWrong) showError('telephone', true, 'Le numéro doit commencer par 01, 05 ou 07');
        else showError('telephone', false);
      });

      input.addEventListener('blur', function () {
        var digits = phoneDigits(input.value);
        if (!digits) return; // champ vide : on ne reproche rien tant qu'il n'a pas soumis
        var message = phoneError(digits);
        showError('telephone', Boolean(message), message || undefined);
      });
    }

    // Validation de confort : évite un aller-retour réseau. La validation qui
    // fait foi reste celle du serveur (PRD §6).
    function validate(raw) {
      var ok = true;

      ['prenom', 'nom', 'accompagne', 'relation'].forEach(function (name) {
        var invalid = !raw[name];
        showError(name, invalid);
        if (invalid) ok = false;
      });

      var phoneMessage = phoneError(phoneDigits(raw.telephone));
      showError('telephone', Boolean(phoneMessage), phoneMessage || undefined);
      if (phoneMessage) ok = false;

      // Email facultatif : vérifié seulement s'il est renseigné.
      var email = (raw.email || '').trim();
      var emailInvalid = email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      showError('email', emailInvalid);
      if (emailInvalid) ok = false;

      return ok;
    }

    /* ── États du bouton ─────────────────────────────────────────────────
       Le style vit dans shared/form-state.css ; ici on ne pose que les
       classes et le libellé. */

    function setLoading(loading) {
      button.disabled = loading;
      button.classList.toggle('is-loading', loading);
      // Les lecteurs d'écran annoncent le changement d'état du bouton.
      button.setAttribute('aria-busy', loading ? 'true' : 'false');
      buttonLabel.textContent = loading ? 'Envoi…' : defaultLabel;
    }

    /**
     * Verrouille le formulaire une fois la présence confirmée.
     *
     * Le formulaire reste visible — l'invité peut relire ce qu'il a envoyé —
     * mais devient inerte. Le masquer ferait remonter d'un coup tout ce qui
     * suit, juste au moment où le message de confirmation apparaît.
     */
    function lockForm() {
      button.classList.remove('is-loading');
      button.classList.add('is-confirmed');
      button.setAttribute('aria-busy', 'false');
      buttonLabel.textContent = 'Présence confirmée';
      form.classList.add('is-locked');

      // `disabled` est le vrai verrou : le grisé CSS n'empêcherait ni la
      // frappe au clavier ni une seconde soumission.
      Array.prototype.forEach.call(form.elements, function (element) {
        element.disabled = true;
      });
    }

    function finish(invitationUrl, customMessage) {
      lockForm();

      if (!done) return;

      done.hidden = false;

      if (customMessage) {
        var text = done.querySelector('.done__text');
        if (text) text.textContent = customMessage;
      }

      var link = done.querySelector('[data-card-link]');
      if (link) {
        if (invitationUrl) link.href = invitationUrl;
        else link.hidden = true;
      }

      if (onDone) onDone(done);

      // `preventScroll` : le focus seul ferait un saut brutal. On amène le
      // bloc à l'écran juste après, en défilement doux — sauf si l'invité a
      // demandé moins de mouvement.
      done.setAttribute('tabindex', '-1');
      try { done.focus({ preventScroll: true }); } catch (err) { done.focus(); }

      var reduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      done.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'center'
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var data = new FormData(form);
      var raw = {
        prenom: (data.get('prenom') || '').trim(),
        nom: (data.get('nom') || '').trim(),
        accompagne: data.get('accompagne'),
        relation: data.get('relation'),
        email: (data.get('email') || '').trim(),
        telephone: (data.get('telephone') || '').trim()
      };

      if (!validate(raw)) {
        status.textContent = 'Merci de compléter les champs indiqués.';
        return;
      }

      var startedAt = Date.now();
      setLoading(true);
      status.textContent = '';

      window.fetch(RSVP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: raw.prenom,
          nom: raw.nom,
          accompagne: raw.accompagne === 'oui',
          relation: raw.relation,
          // Envoyé en chiffres seuls : le serveur normalise de son côté, mais
          // autant ne pas lui transmettre la mise en forme d'affichage.
          telephone: phoneDigits(raw.telephone),
          email: (raw.email || '').trim() || null
        })
      })
        .then(function (response) {
          return response.json()
            .catch(function () { return {}; })
            .then(function (payload) {
              return { ok: response.ok, status: response.status, payload: payload };
            });
        })
        // Plancher d'attente appliqué avant toute bascule d'état, succès
        // comme erreur : c'est ce qui rend le chargement perceptible.
        .then(function (result) {
          return holdLoading(startedAt).then(function () { return result; });
        })
        .then(function (result) {
          if (!result.ok) {
            // Erreurs de validation renvoyées champ par champ (PRD §9.1) :
            // on les affiche sans vider ce que l'invité a déjà saisi.
            if (result.status === 400 && result.payload.errors) {
              Object.keys(result.payload.errors).forEach(function (field) {
                showError(field, true);
              });
              throw new Error(result.payload.message || 'Merci de compléter les champs indiqués.');
            }
            throw new Error(result.payload.message || 'Envoi impossible pour le moment.');
          }

          // Email déjà confirmé : ce n'est pas une erreur, l'invité retrouve
          // simplement la carte qu'il possède déjà (PRD §3.1).
          finish(
            result.payload.invitationUrl,
            result.payload.alreadyConfirmed
              ? 'Vous aviez déjà confirmé votre présence — voici votre carte.'
              : null
          );
        })
        .catch(function (error) {
          // `holdLoading` est rejoué ici pour le cas où `fetch` lui-même a
          // échoué avant le premier passage — le plancher est déjà écoulé
          // autrement, et l'appel se résout alors immédiatement.
          return holdLoading(startedAt).then(function () {
            setLoading(false);
            status.textContent = error.message ||
              'Une erreur est survenue. Merci de réessayer.';
          });
        });
    });
  }

  // Le filet s'arme seul : il protège la page même si une version oublie de
  // l'appeler, et il ne dépend pas de GSAP.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRevealGuard);
  } else {
    initRevealGuard();
  }

  return {
    initCountdown: initCountdown,
    initForm: initForm,
    initRevealGuard: initRevealGuard
  };
})();
