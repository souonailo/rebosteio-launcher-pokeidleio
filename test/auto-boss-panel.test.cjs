const test = require('node:test');
const assert = require('node:assert/strict');
const panel = require('../rust-migration/ui/src/ui/auto-boss-panel.js');

test('intervalo confirmado do servidor aparece como espera, sem resultado incerto', () => {
  const raw = { enabled: true, mode: 'infinite', retryAfterMs: 6000, live: { status: 'victory' } };
  assert.equal(panel.normalizeAccount(raw, 0).status, 'waiting_next');
  assert.equal(panel.normalizeAccount({ ...raw, retryAfterMs: 0 }, 0).status, 'victory');
  assert.equal(panel.normalizeAccount({ ...raw, enabled: false }, 0).status, 'victory');
});

test('gráficos mostram evolução temporal, recompensas vazias, duração e filtros', () => {
  const previousHistory = global.PioBossHistory;
  const previousCache = global.stCache;
  global.stCache = [{ d: { cid: 'chart-account' } }];
  const entries = [
    { bossKey: 'alpha', bossName: 'Alpha', at: 1000, durationMs: 12500, result: 'victory', drops: [{ id: 'tm', name: 'TM rara', qty: 2 }] },
    { bossKey: 'alpha', bossName: 'Alpha', at: 2000, durationMs: null, result: 'victory', drops: [] },
    { bossKey: 'beta', bossName: 'Beta', at: 3000, durationMs: 8000, result: 'defeat', drops: null }
  ];
  global.PioBossHistory = { read: () => entries, summarize: rows => [...new Map(rows.map(row => [row.bossKey, { key: row.bossKey, name: row.bossName }])).values()] };
  try {
    const state = panel.getState();
    state.selectedChartBoss = 'all'; state.selectedChartItem = 'all';
    state.view = 'history';
    const html = panel.renderContent();
    assert.match(html, /pio-boss-columns/);
    assert.match(html, /pio-boss-chart-page/);
    assert.doesNotMatch(html, /data-action="view-charts"/);
    assert.match(html, /data-chart-filter="boss"/);
    assert.match(html, /data-chart-filter="item"/);
    assert.match(html, /data-chart-filter="metric"/);
    assert.match(html, /Média por vitória: 1/);
    assert.match(html, /Vitória sem itens/);
    assert.match(html, /Duração indisponível/);
    assert.match(html, /Drops não informados pelo servidor/);
    assert.match(html, /pio-boss-temporal-svg/);
    assert.match(html, /pio-boss-chart-y-label/);
    assert.match(html, /pio-boss-chart-x-label/);
    state.selectedChartBoss = 'alpha';
    const filtered = panel.renderContent();
    assert.match(filtered, /TM rara/);
    assert.doesNotMatch(filtered, /Drops não informados pelo servidor/);
    state.selectedChartBoss = 'all';
    state.selectedChartMetric = 'duration';
    const duration = panel.renderContent();
    assert.equal((duration.match(/<polyline /g) || []).length, 2, 'unknown duration creates a visual gap instead of connecting across it');
    state.selectedChartMetric = 'drops';
    global.PioBossHistory.read = () => [entries[0]];
    const single = panel.renderContent();
    assert.match(single, /cx="130"/, 'a single battle is centered in the narrow sidebar plot');
    state.view = 'history';
    assert.match(panel.renderContent(), /12,5 s/, 'history rows include recorded duration');
    global.PioBossHistory.read = () => [{ ...entries[0], result: 'defeat', drops: [] }];
    assert.match(panel.renderContent(), /Sem itens nesta batalha/);
    assert.doesNotMatch(panel.renderContent(), /Vitória sem itens/, 'defeat rows do not get victory wording');
    state.view = 'setup';
    const setupHtml = panel.renderContent();
    assert.match(setupHtml, /pio-boss-columns/);
    assert.match(setupHtml, /pio-boss-chart-page/);
    assert.match(setupHtml, /pio-boss-live-chart/);
    assert.doesNotMatch(setupHtml, /data-action="view-charts"/);
  } finally {
    if (previousHistory === undefined) delete global.PioBossHistory; else global.PioBossHistory = previousHistory;
    if (previousCache === undefined) delete global.stCache; else global.stCache = previousCache;
  }
});

test('normaliza tabela de drops real do jogo, custo de entrada e nível', () => {
  const boss = panel.normalizeBoss({
    key: 'arena_test',
    nome: 'Boss de Teste',
    minNivelTreinador: 70,
    type1: 'FIRE',
    entrada: { itemId: 70000, qtd: 1 },
    drops: [
      { itemId: 70081, nome: 'Mega Stone Fragment', chance: 0.065, qtd: [1, 3] },
      { itemId: 70090, nome: 'Mystic Ticket', chance: 0.000005, qtd: [1, 1] }
    ]
  }, { '70081': { id: 70081, name: 'Fragmento de Mega Stone' } });
  assert.equal(boss.key, 'arena_test');
  assert.equal(boss.level, 70);
  assert.equal(boss.tokenCost, 1);
  assert.equal(boss.tokenName, 'Bronze Boss Token');
  assert.equal(boss.tokenId, '70000');
  assert.deepEqual(boss.types, ['FIRE']);
  assert.deepEqual(boss.drops[0], { id: '70081', name: 'Fragmento de Mega Stone', chance: 0.065, quantity: [1, 3] });
  assert.equal(boss.drops[1].chance, 0.000005);
});

test('boss sem ID explícito recebe retrato somente por correspondência exata com Pokédex local', () => {
  const existing = global.PIW_ALL_POKEMON_THEMES;
  global.PIW_ALL_POKEMON_THEMES = [{name:'Articuno',dex:144},{name:'Zapdos',dex:145}];
  try {
    assert.match(panel.bossPortrait({key:'articuno',name:'Articuno'}), /pokemon\/144\.png$/);
    assert.match(panel.bossPortrait({key:'other',name:'Zapdos'}), /pokemon\/145\.png$/);
    assert.equal(panel.bossPortrait({key:'boss-desconhecido',name:'Boss sem espécie'}), '');
  } finally {
    if (existing === undefined) delete global.PIW_ALL_POKEMON_THEMES;
    else global.PIW_ALL_POKEMON_THEMES = existing;
  }
});

test('somente bosses realmente presentes no catálogo são selecionáveis; quatro contas fixas', () => {
  const result = panel.ingest({
    bosses: [{ key: 'first', nome: 'Primeiro', drops: [] }, { nome: 'Sem chave' }],
    accounts: [
      { account_id: 'acc-1', alias: 'Treinadora', inventory: { 70000: 16 }, config: { enabled: true, boss_key: 'first', mode: 'all' } },
      { account_id: 'acc-2', alias: 'Treinador', tokens: 3, config: { enabled: false, mode: 'quantity', quantity: 2 } },
      { account_id: 'acc-3', enabled: false },
      { account_id: 'acc-4', enabled: false },
      { account_id: 'acc-5', enabled: true }
    ]
  });
  assert.equal(result.bosses.length, 1);
  assert.equal(result.accounts.length, 4);
  assert.equal(result.accounts[0].tokens, 16);
  assert.equal(result.accounts[4], undefined);
  assert.equal(result.drafts[1].quantity, 2);
  result.drafts[0].bossKey = 'first';
  result.drafts[0].dirty = true;
  panel.ingest({ bosses: [{ key: 'first', nome: 'Primeiro' }], accounts: [{ account_id: 'acc-1', config: { boss_key: 'other' } }] });
  assert.equal(result.drafts[0].bossKey, 'first', 'edição pendente não deve ser perdida no polling');
});

test('salva configuração da conta escolhida com quantidade explícita', async () => {
  const invocations = [];
  global.pokeAPI = {
    blasterBossConfigure: async (...args) => {
      invocations.push(args);
      return {};
    },
    blasterBossStatus: async () => ({}),
    blasterBossCatalog: async () => []
  };
  panel.selectAccount(0);
  panel.ingest({ bosses: [{ key: 'boss-selected', nome: 'Boss Selecionado', entrada: { itemId: 70000, qtd: 1 } }], accounts: [{ account_id: 'real-account-id', online: true }] });
  const state = panel.getState();
  state.selectedAccount = 0;
  state.drafts[0] = { bossKey: 'boss-selected', enabled: true, mode: 'quantity', quantity: 7, dirty: true };
  await panel.save();
  assert.deepEqual(invocations, [[0, true, 'boss-selected', 'quantity', 7]]);
  assert.equal(state.drafts[0].dirty, false);
  delete global.pokeAPI;
});

test('validação bloqueia boss inexistente e quantidades fracionárias', async () => {
  let called = false;
  global.pokeAPI = { blasterBossConfigure: async () => { called = true; } };
  panel.selectAccount(0);
  panel.ingest({ bosses: [{ key: 'valid', entrada: { itemId: 70000, qtd: 1 } }], accounts: [{ account_id: 'one', online: true }] });
  const state = panel.getState();
  state.selectedAccount = 0;
  state.drafts[0] = { bossKey: 'fake', enabled: true, mode: 'all', quantity: 1, dirty: true };
  await panel.save();
  assert.match(state.error, /boss válido/);
  assert.equal(called, false);
  state.drafts[0] = { bossKey: 'valid', enabled: true, mode: 'quantity', quantity: 1.5, dirty: true };
  await panel.save();
  assert.match(state.error, /quantidade inteira/);
  assert.equal(called, false);
  delete global.pokeAPI;
});

test('não insere HTML do catálogo dentro da interface', () => {
  assert.equal(panel.escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
});

test('lê o catálogo específico de cada conta conectada e os tokens conhecidos do supervisor', async () => {
  const calls = [];
  global.pokeAPI = {
    blasterBossStatus: async index => {
      calls.push(['status', index]);
      return {
        online: index === 1,
        enabled: index === 1,
        bossKey: index === 1 ? 'live-boss' : '',
        mode: 'all',
        live: { tokenBalance: index === 1 ? 5 : null, inArena: index === 1, status: index === 1 ? 'fighting' : 'idle' }
      };
    },
    blasterBossCatalog: async index => {
      calls.push(['catalog', index]);
      return index === 1 ? [{ key: 'live-boss', nome: 'Boss online', drops: [{ itemId: 70095, nome: 'Safari Ticket', chance: 0.001 }] }] : [];
    }
  };
  const state = panel.getState();
  panel.selectAccount(1);
  state.catalogs = Array.from({ length: 4 }, () => ({ raw: [], bosses: [], status: 'missing', fetchedAt: 0 }));
  state.bosses = [];
  state.drafts = [];
  await panel.refresh();
  assert.equal(state.accounts.length, 4);
  assert.equal(state.accounts[1].tokens, 5);
  assert.equal(state.accounts[0].tokens, null);
  assert.equal(state.accounts[1].enabled, true);
  assert.equal(state.accounts[1].inArena, true);
  assert.equal(state.bosses[0].key, 'live-boss');
  assert.equal(state.bosses[0].drops[0].id, '70095');
  assert(calls.some(([type, index]) => type === 'catalog' && index === 1));
  assert.equal(calls.some(([type, index]) => type === 'catalog' && index === 2), false);
  delete global.pokeAPI;
});

test('modo todos envia quantidade null e bloqueia limite acima de cem mil', async () => {
  const configs = [];
  global.pokeAPI = {
    blasterBossConfigure: async (...args) => { configs.push(args); },
    blasterBossStatus: async () => ({}),
    blasterBossCatalog: async () => []
  };
  panel.selectAccount(0);
  const state = panel.ingest({ bosses: [{ key: 'known', entrada: { itemId: 70000, qtd: 1 } }], accounts: [{ index: 0, online: true }] });
  state.selectedAccount = 0;
  state.drafts[0] = { enabled: true, bossKey: 'known', mode: 'quantity', quantity: 100001, dirty: true };
  await panel.save();
  assert.equal(configs.length, 0);
  assert.match(state.error, /100.000/);
  state.drafts[0] = { enabled: true, bossKey: 'known', mode: 'all', quantity: 1, dirty: true };
  await panel.save();
  assert.deepEqual(configs[0], [0, true, 'known', 'all', null]);
  delete global.pokeAPI;
});

test('entrada única envia quantidade 1 sem ativar o modo todos', async () => {
  const configs = [];
  global.pokeAPI = {
    blasterBossConfigure: async (...args) => { configs.push(args); return { enabled: true }; },
    blasterBossStatus: async () => ({ index: 0, online: true, enabled: false, inventory: { '70000': 4 } }),
    blasterBossCatalog: async () => [{ key: 'suicune', nome: 'Suicune', entrada: { itemId: 70000, qtd: 1 } }]
  };
  panel.selectAccount(0);
  const state = panel.ingest({
    bosses: [{ key: 'suicune', nome: 'Suicune', entrada: { itemId: 70000, qtd: 1 } }],
    accounts: [{ index: 0, online: true, inventory: { '70000': 4 } }]
  });
  state.selectedAccount = 0;
  state.drafts[0] = { enabled: false, bossKey: 'suicune', mode: 'all', quantity: 1, dirty: false };
  assert.equal(panel.canRunOnce(), true);
  assert.deepEqual(panel.oneShotConfig(state.drafts[0]), {
    enabled: true, boss_key: 'suicune', mode: 'quantity', quantity: 1
  });
  assert.equal(await panel.runOnce(), true);
  assert.deepEqual(configs[0], [0, true, 'suicune', 'quantity', 1]);
  assert.match(state.success, /Solicitação de Suicune iniciada.*Acompanhe o estado da batalha/);
  delete global.pokeAPI;
});

test('entrada única bloqueia conta pendente/incerta e estoque não confirmado ou insuficiente', () => {
  panel.selectAccount(0);
  const state = panel.ingest({
    bosses: [{ key: 'suicune', nome: 'Suicune', entrada: { itemId: 70000, qtd: 2 } }],
    accounts: [{ index: 0, online: true, inventory: { '70000': 1 } }]
  });
  state.selectedAccount = 0;
  state.drafts[0] = { enabled: false, bossKey: 'suicune', mode: 'all', quantity: 1, dirty: false };
  assert.match(panel.oneShotProblem(), /não tem tokens suficientes/);
  state.accounts[0].inventory = null;
  state.accounts[0].inventoryKnown = false;
  state.accounts[0].tokens = null;
  assert.match(panel.oneShotProblem(), /saldo de tokens.*não foi confirmado/);
  state.accounts[0].tokens = 5;
  state.accounts[0].pending = true;
  assert.match(panel.oneShotProblem(), /aguardando confirmação/);
  state.accounts[0].pending = false;
  state.accounts[0].uncertain = true;
  assert.match(panel.oneShotProblem(), /resultado incerto/);
});

test('sem custo de entrada comprovado, evita habilitar boss e inventar consumo de token', async () => {
  let called = false;
  global.pokeAPI = { blasterBossConfigure: async () => { called = true; } };
  panel.selectAccount(0);
  const state = panel.ingest({ bosses: [{ key: 'incomplete', nome: 'Ficha incompleta' }], accounts: [{ index: 0, online: true }] });
  assert.equal(state.bosses[0].tokenCost, null);
  assert.equal(state.bosses[0].tokenId, null);
  state.selectedAccount = 0;
  state.drafts[0] = { enabled: true, bossKey: 'incomplete', mode: 'all', quantity: 1, dirty: true };
  await panel.save();
  assert.equal(called, false);
  assert.match(state.error, /não informou o custo/);
  delete global.pokeAPI;
});

const realBoss = (key, itemId = 70095, chance = 0.000005) => ({
  key, nome: 'Boss ' + key, minNivelTreinador: 80,
  entrada: { itemId: 70000, qtd: 1 },
  drops: [{ itemId, nome: 'Item ' + itemId, chance, qtd: [1, 2] }]
});

test('cada conta recebe apenas seus próprios bosses, drops e chances, mesmo com key compartilhada', async () => {
  const sent = [];
  global.pokeAPI = {
    blasterBossStatus: async i => ({ index: i, online: i < 2, enabled: false, bossKey: '', mode: 'all' }),
    blasterBossCatalog: async i => i === 0 ? [realBoss('igual', 70090, 0.02), realBoss('exclusivo-a')]
      : i === 1 ? [realBoss('igual', 70095, 0.005), realBoss('exclusivo-b')] : [],
    blasterBossConfigure: async (...args) => { sent.push(args); return { enabled: args[1] }; }
  };
  try {
    panel.selectAccount(0);
    await panel.refresh();
    const state = panel.getState();
    assert.equal(state.catalogs[0].status, 'ready');
    assert.equal(state.catalogs[1].status, 'ready');
    assert.equal(state.catalogs[2].status, 'offline');
    assert.equal(state.bosses.find(b => b.key === 'igual').drops[0].id, '70090');
    assert.equal(state.bosses.some(b => b.key === 'exclusivo-b'), false);
    panel.selectAccount(1);
    assert.equal(state.bosses.find(b => b.key === 'igual').drops[0].id, '70095');
    assert.equal(state.bosses.find(b => b.key === 'igual').drops[0].chance, 0.005);
    assert.equal(state.bosses.some(b => b.key === 'exclusivo-a'), false);
    state.drafts[1] = { enabled: true, bossKey: 'exclusivo-a', mode: 'all', quantity: 1, dirty: true };
    await panel.save();
    assert.match(state.error, /catálogo desta conta/);
    assert.equal(sent.length, 0);
    state.drafts[1].bossKey = 'exclusivo-b';
    await panel.save();
    assert.deepEqual(sent[0], [1, true, 'exclusivo-b', 'all', null]);
  } finally {
    delete global.pokeAPI;
  }
});

test('catálogo ausente ou com falha mantém dados históricos apenas para consulta; OFF continua permitido', async () => {
  let phase = 'ready';
  const sent = [];
  global.pokeAPI = {
    blasterBossStatus: async i => ({ index: i, online: i === 0, enabled: i === 0, bossKey: 'antes', mode: 'all' }),
    blasterBossCatalog: async () => {
      if (phase === 'missing') return [];
      if (phase === 'error') throw new Error('Falha de comunicação');
      return [realBoss(phase === 'recovered' ? 'depois' : 'antes')];
    },
    blasterBossConfigure: async (...args) => { sent.push(args); return { enabled: args[1] }; }
  };
  try {
    panel.selectAccount(0);
    const state = await panel.refresh();
    assert.equal(state.bosses[0].key, 'antes');
    phase = 'missing';
    await panel.refresh();
    assert.equal(state.catalogs[0].status, 'missing');
    assert.equal(state.bosses[0].key, 'antes');
    assert.match(panel.catalogMessage(), /Aguardando/);
    state.drafts[0] = { bossKey: 'antes', enabled: true, mode: 'quantity', quantity: 2, dirty: true };
    await panel.save();
    assert.match(state.error, /catálogo atualizado/);
    assert.equal(sent.length, 0);
    phase = 'error';
    await panel.refresh();
    assert.equal(state.catalogs[0].status, 'error');
    assert.match(panel.catalogMessage(), /Falha/);
    state.drafts[0].enabled = false;
    state.drafts[0].mode = 'all';
    state.drafts[0].quantity = 1;
    await panel.save();
    assert.deepEqual(sent[0], [0, false, 'antes', 'all', null]);
    phase = 'recovered';
    await panel.refresh();
    assert.equal(state.catalogs[0].status, 'ready');
    assert.equal(state.bosses[0].key, 'depois');
    assert.equal(panel.catalogMessage(), '');
  } finally {
    delete global.pokeAPI;
  }
});

test('erros no status do supervisor bloqueiam reconfigurações e não reutilizam tokens antigos', async () => {
  let broken = false;
  let calls = 0;
  global.pokeAPI = {
    blasterBossStatus: async i => {
      if (broken && i === 0) throw Error('offline do supervisor');
      return { index: i, online: i === 0, enabled: i === 0, bossKey: 'safe', mode: 'all', live: { tokenBalance: 9 } };
    },
    blasterBossCatalog: async () => [realBoss('safe')],
    blasterBossConfigure: async () => { calls++; }
  };
  try {
    panel.selectAccount(0);
    const state = await panel.refresh();
    assert.equal(state.accounts[0].tokens, 9);
    broken = true;
    await panel.refresh();
    assert.match(state.accounts[0].statusError, /offline do supervisor/);
    assert.equal(state.accounts[0].tokens, null);
    assert.equal(state.catalogs[0].status, 'error');
    state.drafts[0] = { bossKey: 'safe', enabled: false, mode: 'all', quantity: 1, dirty: true };
    await panel.save();
    assert.equal(calls, 0);
    assert.match(state.error, /Não foi possível conferir o estado/);
    assert.match(panel.catalogMessage(), /Sem comunicação/);
  } finally {
    delete global.pokeAPI;
  }
});

test('OFF em entrada pendente mantém chave/modo/quantidade e não apaga a confirmação pendente', async () => {
  let status = {
    index: 0, online: true, enabled: true, bossKey: 'alpha', mode: 'quantity',
    quantity: 3, completed: 1, pending: true, uncertain: false,
    live: { inArena: true, status: 'fighting', tokenBalance: 4 }
  };
  const sent = [];
  global.pokeAPI = {
    blasterBossStatus: async i => i === 0 ? { ...status } : { index: i, online: false, enabled: false },
    blasterBossCatalog: async () => [realBoss('alpha'), realBoss('beta')],
    blasterBossConfigure: async (...args) => {
      sent.push(args);
      // Representa a resposta do Rust configure_checked(false): preserva
      // pending_entry, completed e o job, alterando apenas enabled.
      status = { ...status, enabled: args[1] };
      return { ...status };
    }
  };
  try {
    panel.selectAccount(0);
    const state = await panel.refresh();
    assert.equal(state.accounts[0].pending, true);
    state.drafts[0] = { enabled: true, bossKey: 'alpha', mode: 'quantity', quantity: 3, dirty: false };
    assert.match(panel.configurationProblem(), /Somente desligar/);
    const before = panel.renderContent();
    assert.match(before, /type="checkbox" data-field="enabled" checked\s+aria-label/);
    assert.match(before, /name="pioBossMode" value="quantity" checked disabled/);
    assert.match(before, /pioBossQuantity" type="number"[^>]*disabled/);
    assert.match(before, /isso não cancela a entrada já enviada/);

    // ON com mudança de boss ou limite continua bloqueado.
    state.drafts[0] = { enabled: true, bossKey: 'beta', mode: 'quantity', quantity: 9, dirty: true };
    await panel.save();
    assert.equal(sent.length, 0);
    assert.match(state.error, /Somente desligar/);

    // OFF que tenta incluir alterações anteriores também é bloqueado.
    state.drafts[0].enabled = false;
    await panel.save();
    assert.equal(sent.length, 0);
    assert.match(state.error, /preserve o boss, modo e quantidade/);

    // Somente OFF, com os valores autoritativos atuais.
    state.drafts[0] = { enabled: false, bossKey: 'alpha', mode: 'quantity', quantity: 3, dirty: true };
    assert.equal(panel.safePendingOff(state.accounts[0], state.drafts[0]), true);
    assert.equal(panel.configurationProblem(), '');
    await panel.save();
    assert.deepEqual(sent, [[0, false, 'alpha', 'quantity', 3]]);
    assert.equal(state.accounts[0].enabled, false);
    assert.equal(state.accounts[0].pending, true);
    assert.equal(state.accounts[0].completed, 1);
    assert.equal(state.accounts[0].bossKey, 'alpha');
    assert.equal(state.drafts[0].dirty, false);
    const after = panel.renderContent();
    assert.match(after, /type="checkbox" data-field="enabled"\s+disabled/);
    assert.match(after, /a entrada anterior ainda precisa ser conferida/);
  } finally {
    delete global.pokeAPI;
  }
});

test('OFF com resultado incerto e conta offline preserva job ativo; ON só após reconciliação', async () => {
  let status = {
    index: 0, online: false, enabled: true, bossKey: 'original', mode: 'all',
    completed: 2, pending: true, uncertain: true, live: null
  };
  const sent = [];
  global.pokeAPI = {
    blasterBossStatus: async i => i === 0 ? { ...status } : { index: i, online: false, enabled: false },
    blasterBossCatalog: async () => [],
    blasterBossConfigure: async (...args) => {
      sent.push(args);
      status = { ...status, enabled: args[1] };
      return { ...status };
    }
  };
  try {
    panel.selectAccount(0);
    const state = await panel.refresh();
    assert.equal(state.catalogs[0].status, 'offline');
    assert.equal(state.accounts[0].uncertain, true);
    state.drafts[0] = { enabled: true, bossKey: 'original', mode: 'all', quantity: 1, dirty: true };
    await panel.save();
    assert.equal(sent.length, 0);
    assert.match(state.error, /resultado incerto/);

    state.drafts[0] = { enabled: false, bossKey: 'original', mode: 'all', quantity: 1, dirty: true };
    assert.equal(panel.configurationProblem(), '', 'OFF não depende de online nem catálogo quando o status confiável confirma o job');
    await panel.save();
    assert.deepEqual(sent, [[0, false, 'original', 'all', null]]);
    assert.equal(state.accounts[0].pending, true);
    assert.equal(state.accounts[0].uncertain, true);
    assert.equal(state.accounts[0].completed, 2);
    assert.equal(state.accounts[0].enabled, false);
    state.drafts[0].enabled = true;
    state.drafts[0].dirty = true;
    await panel.save();
    assert.equal(sent.length, 1, 'reabilitar enquanto incerto não alcança Tauri');
    assert.match(state.error, /resultado incerto/);
  } finally {
    delete global.pokeAPI;
  }
});

test('OFF pendente só aceita modo e quantidade ativos íntegros, e exige status confirmado', async () => {
  let calls = 0;
  global.pokeAPI = { blasterBossConfigure: async () => { calls++; } };
  try {
    panel.selectAccount(0);
    const state = panel.ingest({
      accounts: [{ online: true, enabled: true, bossKey: 'original', mode: 'quantity',
        quantity: 8, pending: true, uncertain: true }],
      catalogs: [{ status: 'missing', raw: [] }]
    });
    const base = { enabled: false, bossKey: 'original', mode: 'quantity', quantity: 8, dirty: true };
    for (const changes of [{ bossKey: 'outro' }, { mode: 'all' }, { quantity: 9 }]) {
      state.drafts[0] = { ...base, ...changes };
      assert.equal(panel.safePendingOff(state.accounts[0], state.drafts[0]), false);
      await panel.save();
      assert.equal(calls, 0);
      assert.match(state.error, /preserve o boss, modo e quantidade/);
    }
    state.accounts[0].statusError = 'consulta não confirmou status';
    state.drafts[0] = { ...base };
    await panel.save();
    assert.equal(calls, 0);
    assert.match(state.error, /Não foi possível conferir/);
    assert.equal(panel.safePendingOff(state.accounts[0], state.drafts[0]), false);
  } finally {
    delete global.pokeAPI;
  }
});

test('clique OFF com rascunho antigo restaura exatamente o job pendente antes de salvar', () => {
  const account = panel.normalizeAccount({
    online: false, enabled: true, pending: true, uncertain: true,
    bossKey: 'boss-ativo', mode: 'quantity', quantity: 6, completed: 2
  }, 0);
  const draft = { enabled: true, bossKey: 'boss-antigo', mode: 'all', quantity: 99, dirty: true };
  assert.equal(panel.updateEnabledDraft(account, draft, false), true);
  assert.deepEqual(draft, {
    enabled: false, bossKey: 'boss-ativo', mode: 'quantity', quantity: 6, dirty: true
  });
  assert.equal(panel.safePendingOff(account, draft), true);
  assert.equal(panel.updateEnabledDraft(account, draft, true), false, 'ON enquanto incerto é recusado');
  assert.equal(draft.enabled, false);
  const inactive = { ...account, enabled: false };
  assert.equal(panel.updateEnabledDraft(inactive, draft, false), false, 'nova alteração enquanto já OFF e incerto é recusada');
});

test('conta em arena bloqueia mudança de boss/limite, mas aceita desligamento explícito', async () => {
  const sent = [];
  global.pokeAPI = {
    blasterBossStatus: async i => ({
      index: i, online: i === 0, enabled: true, bossKey: 'alpha', mode: 'quantity', quantity: 3,
      completed: 1, live: { inArena: i === 0, status: 'fighting', tokenBalance: 4 }
    }),
    blasterBossCatalog: async () => [realBoss('alpha'), realBoss('beta')],
    blasterBossConfigure: async (...args) => { sent.push(args); return { enabled: args[1] }; }
  };
  try {
    panel.selectAccount(0);
    const state = await panel.refresh();
    assert.equal(state.accounts[0].inArena, true);
    assert.equal(state.accounts[0].completed, 1);
    state.drafts[0] = { enabled: true, bossKey: 'beta', mode: 'quantity', quantity: 3, dirty: true };
    await panel.save();
    assert.equal(sent.length, 0);
    assert.match(state.error, /na arena/);
    state.drafts[0].bossKey = 'alpha';
    state.drafts[0].quantity = 4;
    await panel.save();
    assert.equal(sent.length, 0);
    state.drafts[0].enabled = false;
    await panel.save();
    assert.deepEqual(sent[0], [0, false, 'alpha', 'quantity', 3],
      'desativar a arena deve preservar os parâmetros ativos até o encerramento');
  } finally {
    delete global.pokeAPI;
  }
});

test('normaliza probabilidade/quantidade e custo sem inventar taxas ou sprites inexistentes', () => {
  assert.equal(panel.normalizeDrop({ itemId: 70090, chance: 0.000005, qtd: [1, 3] }).chance, 0.000005);
  for (const chance of [-0.1, 1.001, 'erro', true, Infinity]) {
    assert.equal(panel.normalizeDrop({ itemId: 70090, chance }).chance, null);
  }
  assert.equal(panel.normalizeDrop({ itemId: 70090, chance: 0, qtd: [2, 1] }).quantity, null);
  assert.equal(panel.normalizeDrop({ itemId: 70090, qtd: [-1, 2] }).quantity, null);
  for (const cost of [0, -1, 1.5, true, 'invalid']) {
    assert.equal(panel.normalizeBoss({ key: 'invalid-cost', entrada: { itemId: 70000, qtd: cost } }).tokenCost, null);
  }
  assert.equal(panel.normalizeBoss({ key: 'invalid-id', entrada: { itemId: '', qtd: 1 } }).tokenCost, null);
  assert.equal(panel.spriteFor({ id: '70095' }), 'src/ui/assets/boss-drops/70095.png');
  assert.equal(panel.spriteFor({ id: '999999999' }), '');
  assert.equal(panel.normalizeAccount({ live: { tokenBalance: -3 } }, 0).tokens, null);
});

test('rascunhos permanecem independentes entre contas no polling; seleção inválida é recusada', () => {
  panel.selectAccount(0);
  const state = panel.ingest({
    accounts: [{ online: true }, { online: true }, {}, {}],
    catalogs: [
      { status: 'ready', raw: [realBoss('a')] },
      { status: 'ready', raw: [realBoss('b')] },
      { status: 'missing', raw: [] },
      { status: 'offline', raw: [] }
    ]
  });
  panel.selectAccount(1);
  assert.equal(state.bosses[0].key, 'b');
  state.drafts[1] = { enabled: true, bossKey: 'b', mode: 'quantity', quantity: 12, dirty: true };
  panel.selectAccount(0);
  state.drafts[0] = { enabled: true, bossKey: 'a', mode: 'all', quantity: 1, dirty: true };
  panel.ingest({
    accounts: [{ online: true, bossKey: 'other' }, { online: true, bossKey: 'other' }],
    catalogs: [{ status: 'ready', raw: [realBoss('a')] }, { status: 'ready', raw: [realBoss('b')] }]
  });
  assert.equal(state.drafts[0].bossKey, 'a');
  assert.equal(state.drafts[1].bossKey, 'b');
  assert.equal(state.drafts[1].quantity, 12);
  assert.equal(panel.selectAccount(4), false);
  assert.equal(state.selectedAccount, 0);
});

test('salvar configuração idêntica é no-op e preserva contador de entradas confirmadas', async () => {
  const sent = [];
  global.pokeAPI = {
    blasterBossConfigure: async (...args) => { sent.push(args); return { enabled: true }; }
  };
  try {
    panel.selectAccount(0);
    const state = panel.ingest({
      accounts: [{ online: true, enabled: true, bossKey: 'alpha', mode: 'quantity', quantity: 5, completed: 3 }],
      bosses: [realBoss('alpha')]
    });
    state.drafts[0] = { enabled: true, bossKey: 'alpha', mode: 'quantity', quantity: 5, dirty: true };
    await panel.save();
    assert.equal(sent.length, 0);
    assert.equal(state.accounts[0].completed, 3);
    assert.equal(state.drafts[0].dirty, false);
    assert.match(state.success, /Nenhuma alteração/);
  } finally {
    delete global.pokeAPI;
  }
});

test('inventário confirmado mostra tokens sem boss salvo e acompanha o item do boss em rascunho', () => {
  panel.selectAccount(0);
  const state = panel.ingest({bosses:[{key:'bronze',entrada:{itemId:70000,qtd:1}},{key:'other',entrada:{itemId:70011,qtd:2,nome:'Outro Token'}}],
    accounts:[{online:true,inventoryKnown:true,inventory:{70000:12,70011:6},live:{tokenBalance:null}}]});
  assert.equal(state.accounts[0].tokens,12);
  state.drafts[0]={bossKey:'other',mode:'quantity',quantity:4,enabled:false,dirty:true};
  const html=panel.renderContent();
  assert.match(html,/<strong>6<\/strong> Outro Token no inventário/);
  assert.match(html,/estoque atual cobre 3 entradas/);
  assert.equal(panel.normalizeAccount({inventoryKnown:true,inventory:{},live:{tokenBalance:99}},0).tokens,0);
  assert.equal(panel.normalizeAccount({inventoryKnown:false,inventory:{70000:99},live:{tokenBalance:99}},0).tokens,null);
  const previous=state.accounts[0];
  assert.equal(panel.normalizeAccount({__fetchError:'offline'},0,previous).tokens,null);
  assert.equal(panel.normalizeAccount({__fetchError:'offline'},0,previous).inventory,null);
});

test('seleção usa ID do Pokémon da conta e só marca ativo após confirmação do servidor', async () => {
  const team=[{id:12345,sid:25,name:'Pikachu',level:60},{id:789,sid:7,name:'Squirtle',level:50}];
  panel.selectAccount(0);
  panel.getState().drafts=[];
  panel.ingest({accounts:[{online:true,activeId:789,team}]});
  const calls=[];
  global.pokeAPI={
    blasterBossSelectPokemon:async (...args)=>{
      calls.push(args);
      assert.equal(panel.getState().accounts[0].activeId,789,'no optimistic active state');
      return true;
    },
    blasterBossStatus:async ()=>({online:true,team,activeId:12345})
  };
  try {
    assert.equal(await panel.selectPokemon(0),true);
    assert.deepEqual(calls,[[0,12345]]);
    assert.equal(panel.getState().accounts[0].activeId,12345);
    assert.match(panel.renderContent(),/Pikachu/);
    assert.equal(await panel.selectPokemon(99),false);
    for(const flags of [{enabled:true},{pending:true},{uncertain:true},{in_arena:true},{online:false}]) {
      panel.ingest({accounts:[{online:true,team,activeId:789,...flags}]});
      assert.equal(await panel.selectPokemon(0),false);
    }
    assert.equal(calls.length,1);
    panel.ingest({accounts:[{online:true,team,activeId:789}]});
    global.pokeAPI.blasterBossSelectPokemon=async ()=>false;
    assert.equal(await panel.selectPokemon(0),false);
    assert.equal(panel.getState().accounts[0].activeId,789);
    assert.match(panel.getState().error,/conexão/);
  } finally {delete global.pokeAPI;}
});

test('salva principal e combatente separadamente por boss, inclusive o mesmo Pokémon', async () => {
  const team=[{id:11,sid:1,name:'Principal',level:80},{id:22,sid:25,name:'Combatente',level:75}];
  const profiles={};
  const calls=[];
  panel.selectAccount(0);
  panel.getState().drafts=[];
  panel.ingest({bosses:[{key:'alpha',nome:'Alpha',entrada:{itemId:70000,qtd:1}},
    {key:'beta',nome:'Beta',entrada:{itemId:70000,qtd:1}}],
    accounts:[{cid:'cid-1',online:true,team,activeId:11,pokemonProfiles:profiles}]});
  const state=panel.getState();
  state.drafts[0].bossKey='alpha';
  global.pokeAPI={blasterBossPokemonConfigure:async (index,bossKey,primaryId,fighterId)=>{
    calls.push([index,bossKey,primaryId,fighterId]);
    profiles[bossKey]={primaryId,fighterId};
    return {cid:'cid-1',online:true,team,activeId:11,pokemonProfiles:{...profiles}};
  }};
  try {
    assert.match(panel.renderContent(),/Pokémon principal/);
    assert.match(panel.renderContent(),/Combatente do boss/);
    assert.equal(panel.updatePokemonProfileDraft('pokemon-fighter','22'),true);
    assert.match(panel.renderContent(),/Alterações não salvas/);
    state.drafts[0].enabled=true;
    assert.match(panel.configurationProblem(),/Salve a escalação/);
    assert.match(panel.oneShotProblem(),/Salve a escalação/);
    state.drafts[0].enabled=false;
    assert.equal(await panel.savePokemonProfile(),true);
    state.drafts[0].bossKey='beta';
    assert.equal(await panel.savePokemonProfile(),true);
    assert.deepEqual(calls,[[0,'alpha',11,22],[0,'beta',11,11]]);
    assert.equal(state.accounts[0].pokemonProfiles.alpha.fighterId,22);
    assert.equal(state.accounts[0].pokemonProfiles.beta.fighterId,11);
    state.accounts[0].pokemonReturnPending=true;
    assert.equal(await panel.savePokemonProfile('pokemon-fighter','11'),false);
    assert.equal(calls.length,2);
  } finally {delete global.pokeAPI;}
});

test('modos por demanda e infinito: troca de modo, labels e quantidade nula enviada', async () => {
  const configs = [];
  global.pokeAPI = {
    blasterBossConfigure: async (...args) => { configs.push(args); return { enabled: args[1] }; },
    blasterBossStatus: async () => ({ index: 0, online: true, enabled: true, bossKey: 'articuno', mode: configs.at(-1)?.[3] || 'demand', inventory: { '70000': 10 } }),
    blasterBossCatalog: async () => [{ key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } }]
  };
  try {
    panel.selectAccount(0);
    const state = panel.ingest({
      bosses: [{ key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } }],
      accounts: [{ index: 0, online: true, inventory: { '70000': 10 } }]
    });
    state.drafts[0] = { enabled: true, bossKey: 'articuno', mode: 'demand', strategy: 'fixed', dirty: true };
    const html = panel.renderContent();
    assert.match(html, /Por demanda/);
    assert.match(html, /Infinito/);
    assert.match(html, /Boss fixo/);
    assert.match(html, /Porcentagem/);
    await panel.save();
    assert.deepEqual(configs[0], [0, true, 'articuno', 'demand', null]);

    state.drafts[0].mode = 'infinite';
    state.drafts[0].dirty = true;
    await panel.save();
    assert.deepEqual(configs[1], [0, true, 'articuno', 'infinite', null]);
  } finally {
    delete global.pokeAPI;
  }
});

test('distribuição por porcentagem: validação de inteiros 0..100 e soma exata de 100', async () => {
  const configs = [];
  global.pokeAPI = {
    blasterBossConfigure: async (...args) => { configs.push(args); return { enabled: args[1] }; },
    blasterBossStatus: async () => ({}),
    blasterBossCatalog: async () => []
  };
  try {
    panel.selectAccount(0);
    const state = panel.ingest({
      bosses: [
        { key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } },
        { key: 'zapdos', nome: 'Zapdos', entrada: { itemId: 70000, qtd: 1 } },
        { key: 'moltres', nome: 'Moltres', entrada: { itemId: 70000, qtd: 1 } }
      ],
      accounts: [{ index: 0, online: true, inventory: { '70000': 5 } }]
    });

    state.drafts[0] = {
      enabled: true,
      bossKey: 'articuno',
      mode: 'demand',
      strategy: 'percent',
      distribution: [
        { bossKey: 'articuno', percent: 50 },
        { bossKey: 'zapdos', percent: 30 }
      ],
      dirty: true
    };
    assert.match(panel.configurationProblem(), /A soma das porcentagens deve ser exatamente 100%/);
    await panel.save();
    assert.equal(configs.length, 0);

    state.drafts[0].distribution = [
      { bossKey: 'articuno', percent: -10 },
      { bossKey: 'zapdos', percent: 110 }
    ];
    assert.match(panel.configurationProblem(), /entre 0 e 100/);

    state.drafts[0].distribution = [
      { bossKey: 'articuno', percent: 70 },
      { bossKey: 'zapdos', percent: 30 },
      { bossKey: 'moltres', percent: 0 }
    ];
    assert.equal(panel.configurationProblem(), '');
    await panel.save();
    assert.equal(configs.length, 1);
    assert.deepEqual(configs[0], [0, true, 'articuno', 'demand', null, [
      { bossKey: 'articuno', percent: 70 },
      { bossKey: 'zapdos', percent: 30 }
    ]]);
  } finally {
    delete global.pokeAPI;
  }
});

test('partida com saldo zero: bloqueia demanda e permite infinito', async () => {
  let called = false;
  global.pokeAPI = {
    blasterBossConfigure: async () => { called = true; return { enabled: true }; }
  };
  try {
    panel.selectAccount(0);
    const state = panel.ingest({
      bosses: [{ key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } }],
      accounts: [{ index: 0, online: true, inventory: { '70000': 0 } }]
    });

    state.drafts[0] = { enabled: true, bossKey: 'articuno', mode: 'demand', strategy: 'fixed', dirty: true };
    assert.match(panel.configurationProblem(), /Modo por demanda indisponível: o saldo atual é de 0 tokens/);
    await panel.save();
    assert.equal(called, false);

    state.drafts[0].mode = 'infinite';
    assert.equal(panel.configurationProblem(), '');
    await panel.save();
    assert.equal(called, true);
  } finally {
    delete global.pokeAPI;
  }
});

test('isolamento rigoroso de rascunhos entre contas e não compartilha cópias', () => {
  panel.selectAccount(0);
  const state = panel.ingest({
    bosses: [
      { key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } },
      { key: 'zapdos', nome: 'Zapdos', entrada: { itemId: 70000, qtd: 1 } }
    ],
    accounts: [
      { index: 0, online: true, config: { enabled: false, boss_key: 'articuno', mode: 'demand' } },
      { index: 1, online: true, config: { enabled: false, boss_key: 'zapdos', mode: 'infinite' } }
    ]
  });

  state.drafts[0].strategy = 'percent';
  state.drafts[0].distribution = [{ bossKey: 'articuno', percent: 100 }];
  state.drafts[0].dirty = true;

  assert.equal(state.drafts[1].strategy, 'fixed');
  assert.equal(state.drafts[1].mode, 'infinite');
  assert.deepEqual(state.drafts[1].distribution, []);
  assert.equal(state.drafts[1].dirty, false);
});

test('compatibilidade com configurações antigas: mapeia all e quantity para demand sem sujar rascunho no polling', () => {
  panel.selectAccount(0);
  panel.getState().drafts = [];
  const state = panel.ingest({
    bosses: [{ key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } }],
    accounts: [{ index: 0, online: true, config: { enabled: true, boss_key: 'articuno', mode: 'all' } }]
  });

  assert.equal(state.accounts[0].mode, 'all');
  assert.equal(state.drafts[0].dirty, false);

  panel.ingest({
    accounts: [{ index: 0, online: true, config: { enabled: true, boss_key: 'articuno', mode: 'all' } }]
  });
  assert.equal(state.drafts[0].dirty, false, 'polling de configuração legada não deve sujar rascunho nem reiniciar sessão');
});

test('exibe progresso com limite alvo, próximo boss, status de aguardando tokens e contagens de alocação', () => {
  panel.selectAccount(0);
  panel.ingest({
    bosses: [
      { key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } },
      { key: 'zapdos', nome: 'Zapdos', entrada: { itemId: 70000, qtd: 1 } }
    ],
    accounts: [{
      index: 0,
      online: true,
      enabled: true,
      bossKey: 'articuno',
      mode: 'infinite',
      completed: 4,
      limit: 10,
      tokens: 0,
      initialTokens: 8,
      nextBossKey: 'zapdos',
      status: 'waiting_tokens',
      entryCounts: { articuno: 3, zapdos: 1 }
    }]
  });

  const html = panel.renderContent();
  assert.match(html, /Aguardando tokens/);
  assert.doesNotMatch(html, /caça ativa/i);
  assert.match(html, /Entradas confirmadas: <strong>4<\/strong> \/ 10/);
  assert.match(html, /Próximo boss: <strong>Zapdos<\/strong>/);
});

test('sameDistribution: compara inteiros exatos e rejeita duplicatas e frações sem arredondar', () => {
  assert.equal(panel.sameDistribution(
    [{ bossKey: 'a', percent: 60 }, { bossKey: 'b', percent: 40 }],
    [{ bossKey: 'b', percent: 40 }, { bossKey: 'a', percent: 60 }]
  ), true);

  // Rejeita frações sem arredondar
  assert.equal(panel.sameDistribution(
    [{ bossKey: 'a', percent: 50.4 }, { bossKey: 'b', percent: 49.6 }],
    [{ bossKey: 'a', percent: 50 }, { bossKey: 'b', percent: 50 }]
  ), false);

  // Rejeita duplicatas de chave
  assert.equal(panel.sameDistribution(
    [{ bossKey: 'a', percent: 50 }, { bossKey: 'a', percent: 50 }],
    [{ bossKey: 'a', percent: 100 }]
  ), false);
});

test('distribuição por porcentagem exige mesma moeda e mesmo custo de entrada para pesos positivos', () => {
  panel.selectAccount(0);
  panel.getState().drafts = [];
  const state = panel.ingest({
    bosses: [
      { key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1, nome: 'Bronze' } },
      { key: 'zapdos', nome: 'Zapdos', entrada: { itemId: 70001, qtd: 1, nome: 'Silver' } },
      { key: 'moltres', nome: 'Moltres', entrada: { itemId: 70000, qtd: 2, nome: 'Bronze' } },
      { key: 'mewtwo', nome: 'Mewtwo', entrada: { itemId: 70000, qtd: 1, nome: 'Bronze' } }
    ],
    accounts: [{ index: 0, online: true, inventoryKnown: true, inventory: { '70000': 10, '70001': 10 } }]
  });

  state.drafts[0] = {
    enabled: true,
    strategy: 'percent',
    mode: 'demand',
    distribution: [
      { bossKey: 'articuno', percent: 50 },
      { bossKey: 'zapdos', percent: 50 } // Moeda diferente (70001 vs 70000)
    ],
    dirty: true
  };
  assert.match(panel.configurationProblem(), /mesma moeda e ter o mesmo custo/);

  state.drafts[0].distribution = [
    { bossKey: 'articuno', percent: 50 },
    { bossKey: 'moltres', percent: 50 } // Custo diferente (2 vs 1)
  ];
  assert.match(panel.configurationProblem(), /mesma moeda e ter o mesmo custo/);

  state.drafts[0].distribution = [
    { bossKey: 'articuno', percent: 60 },
    { bossKey: 'mewtwo', percent: 40 },
    { bossKey: 'zapdos', percent: 0 } // Peso 0 em moeda diferente não deve bloquear
  ];
  assert.equal(panel.configurationProblem(), '');
});

test('inventário conhecido com chave ausente avalia para 0 tokens e reporta erro claro em demanda', () => {
  panel.selectAccount(0);
  panel.getState().drafts = [];
  const state = panel.ingest({
    bosses: [
      { key: 'rare_boss', nome: 'Rare Boss', entrada: { itemId: 70999, qtd: 2 } }
    ],
    accounts: [{
      index: 0,
      online: true,
      inventoryKnown: true,
      inventory: { '70000': 10 } // Chave 70999 ausente
    }]
  });

  state.drafts[0] = {
    enabled: true,
    bossKey: 'rare_boss',
    strategy: 'fixed',
    mode: 'demand',
    dirty: true
  };

  assert.equal(panel.tokenStock(state.accounts[0], '70999'), 0);
  const problem = panel.configurationProblem();
  assert.match(problem, /Modo por demanda indisponível: o saldo atual é de 0 tokens/);
  assert.doesNotMatch(problem, /ainda não foi confirmado pelo servidor/);
});

test('rótulo de aguardando tokens no infinito não alega caça ativa e só aparece fora de arena e com saldo faltando', () => {
  panel.selectAccount(0);
  panel.getState().drafts = [];
  const state = panel.ingest({
    bosses: [{ key: 'articuno', nome: 'Articuno', entrada: { itemId: 70000, qtd: 1 } }],
    accounts: [{
      index: 0,
      online: true,
      enabled: true,
      bossKey: 'articuno',
      mode: 'infinite',
      tokens: 0,
      inArena: false,
      pending: false,
      uncertain: false
    }]
  });

  let html = panel.renderContent();
  assert.match(html, /<p class="pio-boss-waiting-tokens" role="status">Aguardando tokens<\/p>/);
  assert.doesNotMatch(html, /caça ativa/i);

  // Na arena não exibe aguardando tokens
  state.accounts[0].inArena = true;
  html = panel.renderContent();
  assert.doesNotMatch(html, /pio-boss-waiting-tokens/);

  // Pendente não exibe aguardando tokens
  state.accounts[0].inArena = false;
  state.accounts[0].pending = true;
  html = panel.renderContent();
  assert.doesNotMatch(html, /pio-boss-waiting-tokens/);

  // Com saldo suficiente não exibe aguardando tokens
  state.accounts[0].pending = false;
  state.accounts[0].tokens = 5;
  html = panel.renderContent();
  assert.doesNotMatch(html, /pio-boss-waiting-tokens/);
});

test('cópia do modo Por demanda explica saldo inicial e reserva dos novos tokens', () => {
  panel.selectAccount(0);
  const html = panel.renderContent();
  assert.match(html, /Usa o saldo inicial de tokens ao ativar\. Novos tokens ficam para depois/);
});
