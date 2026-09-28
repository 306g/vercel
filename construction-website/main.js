(() => {
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /* ------------------------------------------------------------------
   * Hero: scroll-scrubbed video.
   * The source clip is pre-extracted into a WebP frame sequence and drawn
   * to a canvas. Frame sequences scrub far more smoothly than seeking a
   * <video> element's currentTime, and work identically across browsers.
   * ------------------------------------------------------------------ */
  const FRAME_COUNT = 97;
  const framePath = i =>
    `assets/frames/f${String(i + 1).padStart(3, '0')}.webp`;

  const hero = document.querySelector('.hero');
  const canvas = hero.querySelector('.hero__canvas');
  const ctx = canvas.getContext('2d');
  const stages = [...hero.querySelectorAll('.hero__stage')].map(el => {
    const [start, end] = el.dataset.range.split(',').map(Number);
    return { el, start, end };
  });
  const meterFill = hero.querySelector('.hero__meter-fill');
  const meterPct = hero.querySelector('.hero__meter-pct');
  const hint = hero.querySelector('.hero__hint');
  const loader = hero.querySelector('.hero__loader');

  const frames = new Array(FRAME_COUNT);
  let loaded = 0;
  let currentFrame = 0;
  let targetFrame = 0;
  let drawnFrame = -1;
  let progress = 0;

  // Load order: first & last frame, then a coarse pass, then fill the gaps.
  // The scrubber can always show *something* close while the rest streams in.
  function loadOrder() {
    const order = [0, FRAME_COUNT - 1];
    const seen = new Set(order);
    for (let step = 16; step >= 1; step = Math.floor(step / 2)) {
      for (let i = 0; i < FRAME_COUNT; i += step) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    return order;
  }

  function loadFrames() {
    const queue = loadOrder();
    const CONCURRENCY = 6;
    const next = () => {
      const i = queue.shift();
      if (i === undefined) return;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const done = () => {
          frames[i] = img;
          loaded++;
          loader.style.transform = `scaleX(${loaded / FRAME_COUNT})`;
          if (loaded === FRAME_COUNT) loader.classList.add('is-done');
          drawnFrame = -1; // a closer frame may now be available
          requestTick();
          next();
        };
        img.decode ? img.decode().then(done, done) : done();
      };
      img.onerror = next;
      img.src = framePath(i);
    };
    for (let c = 0; c < CONCURRENCY; c++) next();
  }

  function nearestLoaded(i) {
    if (frames[i]) return frames[i];
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    drawnFrame = -1;
    requestTick();
  }

  function draw(index) {
    const img = nearestLoaded(index);
    if (!img) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = cw / ch;
    // object-fit: cover
    let dw, dh;
    if (cr > ir) {
      dw = cw;
      dh = cw / ir;
    } else {
      dh = ch;
      dw = ch * ir;
    }
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  function readProgress() {
    const rect = hero.getBoundingClientRect();
    const scrollable = hero.offsetHeight - window.innerHeight;
    return clamp(-rect.top / scrollable, 0, 1);
  }

  function stageOpacity(p, start, end) {
    const fade = 0.07;
    const fadeIn = start <= 0 ? 1 : clamp((p - start) / fade, 0, 1);
    const fadeOut = end > 1 ? 1 : clamp((end - p) / fade, 0, 1);
    return Math.min(fadeIn, fadeOut);
  }

  function updateOverlays(p) {
    for (const { el, start, end } of stages) {
      const o = stageOpacity(p, start, end);
      el.style.opacity = o.toFixed(3);
      const shift = (1 - o) * 24;
      el.style.translate = `0 ${shift.toFixed(1)}px`;
      el.classList.toggle('is-active', o > 0.5);
    }
    meterFill.style.transform = `scaleX(${p})`;
    meterPct.textContent = `${Math.round(p * 100)}%`;
    hint.style.opacity = p > 0.03 ? '0' : '1';
  }

  let ticking = false;
  function requestTick() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }

  function tick() {
    ticking = false;
    progress = readProgress();
    targetFrame = progress * (FRAME_COUNT - 1);

    // Ease toward the target for buttery scrubbing (skipped for reduced motion).
    const diff = targetFrame - currentFrame;
    currentFrame =
      reduceMotion || Math.abs(diff) < 0.05
        ? targetFrame
        : currentFrame + diff * 0.18;

    const index = Math.round(currentFrame);
    if (index !== drawnFrame) {
      draw(index);
      if (frames[index]) drawnFrame = index;
    }
    updateOverlays(progress);

    if (currentFrame !== targetFrame) requestTick();
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  loadFrames();

  /* ------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------ */
  const nav = document.getElementById('nav');
  const toggle = nav.querySelector('.nav__toggle');
  const menu = document.getElementById('mobile-menu');

  const updateNav = () =>
    nav.classList.toggle(
      'is-solid',
      window.scrollY > hero.offsetHeight - window.innerHeight - 10 ||
        !menu.hidden
    );
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  const setMenu = open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    updateNav();
  };
  toggle.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', e => {
    if (e.target.closest('a')) setMenu(false);
  });

  /* ------------------------------------------------------------------
   * Reveal-on-scroll and counters
   * ------------------------------------------------------------------ */
  const revealObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
  );
  document
    .querySelectorAll('.reveal')
    .forEach(el => revealObserver.observe(el));

  const animateCount = el => {
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (reduceMotion) {
      el.textContent = end + suffix;
      return;
    }
    const duration = 1600;
    const t0 = performance.now();
    const step = now => {
      const t = clamp((now - t0) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(end * eased) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const countObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.6 }
  );
  document
    .querySelectorAll('[data-count]')
    .forEach(el => countObserver.observe(el));

  /* ------------------------------------------------------------------
   * Testimonials carousel
   * ------------------------------------------------------------------ */
  const quotesRoot = document.querySelector('[data-quotes]');
  if (quotesRoot) {
    const quotes = [...quotesRoot.querySelectorAll('.quote')];
    const dots = quotesRoot.querySelector('.quotes__dots');
    let active = 0;
    let timer;
    const buttons = quotes.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `Testimonial ${i + 1}`);
      b.addEventListener('click', () => {
        show(i);
        restart();
      });
      dots.appendChild(b);
      return b;
    });
    const show = i => {
      active = i;
      quotes.forEach((q, j) => {
        q.classList.toggle('is-active', j === i);
        q.setAttribute('aria-hidden', String(j !== i));
      });
      buttons.forEach((b, j) =>
        b.setAttribute('aria-selected', String(j === i))
      );
    };
    const restart = () => {
      clearInterval(timer);
      if (!reduceMotion)
        timer = setInterval(() => show((active + 1) % quotes.length), 7000);
    };
    show(0);
    restart();
  }

  /* ------------------------------------------------------------------
   * Contact form (client-side validation; wire to your backend/endpoint)
   * ------------------------------------------------------------------ */
  const form = document.querySelector('.form');
  const status = form.querySelector('.form__status');
  form.addEventListener('submit', e => {
    e.preventDefault();
    let firstInvalid = null;
    for (const field of form.querySelectorAll('[required]')) {
      const ok = field.checkValidity() && field.value.trim() !== '';
      field.setAttribute('aria-invalid', String(!ok));
      if (!ok && !firstInvalid) firstInvalid = field;
    }
    if (firstInvalid) {
      status.className = 'form__status is-err';
      status.textContent = 'Please add your name and a valid email address.';
      firstInvalid.focus();
      return;
    }
    const name = form.elements.name.value.trim().split(' ')[0];
    status.className = 'form__status is-ok';
    status.textContent = `Thanks, ${name}! We'll be in touch within one business day.`;
    form.reset();
  });

  document
    .querySelectorAll('[data-year]')
    .forEach(el => (el.textContent = new Date().getFullYear()));
})();
