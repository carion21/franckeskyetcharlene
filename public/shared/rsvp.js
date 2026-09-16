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

  /* ── Numéro de téléphone ───────────────────────────────────────────── */

  // Numéro ivoirien : 10 chiffres, groupés par deux à la lecture.
  var PHONE_GROUPS = 5;
  var PHONE_DIGITS = 10;

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

    function showError(name, show) {
      var node = form.querySelector('[data-error-for="' + name + '"]');
      if (node) node.hidden = !show;

      var input = form.elements[name];
      if (input && input.setAttribute) {
        input.setAttribute('aria-invalid', show ? 'true' : 'false');
      }
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

      // 10 chiffres, commençant par 0 — mêmes règles que le serveur, qui reste
      // l'autorité (PRD §6).
      var phoneInvalid = !/^0\d{9}$/.test(phoneDigits(raw.telephone));
      showError('telephone', phoneInvalid);
      if (phoneInvalid) ok = false;

      // Email facultatif : vérifié seulement s'il est renseigné.
      var email = (raw.email || '').trim();
      var emailInvalid = email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      showError('email', emailInvalid);
      if (emailInvalid) ok = false;

      return ok;
    }

    function finish(invitationUrl, customMessage) {
      if (!done) return;

      form.hidden = true;
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

      done.setAttribute('tabindex', '-1');
      done.focus();
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

      button.disabled = true;
      buttonLabel.textContent = 'Envoi…';
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
          button.disabled = false;
          buttonLabel.textContent = defaultLabel;
          status.textContent = error.message || 'Une erreur est survenue. Merci de réessayer.';
        });
    });
  }

  return { initCountdown: initCountdown, initForm: initForm };
})();
