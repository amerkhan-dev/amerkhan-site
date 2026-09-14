import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const script = ts.transpileModule(source.replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function fakeClock(window) {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
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
    next,
    pending: () => pending.size,
    drain() {
      let count = 0;
      while (next()) assert.ok(++count < 1000, 'The interface must not schedule an endless animation');
    },
  };
}

function mediaQueries(window, initiallyReduced) {
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

function setup(t, { javascript = true, reduced = false, remove } = {}) {
  const dom = new JSDOM(html, { url: 'https://amerkhan.vercel.app/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
  const clock = fakeClock(window);
  const media = mediaQueries(window, reduced);
  if (remove) window.document.querySelector(remove)?.remove();
  if (javascript) window.eval(script);
  return { window, document: window.document, clock, media };
}

function element(document, selector) {
  const result = document.querySelector(selector);
  assert.ok(result, `Expected ${selector} in the page`);
  return result;
}

function demoSnapshot(document) {
  const demo = element(document, '#recovery-demo');
  return {
    state: demo.dataset.state,
    running: demo.dataset.running,
    title: element(document, '#demo-title').textContent,
    caption: element(document, '#demo-caption').textContent,
    status: element(document, '#demo-status').textContent,
    payments: element(document, '#demo-payment-count').textContent,
  };
}

test('served HTML contains final facts and readable disclosure content without JavaScript', (t) => {
  const { document } = setup(t, { javascript: false });
  const text = document.body.textContent.replace(/\s+/g, ' ');
  for (const value of ['3.94', '50+', '2,000+', '45+', '300+', '20,000', '200+']) {
    assert.ok(text.includes(value), `The verified value ${value} must be present in HTML`);
  }
  assert.match(text, /\$(?:15,000|15K)/);
  assert.doesNotMatch(text, /0\.00\s*GPA/);
  assert.equal(document.querySelectorAll('[data-count], .reveal').length, 0,
    'Facts and sections must not depend on count-up or scroll-reveal initialization');
  const buttons = [...document.querySelectorAll('.disclosure-toggle[aria-controls]')];
  assert.ok(buttons.length >= 8, 'Experience roles and the Belay case study should have details');
  const ids = buttons.map((button) => button.getAttribute('aria-controls'));
  assert.equal(new Set(ids).size, ids.length, 'Disclosure panel IDs must be unique');
  for (const button of buttons) {
    assert.equal(button.tagName, 'BUTTON');
    assert.ok(button.hidden, 'A button requiring JavaScript starts hidden');
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    assert.ok(panel, 'Every disclosure control has a real panel');
    assert.ok(!panel.closest('[hidden], [aria-hidden="true"]'), 'Details are readable without JavaScript');
    assert.ok(panel.textContent.trim().length > 40, 'Details must exist in HTML, not be injected');
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

test('recovery completes with one payment and no continuing timer loop', (t) => {
  const { document, clock } = setup(t);
  element(document, '#demo-run').click();
  clock.drain();
  const demo = element(document, '#recovery-demo');
  assert.equal(demo.dataset.state, 'recovery');
  assert.equal(demo.dataset.running, 'false');
  assert.equal(element(document, '#demo-payment-count').textContent.trim(), '1');
  assert.equal(clock.pending(), 0);
});

test('reset cancels an in-flight demonstration, so delayed work cannot change its state', (t) => {
  const { document, clock } = setup(t);
  const demo = element(document, '#recovery-demo');
  element(document, '#demo-run').click();
  for (let transitions = 0; demo.dataset.state !== 'payment'; transitions++) {
    assert.ok(transitions < 20 && clock.next(), 'The demonstration should reach its payment step');
  }
  assert.equal(element(document, '#demo-payment-count').textContent.trim(), '1');
  element(document, '#demo-reset').click();
  const reset = demoSnapshot(document);
  assert.equal(reset.state, 'ready');
  assert.equal(reset.running, 'false');
  assert.equal(clock.pending(), 0, 'Reset must cancel pending demonstration work');
  clock.drain();
  assert.deepEqual(demoSnapshot(document), reset, 'No late update may overwrite the reset state');
});

test('reduced motion shows recovery immediately without scheduling an animation', (t) => {
  const { document, clock } = setup(t, { reduced: true });
  element(document, '#demo-run').click();
  assert.equal(element(document, '#recovery-demo').dataset.state, 'recovery');
  assert.equal(element(document, '#recovery-demo').dataset.running, 'false');
  assert.equal(element(document, '#demo-payment-count').textContent.trim(), '1');
  assert.equal(clock.pending(), 0);
});

test('enabling reduced motion mid-run stops animation and preserves one payment', (t) => {
  const { document, clock, media } = setup(t);
  element(document, '#demo-run').click();
  media.reduce();
  assert.equal(element(document, '#recovery-demo').dataset.state, 'recovery');
  assert.equal(element(document, '#demo-payment-count').textContent.trim(), '1');
  assert.equal(clock.pending(), 0);
  const completed = demoSnapshot(document);
  clock.drain();
  assert.deepEqual(demoSnapshot(document), completed);
});

test('missing optional demo markup does not break navigation or role details', (t) => {
  const { document } = setup(t, { remove: '#demo-status' });
  const button = element(document, '.disclosure-toggle');
  assert.equal(button.hidden, false);
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  const nav = element(document, '#nav-toggle');
  nav.click();
  assert.equal(nav.getAttribute('aria-expanded'), 'true');
});
