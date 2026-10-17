// Test di regressione frontend: campi malevoli da EasyAcademy devono risultare
// escapati nell'HTML generato da app.js. Esegue public/app.js in vm con un
// mini-stub del DOM, senza dipendenze npm.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl() {
  const listeners = {};
  const el = {
    _listeners: listeners,
    innerHTML: '',
    textContent: '',
    value: '',
    dataset: {},
    className: '',
    id: '',
    max: '1439',
    min: '0',
    onclick: null,
    classList: {
      add() {},
      remove() {},
      toggle() { return false; },
      contains() { return true; },
    },
    setAttribute() {},
    insertBefore() {},
    addEventListener(type, fn) { listeners[type] = fn; },
    closest() { return null; },
    click() {},
    scrollIntoView() {},
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    style: { setProperty() {}, left: '', top: '' },
  };
  return el;
}

test('app.js escapes malicious API fields in generated HTML', async () => {
  const els = new Map();
  const getEl = (sel) => {
    if (!els.has(sel)) els.set(sel, makeEl());
    return els.get(sel);
  };

  const EVIL = {
    name: '<img src=x onerror=alert(1)>',
    type: '<svg onload=alert(2)>',
    teachers: ['<script>alert(3)</script>'],
    capacity: '<img onerror=alert(5)>',
    roomName: '<u onclick=alert(4)>',
  };

  const payload = {
    date: '2025-01-01',
    fetchedAt: Date.now(),
    lastUpdate: null,
    rooms: { A101: { code: 'A101', name: EVIL.roomName, capacity: EVIL.capacity } },
    events: [{
      room: 'A101', from: '00:00', to: '23:59',
      name: EVIL.name, type: EVIL.type, teachers: EVIL.teachers,
      cancelled: false,
    }],
  };

  const sandbox = {
    FLOORS: [{
      id: 'f1', building: 'B', name: 'P1', viewBox: '0 0 100 100',
      outline: [], corridors: [], areas: [], texts: [], arrows: [],
      rooms: [{ code: 'A101', label: 'A101', x: 0, y: 0, w: 100, h: 60 }],
    }],
    document: {
      querySelector: getEl,
      createElement: () => makeEl(),
    },
    window: {
      innerWidth: 1024,
      innerHeight: 768,
      matchMedia: (q) => ({ matches: false }),
    },
    location: { search: '' },
    Intl,
    URLSearchParams,
    setInterval: () => 0,
    requestAnimationFrame: (fn) => fn(),
    fetch: async () => ({ ok: true, json: async () => payload }),
    console,
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'app.js' });

  // lascia completare load() (fetch stub + renderAll)
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const map = getEl('#map');
  const list = getEl('#room-list');
  const tooltip = getEl('#tooltip');
  const detail = getEl('#detail');

  // tooltip: mouseover su una stanza
  const roomG = { dataset: { code: 'A101', label: 'A101' } };
  map._listeners.mouseover({ target: { closest: () => roomG }, clientX: 0, clientY: 0 });
  // dettaglio: click sulla stanza
  map._listeners.click({ target: { closest: () => roomG } });

  const html = [map.innerHTML, list.innerHTML, tooltip.innerHTML, detail.innerHTML].join('\n');
  assert.ok(html.length > 0, 'rendered HTML produced');
  for (const raw of [EVIL.name, EVIL.type, EVIL.teachers[0], EVIL.capacity, EVIL.roomName]) {
    assert.ok(!html.includes(raw), `raw payload must not appear in HTML: ${raw}`);
  }
  // i payload devono risultare escapati (presenza della forma &lt;)
  assert.ok(html.includes('&lt;img'), 'escaped <img present');
  assert.ok(html.includes('&lt;svg'), 'escaped <svg present');
  assert.ok(html.includes('&lt;script&gt;'), 'escaped <script> present');
});

test('time controls toggle label and expanded state', async () => {
  const els = new Map();
  const getEl = (sel) => {
    if (!els.has(sel)) els.set(sel, makeEl());
    return els.get(sel);
  };
  const topbar = getEl('.topbar');
  const classes = new Set();
  topbar.classList = {
    toggle(name) {
      if (classes.has(name)) {
        classes.delete(name);
        return false;
      }
      classes.add(name);
      return true;
    },
    contains(name) { return classes.has(name); },
  };
  const ctrlToggle = makeEl();
  const attributes = new Map();
  ctrlToggle.setAttribute = (name, value) => attributes.set(name, String(value));
  const payload = { rooms: {}, events: [], lastUpdate: null };
  const sandbox = {
    FLOORS: [{
      id: 'f1', building: 'B', name: 'P1', viewBox: '0 0 100 100',
      outline: [], corridors: [], areas: [], texts: [], arrows: [], rooms: [],
    }],
    document: {
      querySelector: getEl,
      createElement: () => ctrlToggle,
    },
    window: {
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: (q) => ({ matches: q === '(max-width: 700px)' }),
    },
    location: { search: '' },
    Intl,
    URLSearchParams,
    setInterval: () => 0,
    requestAnimationFrame: (fn) => fn(),
    fetch: async () => ({ ok: true, json: async () => payload }),
    console,
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'app.js' });
  await new Promise((r) => setImmediate(r));

  const time = getEl('#time-input');
  time.value = '600';
  time._listeners.input();
  assert.ok(!ctrlToggle.textContent.endsWith('·'));

  const date = getEl('#date-input');
  date.value = '2026-04-17';
  date._listeners.change();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(ctrlToggle.textContent, '🕒 17/4 10:00');
  assert.strictEqual(attributes.get('aria-expanded'), 'false');

  ctrlToggle._listeners.click();
  assert.strictEqual(attributes.get('aria-expanded'), 'true');
  assert.strictEqual(topbar.classList.contains('show-controls'), true);

  ctrlToggle._listeners.click();
  assert.strictEqual(attributes.get('aria-expanded'), 'false');
  assert.strictEqual(topbar.classList.contains('show-controls'), false);
});

test('live map updates each minute while data refreshes hourly', async () => {
  const els = new Map();
  const getEl = (sel) => {
    if (!els.has(sel)) els.set(sel, makeEl());
    return els.get(sel);
  };
  const timers = new Map();
  const requests = [];
  let now = Date.UTC(2026, 3, 17, 8);
  const Clock = class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  const sandbox = {
    FLOORS: [{
      id: 'f1', building: 'B', name: 'P1', viewBox: '0 0 100 100',
      outline: [], corridors: [], areas: [], texts: [], arrows: [],
      rooms: [{ code: 'A101', label: 'A101', x: 0, y: 0, w: 100, h: 60 }],
    }],
    document: { querySelector: getEl, createElement: () => makeEl() },
    window: { innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: false }) },
    location: { search: '' },
    Intl,
    Date: Clock,
    URLSearchParams,
    setInterval: (fn, ms) => timers.set(ms, fn),
    fetch: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({
          rooms: { A101: { name: 'A101', capacity: 40 } },
          events: [{
            room: 'A101', from: '10:01', to: '11:00', name: 'Lezione',
            type: 'Lezione', teachers: [], cancelled: false,
          }],
        }),
      };
    },
    console,
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'app.js' });
  await new Promise((r) => setImmediate(r));

  assert.strictEqual(requests.length, 1);
  assert.match(getEl('#map').innerHTML, /class="room soon /);
  assert.ok(timers.has(60 * 1000));
  assert.ok(timers.has(60 * 60 * 1000));
  assert.strictEqual(timers.size, 2);

  now += 60 * 1000;
  timers.get(60 * 1000)();
  assert.strictEqual(requests.length, 1);
  assert.match(getEl('#map').innerHTML, /class="room busy /);

  timers.get(60 * 60 * 1000)();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(requests.length, 2);

  getEl('#time-input')._listeners.input();
  timers.get(60 * 60 * 1000)();
  assert.strictEqual(requests.length, 2);

  getEl('#date-input').value = '2026-04-16';
  getEl('#date-input')._listeners.change();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(requests.length, 3);

  getEl('#now-btn')._listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(requests.length, 4);

  now = Date.UTC(2026, 3, 17, 22);
  timers.get(60 * 1000)();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(getEl('#date-input').value, '2026-04-18');
  assert.strictEqual(requests.length, 5);
});
