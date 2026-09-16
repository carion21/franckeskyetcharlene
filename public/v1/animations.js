/* ═══════════════════════════════════════════════════════════════════════
   /v1 — « Pellicule » : chorégraphie GSAP + ScrollTrigger.
   Compte à rebours et formulaire RSVP : /shared/rsvp.js (logique commune).

   Deux garanties tenues par ce fichier :
   1. rien n'est masqué par le CSS — seul le JS masque, juste avant d'animer.
      Si GSAP ne se charge pas (CDN bloqué, SRI en échec), la page reste
      entièrement lisible ;
   2. `prefers-reduced-motion` coupe la chorégraphie sans rien masquer.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isSmallScreen = window.matchMedia('(max-width: 700px)').matches;
  var gsap = window.gsap;
  var hasGsap = typeof gsap !== 'undefined';
  var animate = hasGsap && !prefersReducedMotion;

  if (hasGsap && window.ScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
  }

  /* ── Ouverture ─────────────────────────────────────────────────────── */
  function playOverlay() {
    var overlay = document.querySelector('[data-overlay]');
    if (!overlay) return;

    if (!animate) {
      overlay.hidden = true;
      return;
    }

    var strokes = overlay.querySelectorAll('[data-draw]');
    strokes.forEach(function (node) {
      var length = node.getTotalLength ? node.getTotalLength() : 100;
      gsap.set(node, { strokeDasharray: length, strokeDashoffset: length });
    });

    gsap.timeline({ delay: 0.2 })
      .to(strokes, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut', stagger: 0.07 })
      .to(overlay, {
        autoAlpha: 0,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: function () { overlay.hidden = true; }
      }, '+=0.15');
  }

  /* ── Hero : nom lettre par lettre + Ken Burns ──────────────────────── */
  function splitName() {
    var target = document.querySelector('[data-split]');
    if (!target) return [];

    var text = target.textContent.trim();
    target.textContent = '';

    return text.split('').map(function (character) {
      var span = document.createElement('span');
      span.className = 'char';
      span.textContent = character; // textContent, jamais innerHTML
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
        delay: 2.5
      });
    }

    gsap.from('.hero__rule', { scaleX: 0, duration: 0.9, ease: 'power2.out', delay: 3.1 });
    gsap.from('.hero__place', { opacity: 0, y: 12, duration: 0.8, ease: 'power2.out', delay: 3.25 });
    gsap.from('.countdown', { opacity: 0, y: 20, duration: 0.9, ease: 'power2.out', delay: 3.4 });

    // Ken Burns : lent, en boucle alternée. Amplitude volontairement plus
    // faible ici que sur les autres versions : le fond n'est pas une photo
    // mais une plaque gravée, aux bords droits et au décor symétrique — à
    // 1.09 on voyait le cadre doré glisser sous les prénoms.
    gsap.fromTo('[data-kenburns]',
      { scale: 1.04 },
      { scale: 1, duration: 22, ease: 'none', repeat: -1, yoyo: true }
    );

    // Parallaxe douce de la photo pendant le scroll du hero.
    if (window.ScrollTrigger) {
      gsap.to('[data-kenburns]', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    // Particules : une seule sur petit écran (PRD §4.1), le CSS masque les autres.
    var particles = document.querySelectorAll('.particle');
    particles.forEach(function (particle, index) {
      if (isSmallScreen && index > 0) return;
      gsap.to(particle, {
        x: index % 2 ? 26 : -22,
        y: index % 2 ? -24 : 34,
        rotation: index % 2 ? -12 : 16,
        duration: 14 + index * 3,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true
      });
    });
  }

  /* ── Révélations au scroll ─────────────────────────────────────────── */
  function playReveals() {
    if (!animate || !window.ScrollTrigger) return;

    gsap.utils.toArray('[data-reveal]').forEach(function (node) {
      gsap.from(node, {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: 'power2.out',
        scrollTrigger: { trigger: node, start: 'top 88%', once: true }
      });
    });

    // Cadres Art Déco : le tracé suit le scroll (scrub).
    gsap.utils.toArray('[data-draw-rect]').forEach(function (rect) {
      var length = rect.getTotalLength ? rect.getTotalLength() : 400;
      gsap.fromTo(rect,
        { strokeDasharray: length, strokeDashoffset: length },
        {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: rect.closest('section'),
            start: 'top 80%',
            end: 'center center',
            scrub: 0.6
          }
        }
      );
    });

    // Fil doré du programme, tracé au scroll.
    var thread = document.querySelector('[data-thread]');
    var scope = document.querySelector('[data-thread-scope]');
    if (thread && scope) {
      gsap.to(thread, {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: { trigger: scope, start: 'top 70%', end: 'bottom 75%', scrub: 0.5 }
      });
    }

    // Scintillement du climax — pic émotionnel de la page.
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

    // Formulaire révélé champ par champ.
    var fields = gsap.utils.toArray('[data-field], [data-submit]');
    if (fields.length) {
      gsap.from(fields, {
        opacity: 0,
        y: 18,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.09,
        scrollTrigger: { trigger: '.rsvp', start: 'top 75%', once: true }
      });
    }
  }

  /* ── Démarrage ─────────────────────────────────────────────────────── */
  function init() {
    playOverlay();
    playHero();
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
