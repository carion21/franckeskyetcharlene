/* ═══════════════════════════════════════════════════════════════════════
   /v2 — « Quatre Actes » : chorégraphie GSAP + ScrollTrigger.
   Compte à rebours et formulaire RSVP : /shared/rsvp.js (logique commune).

   Différence de parti pris avec /v1 : ici chaque acte est *annoncé*. Le
   chiffre romain monte et s'éclaircit, le filet doré se tire depuis le
   centre, puis seulement le contenu de l'acte arrive. La lecture est
   ponctuée plutôt que continue.

   Mêmes garanties que /v1 : rien n'est masqué par le CSS (une panne de CDN
   laisse la page lisible), et `prefers-reduced-motion` coupe tout sans rien
   masquer.
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

  /* ── Acte I ────────────────────────────────────────────────────────── */
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
        delay: 2.5
      });
    }

    gsap.from('.hero__rule', { scaleX: 0, duration: 0.9, ease: 'power2.out', delay: 3.1 });
    gsap.from('.hero__place', { opacity: 0, y: 12, duration: 0.8, ease: 'power2.out', delay: 3.25 });
    gsap.from('.countdown', { opacity: 0, y: 20, duration: 0.9, ease: 'power2.out', delay: 3.4 });

    gsap.fromTo('[data-kenburns]',
      { scale: 1.09 },
      { scale: 1, duration: 22, ease: 'none', repeat: -1, yoyo: true }
    );

    if (window.ScrollTrigger) {
      gsap.to('[data-kenburns]', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.act--hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    document.querySelectorAll('.particle').forEach(function (particle, index) {
      if (isSmallScreen && index > 0) return;
      gsap.to(particle, {
        x: index % 2 ? 26 : -22,
        y: index % 2 ? -24 : 34,
        rotation: index % 2 ? -12 : 16,
        duration: 15 + index * 3,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true
      });
    });
  }

  /* ── Lever d'acte ──────────────────────────────────────────────────── */
  function playActHeads() {
    if (!animate || !window.ScrollTrigger) return;

    gsap.utils.toArray('[data-act-head]').forEach(function (head) {
      // Le hero est déjà annoncé par la timeline d'ouverture.
      if (head.classList.contains('act__head--hero')) return;

      var numeral = head.querySelector('[data-numeral]');
      var name = head.querySelector('.act__name');
      var rule = head.querySelector('[data-act-rule]');

      var timeline = gsap.timeline({
        scrollTrigger: { trigger: head, start: 'top 82%', once: true }
      });

      if (numeral) {
        timeline.fromTo(numeral,
          { opacity: 0, y: 26, scale: 0.94 },
          { opacity: 0.16, y: 0, scale: 1, duration: 1, ease: 'power2.out' }
        );
      }

      if (name) {
        timeline.from(name, { opacity: 0, y: 12, duration: 0.6, ease: 'power2.out' }, '-=0.55');
      }

      if (rule) {
        timeline.from(rule, { scaleX: 0, duration: 0.8, ease: 'power2.out' }, '-=0.4');
      }
    });
  }

  /* ── Contenu des actes ─────────────────────────────────────────────── */
  function playReveals() {
    if (!animate || !window.ScrollTrigger) return;

    gsap.utils.toArray('[data-reveal]').forEach(function (node) {
      gsap.from(node, {
        opacity: 0,
        y: 24,
        duration: 0.9,
        ease: 'power2.out',
        scrollTrigger: { trigger: node, start: 'top 88%', once: true }
      });
    });

    gsap.utils.toArray('[data-draw-rect]').forEach(function (rect) {
      var length = rect.getTotalLength ? rect.getTotalLength() : 400;
      gsap.fromTo(rect,
        { strokeDasharray: length, strokeDashoffset: length },
        {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: rect.closest('section'),
            start: 'top 78%',
            end: 'center center',
            scrub: 0.6
          }
        }
      );
    });

    var thread = document.querySelector('[data-thread]');
    var scope = document.querySelector('[data-thread-scope]');
    if (thread && scope) {
      gsap.to(thread, {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: { trigger: scope, start: 'top 60%', end: 'bottom 80%', scrub: 0.5 }
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
        scrollTrigger: { trigger: '.act--climax', start: 'top 70%', once: true }
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
        scrollTrigger: { trigger: '.form', start: 'top 82%', once: true }
      });
    }
  }

  /* ── Démarrage ─────────────────────────────────────────────────────── */
  function init() {
    playOverlay();
    playHero();
    playActHeads();
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
