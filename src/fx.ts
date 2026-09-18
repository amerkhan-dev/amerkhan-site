/**
 * Decorative effects: emoji bursts, an emoji rain easter egg, scroll reveals
 * and the hero spark. Everything here is aria-hidden, respects reduced
 * motion, and cleans up after itself. Nothing runs until something happens.
 */
const reducedMotion = () => typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionAllowed = () => !reducedMotion();

const finePointer = () => typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;

/**
 * Sets text while wrapping each emoji in an aria-hidden span, matching how
 * the static HTML keeps decorative emoji out of screen reader output.
 */
export function setRichText(element: Element, text: string) {
  element.replaceChildren();
  let index = 0;
  for (const match of text.matchAll(EMOJI)) {
    const start = match.index ?? 0;
    if (start > index) element.append(text.slice(index, start));
    const emoji = document.createElement('span');
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = match[0];
    element.append(emoji);
    index = start + match[0].length;
  }
  if (index < text.length) element.append(text.slice(index));
}

/** Asks the scroll companion to say something (see companion.ts). */
export function cheer(text: string, pop = '') {
  document.dispatchEvent(new CustomEvent('buddy:say', { detail: { text, pop } }));
}

const SPARKS = ['✦', '✧', '✦', '•'];
const MAX_PARTICLES = 90;
let particles = 0;

function spawn(className: string, x: number, y: number, content: string,
  vars: Record<string, string>, lifetime: number) {
  const layer = document.getElementById('fxLayer');
  if (!layer || particles >= MAX_PARTICLES) return;
  const particle = document.createElement('span');
  particle.className = className;
  particle.textContent = content;
  particle.style.left = `${x}px`;
  particle.style.top = `${y}px`;
  for (const [name, value] of Object.entries(vars)) particle.style.setProperty(name, value);
  particles++;
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    particles--;
    window.clearTimeout(timer);
    particle.remove();
  };
  // animationend is the normal path; the timer covers hidden tabs and old engines.
  const timer = window.setTimeout(remove, lifetime + 250);
  particle.addEventListener('animationend', remove, { once: true });
  layer.append(particle);
}

/** Pops a ring of emoji (or violet sparks) outward from a point in the viewport. */
export function burst(x: number, y: number, emojis?: readonly string[], count = emojis?.length ? 8 : 10) {
  if (!motionAllowed()) return;
  const symbols = emojis?.length ? emojis : SPARKS;
  const offset = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const angle = offset + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = (emojis?.length ? 56 : 34) + Math.random() * 42;
    const life = 620 + Math.random() * 380;
    spawn(emojis?.length ? 'fx-particle' : 'fx-particle fx-spark', x, y, symbols[i % symbols.length], {
      '--dx': `${Math.cos(angle) * distance}px`,
      '--dy': `${Math.sin(angle) * distance - 12}px`,
      '--rot': `${(Math.random() - 0.5) * 140}deg`,
      '--life': `${life}ms`,
      '--scale': `${0.8 + Math.random() * 0.5}`,
    }, life);
  }
}

export function burstFrom(element: Element, emojis?: readonly string[], count?: number) {
  const rect = element.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, emojis, count);
}

export const emojiList = (value: string | null | undefined) => (value ?? '').split(/\s+/).filter(Boolean);

/** Rains emoji down the whole viewport, once. */
export function emojiRain(emojis: readonly string[], drops = 42) {
  if (!motionAllowed()) return;
  const width = window.innerWidth || 1024;
  for (let i = 0; i < drops; i++) {
    const life = 2100 + Math.random() * 1500;
    const delay = Math.random() * 1300;
    spawn('fx-particle fx-rain', Math.random() * width, -40, emojis[i % emojis.length], {
      '--life': `${life}ms`,
      '--delay': `${delay}ms`,
      '--rot': `${(Math.random() - 0.5) * 540}deg`,
      '--size': `${18 + Math.random() * 18}px`,
      '--drift': `${(Math.random() - 0.5) * 120}px`,
    }, life + delay);
  }
}

function initClickBursts() {
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch' || !finePointer() || !motionAllowed()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-no-burst]')) return;
    burst(event.clientX, event.clientY, emojiList(target?.closest('[data-burst]')?.getAttribute('data-burst')));
  }, { passive: true });
}

const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

function initKonami() {
  let progress = 0;
  document.addEventListener('keydown', (event) => {
    const key = event.key?.toLowerCase();
    if (!key) return;
    if (key === KONAMI[progress]) progress++;
    else progress = key === KONAMI[0] ? 1 : 0;
    if (progress < KONAMI.length) return;
    progress = 0;
    emojiRain(['🃏', '🏋️', '🧊', '🥊', '⚽', '🏀', '💪', '🎯', '🚀', '💜']);
    cheer('Cheat code accepted! 🎮', '🎮');
  });
}

const SPARK_CYCLE = ['✳', '🚀', '🧠', '🃏', '🏋️', '🧊', '🥊', '⚽', '💜'];

function initSpark() {
  const spark = document.querySelector<HTMLElement>('[data-spark]');
  if (!spark) return;
  let index = 0;
  spark.addEventListener('click', (event) => {
    index = (index + 1) % SPARK_CYCLE.length;
    spark.textContent = SPARK_CYCLE[index];
    spark.classList.toggle('is-emoji', index > 0);
    spark.classList.remove('is-popping');
    void spark.offsetWidth; // restart the pop animation
    spark.classList.add('is-popping');
    if (event.clientX || event.clientY) burst(event.clientX, event.clientY);
  });
}

/**
 * Below-the-fold cards rise in as they enter the viewport. Content is only
 * hidden once JavaScript knows it can reveal it again; reduced motion and a
 * missing IntersectionObserver leave everything visible.
 */
function initReveal() {
  if (typeof window.IntersectionObserver !== 'function' || typeof window.matchMedia !== 'function') return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches) return;
  const root = document.documentElement;
  const targets = [...document.querySelectorAll<HTMLElement>(
    '#main > .section .section-head, .numbers-inner, .edu-card, .role-card, .project-card, .skill-card, .hobby-card, .contact-inner',
  )];
  if (!targets.length) return;

  const finish = (element: HTMLElement) => {
    element.classList.remove('reveal', 'is-revealed');
    element.style.removeProperty('--reveal-delay');
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement;
      observer.unobserve(element);
      element.classList.add('is-revealed');
      // Child animations bubble too; only the card's own reveal ends it.
      const done = (event: AnimationEvent) => {
        if (event.target !== element || event.animationName !== 'reveal-in') return;
        element.removeEventListener('animationend', done);
        finish(element);
      };
      element.addEventListener('animationend', done);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  for (const element of targets) {
    const siblings = element.parentElement ? [...element.parentElement.children] : [];
    const index = Math.max(0, siblings.indexOf(element));
    element.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 70}ms`);
    element.classList.add('reveal');
    observer.observe(element);
  }
  root.classList.add('reveal-ready');

  const showAll = () => {
    observer.disconnect();
    targets.forEach(finish);
    root.classList.remove('reveal-ready');
  };
  if (typeof motion.addEventListener === 'function') {
    motion.addEventListener('change', () => { if (motion.matches) showAll(); });
  }
  window.addEventListener('beforeprint', showAll);
}

export function initFx() {
  initClickBursts();
  initKonami();
  initSpark();
  initReveal();
}
