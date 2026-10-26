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

  PioBattleHud.setBlasterActive(0, false);
  assert.equal(PioBattleHud.isBlasterActive(0), false);
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
  assert.equal(catchBonus.text, 'Catch +15% · 1h 05m');

  // Polling keeps the confirmed buff visible without replacing its DOM text.
  PioBattleHud.update(panel, 0, { ...fakeState, kick: null });
  socialEvents.kick({ accounts: [{ status: 'authenticated' }] });
  const expiresAt = Date.now() + 5400000;
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
});


