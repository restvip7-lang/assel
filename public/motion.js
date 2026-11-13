// Motion layer: Lenis smooth scroll + GSAP ScrollTrigger reveals.
// Pure enhancement: without it (old phone, CDN down, reduced motion) the page works and shows everything.
(() => {
  const root = document.documentElement;
  const done = () => root.classList.remove('m');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !window.gsap || !window.ScrollTrigger) return done();
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out', duration: 0.9 });

  // Smooth wheel scrolling on desktop; touch scrolling stays native.
  if (window.Lenis) {
    const lenis = new window.Lenis({ autoRaf: false, lerp: 0.11 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;
  }

  const $ = (s, el = document) => [...el.querySelectorAll(s)];

  // Split a heading into words that rise from a mask (keeps <em> styling).
  function splitWords(el) {
    if (!el || el.dataset.split) return [];
    el.dataset.split = 1;
    const walk = node => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) return frag.append(part);
            const o = document.createElement('span'); o.className = 'wo';
            const i = document.createElement('span'); i.className = 'wi'; i.textContent = part;
            o.append(i); frag.append(o);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(el);
    return $('.wi', el);
  }

  const reveal = (targets, vars = {}) => {
    if (!targets.length) return;
    gsap.set(targets, { autoAlpha: 0, y: vars.y ?? 50 });
    ScrollTrigger.batch(targets, {
      start: 'top 90%', once: true,
      onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.08, overwrite: true, ...vars.to }),
    });
  };

  function heroIn() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const tl = gsap.timeline();
    tl.from(hero.querySelector(':scope > img'), { scale: 1.18, duration: 2.2, ease: 'power2.out' }, 0)
      .from(hero.querySelector('.eyebrow'), { autoAlpha: 0, y: 16, duration: 0.6 }, 0.1)
      .from(splitWords(hero.querySelector('h1')), { yPercent: 115, duration: 1, stagger: 0.045, ease: 'power4.out' }, 0.2)
      .from($('.sub, .agent, .ticks', hero), { autoAlpha: 0, y: 24, stagger: 0.1 }, 0.6)
      .from(hero.querySelector('.pick'), { autoAlpha: 0, y: 60, rotate: 2.5, duration: 1.1, ease: 'expo.out' }, 0.45)
      .from($('.pick .seg button', hero), { autoAlpha: 0, scale: 0.85, stagger: 0.02, duration: 0.4, ease: 'back.out(2)' }, 0.8);
    gsap.to(hero.querySelector(':scope > img'), { yPercent: 12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  function objectIn() {
    const gal = $('.gal button');
    if (!gal.length) return;
    gsap.from(gal, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, stagger: 0.12, ease: 'expo.inOut' });
    gsap.from($('.ob h1, .ob .loc, .ob .badges'), { autoAlpha: 0, y: 30, stagger: 0.08, delay: 0.3 });
    gsap.from($('.kv div'), { autoAlpha: 0, y: 20, stagger: 0.06, delay: 0.5 });
    gsap.from('.side', { autoAlpha: 0, x: 40, duration: 1, delay: 0.4 });
    // Price counts up once.
    const pr = document.querySelector('.side .pr');
    const target = pr && Number(pr.textContent.replace(/\D/g, ''));
    if (target) {
      const c = { v: target * 0.6 };
      gsap.to(c, { v: target, duration: 1.4, delay: 0.5, ease: 'power2.out',
        onUpdate: () => { pr.textContent = '€' + (Math.round(c.v / 100) * 100).toLocaleString('en-US').replace(/,/g, ' '); },
        onComplete: () => { pr.textContent = '€' + target.toLocaleString('en-US').replace(/,/g, ' '); } });
    }
    reveal($('.ob h2, .near, .map, .vid'), { y: 40 });
  }

  function page() {
    heroIn();
    objectIn();
    reveal($('.strip .w > div'), { y: 20 });
    reveal($('.sec h2, .sechd p'), { y: 40 });
    reveal($('.card'), { y: 70 });
    reveal($('.step, .rev, .faq details, .about .pic, .about > div, .work figure'), { y: 50 });
    reveal($('.contact'), { y: 60 });
    // One gentle nudge on the WhatsApp bar button after a while on the page.
    const wa = document.querySelector('.bar .btn.wa');
    if (wa) gsap.fromTo(wa, { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 3, ease: 'power1.inOut', delay: 7 });
    done();
    ScrollTrigger.refresh();
  }

  // Called by the page after filters re-render the catalogue.
  window.motion = {
    cards(grid) {
      const cards = $('.card', grid);
      gsap.from(cards, { autoAlpha: 0, y: 30, scale: 0.97, stagger: 0.05, duration: 0.6 });
      ScrollTrigger.refresh();
    },
  };

  page();
})();
