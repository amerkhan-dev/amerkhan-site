import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
// Exercise both production modules in one browser realm, without Vite's CSS loader.
const source = read('../src/companion.ts').replace(/\bexport\s+(?=function\s+initCompanion\b)/, '') + '\n'
  + read('../src/main.ts').replace(/^import\s+(?:\{\s*initCompanion\s*\}\s+from\s+)?['"][^'"]+['"];?\s*$/gm, '');
const script = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

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
  assert.equal(element(document, '.buddy-caption').textContent, 'Shipping things.');
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
