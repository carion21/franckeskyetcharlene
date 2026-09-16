/* ═══════════════════════════════════════════════════════════════════════
   /invitation/:id — déclenchement automatique du .ics à la première visite.

   L'auto-déclenchement est un bonus, jamais le seul chemin : iOS comme
   Android bloquent régulièrement un téléchargement qui ne suit pas un geste
   utilisateur. Le bouton « Ajouter à mon agenda » reste donc toujours
   visible et fonctionnel (PRD §3.1, §9).

   Le téléchargement passe par une iframe cachée plutôt que par
   `window.location` : la page reste affichée, l'invité ne « perd » pas sa
   carte au profit d'un écran de téléchargement.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var icsUrl = script.getAttribute('data-ics-url');
  var autoIcs = script.getAttribute('data-auto-ics') === 'true';

  if (!icsUrl) return;

  function triggerDownload() {
    try {
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.display = 'none';
      frame.src = icsUrl;
      document.body.appendChild(frame);

      // L'iframe n'a plus d'utilité une fois la requête partie.
      window.setTimeout(function () {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }, 20000);
    } catch (err) {
      // Bloqué par le navigateur : le bouton prend le relais, rien à signaler.
    }
  }

  if (autoIcs) {
    // Court délai : on laisse la page s'afficher d'abord, pour que l'invité
    // voie sa carte avant qu'une invite système ne s'ouvre par-dessus.
    window.setTimeout(triggerDownload, 1200);
  }

  // Si l'aperçu ne se charge pas (génération encore en cours, stockage
  // indisponible), on bascule sur le QR plutôt que de laisser un cadre vide
  // ou une icône d'image cassée.
  var preview = document.getElementById('card-preview');
  var fallback = document.getElementById('card-preview-fallback');

  if (preview && fallback) {
    preview.addEventListener('error', function () {
      preview.hidden = true;
      fallback.hidden = false;
    });
  }

  // Sur iOS, un lien vers un fichier téléchargeable peut laisser la page dans
  // un état « figé » visuellement. Un focus explicite au retour remet la page
  // d'aplomb sans rien changer au comportement standard du clic.
  var button = document.getElementById('ics-button');
  if (button) {
    button.addEventListener('click', function () {
      window.setTimeout(function () { window.focus(); }, 300);
    });
  }
})();
