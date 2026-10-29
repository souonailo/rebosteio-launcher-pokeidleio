const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createTelemetryEnvironment() {
  const context = {
    window: {},
    document: {
      hidden: false,
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: (id) => null
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    Date,
    Math,
    Object,
    Array,
    String,
    Number,
    JSON,
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {}
  };
  context.window = context;

  // 1. Load PioInventory
  const invCode = fs.readFileSync('rust-migration/ui/src/ui/inventory-state.js', 'utf8');
  vm.runInNewContext(invCode, context);

  // 2. Setup minimal globals and helpers matching index.html
  const helperCode = `
    const PIO_RARO_RE = /boss token|key fragment|fragmento de chave|shiny stone|bicicleta|bike|mega stone|fragmento de mega|tm disk|pe[çc]a de tm|mystic ticket|safari ticket|ovo shiny|shiny egg/i;
    function pioTipoItem(nome) {
      const n = String(nome || '');
      if (PIO_RARO_RE.test(n)) return 'raro';
      if (/\\bstone\\b/i.test(n) && !/fragment|fragmento/i.test(n)) return 'pedra';
      return null;
    }
    window.pioTipoItem = pioTipoItem;
    window.pioDrops = [];
    window.pioDropsUlt = {};
    window.pioPrecos = {};
    window.pioRegistrarDrop = function(conta, nick, item, qtd, origem, extra = {}) {
      const tipo = pioTipoItem(item);
      if (!tipo || !(qtd > 0)) return;
      const ev = { t: Date.now(), conta, nick, item, qtd, tipo, origem, ...extra };
      window.pioDrops.push(ev);
    };
    window.pioDropsTrack = function(conta, d) {
      if (!d || !d.sess) return;
      const st = d.sess.st, cur = {};
      for (const [k, v] of Object.entries(d.drops || {})) {
        if (/^\\d+$/.test(k) && v && v.name && d.drops[v.name]) continue;
        const nm = (v && v.name) || k;
        cur[nm] = (cur[nm] || 0) + (+(v && v.qty) || 0);
      }
      const ult = window.pioDropsUlt[conta];
      window.pioDropsUlt[conta] = { st, cur };
      if (!ult) return;
      const mesma = ult.st === st;
      for (const nm in cur) {
        const dq = cur[nm] - (mesma ? (ult.cur[nm] || 0) : 0);
        if (dq > 0) window.pioRegistrarDrop(conta, d.nick, nm, dq, 'drop', { hunt: d.slug || '' });
      }
    };
    window.pioDropsSessao = function(conta) {
      const u = window.pioDropsUlt[conta]; if (!u) return { raros: [], pedras: 0 };
      const raros = [], ped = Object.entries(u.cur).filter(([n]) => pioTipoItem(n) === 'pedra').reduce((s, [, q]) => s + q, 0);
      for (const [n, q] of Object.entries(u.cur)) if (pioTipoItem(n) === 'raro' && q > 0) raros.push({ n, q });
      return { raros, pedras: ped };
    };
    window.pioDropsPorItem = function(tipo, dias) {
      const M = {};
      for (const x of window.pioDrops) {
        if (x.tipo !== tipo || x.origem !== 'drop') continue;
        const e = M[x.item] = M[x.item] || { qtd: 0, porConta: {}, valor: 0 };
        e.qtd += x.qtd;
        e.porConta[x.conta] = (e.porConta[x.conta] || 0) + x.qtd;
      }
      return M;
    };

    window.histDay = {};
    window.curDay = '2026-10-28';
    window.dayKey = function() { return window.curDay; };
    window.pioDiaUlt = {};
    window.pioAcumDia = function(conta, d) {
      if (!d || !d.sess) return;
      const i = conta - 1, k = window.dayKey();
      const ult = window.pioDiaUlt[conta];
      window.pioDiaUlt[conta] = { xp: d.xp, s: d.sess, nick: d.nick };
      if (!ult || ult.nick !== d.nick) return;
      const b = (window.histDay[k] = window.histDay[k] || {})[i] = (window.histDay[k][i] || { g: 0, x: 0, kl: 0, c: 0, sf: 0, sc: 0 });
      const mesma = ult.s && ult.s.st === d.sess.st;
      const dv = f => mesma ? Math.max(0, (+d.sess[f] || 0) - (+ult.s[f] || 0)) : (+d.sess[f] || 0);
      const liq = x => (+x.g || 0) + (+x.v || 0) - (+x.s || 0);
      b.g += liq(d.sess) - (mesma ? liq(ult.s) : 0);
      if (d.xp != null && ult.xp != null && d.xp >= ult.xp && d.xp - ult.xp < 5e10) b.x += d.xp - ult.xp;
      b.kl += dv('k'); b.c += dv('c'); b.sf += dv('sf'); b.sc += dv('sc');
    };
    window.totalDia = function(k) {
      const T = { g: 0, x: 0, kl: 0, c: 0, sf: 0, sc: 0 };
      Object.values(window.histDay[k] || {}).forEach(b => {
        T.g += b.g; T.x += b.x; T.kl += b.kl; T.c += b.c; T.sf += b.sf; T.sc += b.sc;
      });
      return T;
    };

    window.lifeShiny = [];
    window.lifeCatch = [];
    const tabNames = ['Conta 1', 'Conta 2', 'Conta 3', 'Conta 4'];
    const ACOR = ['#79c0ff', '#3fb950', '#d29922', '#db61a2'];
    const kSh = (p, x) => 's' + p + '_' + x.t + '_' + (x.sid || x.n);
    const kCa = (p, x) => 'c' + p + '_' + x.t + '_' + (x.n || x.sid || '');
    const seenLog = {
      _set: new Set(),
      has(k) { return this._set.has(k); },
      add(k) { this._set.add(k); },
      setSource() {}
    };
    window.mergeLogs = function(i, r) {
      const acc = tabNames[i] || ('Conta ' + (i + 1)), dot = ACOR[i % ACOR.length];
      (r.shinyLog || []).forEach(x => {
        const key = kSh(i, x);
        if (seenLog.has(key)) return; seenLog.add(key);
        window.lifeShiny.push({ n: String(x.n || '').slice(0, 40), sid: +x.sid || 0, t: +x.t || 0, cap: x.cap ? 1 : 0, def: x.def ? 1 : 0, p: i, acc, dot });
      });
      (r.catchLog || []).forEach(x => {
        const key = kCa(i, x);
        const ivsClean = x.ivs && typeof x.ivs === 'object' ? { hp: +x.ivs.hp || 0, atk: +x.ivs.atk || 0, def: +x.ivs.def || 0, spAtk: +x.ivs.spAtk || 0, spDef: +x.ivs.spDef || 0, speed: +x.ivs.speed || 0 } : null;
        const totIv = (+x.iv > 0) ? +x.iv : (ivsClean ? (ivsClean.hp + ivsClean.atk + ivsClean.def + ivsClean.spAtk + ivsClean.spDef + ivsClean.speed) : 0);
        if (seenLog.has(key)) return; seenLog.add(key);
        window.lifeCatch.push({ id: x.id || null, n: String(x.n || '').slice(0, 40), iv: totIv || 0, ivs: ivsClean, potencia: x.potencia != null ? +x.potencia : null, q: +x.q || 0, sh: !!x.sh, fx: !!x.fx, t: +x.t || 0, p: i, acc, dot });
      });
    };

    const stCache = {};
    window.stCache = stCache;

    window.pioUltimo = {};
    window.getPioHeadlessColeta = function(i) {
      const conta = i + 1;
      const antes = window.pioUltimo[conta] || {};
      const st = (window.stCache && window.stCache[i] && window.stCache[i].d) || {};
      const a = st.a || {};
      const drops = st.drops || st.rawDrops || {};
      const noCentro = st.inCenter === true || st.hunt === 'centro';
      const xpVivo = st.xp != null ? st.xp : (a.xpg != null ? a.xpg : (antes.xp != null ? antes.xp : null));

      const nowMs = Date.now();
      let vipDias = st.vipDias != null ? st.vipDias : null;
      if (vipDias == null && st.vipAte && st.vipAte > nowMs) {
        vipDias = Math.max(1, Math.ceil((st.vipAte - nowMs) / 86400000));
      }
      if (vipDias == null && antes.vipDias != null) {
        vipDias = antes.vipDias;
      }

      let passeDias = st.passeDias != null ? st.passeDias : null;
      const passeAte = st.passeVipAte || (st.passe && st.passe.vipAte);
      if (passeDias == null && passeAte && passeAte > nowMs) {
        passeDias = Math.max(1, Math.ceil((passeAte - nowMs) / 86400000));
      }
      if (passeDias == null && antes.passeDias != null) {
        passeDias = antes.passeDias;
      }

      let boostXp = st.boostXp || antes.boostXp || (vipDias ? '+50%' : null);

      const catchLog = Array.isArray(st.catchLog) ? st.catchLog : [];
      const capturas = catchLog.map(c => ({
        id: c.id || ('cl_' + (c.t || Date.now()) + '_' + (c.sid || c.n || '')),
        t: c.t || Date.now(),
        especie: c.sid || 0,
        nome: c.n || '',
        modo: 'headless',
        minutos: Math.round((a.seconds || 0) / 60),
        bolas: a.balls || 0
      }));

      return {
        nick: st.name || tabNames[i] || ('Conta ' + (i + 1)),
        level: st.level != null ? st.level : null,
        xp: xpVivo,
        gemas: st.gemas != null ? st.gemas : (st.orbs != null ? st.orbs : (st.diamonds != null ? st.diamonds : 0)),
        ouro: st.gold != null ? st.gold : null,
        diamantes: st.diamonds != null ? st.diamonds : (st.diamantes != null ? st.diamantes : null),
        sockOk: !!st.live,
        noCentro,
        slug: noCentro ? '' : (st.hunt || ''),
        lastKillT: Date.now(),
        alertas: [],
        erros: [],
        bosses: [],
        capturas,
        sess: st.sess || {
          st: st.sessStart || Date.now(),
          k: a.kills || 0,
          g: st.sessionGold != null ? st.sessionGold : (st.gold || 0),
          v: 0,
          s: a.supplyGold || 0,
          c: a.captures || 0,
          sf: a.shinyFound || 0,
          sc: a.shinyCap || 0
        },
        drops,
        boostXp,
        vipDias,
        passeDias
      };
    };

    window.getPioHeadlessCard = function(i) {
      const st = (window.stCache && window.stCache[i] && window.stCache[i].d) || {};
      const a = st.a || {};
      const team = st.team || [];
      const ld = team.find(p => p && p.ld) || team[0] || null;
      const noCentro = st.inCenter === true || st.hunt === 'centro';
      return {
        t: Date.now(),
        sess: {
          ms: (a.seconds || 0) * 1000,
          xp: a.xpg != null ? a.xpg : (a.xp || 0),
          gold: st.sessionGold != null ? st.sessionGold : (st.gold || 0),
          gastos: a.supplyGold || 0,
          abates: a.kills || 0,
          capturas: a.captures || 0,
          shV: a.shinyFound || 0,
          shP: a.shinyCap || 0
        },
        hunt: noCentro ? 'Centro' : (st.hunt || ''),
        ativo: ld ? {
          nome: ld.name || '',
          nivel: ld.level || 0,
          shiny: !!ld.shiny,
          ivt: ld.ivTotal != null ? ld.ivTotal : (ld.iv != null ? ld.iv : null),
          q: ld.quality != null ? ld.quality : (ld.q != null ? ld.q : null)
        } : null
      };
    };
  `;
  vm.runInNewContext(helperCode, context);
  return context;
}

test('Headless telemetry - PioInventory projects bag, drops and session', () => {
  const ctx = createTelemetryEnvironment();
  const rawState = {
    i: 0,
    name: 'Ash',
    live: true,
    ballsKnown: true,
    inventoryKnown: true,
    ballMap: { '1': 150, '4': 25 },
    invMap: { '205': 10, '206': 2, '200': 40 },
    rawDrops: {
      '101': { id: '101', name: 'Water Stone', qty: 3 },
      '70000': { id: '70000', name: 'Bronze Boss Token', qty: 1 }
    },
    a: {
      seconds: 120,
      kills: 45,
      captures: 12,
      shinyFound: 2,
      shinyCap: 1,
      xpg: 5400,
      supplyGold: 500
    },
    sessStart: 100000,
    gold: 25000,
    diamonds: 80,
    level: 35,
    xp: 120500,
    catchLog: [
      { id: 11, n: 'Squirtle', sid: 7, iv: 160, sh: false, t: 1001 }
    ],
    shinyLog: [
      { n: 'Pikachu', sid: 25, def: 0, t: 1000 },
      { n: 'Pikachu', sid: 25, cap: 1, t: 1002 }
    ]
  };

  const projected = ctx.window.PioInventory.project(rawState);
  assert.ok(projected.bag, 'bag must be projected');
  const bolasGrp = projected.bag.find(g => g.label === 'Pokébolas');
  assert.equal(bolasGrp.total, 175);
  const revGrp = projected.bag.find(g => g.label === 'Revive');
  assert.equal(revGrp.total, 12);

  assert.ok(projected.drops['101'], 'drops must include Water Stone');
  assert.equal(projected.drops['101'].qty, 3);
  assert.ok(projected.drops['70000'], 'drops must include Boss Token');

  assert.equal(projected.sess.k, 45);
  assert.equal(projected.sess.c, 12);
  assert.equal(projected.sess.sf, 2);
  assert.equal(projected.sess.sc, 1);
  assert.equal(projected.catchLog.length, 1);
  assert.equal(projected.shinyLog.length, 2);
});

test('Headless telemetry - pioDropsTrack registers pedras and raros correctly', () => {
  const ctx = createTelemetryEnvironment();
  const c = 1; // Conta 1

  // Baseline reading (first snapshot sets baseline, does not trigger fake drops)
  const baseData = {
    nick: 'Conta1',
    slug: 'seafoam',
    sess: { st: 1000 },
    drops: {
      'Water Stone': { name: 'Water Stone', qty: 2 },
      'Boss Token': { name: 'Boss Token', qty: 1 }
    }
  };
  ctx.pioDropsTrack(c, baseData);
  assert.equal(ctx.pioDrops.length, 0, 'First reading is baseline only');

  // Next reading: 2 new Water Stones, 1 new Boss Token
  const nextData = {
    nick: 'Conta1',
    slug: 'seafoam',
    sess: { st: 1000 },
    drops: {
      'Water Stone': { name: 'Water Stone', qty: 4 },
      'Boss Token': { name: 'Boss Token', qty: 2 }
    }
  };
  ctx.pioDropsTrack(c, nextData);
  assert.equal(ctx.pioDrops.length, 2, 'Must record 2 drop events');

  const pedras = ctx.pioDropsPorItem('pedra', 0);
  assert.equal(pedras['Water Stone'].qtd, 2);
  assert.equal(pedras['Water Stone'].porConta[1], 2);

  const raros = ctx.pioDropsPorItem('raro', 0);
  assert.equal(raros['Boss Token'].qtd, 1);
  assert.equal(raros['Boss Token'].porConta[1], 1);

  const ses = ctx.pioDropsSessao(1);
  assert.equal(ses.pedras, 4);
  assert.equal(ses.raros.length, 1);
  assert.equal(ses.raros[0].n, 'Boss Token');
  assert.equal(ses.raros[0].q, 2);
});

test('Headless telemetry - pioAcumDia accumulates daily totals from headless state', () => {
  const ctx = createTelemetryEnvironment();
  const conta = 1;

  // Baseline
  ctx.pioAcumDia(conta, {
    nick: 'Conta1',
    xp: 100000,
    sess: { st: 5000, k: 10, c: 2, sf: 1, sc: 1, g: 1000, v: 0, s: 0 }
  });

  // Delta after farming in headless
  ctx.pioAcumDia(conta, {
    nick: 'Conta1',
    xp: 102500, // +2500 XP
    sess: { st: 5000, k: 35, c: 8, sf: 2, sc: 2, g: 3500, v: 0, s: 200 } // +25 kills, +6 caps, +1 sf, +1 sc, +2300 net gold
  });

  const dia = ctx.totalDia(ctx.curDay);
  assert.equal(dia.x, 2500, 'XP must accumulate +2500');
  assert.equal(dia.kl, 25, 'Kills must accumulate +25');
  assert.equal(dia.c, 6, 'Captures must accumulate +6');
  assert.equal(dia.sf, 1, 'Shinies seen must accumulate +1');
  assert.equal(dia.sc, 1, 'Shinies caught must accumulate +1');
  assert.equal(dia.g, 2300, 'Net gold must accumulate +2300');
});

test('Headless telemetry - mergeLogs captures live shinies and captures', () => {
  const ctx = createTelemetryEnvironment();
  const headlessUpdate = {
    catchLog: [
      { id: 101, n: 'Bulbasaur', sid: 1, iv: 172, ivs: { hp: 30, atk: 28, def: 29, spAtk: 31, spDef: 27, speed: 27 }, q: 1.4, potencia: 3, sh: false, t: 9000 }
    ],
    shinyLog: [
      { n: 'Charmander', sid: 4, def: 0, t: 8900 },
      { n: 'Charmander', sid: 4, cap: 1, t: 8950 }
    ]
  };

  ctx.mergeLogs(0, headlessUpdate);
  assert.equal(ctx.lifeShiny.length, 2, 'lifeShiny must record 2 shiny events');
  assert.equal(ctx.lifeShiny[0].n, 'Charmander');
  assert.equal(ctx.lifeShiny[1].cap, 1);

  assert.equal(ctx.lifeCatch.length, 1, 'lifeCatch must record 1 capture');
  assert.equal(ctx.lifeCatch[0].n, 'Bulbasaur');
  assert.equal(ctx.lifeCatch[0].iv, 172);
});

test('Headless telemetry - getPioHeadlessColeta and getPioHeadlessCard return accurate data', () => {
  const ctx = createTelemetryEnvironment();
  const state = ctx.window.PioInventory.project({
    ok: true,
    i: 0,
    name: 'MainTrainer',
    live: true,
    level: 40,
    xp: 250000,
    gold: 50000,
    diamonds: 120,
    gemas: 45,
    hunt: 'vulpix',
    team: [{ sid: 7, name: 'Blastoise', level: 50, ld: true, shiny: true, ivTotal: 180, quality: 1.5 }],
    ballsKnown: true,
    inventoryKnown: true,
    ballMap: { 1: 200 },
    invMap: { 205: 15 },
    rawDrops: { '100': { id: '100', name: 'Fire Stone', qty: 5 } },
    a: { seconds: 3600, kills: 120, captures: 30, xpg: 24000, shinyFound: 1, shinyCap: 1 }
  });
  ctx.stCache[0] = { t: Date.now(), d: state };

  const coleta = ctx.window.getPioHeadlessColeta(0);
  assert.equal(coleta.nick, 'MainTrainer');
  assert.equal(coleta.level, 40);
  assert.equal(coleta.xp, 250000);
  assert.equal(coleta.ouro, 50000);
  assert.equal(coleta.gemas, 45);
  assert.equal(coleta.diamantes, 120);
  assert.equal(coleta.sockOk, true);
  assert.equal(coleta.slug, 'vulpix');
  assert.equal(coleta.drops['100'].qty, 5);

  const card = ctx.window.getPioHeadlessCard(0);
  assert.equal(card.hunt, 'vulpix');
  assert.equal(card.sess.abates, 120);
  assert.equal(card.sess.capturas, 30);
  assert.equal(card.sess.xp, 24000);
  assert.equal(card.ativo.nome, 'Blastoise');
  assert.equal(card.ativo.shiny, true);
  assert.equal(card.ativo.ivt, 180);
});

test('Headless telemetry - VIP and Pass days persist and do not reset to null', () => {
  const ctx = createTelemetryEnvironment();
  const now = Date.now();
  const state = ctx.window.PioInventory.project({
    ok: true,
    i: 0,
    name: 'MainTrainer',
    live: true,
    vipAte: now + 7 * 86400000,
    vipDias: 7,
    passeVipAte: now + 15 * 86400000,
    passeDias: 15,
    boostXp: '+50%',
    catchLog: [
      { id: 'c1', sid: 25, n: 'Pikachu', sh: true, t: now }
    ]
  });
  ctx.stCache[0] = { t: now, d: state };

  const coleta1 = ctx.window.getPioHeadlessColeta(0);
  assert.equal(coleta1.vipDias, 7, 'vipDias must be 7');
  assert.equal(coleta1.passeDias, 15, 'passeDias must be 15');
  assert.equal(coleta1.boostXp, '+50%', 'boostXp must be +50%');
  assert.equal(coleta1.capturas.length, 1, 'capturas must be populated');
  assert.equal(coleta1.capturas[0].nome, 'Pikachu');

  // Simulate storing in pioUltimo[1]
  ctx.window.pioUltimo[1] = { ...coleta1 };

  // Next headless state arrives without vipDias/passeDias (e.g. partial delta)
  const deltaState = ctx.window.PioInventory.project({
    ok: true,
    i: 0,
    live: true,
    name: 'MainTrainer'
  });
  ctx.stCache[0] = { t: now + 1000, d: deltaState };

  const coleta2 = ctx.window.getPioHeadlessColeta(0);
  assert.equal(coleta2.vipDias, 7, 'vipDias must not reset to null');
  assert.equal(coleta2.passeDias, 15, 'passeDias must not reset to null');
  assert.equal(coleta2.boostXp, '+50%', 'boostXp must not reset to null');
});

test('Headless telemetry - pioDropsTrack does not duplicate stone drops if ID and name exist', () => {
  const ctx = createTelemetryEnvironment();
  const c = 1;

  // Baseline
  ctx.pioDropsTrack(c, {
    nick: 'Conta1',
    sess: { st: 2000 },
    drops: {
      '53': { id: '53', name: 'Fire Stone', qty: 2 },
      'Fire Stone': { id: '53', name: 'Fire Stone', qty: 2 }
    }
  });
  assert.equal(ctx.pioDrops.length, 0, 'Baseline reading produces no registered drops');

  // 1 new Fire Stone dropped
  ctx.pioDropsTrack(c, {
    nick: 'Conta1',
    sess: { st: 2000 },
    drops: {
      '53': { id: '53', name: 'Fire Stone', qty: 3 },
      'Fire Stone': { id: '53', name: 'Fire Stone', qty: 3 }
    }
  });

  assert.equal(ctx.pioDrops.length, 1, 'Only 1 drop event should be recorded');
  assert.equal(ctx.pioDrops[0].item, 'Fire Stone');
  assert.equal(ctx.pioDrops[0].qtd, 1, 'Quantity delta must be exactly 1, not 2');
});
