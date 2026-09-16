/* ═══════════════════════════════════════════════════════════════════════
   /v3 — « Fil Doré » : chorégraphie GSAP + ScrollTrigger.
   Compte à rebours et formulaire RSVP : /shared/rsvp.js (logique commune).

   Parti pris : le fil est le héros. Il se remplit exactement au rythme du
   scroll (scrub), et chaque perle s'allume quand le fil l'atteint — les
   cartes arrivent depuis leur côté du fil. Là où /v1 enchaîne et /v2
   découpe en actes, /v3 déroule une ligne unique.

   Mêmes garanties que /v1 et /v2 : rien n'est masqué par le CSS, et
   `prefers-reduced-motion` coupe la chorégraphie sans rien masquer.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gsap = window.gsap;
  var hasGsap = typeof gsap !== 'undefined';
  var animate = hasGsap && !prefersReducedMotion;

  if (hasGsap && window.ScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
  }

  /* ── Ouverture : le monogramme, puis le fil qui tombe ──────────────── */
  function playOverlay() {
    var overlay = document.querySelector('[data-overlay]');
    if (!overlay) return;

    if (!animate) {
      overlay.hidden = true;
      return;
    }

    var initials = overlay.querySelector('.overlay__initials');
    var strokes = overlay.querySelectorAll('[data-draw]');

    strokes.forEach(function (node) {
      var length = node.getTotalLength ? node.getTotalLength() : 44;
      gsap.set(node, { strokeDasharray: length, strokeDashoffset: length });
    });

    gsap.timeline({ delay: 0.2 })
      .from(initials, { opacity: 0, y: 14, duration: 0.9, ease: 'power2.out' })
      .to(strokes, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' }, '-=0.2')
      .to(overlay, {
        autoAlpha: 0,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: function () { overlay.hidden = true; }
      }, '+=0.25');
  }

  /* ── Hero ──────────────────────────────────────────────────────────── */
  function splitName() {
    var target = document.querySelector('[data-split]');
    if (!target) return [];

    var text = target.textContent.trim();
    target.textContent = '';

    return text.split('').map(function (character) {
      var span = document.createElement('span');
      span.className = 'char';
      span.textContent = character;
      target.appendChild(span);
      return span;
    });
  }

  function playHero() {
    var chars = splitName();
    if (!animate) return;

    if (chars.length) {
      gsap.from(chars, {
        opacity: 0,
        y: 16,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.035,
        delay: 2.4
      });
    }

    gsap.from('.hero__rule', { scaleX: 0, duration: 0.9, ease: 'power2.out', delay: 3 });
    gsap.from('.hero__place', { opacity: 0, y: 12, duration: 0.8, ease: 'power2.out', delay: 3.15 });
    gsap.from('.countdown', { opacity: 0, y: 20, duration: 0.9, ease: 'power2.out', delay: 3.3 });
    gsap.from('.hero__thread-start', { scaleY: 0, transformOrigin: 'top center', duration: 0.7, ease: 'power2.out', delay: 3.6 });

    gsap.fromTo('[data-kenburns]',
      { scale: 1.09 },
      { scale: 1, duration: 22, ease: 'none', repeat: -1, yoyo: true }
    );

    if (window.ScrollTrigger) {
      gsap.to('[data-kenburns]', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }
  }

  /* ── Le fil et ses perles ──────────────────────────────────────────── */
  function playSpine() {
    if (!animate || !window.ScrollTrigger) return;

    var fill = document.querySelector('[data-thread]');
    var scope = document.querySelector('[data-thread-scope]');

    if (fill && scope) {
      // scaleY seul : translateX(-50%) du CSS doit survivre, donc on anime
      // la propriété scaleY de GSAP et non un `transform` complet.
      gsap.to(fill, {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: { trigger: scope, start: 'top 65%', end: 'bottom 70%', scrub: 0.4 }
      });
    }

    // Chaque perle s'allume quand le fil l'atteint.
    gsap.utils.toArray('[data-dot]').forEach(function (dot) {
      gsap.from(dot, {
        scale: 0,
        opacity: 0,
        duration: 0.5,
        ease: 'back.out(2)',
        scrollTrigger: { trigger: dot.closest('.bead'), start: 'top 72%', once: true }
      });
    });

    // Les cartes arrivent depuis leur côté du fil.
    gsap.utils.toArray('.bead').forEach(function (bead) {
      var card = bead.querySelector('[data-reveal]');
      if (!card) return;

      var fromLeft = bead.classList.contains('bead--left');

      gsap.from(card, {
        opacity: 0,
        x: fromLeft ? -28 : 28,
        y: 12,
        duration: 0.9,
        ease: 'power2.out',
        scrollTrigger: { trigger: bead, start: 'top 80%', once: true }
      });
    });
  }

  /* ── Climax et formulaire ──────────────────────────────────────────── */
  function playReveals() {
    if (!animate || !window.ScrollTrigger) return;

    // Les [data-reveal] hors du fil (climax, contact, footer).
    gsap.utils.toArray('[data-reveal]').forEach(function (node) {
      if (node.closest('.bead')) return; // déjà traité par playSpine

      gsap.from(node, {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: 'power2.out',
        scrollTrigger: { trigger: node, start: 'top 88%', once: true }
      });
    });

    var ring = document.querySelector('[data-ring]');
    if (ring) {
      gsap.from(ring, {
        scale: 0.6,
        opacity: 0,
        duration: 1,
        ease: 'back.out(1.6)',
        scrollTrigger: { trigger: '.climax', start: 'top 72%', once: true }
      });
    }

    var spark = document.querySelector('[data-spark]');
    if (spark) {
      gsap.to(spark, {
        opacity: 1,
        scale: 1.35,
        duration: 1.4,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        scrollTrigger: { trigger: '.climax', start: 'top 70%', once: true }
      });
    }

    var fields = gsap.utils.toArray('[data-field], [data-submit]');
    if (fields.length) {
      gsap.from(fields, {
        opacity: 0,
        y: 18,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.09,
        scrollTrigger: { trigger: '.rsvp', start: 'top 78%', once: true }
      });
    }
  }

  /* ── Démarrage ─────────────────────────────────────────────────────── */
  function init() {
    playOverlay();
    playHero();
    playSpine();
    playReveals();
    WeddingRSVP.initCountdown();
    WeddingRSVP.initForm({
      onDone: function (done) {
        if (animate) gsap.from(done, { opacity: 0, y: 20, duration: 0.7, ease: 'power2.out' });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
