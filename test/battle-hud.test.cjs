const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Battle Slot HUD - module logic, rendering, and lifecycle', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'battle-hud.js'), 'utf8');

  // Create mock DOM environment
  const store = {};
  const mockLocalStorage = {
    getItem: k => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.classList = {
        _set: new Set(),
        add: (...cs) => cs.forEach(c => this.classList._set.add(c)),
        remove: (...cs) => cs.forEach(c => this.classList._set.delete(c)),
        toggle: (c, force) => {
          if (force === undefined) {
            if (this.classList._set.has(c)) this.classList._set.delete(c);
            else this.classList._set.add(c);
          } else if (force) this.classList._set.add(c);
          else this.classList._set.delete(c);
        },
        contains: c => this.classList._set.has(c)
      };
      this.attributes = {};
      this.children = [];
      this.textContent = '';
      this.style = {};
      this.src = '';
    }
    set className(val) {
      this._className = val;
      this.classList._set.clear();
      String(val || '').split(/\s+/).filter(Boolean).forEach(c => this.classList._set.add(c));
    }
    get className() { return this._className || ''; }
    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      const stack = [this];
      const re = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const full = m[0];
        const tag = m[1].toLowerCase();
        const attrs = m[2] || '';
        const isClosing = full.startsWith('</');
        const isSelfClosing = full.endsWith('/>') || ['img', 'br', 'hr', 'input', 'path'].includes(tag);

        if (isClosing) {
          if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tag) {
            stack.pop();
          }
        } else {
          const el = new MockElement(tag);
          const classMatch = attrs.match(/class=["']([^"']+)["']/);
          if (classMatch) {
            el.className = classMatch[1];
          }
          const idMatch = attrs.match(/id=["']([^"']+)["']/);
          if (idMatch) {
            el.id = idMatch[1];
          }
          const titleMatch = attrs.match(/title=["']([^"']+)["']/);
          if (titleMatch) {
            el.setAttribute('title', titleMatch[1]);
          }
          stack[stack.length - 1].children.push(el);
          if (!isSelfClosing) {
            stack.push(el);
          }
        }
      }
    }
    get innerHTML() { return this._innerHTML || ''; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }
    appendChild(child) { this.children.push(child); return child; }
    insertBefore(newChild, refChild) {
      const idx = this.children.indexOf(refChild);
      if (idx >= 0) this.children.splice(idx, 0, newChild);
      else this.children.push(newChild);
      return newChild;
    }
    querySelector(selector) {
      const clean = selector.replace(/^[.#]/, '');
      const find = el => {
        if (selector.startsWith('.') && el.classList.contains(clean)) return el;
        if (selector.startsWith('#') && el.id === clean) return el;
        if (selector === el.tagName?.toLowerCase()) return el;
        for (const c of el.children) {
          const res = find(c);
          if (res) return res;
        }
        return null;
      };
      return find(this);
    }
  }

  const mockDocument = {
    createElement: tag => new MockElement(tag),
    getElementById: id => (id === 'grid' ? mockGrid : null)
  };

  const mockGrid = new MockElement('div');
  mockGrid.id = 'grid';

  const context = {
    window: {
      PIW_ALL_POKEMON_THEMES: [
        { name: 'Squirtle', dex: 7, id: 'pkmn-squirtle' },
        { name: 'Vulpix', dex: 37, id: 'pkmn-vulpix' }
      ]
    },
    document: mockDocument,
    localStorage: mockLocalStorage,
    console
  };
  const socialEvents = {};
  context.window.pokeAPI = {
    onKickPoints: cb => { socialEvents.points = cb; },
    onKickStatus: cb => { socialEvents.kick = cb; }
  };
  context.window.window = context.window;
  context.window.document = mockDocument;
  context.window.localStorage = mockLocalStorage;

  vm.createContext(context);
  vm.runInContext(code, context);

  const PioBattleHud = context.window.PioBattleHud;
  assert.ok(PioBattleHud, 'PioBattleHud must be exposed on window');

  // Test 1: Mounting in panel
  const panel = new MockElement('div');
  panel.className = 'panel';
  const header = new MockElement('div');
  header.className = 'panel-header';
  const reloadBtn = new MockElement('button');
  reloadBtn.className = 'reload';
  header.appendChild(reloadBtn);
  panel.appendChild(header);

  mockGrid.appendChild(panel);

  PioBattleHud.mount(panel, 0);

  const hudEl = panel.querySelector('.battle-slot-hud');
  assert.ok(hudEl, 'HUD element must be appended into panel');

  const ecoBtn = header.querySelector('.btn-eco-hud');
  assert.ok(ecoBtn, 'Toggle button must be inserted in panel-header');

  // Test 2: Toggling HUD
  assert.equal(PioBattleHud.isHudActive(0), false);
  PioBattleHud.setHudActive(0, true);
  assert.equal(PioBattleHud.isHudActive(0), true);
  assert.equal(panel.classList.contains('is-hud-active'), true);
  assert.equal(ecoBtn.classList.contains('is-on'), true);
  assert.equal(ecoBtn.getAttribute('aria-pressed'), 'true');

  // Test 3: Updating State (Metrics & Sprites)
  const fakeState = {
    i: 0,
    hunt: 'vulpix',
    balls: 2063,
    equippedBall: { name: 'Pokeball', infinite: false },
    team: [
      { sid: 7, name: 'Squirtle', level: 25, ld: true, shiny: false }
    ],
    invMap: {
      70000: 5,
      70011: 0,
      70013: 10,
      70012: 1
    },
    rawDrops: {
      70000: { id: 70000, name: 'Bronze Boss Token', qty: 2 },
      70012: { id: 70012, name: 'Shiny Stone Fragment', qty: 1 }
    },
    a: {
      seconds: 6,
      xph: 45000,
      shinyCap: 2,
      shinyFound: 2
    }
  };

  PioBattleHud.update(panel, 0, fakeState);

  const timeEl = hudEl.querySelector('.bsh-val-time');
  assert.equal(timeEl.textContent, '0h 00m 06s');

  const leadNameEl = hudEl.querySelector('.bsh-lead-name');
  assert.equal(leadNameEl.textContent, 'Squirtle Lv 25');

  const huntNameEl = hudEl.querySelector('.bsh-hunt-name');
  assert.equal(huntNameEl.textContent, 'Vulpix');

  const leadSprite = hudEl.querySelector('.bsh-lead-sprite');
  assert.ok(leadSprite.getAttribute('data-src').includes('7.gif'), 'Lead sprite must resolve to Squirtle gif');

  const huntSprite = hudEl.querySelector('.bsh-hunt-sprite');
  assert.ok(huntSprite.getAttribute('data-src').includes('37.gif'), 'Hunt sprite must resolve to Vulpix gif');

  // Verify Important Drops widget
  const dropsContainer = hudEl.querySelector('.bsh-important-drops');
  assert.ok(dropsContainer, 'Important drops container must be mounted in HUD');

  const bossTokenCard = hudEl.querySelector('.bsh-drop-boss_token');
  assert.ok(bossTokenCard, 'Boss Token card must exist');
  assert.equal(bossTokenCard.querySelector('.bsh-drop-qty').textContent, 'x3', 'Boss Token initial count must be 5 - 2 = 3');
  assert.equal(bossTokenCard.querySelector('.bsh-drop-badge').textContent, '+2', 'Boss Token badge must show +2 drops');
  assert.equal(bossTokenCard.querySelector('.bsh-drop-badge').style.display, 'inline-flex', 'Badge must be visible when drops > 0');

  const fragChaveCard = hudEl.querySelector('.bsh-drop-frag_chave');
  assert.ok(fragChaveCard, 'Key fragment card must exist');
  assert.equal(fragChaveCard.querySelector('.bsh-drop-qty').textContent, 'x0', 'Key fragment count must be x0');
  assert.equal(fragChaveCard.querySelector('.bsh-drop-badge').style.display, 'none', 'Badge must be hidden when 0 drops');

  const fragBikeCard = hudEl.querySelector('.bsh-drop-frag_bike');
  assert.ok(fragBikeCard, 'Bike fragment card must exist');
  assert.equal(fragBikeCard.querySelector('.bsh-drop-qty').textContent, 'x10', 'Bike fragment count must be x10');
  assert.equal(fragBikeCard.querySelector('.bsh-drop-badge').style.display, 'none', 'Badge must be hidden when 0 drops');

  const shinyStoneCard = hudEl.querySelector('.bsh-drop-shiny_stone');
  assert.ok(shinyStoneCard, 'Shiny stone card must exist');
  assert.equal(shinyStoneCard.querySelector('.bsh-drop-qty').textContent, 'x0', 'Shiny stone initial count must be 1 - 1 = 0');
  assert.equal(shinyStoneCard.querySelector('.bsh-drop-badge').textContent, '+1', 'Shiny stone badge must show +1 drops');
  assert.equal(shinyStoneCard.querySelector('.bsh-drop-badge').style.display, 'inline-flex', 'Badge must be visible for shiny stone drop');

  // Test 4: Pause animation toggle
  const pauseBtn = hudEl.querySelector('.bsh-pause-btn');
  assert.equal(PioBattleHud.isPaused(0), false);
  pauseBtn.onclick();
  assert.equal(PioBattleHud.isPaused(0), true);
  assert.equal(pauseBtn.textContent, 'Retomar animação');

  // Re-updating while paused switches to png
  PioBattleHud.update(panel, 0, fakeState);
  assert.ok(leadSprite.getAttribute('data-src').includes('7.png'), 'Paused lead sprite must be PNG');

  // Test 5: Open game button turns off HUD
  const openBtn = hudEl.querySelector('.bsh-open-game-btn');
  openBtn.onclick();
  assert.equal(PioBattleHud.isHudActive(0), false);
  assert.equal(panel.classList.contains('is-hud-active'), false);
  assert.equal(ecoBtn.getAttribute('aria-pressed'), 'false');

  // Test 6: Master Blaster mode
  const blasterBtn = header.querySelector('.btn-blaster-hud');
  assert.ok(blasterBtn, 'Master Blaster button must be mounted in panel header');
  assert.equal(PioBattleHud.isBlasterActive(0), false);

  PioBattleHud.setBlasterActive(0, true);
  assert.equal(PioBattleHud.isBlasterActive(0), true);
  assert.equal(PioBattleHud.isHudActive(0), true);
  assert.equal(panel.classList.contains('is-blaster-active'), true);
  assert.equal(panel.classList.contains('is-hud-active'), true);
  assert.equal(blasterBtn.classList.contains('is-on'), true);

  const banner = hudEl.querySelector('.bsh-mode-banner');
  assert.ok(banner.textContent.includes('Headless'), 'Banner must indicate Master Blaster mode');

  const tierEl = hudEl.querySelector('.bsh-outland-tier');
  PioBattleHud.update(panel, 0, {...fakeState, live: true, outlandTier: 2});
  assert.equal(tierEl.textContent, 'Outland · tier 2');
  assert.equal(tierEl.hidden, false);
  PioBattleHud.update(panel, 0, {...fakeState, live: false, outlandTier: 2});
  assert.equal(tierEl.textContent, 'Outland · aguardando confirmação');
  for (const outlandTier of [undefined, null, 0, '2']) {
    PioBattleHud.update(panel, 0, {...fakeState, live: true, outlandTier});
    assert.equal(tierEl.textContent, 'Outland · aguardando confirmação');
  }
  PioBattleHud.update(panel, 0, {...fakeState, live: true, outlandTier: 3});
  assert.equal(tierEl.textContent, 'Outland · tier 3');

  PioBattleHud.setBlasterActive(0, false);
  assert.equal(PioBattleHud.isBlasterActive(0), false);
  PioBattleHud.update(panel, 0, {...fakeState, live: true, outlandTier: 2});
  assert.equal(tierEl.hidden, true);
  assert.equal(panel.classList.contains('is-blaster-active'), false);

  // Test 7: Kick Bonus display and countdown
  const kickBonusEl = hudEl.querySelector('.bsh-kick-bonus');
  assert.ok(kickBonusEl, 'Kick bonus element must exist');

  const stateWithKick = {
    ...fakeState,
    kick: {
      bonusExp: 1,
      bonusQty: 2,
      bonusTime: '48m'
    }
  };
  PioBattleHud.update(panel, 0, stateWithKick);
  // O buff não mostra "2x" no nome porque a porcentagem não stacka (+15% permanece +15%)
  assert.equal(kickBonusEl.textContent, 'EXP +15% · 48m');
  assert.equal(kickBonusEl.classList.contains('is-bonus-active'), true);

  // Test 8: formatKickBonus unit scenarios
  assert.equal(typeof PioBattleHud.formatKickBonus, 'function', 'formatKickBonus must be exposed');

  // No bonus
  const emptyBonus = PioBattleHud.formatKickBonus(null, null);
  assert.equal(emptyBonus.text, 'Sem bônus');
  assert.equal(emptyBonus.active, false);

  // Kick redemption active via account (55m restantes)
  const accountWithRedeem = {
    activeRedemption: {
      channel: 'souonailo',
      reward: { key: 'exp', title: '+15% EXP' },
      at: Date.now() - 300000, // 5 min ago
      duration: 3600
    }
  };
  const redeemBonus = PioBattleHud.formatKickBonus(null, accountWithRedeem);
  assert.equal(redeemBonus.active, true);
  assert.ok(redeemBonus.text.startsWith('EXP +15% · 5'), `Expected ~55m countdown, got: ${redeemBonus.text}`);
  assert.ok(redeemBonus.details.includes('@souonailo'));

  // Acúmulo de tempo: 2x 15% (2 horas)
  const stacked2xBonus = PioBattleHud.formatKickBonus({ bonusExp: 1, bonusQty: 2, bonusTime: '1h' }, null);
  assert.equal(stacked2xBonus.active, true);
  assert.equal(stacked2xBonus.text, 'EXP +15% · 2h 00m');

  // Acúmulo de tempo: tempo restante anterior + 1 hora via expiresAt (ex: 30m restantes + 1h = 1h 30m)
  const stackedTimeAccount = {
    activeRedemption: {
      channel: 'souonailo',
      reward: { key: 'exp', title: '+15% EXP' },
      expiresAt: Date.now() + 5400000 // 90 min (1h 30m)
    }
  };
  const stackedTimeBonus = PioBattleHud.formatKickBonus(null, stackedTimeAccount);
  assert.equal(stackedTimeBonus.active, true);
  assert.equal(stackedTimeBonus.text, 'EXP +15% · 1h 30m');

  // Catch bonus com tempo restante 1h 05m
  const catchBonus = PioBattleHud.formatKickBonus({ bonusCatch: 1, bonusQty: 3, bonusTime: '1h 05m' }, null);
  assert.equal(catchBonus.active, true);
  assert.equal(catchBonus.text, 'Captura +15% · 1h 05m');

  // Polling keeps the confirmed buff visible without replacing its DOM text.
  PioBattleHud.update(panel, 0, { ...fakeState, kick: null });
  socialEvents.kick({ accounts: [{ status: 'authenticated' }] });
  const expiresAt = Date.now() + 5430000;
  const confirmed = { status: 'authenticated', activeRedemption: {
    status: 'confirmed', reward: { key: 'exp' }, expiresAt
  } };
  socialEvents.points({ accounts: [confirmed] });
  const bonusBeforePoll = kickBonusEl.textContent;
  let bonusWrites = 0;
  Object.defineProperty(kickBonusEl, 'textContent', {
    configurable: true,
    get: () => bonusBeforePoll,
    set: () => { bonusWrites++; }
  });
  socialEvents.points({ accounts: [{ ...confirmed, refreshing: true }] });
  PioBattleHud.updateSocial(panel, 0);
  socialEvents.points({ accounts: [{ ...confirmed, refreshing: false }] });
  assert.equal(bonusWrites, 0, 'Unchanged countdown must not recreate the text node');
  assert.equal(hudEl.querySelector('.bsh-kick-status').textContent, 'Sessão confirmada');
  assert.ok(kickBonusEl.textContent.startsWith('EXP +15%'));
  delete kickBonusEl.textContent;
  socialEvents.points({ accounts: [{ ...confirmed, activeRedemption: {
    ...confirmed.activeRedemption, expiresAt: Date.now() - 1
  } }] });
  assert.equal(kickBonusEl.textContent, 'Sem bônus', 'Expired buffs must disappear even without another balance request');
  const twitchBonusEl = hudEl.querySelector('.bsh-twitch-bonus');
  PioBattleHud.update(panel, 0, { ...fakeState, twitch: {
    login: 'viewer', pctAtual: 20, assistindo: true,
    bonus: { xp: Date.now() + 3599000, captura: Date.now() + 1199000, shiny: 0 }
  } });
  assert.equal(twitchBonusEl.textContent, 'EXP +15% · 1h 00m · Captura +15% · 20m');
  assert.ok(twitchBonusEl.classList.contains('is-bonus-active'));
  PioBattleHud.update(panel, 0, { ...fakeState, twitch: {
    login: 'viewer', pctAtual: 20, assistindo: true,
    bonus: { xp: Date.now() - 1, captura: 0, shiny: 0 }
  } });
  assert.equal(twitchBonusEl.textContent, 'Sem bônus', 'Legacy chat percentage cannot keep expired Twitch point buffs active');
  assert.ok(!twitchBonusEl.classList.contains('is-bonus-active'));
});

test('drop telemetry counts serialized name and ID aliases once in both HUD copies', () => {
  for (const relativePath of ['src/ui/battle-hud.js', 'rust-migration/ui/src/ui/battle-hud.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    const context = {
      window: {}, document: { getElementById: () => null },
      localStorage: { getItem: () => null, setItem: () => {} }, console
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(code, context);
    const hud = context.window.PioBattleHud;
    const bossToken = hud.IMPORTANT_DROPS.find(item => item.key === 'boss_token');
    const bikeFragment = hud.IMPORTANT_DROPS.find(item => item.key === 'frag_bike');
    const serialized = JSON.parse(JSON.stringify({
      invMap: { 70000: 26 },
      rawDrops: {
        'Bronze Boss Token': { id: 70000, name: 'Bronze Boss Token', qty: 20 },
        '70000': { id: 70000, name: 'Bronze Boss Token', qty: 20 }
      }, sessStart: 1000
    }));
    assert.deepEqual({ ...hud.resolveItemTelemetry(bossToken, serialized, 41) },
      { initial: 6, runDrops: 20, current: 26 });

    const bikeState = JSON.parse(JSON.stringify({ invMap: { 70013: 1 }, rawDrops: { 70013: { id: 70013, name: 'Fragmento de Bicicleta', qty: 2 } }, sessStart: 2000 }));
    assert.equal(hud.resolveItemTelemetry(bikeFragment, bikeState, 42).runDrops, 2);

    const nameOnly = { rawDrops: { 'Bronze Boss Token': 3 }, sessStart: 3000 };
    assert.equal(hud.resolveItemTelemetry(bossToken, nameOnly, 43).runDrops, 3);
    const listFallback = { drops: [{ id: 70000, qty: 4 }], sessStart: 4000 };
    assert.equal(hud.resolveItemTelemetry(bossToken, listFallback, 44).runDrops, 4);

    const shiny = hud.IMPORTANT_DROPS.find(item => item.key === 'shiny_stone');
    const distinctIds = { rawDrops: { 70012: { id: 70012, name: 'Shiny Stone', qty: 2 }, 60598: { id: 60598, name: 'Shiny Stone', qty: 3 } }, sessStart: 5000 };
    assert.equal(hud.resolveItemTelemetry(shiny, distinctIds, 45).runDrops, 5);

    const distinctNameOnly = { rawDrops: {
      'Shiny Stone': { name: 'Shiny Stone', qty: 2 },
      'Fragmento de Shiny Stone': { name: 'Fragmento de Shiny Stone', qty: 3 }
    }, sessStart: 6000 };
    assert.equal(hud.resolveItemTelemetry(shiny, distinctNameOnly, 46).runDrops, 5);

    const numericKeyWithoutId = { rawDrops: { 70000: { qty: 3 } }, sessStart: 7000 };
    assert.equal(hud.resolveItemTelemetry(bossToken, numericKeyWithoutId, 47).runDrops, 3);
    const nullEntryWithNumericKey = { rawDrops: { 70000: null }, sessStart: 8000 };
    assert.equal(hud.resolveItemTelemetry(bossToken, nullEntryWithNumericKey, 48).runDrops, 0);

    const bikeAliases = { invMap: { 70013: 1 }, rawDrops: {
      'Fragmento de Bicicleta': { name: 'Fragmento de Bicicleta', qty: 1 },
      70013: { id: 70013, name: 'Fragmento de Bicicleta', qty: 1 }
    }, sessStart: 9000 };
    assert.equal(hud.resolveItemTelemetry(bikeFragment, bikeAliases, 49).runDrops, 1);
    bikeAliases.invMap[70013] = 0;
    assert.equal(hud.resolveItemTelemetry(bikeFragment, bikeAliases, 49).runDrops, 1);
  }
});

test('independent Kick and Twitch points fields, 0 vs missing vs stale, and 4-account isolation in both HUD copies', () => {
  for (const relativePath of ['src/ui/battle-hud.js', 'rust-migration/ui/src/ui/battle-hud.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

    const store = {};
    const mockLocalStorage = {
      getItem: k => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    };

    class MockElement {
      constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.classList = {
          _set: new Set(),
          add: (...cs) => cs.forEach(c => this.classList._set.add(c)),
          remove: (...cs) => cs.forEach(c => this.classList._set.delete(c)),
          toggle: (c, force) => {
            if (force === undefined) {
              if (this.classList._set.has(c)) this.classList._set.delete(c);
              else this.classList._set.add(c);
            } else if (force) this.classList._set.add(c);
            else this.classList._set.delete(c);
          },
          contains: c => this.classList._set.has(c)
        };
        this.attributes = {};
        this.children = [];
        this.textContent = '';
        this.style = {};
        this.src = '';
      }
      set className(val) {
        this._className = val;
        this.classList._set.clear();
        String(val || '').split(/\s+/).filter(Boolean).forEach(c => this.classList._set.add(c));
      }
      get className() { return this._className || ''; }
      set innerHTML(html) {
        this._innerHTML = html;
        this.children = [];
        const stack = [this];
        const re = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
        let m;
        let lastIdx = 0;
        while ((m = re.exec(html)) !== null) {
          const text = html.slice(lastIdx, m.index).trim();
          if (text && stack.length > 0 && !stack[stack.length - 1].textContent) {
            stack[stack.length - 1].textContent = text;
          }
          lastIdx = re.lastIndex;
          const full = m[0];
          const tag = m[1].toLowerCase();
          const attrs = m[2] || '';
          const isClosing = full.startsWith('</');
          const isSelfClosing = full.endsWith('/>') || ['img', 'br', 'hr', 'input', 'path'].includes(tag);

          if (isClosing) {
            if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tag) {
              stack.pop();
            }
          } else {
            const el = new MockElement(tag);
            const classMatch = attrs.match(/class=["']([^"']+)["']/);
            if (classMatch) {
              el.className = classMatch[1];
            }
            const idMatch = attrs.match(/id=["']([^"']+)["']/);
            if (idMatch) {
              el.id = idMatch[1];
            }
            const titleMatch = attrs.match(/title=["']([^"']+)["']/);
            if (titleMatch) {
              el.setAttribute('title', titleMatch[1]);
            }
            stack[stack.length - 1].children.push(el);
            if (!isSelfClosing) {
              stack.push(el);
            }
          }
        }
      }
      get innerHTML() { return this._innerHTML || ''; }
      setAttribute(k, v) { this.attributes[k] = String(v); }
      getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
      hasAttribute(k) { return this.attributes[k] !== undefined; }
      appendChild(child) { this.children.push(child); return child; }
      insertBefore(newChild, refChild) {
        const idx = this.children.indexOf(refChild);
        if (idx >= 0) this.children.splice(idx, 0, newChild);
        else this.children.push(newChild);
        return newChild;
      }
      querySelector(selector) {
        const clean = selector.replace(/^[.#]/, '');
        const find = el => {
          if (selector.startsWith('.') && el.classList.contains(clean)) return el;
          if (selector.startsWith('#') && el.id === clean) return el;
          if (selector === el.tagName?.toLowerCase()) return el;
          for (const c of el.children) {
            const res = find(c);
            if (res) return res;
          }
          return null;
        };
        return find(this);
      }
    }

    const mockGrid = new MockElement('div');
    mockGrid.id = 'grid';

    const panels = [0, 1, 2, 3].map(idx => {
      const p = new MockElement('div');
      p.className = 'panel';
      p.setAttribute('data-account', String(idx));
      mockGrid.appendChild(p);
      return p;
    });

    const mockDocument = {
      createElement: tag => new MockElement(tag),
      getElementById: id => (id === 'grid' ? mockGrid : null)
    };

    const listeners = {};
    const context = {
      window: {
        PIW_ALL_POKEMON_THEMES: []
      },
      document: mockDocument,
      localStorage: mockLocalStorage,
      console
    };
    context.window.window = context.window;
    context.window.document = mockDocument;
    context.window.localStorage = mockLocalStorage;
    context.window.PioInventory = { project: s => s };
    context.window.pokeAPI = {
      onKickPoints: cb => { listeners.kickPoints = cb; },
      onTwitchPoints: cb => { listeners.twitchPoints = cb; },
      onKickStatus: cb => { listeners.kickStatus = cb; },
      onTwitchStatus: cb => { listeners.twitchStatus = cb; },
      onTwitchChatStatus: cb => { listeners.twitchChatStatus = cb; }
    };

    vm.createContext(context);
    vm.runInContext(code, context);

    const hud = context.window.PioBattleHud;
    assert.ok(hud, `PioBattleHud must be exposed on window in ${relativePath}`);

    // Mount HUD in all 4 panels
    for (let i = 0; i < 4; i++) {
      hud.mount(panels[i], i);
    }

    // Verify initial structure and explicit labels in Panel 0
    const p0Hud = panels[0].querySelector('.battle-slot-hud');
    assert.ok(p0Hud, 'HUD must be mounted in panel 0');
    assert.equal(p0Hud.querySelector('.bsh-social-wallet'), null);
    for (const platform of ['kick', 'twitch']) {
      const section = p0Hud.querySelector('.bsh-social-' + platform);
      assert.ok(section.querySelector('.bsh-social-heading').querySelector('.bsh-' + platform + '-points'));
    }

    // Both should initially show unconfirmed status
    const kickPoints0 = p0Hud.querySelector('.bsh-kick-points');
    const kickLegacy0 = p0Hud.querySelector('.bsh-social-points');
    assert.equal(kickPoints0, kickLegacy0, 'bsh-social-points must point to Kick points for backward compatibility');
    assert.equal(kickPoints0.textContent, 'Pontos —');
    assert.equal(p0Hud.querySelector('.bsh-kick-channels').textContent, 'Sem saldo confirmado');

    const twitchPoints0 = p0Hud.querySelector('.bsh-twitch-points');
    assert.equal(twitchPoints0.textContent, 'Pontos —');
    assert.equal(p0Hud.querySelector('.bsh-twitch-channels').textContent, 'Sem saldo confirmado');

    // The game's official list, rather than point lookups, authorizes visible channels.
    const authorized = (...logins) => logins.map(login => ({login, ativo: true}));
    hud.update(panels[0], 0, {twitch: {oficiais: authorized('souonailo')},kick: {oficiais: authorized('biscoitao')}});
    hud.update(panels[1], 1, {twitch: {oficiais: authorized('oldstream','futurestream')},kick: {oficiais: authorized('biscoitao')}});
    hud.update(panels[2], 2, {twitch: {oficiais: []},kick: {oficiais: authorized('live_a','live_b')}});

    // 1. Independent subscription: update Twitch points for Account 0 only
    listeners.twitchPoints({
      accounts: [
        {
          status: 'authenticated',
          balances: {
            souonailo: { status: 'verified', points: 3450, checkedAt: Date.now() - 5000 }
          }
        }
      ]
    });

    // Panel 0 Twitch points must update; Kick points must NOT change
    assert.equal(twitchPoints0.textContent, '3.450 pts');
    assert.equal(p0Hud.querySelector('.bsh-twitch-channels').textContent, '1 canal');
    assert.equal(twitchPoints0.title, 'souonailo: 3.450');
    assert.equal(kickPoints0.textContent, 'Pontos —', 'Kick points must remain unchanged when Twitch points update');

    // 4-Account isolation: Panels 1, 2, 3 Twitch points must remain unconfirmed
    for (let i = 1; i < 4; i++) {
      const p = panels[i].querySelector('.battle-slot-hud');
      assert.equal(p.querySelector('.bsh-twitch-points').textContent, 'Pontos —', `Account ${i} Twitch points must not be affected by account 0`);
      assert.equal(p.querySelector('.bsh-kick-points').textContent, 'Pontos —', `Account ${i} Kick points must not be affected by account 0`);
    }

    // 2. Independent subscription: update Kick points for Account 0
    listeners.kickPoints({
      accounts: [
        {
          status: 'authenticated',
          balances: {
            biscoitao: { status: 'verified', points: 1200, checkedAt: Date.now() - 1000 }
          }
        }
      ]
    });

    // Panel 0 Kick points must update; Twitch points must retain their independent total (never summed together)
    assert.equal(kickPoints0.textContent, '1.200 pts');
    assert.equal(p0Hud.querySelector('.bsh-kick-channels').textContent, '1 canal');
    assert.equal(kickPoints0.title, 'biscoitao: 1.200');
    assert.equal(twitchPoints0.textContent, '3.450 pts', 'Twitch and Kick must have separate sums and never sum together');

    // 3. Verified 0 pts vs missing vs stale vs old checkedAt for Account 1
    // Account 1: Kick has verified 0 pts; Twitch has stale points and old checkedAt (>120s)
    listeners.kickPoints({
      accounts: [
        { status: 'authenticated', balances: { biscoitao: { status: 'verified', points: 1200, checkedAt: Date.now() } } },
        { status: 'authenticated', balances: { biscoitao: { status: 'verified', points: 0, checkedAt: Date.now() } } }
      ]
    });
    listeners.twitchPoints({
      accounts: [
        { status: 'authenticated', balances: { souonailo: { status: 'verified', points: 3450, checkedAt: Date.now() } } },
        {
          status: 'authenticated',
          balances: {
            oldstream: { status: 'verified', points: 9999, checkedAt: Date.now() - 150000 },
            futurestream: { status: 'verified', points: 5000, checkedAt: Date.now() + 60000 }
          }
        }
      ]
    });

    const p1Hud = panels[1].querySelector('.battle-slot-hud');
    const kickPoints1 = p1Hud.querySelector('.bsh-kick-points');
    const twitchPoints1 = p1Hud.querySelector('.bsh-twitch-points');

    // Kick 0 verified points must display '0 pts', NOT 'Pontos —'
    assert.equal(kickPoints1.textContent, '0 pts');
    assert.equal(p1Hud.querySelector('.bsh-kick-channels').textContent, '1 canal');
    assert.equal(kickPoints1.title, 'biscoitao: 0');

    // Expired and future-dated balances do not count; aggregate pending channels in the tooltip.
    assert.equal(twitchPoints1.textContent, 'Pontos —');
    assert.equal(p1Hud.querySelector('.bsh-twitch-channels').textContent, 'Sem saldo confirmado');
    assert.equal(twitchPoints1.title, '2 canais oficiais sem saldo confirmado');

    // Missing checkedAt is unverified:
    listeners.kickPoints({
      accounts: [
        { status: 'authenticated', balances: { biscoitao: { status: 'verified', points: 1200 } } }
      ]
    });
    assert.equal(p0Hud.querySelector('.bsh-kick-points').textContent, 'Pontos —', 'Missing checkedAt must be unverified');
    assert.equal(p0Hud.querySelector('.bsh-kick-points').title, '1 canal oficial sem saldo confirmado');

    // 4. Partial / mixed channels for Account 2
    // Kick: 2 channels (1 verified 500 fresh, 1 stale 200) -> total 500 pts, '1 canal · parcial', tooltip shows breakdown
    listeners.kickPoints({
      accounts: [
        { status: 'authenticated', balances: { biscoitao: { status: 'verified', points: 1200, checkedAt: Date.now() } } },
        { status: 'authenticated', balances: { biscoitao: { status: 'verified', points: 0, checkedAt: Date.now() } } },
        {
          status: 'authenticated',
          balances: {
            live_a: { status: 'verified', points: 500, checkedAt: Date.now() },
            live_b: { status: 'stale', points: 200 }
          }
        }
      ]
    });

    const p2Hud = panels[2].querySelector('.battle-slot-hud');
    const kickPoints2 = p2Hud.querySelector('.bsh-kick-points');
    assert.equal(kickPoints2.textContent, '500 pts');
    assert.equal(p2Hud.querySelector('.bsh-kick-channels').textContent, '1 canal · parcial');
    assert.equal(kickPoints2.title, 'live_a: 500\n1 canal oficial sem saldo confirmado');

    // A spurious verified account must not appear or affect the total for either service.
    listeners.twitchPoints({ accounts: [
      {status: 'authenticated', balances: {
        souonailo: {status: 'verified',points: 120,checkedAt: Date.now()},
        random_account: {status: 'verified',points: 99999,checkedAt: Date.now()}
      }}
    ] });
    assert.equal(twitchPoints0.textContent, '120 pts');
    assert.equal(twitchPoints0.title, 'souonailo: 120');
    listeners.kickPoints({ accounts: [
      {status: 'authenticated', balances: {
        biscoitao: {status: 'verified',points: 70,checkedAt: Date.now()},
        unrelated_player: {status: 'verified',points: 99999,checkedAt: Date.now()}
      }}
    ] });
    assert.equal(kickPoints0.textContent, '70 pts');
    assert.equal(kickPoints0.title, 'biscoitao: 70');

    // 5. In-game points fallback for Kick only (Account 3); Twitch has NO game.twitch.pontos fallback
    hud.update(panels[3], 3, {
      kick: { pontos: 888 },
      twitch: { pontos: 444 }
    });

    const p3Hud = panels[3].querySelector('.battle-slot-hud');
    assert.equal(p3Hud.querySelector('.bsh-kick-points').textContent, '888 pts no jogo');
    assert.equal(p3Hud.querySelector('.bsh-kick-channels').textContent, 'Saldo informado pelo jogo');
    // Twitch does not use in-game telemetry fallback without verified per-channel source:
    assert.equal(p3Hud.querySelector('.bsh-twitch-points').textContent, 'Pontos —');
    assert.equal(p3Hud.querySelector('.bsh-twitch-channels').textContent, 'Sem saldo confirmado');

    // Missing game telemetry does not turn Kick into 0
    hud.update(panels[3], 3, { kick: {}, twitch: {} });
    assert.equal(p3Hud.querySelector('.bsh-kick-points').textContent, 'Pontos —');
    assert.equal(p3Hud.querySelector('.bsh-kick-channels').textContent, 'Sem saldo confirmado');
    assert.equal(p3Hud.querySelector('.bsh-twitch-points').textContent, 'Pontos —');
    assert.equal(p3Hud.querySelector('.bsh-twitch-channels').textContent, 'Sem saldo confirmado');
  }
});
