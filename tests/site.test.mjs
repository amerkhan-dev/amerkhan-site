import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
// Every production module, transpiled to CommonJS and linked by a tiny
// require() so the whole app runs in one browser realm without Vite.
const MODULES = ['poker', 'cube', 'fx', 'equity-chart', 'hobbies', 'companion', 'main'];
const compile = (name) => ts.transpileModule(read(`../src/${name}.ts`), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const script = `(() => {
  const factories = {};
  const cache = {};
  const require = (id) => {
    const name = id.replace(/^\\.\\//, '').replace(/\\.ts$/, '');
    if (!cache[name]) {
      cache[name] = { exports: {} };
      factories[name](cache[name], cache[name].exports, require);
    }
    return cache[name].exports;
  };
  ${MODULES.map((name) => `factories[${JSON.stringify(name)}] = (module, exports, require) => {\n${compile(name)}\n};`).join('\n')}
  require('./main');
})();`;

/** Loads a DOM-free module (the poker engine, the cube model) straight into Node. */
function load(name) {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compile(name))(module, module.exports, (id) => load(id.replace(/^\.\//, '')));
  return module.exports;
}

/** A seeded PRNG (mulberry32) so simulations in tests are repeatable. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeClock(window) {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  Object.defineProperty(window.performance, 'now', { value: () => now });
  window.setTimeout = (callback, delay = 0, ...args) => {
    const id = nextId++;
    pending.set(id, { at: now + Math.max(0, Number(delay) || 0), callback, args });
    return id;
  };
  window.clearTimeout = (id) => pending.delete(id);
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(now), 16);
  window.cancelAnimationFrame = window.clearTimeout;
  function next() {
    const [entry] = [...pending.entries()].sort((a, b) => a[1].at - b[1].at);
    if (!entry) return false;
    const [id, timer] = entry;
    pending.delete(id);
    now = timer.at;
    if (typeof timer.callback === 'function') timer.callback(...timer.args);
    else window.eval(String(timer.callback));
    return true;
  }
  return {
    pending: () => pending.size,
    advance(milliseconds) {
      const end = now + milliseconds;
      let count = 0;
      while ([...pending.values()].some((timer) => timer.at <= end)) {
        next();
        assert.ok(++count < 1000, 'The interface must not spin within a clock interval');
      }
      now = end;
    },
    drain() {
      let count = 0;
      while (next()) assert.ok(++count < 1000, 'The interface must not schedule an endless animation');
    },
  };
}

function mediaQueries(window, initiallyReduced, finePointer) {
  let reduced = initiallyReduced;
  const queries = new Map();
  window.matchMedia = (query) => {
    if (queries.has(query)) return queries.get(query);
    const listeners = new Set();
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const media = {
      media: query,
      get matches() {
        if (query.includes('prefers-reduced-motion')) return reduced;
        if (query.includes('pointer: fine')) return finePointer;
        if (max) return window.innerWidth <= Number(max[1]);
        if (min) return window.innerWidth >= Number(min[1]);
        return false;
      },
      addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
      removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener); },
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
      dispatchEvent(event) { listeners.forEach((listener) => listener(event)); return true; },
      onchange: null,
    };
    queries.set(query, media);
    return media;
  };
  return {
    reduce() {
      reduced = true;
      for (const media of queries.values()) {
        if (!media.media.includes('prefers-reduced-motion')) continue;
        const event = new window.Event('change');
        Object.defineProperties(event, { matches: { value: true }, media: { value: media.media } });
        media.dispatchEvent(event);
        media.onchange?.(event);
      }
    },
  };
}

function intersections(window) {
  const observers = new Set();
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.add(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    takeRecords() { return []; }
  };
  return {
    isObserved(target) { return [...observers].some((observer) => observer.targets.has(target)); },
    enter(targets) {
      for (const observer of observers) {
        const entries = [...targets].filter((target) => observer.targets.has(target)).map((target) => ({
          target, isIntersecting: true, intersectionRatio: 1,
        }));
        if (entries.length) observer.callback(entries, observer);
      }
    },
  };
}

function setup(t, { javascript = true, reduced = false, observer = true, finePointer = false } = {}) {
  const dom = new JSDOM(html, {
    url: 'https://amerkhan.vercel.app/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: finePointer ? 1280 : 375, configurable: true });
  const clock = fakeClock(window);
  const media = mediaQueries(window, reduced, finePointer);
  const visibility = observer ? intersections(window) : null;
  if (javascript) window.eval(script);
  return { window, document: window.document, clock, media, visibility };
}

function element(document, selector) {
  const result = document.querySelector(selector);
  assert.ok(result, `Expected ${selector} in the page`);
  return result;
}

function counters(document) {
  const nodes = [...document.querySelectorAll('[data-counter]')];
  assert.ok(nodes.length > 0, 'The page should offer metric count-ups');
  return nodes;
}

function accessibleText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('[aria-hidden="true"], [hidden]').forEach((child) => child.remove());
  return clone.textContent.trim();
}

const snapshot = (nodes) => new Map(nodes.map((node) => [node, node.textContent.trim()]));

function assertFinalValues(originals) {
  for (const [node, value] of originals) {
    assert.equal(node.textContent.trim(), value, `Final counter value must remain ${value}`);
    assert.equal(accessibleText(node), value, 'Assistive technology should encounter each final value once');
    assert.equal(node.querySelector('[aria-hidden="true"]'), null, 'Completed counters need no decorative text');
  }
}

function movePointer(window, target, x, y, pointerType = 'mouse') {
  // JSDOM 26 has MouseEvent but no PointerEvent constructor. Dispatch through
  // the actual DOM listeners, preserving PointerEvent's relevant public fields.
  const EventConstructor = window.PointerEvent ?? window.MouseEvent;
  const event = new EventConstructor('pointermove', {
    bubbles: true, clientX: x, clientY: y, pointerType,
  });
  if (!('pointerType' in event)) Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

test('served HTML preserves verified metrics, six readable roles, and four equal project cards', (t) => {
  const { document } = setup(t, { javascript: false });
  const values = counters(document).map((node) => node.textContent.trim());
  for (const value of ['3.94', '50+', '2,000+', '$15K', '45+', '300+', '20,000', '200+']) {
    assert.ok(values.includes(value), `The verified value ${value} must be in the source HTML`);
  }
  for (const node of counters(document)) {
    assert.match(node.textContent.trim(), /^\$?[\d,]+(?:\.\d+)?(?:\+|K)?$/);
    assert.equal(node.closest('[hidden], [aria-hidden="true"]'), null);
    assert.doesNotMatch(node.textContent, /^0(?:\.00)?$/);
  }
  const experience = element(document, '#experience');
  assert.equal(experience.querySelectorAll('.role-card').length, 6);
  assert.doesNotMatch(experience.textContent, /Belay/i);
  for (const id of ['fintech-details', 'its-details', 'teaching-details']) {
    assert.equal(element(document, `#${id}`).querySelectorAll('li').length, 4);
  }
  const projects = [...document.querySelectorAll('#projects .project-card')];
  assert.equal(projects.length, 4);
  assert.equal(projects[0].id, 'belay', 'Belay leads the project grid');
  assert.equal(new Set(projects.map((card) => card.className)).size, 1,
    'Belay has the same card treatment as the other projects');
  const buttons = [...document.querySelectorAll('.disclosure-toggle[aria-controls]')];
  assert.equal(buttons.length, 10, 'Each role and project has details');
  const ids = buttons.map((button) => button.getAttribute('aria-controls'));
  assert.equal(new Set(ids).size, ids.length, 'Disclosure panel IDs must be unique');
  for (const button of buttons) {
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.ok(button.hidden, 'A control requiring JavaScript starts hidden');
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    assert.ok(panel, 'Every disclosure control has a real panel');
    assert.ok(!panel.closest('[hidden], [aria-hidden="true"]'), 'Details are readable without JavaScript');
    assert.ok(panel.textContent.trim().length > 40, 'Details must exist in HTML');
  }
});

test('enhanced disclosures expose native controls and synchronize their accessible state', (t) => {
  const { document } = setup(t);
  const buttons = [...document.querySelectorAll('.disclosure-toggle[aria-controls]')];
  assert.ok(buttons.length);
  for (const button of buttons) {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    assert.equal(button.hidden, false);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.hidden, true);
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(panel.hidden, false);
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.hidden, true);
  }
});

test('mobile navigation closes on Escape and returns focus to its control', (t) => {
  const { document, window } = setup(t);
  const toggle = element(document, '#nav-toggle');
  const nav = element(document, '#primary-navigation');
  // jsdom has no layout engine; represent the visible mobile menu button.
  toggle.getClientRects = () => [new window.DOMRect(0, 0, 44, 44)];
  assert.equal(toggle.getAttribute('aria-controls'), nav.id);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  element(document, '#primary-navigation a').focus();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, toggle);
});

test('count-ups wait for visibility, preserve accessible facts, and finish with exact formatting', (t) => {
  const { document, clock, visibility } = setup(t);
  const nodes = counters(document);
  const originals = snapshot(nodes);
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0, 'Unseen counters do not schedule animations');
  assert.ok(nodes.every((node) => visibility.isObserved(node)));
  visibility.enter(nodes);
  clock.advance(400);
  assert.ok(clock.pending() > 0, 'Visible counters should be animating');
  for (const [node, original] of originals) {
    assert.equal(accessibleText(node), original, 'Counting must never change the accessible final value');
    const overlays = [...node.querySelectorAll('[aria-hidden="true"]')];
    assert.equal(overlays.length, 1, 'Only one decorative count-up is needed');
    const animated = overlays[0].textContent.trim();
    assert.notEqual(animated, original, 'A visible metric should count up');
    if (original === '3.94') assert.match(animated, /^\d\.\d{2}$/);
    if (original.startsWith('$')) assert.match(animated, /^\$\d+K$/);
    if (original.endsWith('+')) assert.ok(animated.endsWith('+'));
    if (original.includes(',')) assert.match(animated, /^\d{1,3},\d{3}\+?$/);
  }
  clock.drain();
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0, 'Finished count-ups leave no continuous JavaScript animation');
  visibility.enter(nodes);
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0, 'Returning to a completed metric must not restart it');
});

test('below-fold metrics keep final source values while visible metrics animate', (t) => {
  const { document, window, clock, visibility } = setup(t);
  const visible = [...document.querySelectorAll('#home [data-counter]')];
  const unseen = counters(document).filter((node) => !visible.includes(node));
  const originals = snapshot(unseen);
  assert.ok(visible.length && unseen.length);
  visibility.enter(visible);
  window.dispatchEvent(new window.Event('scroll'));
  clock.advance(400);
  assertFinalValues(originals);
  assert.ok(unseen.every((node) => visibility.isObserved(node)));
  clock.drain();
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0);
});

test('reduced motion keeps exact metrics and skips count-up animations entirely', (t) => {
  const { document, window, clock, visibility } = setup(t, { reduced: true });
  const nodes = counters(document);
  const originals = snapshot(nodes);
  assert.ok(nodes.every((node) => !visibility.isObserved(node)));
  visibility.enter(nodes);
  window.dispatchEvent(new window.Event('scroll'));
  clock.drain();
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0);
});

test('enabling reduced motion during a count-up restores final values and cancels pending work', (t) => {
  const { document, clock, media, visibility } = setup(t);
  const nodes = counters(document);
  const originals = snapshot(nodes);
  visibility.enter(nodes.slice(0, 3));
  clock.advance(200);
  assert.ok(clock.pending() > 0);
  media.reduce();
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0, 'Changing motion preference must cancel active animations');
  assert.ok(nodes.every((node) => !visibility.isObserved(node)));
  visibility.enter(nodes);
  clock.drain();
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0);
});

test('missing IntersectionObserver leaves metrics correct and other controls functional', (t) => {
  const { document, clock } = setup(t, { observer: false });
  const originals = snapshot(counters(document));
  assertFinalValues(originals);
  assert.equal(clock.pending(), 0);
  const details = element(document, '.disclosure-toggle');
  details.click();
  assert.equal(details.hidden, false);
  assert.equal(details.getAttribute('aria-expanded'), 'true');
  assert.equal(document.getElementById(details.getAttribute('aria-controls')).hidden, false);
  const navigation = element(document, '#nav-toggle');
  navigation.click();
  assert.equal(navigation.getAttribute('aria-expanded'), 'true');
  clock.drain();
  assertFinalValues(originals);
});

test('fine-pointer cursor starts at known coordinates, settles, and restores native cursor for keyboard and blur', (t) => {
  const { document, window, clock } = setup(t, { finePointer: true });
  const root = document.documentElement;
  const dot = element(document, '#cursorDot');
  const ring = element(document, '#cursorRing');
  const label = element(document, '#cursorLabel');
  const link = element(document, '.social-card[data-cursor="view"]');
  assert.equal(root.classList.contains('cursor-active'), false, 'Native cursor remains until coordinates are known');
  assert.equal(dot.style.left, '');
  link.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
  assert.equal(root.classList.contains('cursor-active'), false, 'Hover alone cannot hide the native cursor');
  movePointer(window, link, 30, 45, 'touch');
  assert.equal(root.classList.contains('cursor-active'), false, 'Touch input must not activate a custom cursor');

  movePointer(window, link, 240, 180);
  assert.equal(root.classList.contains('cursor-active'), true);
  for (const cursor of [dot, ring]) {
    assert.equal(cursor.style.left, '240px');
    assert.equal(cursor.style.top, '180px');
  }
  assert.equal(label.textContent, 'View');
  assert.ok(label.closest('[aria-hidden="true"]'), 'Cursor labels stay decorative');
  movePointer(window, link, 420, 310);
  clock.drain();
  for (const cursor of [dot, ring]) {
    assert.equal(cursor.style.left, '420px');
    assert.equal(cursor.style.top, '310px');
  }
  assert.equal(clock.pending(), 0, 'A stationary cursor leaves no animation loop');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(root.classList.contains('cursor-active'), false, 'Keyboard navigation restores the native cursor');
  assert.equal(label.textContent, '');
  movePointer(window, link, 600, 450);
  assert.equal(root.classList.contains('cursor-active'), true);
  window.dispatchEvent(new window.Event('blur'));
  assert.equal(root.classList.contains('cursor-active'), false, 'Leaving the page restores the native cursor');
  assert.equal(label.textContent, '');
  assert.equal(clock.pending(), 0, 'Blur cancels cursor animation immediately');
});

test('coarse pointers and reduced motion keep the native cursor', (t) => {
  for (const options of [{ finePointer: false }, { finePointer: true, reduced: true }]) {
    const { document, window, clock } = setup(t, options);
    movePointer(window, document.body, 240, 180);
    assert.equal(document.documentElement.classList.contains('cursor-active'), false);
    assert.equal(element(document, '#cursorDot').style.left, '');
    assert.equal(clock.pending(), 0);
  }
});

test('companion reacts to continued scrolling, updates its decorative caption, and returns to idle', (t) => {
  const { document, window, clock, visibility } = setup(t);
  const buddy = element(document, '#scroll-companion');
  assert.equal(buddy.getAttribute('aria-hidden'), 'true');
  assert.equal(buddy.classList.contains('motion-enabled'), true);
  assert.equal(buddy.classList.contains('is-scrolling'), false);
  visibility.enter([element(document, '#projects')]);
  assert.equal(element(document, '.buddy-caption').textContent, 'Shipping things. 🚀');
  window.dispatchEvent(new window.Event('scroll'));
  assert.equal(buddy.classList.contains('is-scrolling'), true);
  clock.advance(150);
  window.dispatchEvent(new window.Event('scroll'));
  clock.advance(150);
  assert.equal(buddy.classList.contains('is-scrolling'), true, 'More scrolling keeps the typing gesture active');
  clock.drain();
  assert.equal(buddy.classList.contains('is-scrolling'), false);
  assert.equal(clock.pending(), 0, 'An idle companion leaves no JavaScript animation loop');
});

test('reduced motion disables companion gestures initially and during scrolling', (t) => {
  for (const reduced of [true, false]) {
    const { document, window, clock, media } = setup(t, { reduced });
    const buddy = element(document, '#scroll-companion');
    window.dispatchEvent(new window.Event('scroll'));
    assert.equal(buddy.classList.contains('is-scrolling'), !reduced);
    media.reduce();
    assert.equal(buddy.classList.contains('motion-enabled'), false);
    assert.equal(buddy.classList.contains('is-scrolling'), false, 'Changing preference ends the gesture immediately');
    clock.drain();
    window.dispatchEvent(new window.Event('scroll'));
    clock.drain();
    assert.equal(buddy.classList.contains('is-scrolling'), false);
    assert.equal(clock.pending(), 0);
  }
});

/* ------------------------------------------------------------------ */
/* Hobbies & free time                                                  */
/* ------------------------------------------------------------------ */
const WIDGETS = ['[data-poker]', '[data-barbell]', '[data-cube]', '[data-keepy]', '[data-reflex]'];
const squash = (text) => text.replace(/\s+/g, ' ');

test('hobbies section states the confirmed facts and reads fully without JavaScript', (t) => {
  const { document } = setup(t, { javascript: false });
  const section = element(document, '#hobbies');
  assert.equal(section.getAttribute('aria-labelledby'), 'hobbies-title');
  assert.ok(document.querySelector('#primary-navigation a[href="#hobbies"]'), 'The navigation links to the section');
  const cards = [...section.querySelectorAll('.hobby-card')];
  assert.equal(cards.length, 5);
  for (const card of cards) {
    const title = document.getElementById(card.getAttribute('aria-labelledby'));
    assert.ok(title?.tagName === 'H3' && card.contains(title), 'Each hobby card is labelled by its own heading');
  }
  const text = squash(section.textContent);
  for (const fact of ['decision-making under uncertainty', 'expected value', 'pot odds', '2× bodyweight bench',
    'bench press twice my bodyweight', '340+ lb bench at 165 lb', 'lifting and powerlifting', "Rubik's Cube", 'MMA and martial arts',
    'Three-year varsity soccer athlete', 'MetroWest Academic All-Star for the 2024–25 season', 'intramural soccer and basketball']) {
    assert.ok(text.includes(fact), `The hobbies copy should include “${fact}”`);
  }
  assert.doesNotMatch(text, /intermural/i, 'Intramural is spelled correctly');
  for (const selector of WIDGETS) {
    assert.equal(element(document, selector).hidden, true, `${selector} needs JavaScript, so it starts hidden`);
  }
  assert.equal(element(document, '.emoji-ticker').getAttribute('aria-hidden'), 'true', 'The ticker repeats the cards and stays decorative');
});

test('enhancement reveals every hobby widget with native controls, and nothing animates until used', (t) => {
  const { document, clock } = setup(t);
  for (const selector of WIDGETS) assert.equal(element(document, selector).hidden, false, `${selector} is revealed`);
  for (const button of document.querySelectorAll('#hobbies button')) {
    assert.equal(button.type, 'button');
    assert.ok(button.textContent.trim() || button.getAttribute('aria-label'), 'Every control has a name');
  }
  assert.equal(document.querySelectorAll('[data-cube-stage] .cubie').length, 26, 'The cube is built from 26 pieces');
  assert.equal(clock.pending(), 0, 'Widgets schedule no work before a visitor interacts');
});

test('hand evaluator matches exact five-card category counts and ranks showdowns correctly', () => {
  const { evaluate, categoryOf } = load('poker');
  const counts = {};
  const hand = new Uint8Array(5);
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
    for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
      hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
      const category = categoryOf(evaluate(hand, 5));
      counts[category] = (counts[category] ?? 0) + 1;
    }
  assert.deepEqual(counts, {
    'Straight flush': 40, 'Four of a kind': 624, 'Full house': 3744, Flush: 5108, Straight: 10200,
    'Three of a kind': 54912, 'Two pair': 123552, Pair: 1098240, 'High card': 1302540,
  });

  const card = (text) => '23456789TJQKA'.indexOf(text[0]) * 4 + 'shdc'.indexOf(text[1]);
  const score = (text) => evaluate(text.split(' ').map(card));
  const beats = (a, b, message) => assert.ok(score(a) > score(b), message);
  beats('As Ks Qs Js Ts 2d 3c', 'Ah Ad Ac As Kd 2c 3h', 'A royal flush beats quads');
  beats('6h 5d 4c 3s 2h Kd Kc', 'Ah 2d 3c 4s 5h Kh Qc', 'A six-high straight beats the wheel');
  beats('2h 7h 9h Jh Kh Ac Ad', 'Th Jd Qc Ks Ah 2c 3d', 'A flush beats a straight');
  beats('Kh Kd Kc 2s 2h 9h 8h', 'Ah Qh 9h 7h 3h Kd Kc', 'A full house beats a flush');
  beats('Ah Ad Kc Kd 9s 3c 2h', 'Ah Ad Kc Kd 8s 3c 2h', 'Two pair plays its best kicker');
  beats('Kh Kd Kc Qs Qh Qd 2c', 'Kh Kd Kc Js Jh Jd Ac', 'Two sets make a full house with the lower set as the pair');
  assert.equal(score('Ah Kd 7c 7s 2h 2d 9c'), score('Ad Kc 7h 7d 2s 2c 9h'), 'Identical ranks split the pot');
  assert.equal(categoryOf(score('As 2s 3s 4s 5s Kd Kc')), 'Straight flush', 'The wheel can be a straight flush');
});

test('Monte Carlo equity lands on published preflop values with a seeded shuffle', () => {
  const { simulate, equityOf, describeHole } = load('poker');
  const card = (text) => '23456789TJQKA'.indexOf(text[0]) * 4 + 'shdc'.indexOf(text[1]);
  for (const [hand, published] of [[['As', 'Ah'], 0.852], [['Ks', 'Kh'], 0.824], [['As', 'Ks'], 0.670], [['7s', '2h'], 0.346]]) {
    const hole = hand.map(card);
    const equity = equityOf(simulate(hole, 60000, undefined, seeded(hole[0] * 53 + hole[1])));
    assert.ok(Math.abs(equity - published) < 0.008, `${hand.join('')} ≈ ${published}, got ${equity.toFixed(4)}`);
  }
  assert.equal(describeHole([card('Ks'), card('As')]).short, 'AKs');
  assert.equal(describeHole([card('7d'), card('2c')]).short, '72o');
  assert.equal(describeHole([card('Qd'), card('Qc')]).long, 'Pocket Queens');
});

test('cube model: face turns have order four, known algorithms return home, scrambles undo exactly', () => {
  const { createCube, applyMove, isSolved, parseMoves, invert, scramble, pushSimplified, FACES } = load('cube');
  const order = (algorithm) => {
    const cube = createCube();
    for (let n = 1; n <= 2000; n++) {
      parseMoves(algorithm).forEach((move) => applyMove(cube, move));
      if (isSolved(cube)) return n;
    }
    return -1;
  };
  for (const face of FACES) assert.equal(order(face), 4, `${face} has order 4`);
  assert.equal(order("R U R' U'"), 6);
  assert.equal(order('R U'), 105);
  assert.equal(order("R U R' U' R' F R2 U' R' U' R U R' F'"), 2, 'The T-permutation swaps pieces and swaps them back');
  const random = seeded(2028);
  for (let i = 0; i < 200; i++) {
    const cube = createCube();
    const history = [];
    for (const move of scramble(20, random)) {
      applyMove(cube, move);
      pushSimplified(history, move);
    }
    assert.equal(isSolved(cube), false);
    for (const move of invert(history)) {
      applyMove(cube, move);
      pushSimplified(history, move);
    }
    assert.ok(isSolved(cube) && history.length === 0, 'Undoing a scramble solves the cube and empties its history');
  }
});

test('poker table deals, replays the convergence, and settles with an accessible summary', (t) => {
  for (const reduced of [false, true]) {
    const { document, clock } = setup(t, { reduced });
    const table = element(document, '[data-poker]');
    element(document, '[data-poker-deal]').click();
    if (!reduced) assert.ok(clock.pending() > 0, 'Dealing animates the cards and the estimate');
    clock.drain();
    assert.equal(table.dataset.state, 'done');
    assert.match(element(document, '[data-poker-equity]').textContent, /^\d{1,2}\.\d%$/);
    assert.ok([...document.querySelectorAll('.playing-card')].every((card) => card.classList.contains('is-up')));
    assert.match(element(document, '[data-poker-live]').textContent, /percent equity against a random hand over 20,000 simulations\.$/);
    assert.equal(document.querySelectorAll('[data-poker-table] tr').length, 5, 'Checkpoints are available as a table');
    assert.ok(document.querySelector('[data-poker-chart] .equity-line'), 'The convergence line is drawn');
    assert.ok(document.querySelector('[data-poker-hand] [aria-hidden="true"]'), 'Emoji in the hand summary stay decorative');
    assert.equal(clock.pending(), 0, 'A settled table leaves no animation running');
  }
});

test('barbell loads to twice the 165 lb bodyweight, then the 340 lb target', (t) => {
  const { document, clock } = setup(t);
  const add = element(document, '[data-barbell-add]');
  const total = element(document, '[data-barbell-total]');
  assert.equal(total.textContent, '45');
  const seen = [];
  for (let i = 0; i < 5; i++) {
    add.click();
    clock.drain();
    seen.push(total.textContent);
  }
  assert.deepEqual(seen, ['135', '225', '315', '325', '330']);
  assert.match(element(document, '[data-barbell-note]').textContent, /330 lb = 2 × my 165 lb bodyweight/);
  assert.match(element(document, '[data-barbell-live]').textContent, /twice my 165 pound bodyweight/);
  add.click();
  clock.drain();
  assert.equal(total.textContent, '340');
  assert.equal(add.disabled, true, 'The sequence ends at the next target');
  assert.equal(document.querySelectorAll('[data-plates] .plate').length, 12);
  element(document, '[data-barbell-reset]').click();
  clock.drain();
  assert.equal(total.textContent, '45');
  assert.equal(document.querySelectorAll('[data-plates] .plate').length, 0);
  assert.equal(add.disabled, false);
  assert.equal(clock.pending(), 0);
});

test('cube scrambles with real face turns, solves itself, and takes keyboard moves', (t) => {
  const { document, window, clock } = setup(t);
  const cube = element(document, '[data-cube]');
  const stage = element(document, '[data-cube-stage]');
  assert.equal(cube.dataset.solved, 'true');
  element(document, '[data-cube-scramble]').click();
  clock.drain();
  assert.equal(cube.dataset.solved, 'false');
  assert.match(element(document, '[data-cube-live]').textContent, /scrambled with 20 random face turns/);
  assert.equal(element(document, '[data-cube-tape]').textContent.split(' ').length, 10, 'The tape shows the latest moves');
  element(document, '[data-cube-solve]').click();
  clock.drain();
  assert.equal(cube.dataset.solved, 'true');
  assert.equal(element(document, '[data-cube-live]').textContent, 'Cube solved.');
  const press = (key, shiftKey = false) => stage.dispatchEvent(new window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  press('r');
  clock.drain();
  assert.equal(cube.dataset.solved, 'false');
  press('R', true);
  clock.drain();
  assert.equal(cube.dataset.solved, 'true', "R then R' returns home");
  const before = stage.querySelector('.cube').style.transform;
  press('ArrowLeft');
  assert.notEqual(stage.querySelector('.cube').style.transform, before, 'Arrow keys turn the whole cube');
  assert.equal(clock.pending(), 0);
});

test('keepy-uppy counts touches in the air and stops its loop once the ball lands', (t) => {
  const { document, clock } = setup(t);
  const ball = element(document, '[data-keepy-ball]');
  ball.click();
  assert.ok(clock.pending() > 0, 'A kicked ball is in flight');
  clock.advance(200);
  ball.click();
  assert.equal(element(document, '[data-keepy-count]').textContent, '2', 'A touch before landing extends the streak');
  clock.drain();
  assert.equal(element(document, '[data-keepy-live]').textContent, 'Dropped after 2 touches. Best: 2.');
  assert.equal(element(document, '[data-keepy-best]').textContent, '2');
  assert.equal(clock.pending(), 0, 'The physics loop ends when the ball comes to rest');

  const calm = setup(t, { reduced: true });
  assert.equal(element(calm.document, '[data-keepy]').hidden, true, 'Reduced motion keeps the physics toy off');
});

test('reflex check rejects early taps and times a real reaction', (t) => {
  const { document, clock } = setup(t);
  const pad = element(document, '[data-reflex-pad]');
  pad.click();
  assert.equal(pad.dataset.state, 'waiting');
  clock.advance(800);
  pad.click();
  assert.equal(pad.dataset.state, 'early', 'Tapping before the glove appears is too early');
  clock.advance(800);
  pad.click();
  clock.advance(3500);
  assert.equal(pad.dataset.state, 'go');
  clock.advance(240);
  pad.click();
  assert.equal(pad.dataset.state, 'done');
  assert.match(element(document, '[data-reflex-text]').textContent, /^\d+ ms · /);
  assert.match(element(document, '[data-reflex-best]').textContent, /^\d+ ms$/);
  clock.drain();
  assert.equal(clock.pending(), 0);
});

test('companion wears emoji captions, reacts to hobbies and widget cheers, and its eyes follow a fine pointer', (t) => {
  const { document, window, clock, visibility } = setup(t, { finePointer: true });
  const buddy = element(document, '#scroll-companion');
  const caption = element(document, '.buddy-caption');
  visibility.enter([element(document, '#hobbies')]);
  assert.equal(caption.textContent, 'Off the clock! 🎲');

  const lift = element(document, '#hobby-lift');
  lift.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
  assert.equal(caption.textContent, lift.dataset.buddy, 'Hovering a hobby gets a reaction');
  document.dispatchEvent(new window.CustomEvent('buddy:say', { detail: { text: '2× bodyweight! 💪', pop: '💪' } }));
  assert.equal(caption.textContent, '2× bodyweight! 💪', 'A widget cheer takes priority');
  assert.ok(buddy.classList.contains('is-cheering'));
  assert.equal(element(document, '.buddy-pop').textContent, '💪');
  clock.drain();
  assert.equal(caption.textContent, lift.dataset.buddy, 'After the cheer, the hover reaction returns');
  element(document, '#contact').dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
  assert.equal(caption.textContent, 'Off the clock! 🎲', 'Leaving the card restores the section caption');

  movePointer(window, document.body, 900, 700);
  assert.notEqual(buddy.style.getPropertyValue('--gaze-x'), '', 'The eyes track the pointer');
  window.dispatchEvent(new window.Event('blur'));
  assert.equal(buddy.style.getPropertyValue('--gaze-x'), '', 'The eyes return to center');
  movePointer(window, document.body, 50, 60, 'touch');
  assert.equal(buddy.style.getPropertyValue('--gaze-x'), '', 'Touch never moves the eyes');
  assert.equal(clock.pending(), 0);
});

test('cursor wears a hobby emoji, shows widget labels, and shrinks over the chart', (t) => {
  const { document, window, clock } = setup(t, { finePointer: true });
  const ring = element(document, '#cursorRing');
  const label = element(document, '#cursorLabel');
  movePointer(window, element(document, '#hobby-poker .hobby-desc'), 300, 300);
  assert.equal(label.textContent, '🃏');
  assert.ok(ring.classList.contains('is-emoji'));
  movePointer(window, element(document, '[data-cube-stage]'), 320, 320);
  assert.equal(label.textContent, 'Drag');
  assert.ok(ring.classList.contains('is-label') && !ring.classList.contains('is-emoji'));
  movePointer(window, element(document, '[data-poker-chart]'), 340, 340);
  assert.equal(label.textContent, '');
  assert.ok(ring.classList.contains('is-precise'), 'The ring never hides the data being read');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(ring.classList.contains('is-precise'), false);
  clock.drain();
});

test('below-the-fold cards reveal on entry, and stay visible without motion or JavaScript', (t) => {
  const { document, window, visibility } = setup(t);
  const card = element(document, '#hobby-cube');
  assert.ok(document.documentElement.classList.contains('reveal-ready'));
  assert.ok(card.classList.contains('reveal'));
  visibility.enter([card]);
  assert.ok(card.classList.contains('is-revealed'));
  const end = new window.Event('animationend', { bubbles: true });
  Object.defineProperty(end, 'animationName', { value: 'reveal-in' });
  card.dispatchEvent(end);
  assert.equal(card.classList.contains('reveal'), false, 'A revealed card returns to its normal styles');
  for (const options of [{ reduced: true }, { javascript: false }]) {
    const other = setup(t, options).document;
    assert.equal(other.querySelectorAll('.reveal').length, 0, 'Nothing is hidden for reduced motion or without JavaScript');
  }
});

test('the Konami code rains emoji once and cleans up after itself', (t) => {
  const { document, window, clock } = setup(t, { finePointer: true });
  const keys = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  for (const key of keys) document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  const drops = document.querySelectorAll('#fxLayer .fx-rain');
  assert.ok(drops.length > 20, 'Emoji rain falls');
  assert.equal(element(document, '#fxLayer').getAttribute('aria-hidden'), 'true');
  assert.equal(element(document, '.buddy-caption').textContent, 'Cheat code accepted! 🎮');
  clock.drain();
  assert.equal(document.querySelectorAll('#fxLayer > *').length, 0, 'Every drop is removed');
  const calm = setup(t, { reduced: true, finePointer: true });
  for (const key of keys) calm.document.dispatchEvent(new calm.window.KeyboardEvent('keydown', { key, bubbles: true }));
  assert.equal(calm.document.querySelectorAll('#fxLayer > *').length, 0, 'Reduced motion skips the rain');
});
