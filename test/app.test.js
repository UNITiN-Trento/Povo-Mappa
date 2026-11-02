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
      addEventListener() {},
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
      addEventListener() {},
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
    document: { querySelector: getEl, createElement: () => makeEl(), addEventListener() {} },
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

test('palette toggle persists colorblind mode in localStorage', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const run = (storage) => {
    const els = new Map();
    const getEl = (sel) => {
      if (!els.has(sel)) els.set(sel, makeEl());
      return els.get(sel);
    };

    const classes = new Set();
    getEl('html').classList = {
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains(name) { return classes.has(name); },
    };

    const attributes = new Map();
    getEl('#palette-btn').setAttribute = (name, value) => attributes.set(name, String(value));

    const localStorage = {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    };

    const sandbox = {
      FLOORS: [{
        id: 'f1', building: 'B', name: 'P1', viewBox: '0 0 100 100',
        outline: [], corridors: [], areas: [], texts: [], arrows: [], rooms: [],
      }],
      document: {
        querySelector: getEl,
        createElement: () => makeEl(),
        addEventListener() {},
      },
      window: {
        innerWidth: 1024,
        innerHeight: 768,
        matchMedia: () => ({ matches: false }),
      },
      location: { search: '' },
      Intl,
      URLSearchParams,
      setInterval: () => 0,
      requestAnimationFrame: (fn) => fn(),
      fetch: async () => ({ ok: true, json: async () => ({ rooms: {}, events: [], lastUpdate: null }) }),
      localStorage,
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'app.js' });
    return { getEl, attributes };
  };

  // a. storage vuota: niente classe 'cb', aria-pressed 'false'
  const storage = new Map();
  const { getEl, attributes } = run(storage);
  assert.strictEqual(getEl('html').classList.contains('cb'), false);
  assert.strictEqual(attributes.get('aria-pressed'), 'false');

  // b. un click attiva la palette daltonica e la salva
  getEl('#palette-btn')._listeners.click();
  assert.strictEqual(getEl('html').classList.contains('cb'), true);
  assert.strictEqual(attributes.get('aria-pressed'), 'true');
  assert.strictEqual(storage.get('povo-palette'), 'cb');

  // c. secondo click: torna standard e la chiave viene rimossa
  getEl('#palette-btn')._listeners.click();
  assert.strictEqual(getEl('html').classList.contains('cb'), false);
  assert.strictEqual(attributes.get('aria-pressed'), 'false');
  assert.strictEqual(storage.has('povo-palette'), false);

  // d. storage pre-seed con 'cb': all'avvio la palette e' attiva
  const seeded = new Map([['povo-palette', 'cb']]);
  const fresh = run(seeded);
  assert.strictEqual(fresh.getEl('html').classList.contains('cb'), true);
  assert.strictEqual(fresh.attributes.get('aria-pressed'), 'true');
});

test('manual time choice expires back to live after 30 minutes', async () => {
  const els = new Map();
  const getEl = (sel) => {
    if (!els.has(sel)) els.set(sel, makeEl());
    return els.get(sel);
  };
  const timers = new Map();
  const requests = [];
  const docListeners = {};
  let now = Date.UTC(2026, 3, 17, 8);
  const Clock = class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  const nowClasses = new Set();
  getEl('#now-btn').classList = {
    add(name) { nowClasses.add(name); },
    remove(name) { nowClasses.delete(name); },
    toggle(name, force) {
      const on = force === undefined ? !nowClasses.has(name) : Boolean(force);
      if (on) nowClasses.add(name); else nowClasses.delete(name);
      return on;
    },
    contains(name) { return nowClasses.has(name); },
  };
  const documentStub = {
    querySelector: getEl,
    createElement: () => makeEl(),
    visibilityState: 'hidden',
    addEventListener(type, fn) { docListeners[type] = fn; },
  };
  const sandbox = {
    FLOORS: [{
      id: 'f1', building: 'B', name: 'P1', viewBox: '0 0 100 100',
      outline: [], corridors: [], areas: [], texts: [], arrows: [], rooms: [],
    }],
    document: documentStub,
    window: { innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: false }) },
    location: { search: '' },
    Intl,
    Date: Clock,
    URLSearchParams,
    setInterval: (fn, ms) => timers.set(ms, fn),
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ rooms: {}, events: [], lastUpdate: null }) };
    },
    console,
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'app.js' });
  await new Promise((r) => setImmediate(r));

  const time = getEl('#time-input');
  const label = getEl('#time-label');

  // a. scelta manuale: il label perde '(adesso)'
  time.value = '600';
  time._listeners.input();
  assert.ok(!label.textContent.includes('(adesso)'));

  // b. a 29 minuti dalla scelta il tick lascia tutto com'e'
  now += 29 * 60 * 1000;
  timers.get(60 * 1000)();
  assert.ok(!label.textContent.includes('(adesso)'));

  // c. a 31 minuti il tick riporta live: '(adesso)' + now-btn 'on'
  now += 2 * 60 * 1000;
  timers.get(60 * 1000)();
  assert.ok(label.textContent.endsWith('(adesso)'));
  assert.strictEqual(nowClasses.has('on'), true);

  // d. nuova scelta manuale, +31 min senza tick: al ritorno visible scade
  time._listeners.input();
  now += 31 * 60 * 1000;
  documentStub.visibilityState = 'visible';
  docListeners.visibilitychange();
  assert.ok(label.textContent.endsWith('(adesso)'));

  // e. cambio data, +31 min: il tick riporta live e ricarica la data di oggi
  const date = getEl('#date-input');
  date.value = '2026-04-18';
  date._listeners.change();
  now += 31 * 60 * 1000;
  timers.get(60 * 1000)();
  await new Promise((r) => setImmediate(r));
  assert.ok(label.textContent.endsWith('(adesso)'));
  assert.ok(requests.at(-1).includes('date=2026-04-17'));
});
