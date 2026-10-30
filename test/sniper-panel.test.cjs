/**
 * @file test/sniper-panel.test.cjs
 * Testes unitários do Painel Central de Auto-Sniper com integração léxica real,
 * preservação de rascunhos, contadores e restrições, exclusividade mútua, execução real
 * contra armazenamento mockado (PIOSniperStorage / localStorage), guardas de login e flush pré-headless.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const SniperPanel = require('../rust-migration/ui/src/ui/sniper-panel.js');

// ---------------------------------------------------------------------------
// 1. Validação de Regras & Integridade de Alvos / IDs
// ---------------------------------------------------------------------------
test('validação de regras do sniper rejeita campos faltantes ou preços inválidos', () => {
  const invalidNoTarget = SniperPanel.validateRule({
    targetType: 'item',
    targetName: '',
    targetId: '',
    maxPriceGold: 5000
  });
  assert.equal(invalidNoTarget.ok, false);
  assert.match(invalidNoTarget.error, /nome ou o ID/);

  const invalidNegativePrice = SniperPanel.validateRule({
    targetType: 'item',
    targetName: 'Water Stone',
    targetId: '142',
    maxPriceGold: -100
  });
  assert.equal(invalidNegativePrice.ok, false);
  assert.match(invalidNegativePrice.error, /negativo/);

  const invalidZeroPrice = SniperPanel.validateRule({
    targetType: 'item',
    targetName: 'Water Stone',
    targetId: '142',
    maxPriceGold: 0,
    maxPriceGems: 0
  });
  assert.equal(invalidZeroPrice.ok, false);
  assert.match(invalidZeroPrice.error, /ao menos um teto/);
});

test('validação de regras formata regra com todos os campos canônicos e ID inteiro', () => {
  const res = SniperPanel.validateRule({
    targetType: 'pokemon',
    targetName: 'Mewtwo',
    targetId: '150',
    maxPriceGold: 500000,
    maxPriceGems: 10,
    maxQty: 3,
    infinite: false,
    active: true
  });

  assert.equal(res.ok, true);
  const r = res.rule;
  assert.equal(r.targetType, 'pokemon');
  assert.equal(r.targetName, 'Mewtwo');
  assert.equal(r.targetId, 150);
  assert.equal(r.maxPriceGold, 500000);
  assert.equal(r.maxPriceGems, 10);
  assert.equal(r.maxQty, 3);
  assert.equal(r.infinite, false);
  assert.equal(r.active, true);
  assert.equal(r.totalBought, 0);
  assert.ok(r.id);
});

test('validateRule mantém targetId:null para itens por nome e preserva restrições extras', () => {
  const res = SniperPanel.validateRule({
    id: 'r_legacy_123',
    targetType: 'item',
    targetName: 'Water Stone',
    targetId: '', // sem ID numérico
    maxPriceGold: 5000,
    customRestriction: { minLevel: 10, nature: 'Modest' }
  });

  assert.equal(res.ok, true);
  assert.equal(res.rule.targetId, null, 'targetId deve ser null para resolução pelo catálogo do backend');
  assert.notEqual(res.rule.targetId, 'r_legacy_123', 'Não deve usar r_id como targetId');
  assert.notEqual(res.rule.targetId, 'Water Stone', 'Não deve usar targetName como targetId');
  assert.deepEqual(res.rule.customRestriction, { minLevel: 10, nature: 'Modest' }, 'Deve preservar restrições extras');
});

test('validação de regra infinita define maxQty como 0', () => {
  const res = SniperPanel.validateRule({
    targetType: 'item',
    targetName: 'Ancient Stone',
    targetId: '2',
    maxPriceGold: 25000,
    infinite: true
  });
  assert.equal(res.ok, true);
  assert.equal(res.rule.infinite, true);
  assert.equal(res.rule.maxQty, 0);
  assert.equal(res.rule.targetId, 2);
});

// ---------------------------------------------------------------------------
// 2. Escape HTML e Sanitização
// ---------------------------------------------------------------------------
test('escapeHtml neutraliza tags perigosas em nomes e logs', () => {
  const raw = '<script>alert("xss")</script> & "quotes" \'apostrophe\'';
  const escaped = SniperPanel.escapeHtml(raw);
  assert.equal(escaped.includes('<script>'), false);
  assert.equal(escaped.includes('&lt;script&gt;'), true);
  assert.equal(escaped.includes('&amp;'), true);
  assert.equal(escaped.includes('&quot;'), true);
  assert.equal(escaped.includes('&#039;'), true);
});

// ---------------------------------------------------------------------------
// 3. Integração Léxica e Detecção de Modo
// ---------------------------------------------------------------------------
test('getAccountMode detecta visual, headless e offline usando __PIO_SNIPER_INTEGRATION__', () => {
  const mockWebviews = [{}, {}, null, {}];
  const offFlags = [false, false, true, false];

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: (i) => mockWebviews[i],
    getAllWebviews: () => mockWebviews,
    isAccountOff: (i) => offFlags[i],
    isScriptOn: () => true,
    setScriptOn: () => true,
    ensurePresetLoaded: async () => {},
    injectScripts: async () => {}
  };

  globalThis.PioBattleHud = {
    isBlasterActive: (i) => (i === 1) // Conta 1 está headless
  };

  assert.equal(SniperPanel.getAccountMode(0), 'visual', 'Conta 0 com webview aberta é visual');
  assert.equal(SniperPanel.getAccountMode(1), 'headless', 'Conta 1 com blaster ativo é headless');
  assert.equal(SniperPanel.getAccountMode(2), 'offline', 'Conta 2 marcada off é offline');
  assert.equal(SniperPanel.getAccountMode(3), 'visual', 'Conta 3 é visual');
});

// ---------------------------------------------------------------------------
// 4. Preservação de Rascunhos, Configuração e Edição de Regras Pausadas
// ---------------------------------------------------------------------------
test('preserva configuração completa de scanIntervalMs e fastScanIntervalMs nos drafts', () => {
  const st = SniperPanel.getState();
  st.activeTab = 0;
  st.drafts[0] = {
    configured: true,
    enabled: true,
    rules: [{ id: 'r1', targetType: 'item', targetName: 'Sun Stone', targetId: 209, maxPriceGold: 5000, maxPriceGems: 0, maxQty: 1, active: true }],
    config: { scanIntervalMs: 30000, fastScanIntervalMs: 2000, customSetting: true },
    isDirty: true
  };

  st.activeTab = 1;
  st.activeTab = 0;

  assert.equal(st.drafts[0].isDirty, true);
  assert.equal(st.drafts[0].config.scanIntervalMs, 30000);
  assert.equal(st.drafts[0].config.fastScanIntervalMs, 2000);
  assert.equal(st.drafts[0].config.customSetting, true);
});

test('edição de regra pausada preserva active:false e mantém restrições existentes', () => {
  const st = SniperPanel.getState();
  st.activeTab = 0;
  const pausedRule = {
    id: 'rule_paused_1',
    targetType: 'pokemon',
    targetName: 'Charizard',
    targetId: 6,
    maxPriceGold: 100000,
    maxPriceGems: 5,
    maxQty: 1,
    infinite: false,
    active: false, // PAUSADA
    totalBought: 2,
    extraFilter: { shinyOnly: true }
  };

  st.drafts[0] = {
    configured: true,
    enabled: true,
    rules: [pausedRule],
    config: {},
    isDirty: false
  };

  st.editingRuleId = 'rule_paused_1';
  st.ruleDraft = { ...pausedRule, maxPriceGold: 120000 };

  const draft = st.drafts[0];
  const prevRule = draft.rules.find(r => r.id === st.editingRuleId);
  const rawRule = {
    ...(prevRule || {}),
    id: st.editingRuleId,
    targetType: st.ruleDraft.targetType,
    targetName: st.ruleDraft.targetName,
    targetId: st.ruleDraft.targetId,
    maxPriceGold: st.ruleDraft.maxPriceGold,
    maxPriceGems: st.ruleDraft.maxPriceGems,
    maxQty: st.ruleDraft.maxQty,
    infinite: st.ruleDraft.infinite,
    active: prevRule ? (prevRule.active !== false) : true,
    totalBought: prevRule ? (Number(prevRule.totalBought) || 0) : 0
  };

  const validated = SniperPanel.validateRule(rawRule);
  assert.equal(validated.ok, true);

  const idx = draft.rules.findIndex(r => r.id === st.editingRuleId);
  draft.rules[idx] = {
    ...draft.rules[idx],
    ...validated.rule,
    active: prevRule ? (prevRule.active !== false) : validated.rule.active,
    totalBought: prevRule ? (Number(prevRule.totalBought) || 0) : 0
  };

  assert.equal(draft.rules[0].active, false, 'Regra pausada deve permanecer pausada após edição');
  assert.equal(draft.rules[0].maxPriceGold, 120000, 'Preço deve ser atualizado');
  assert.equal(draft.rules[0].totalBought, 2, 'Contador existente deve ser preservado');
  assert.deepEqual(draft.rules[0].extraFilter, { shinyOnly: true }, 'Restrições extras devem ser mantidas');
});

test('sincronização periódica do backend não zera totalBought existente', async () => {
  const mockSnapshot = {
    accounts: [
      {
        index: 0,
        configured: true,
        enabled: true,
        rules: [{ id: 'rule_stay', targetType: 'item', targetName: 'Cocoon Stone', targetId: 23, maxPriceGold: 1000, totalBought: 2 }],
        config: { scanIntervalMs: 45000 },
        logs: []
      }
    ],
    version: 1
  };

  globalThis.pokeAPI = {
    sniperGetState: async () => mockSnapshot
  };

  const st = SniperPanel.getState();
  st.accounts[0].rules = [
    { id: 'rule_stay', targetType: 'item', targetName: 'Cocoon Stone', targetId: 23, maxPriceGold: 1000, totalBought: 7 }
  ];

  await SniperPanel.loadBackendState(true);
  const r = st.accounts[0].rules.find(x => x.id === 'rule_stay');
  assert.equal(r.totalBought, 7, 'Deve preservar o maior contador conhecido para não estourar o orçamento');
});

// ---------------------------------------------------------------------------
// 5. syncVisualWebview: Execução Real Contra Armazenamento Mockado (PIOSniperStorage)
// ---------------------------------------------------------------------------
test('syncVisualWebview executa script gerado contra armazenamento mockado real (PIOSniperStorage)', async () => {
  const actualStorage = {
    rotom_sniper_rules: [
      { id: 'r_same', targetType: 'item', targetName: 'Metal Stone', targetId: 87, maxPriceGold: 2000, totalBought: 7 }
    ],
    rotom_sniper_enabled: false,
    rotom_sniper_config: { scanIntervalMs: 45000, fastScanIntervalMs: 3000 }
  };

  const postedMessages = [];
  const mockWv = {
    executeJavaScript: async (code) => {
      const mockWindow = {
        PIOSniperStorage: {
          get: async (keys) => {
            const out = {};
            keys.forEach(k => { out[k] = actualStorage[k]; });
            return out;
          },
          set: async (data) => {
            Object.assign(actualStorage, data);
          }
        },
        postMessage: (msg) => { postedMessages.push(msg); }
      };

      const fn = new Function('window', `return (${code});`);
      return await fn(mockWindow);
    }
  };

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false,
    ensurePresetLoaded: async () => {}
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  const settings = {
    enabled: true,
    rules: [{ id: 'r_same', targetType: 'item', targetName: 'Metal Stone', targetId: 87, maxPriceGold: 2000, totalBought: 3 }],
    config: { scanIntervalMs: 40000, fastScanIntervalMs: 2500 }
  };

  const res = await SniperPanel.syncVisualWebview(0, settings);
  assert.equal(res.ok, true);
  assert.equal(actualStorage.rotom_sniper_rules[0].totalBought, 7, 'Deve mesclar max(native 3, visual 7) no armazenamento real');
  assert.equal(actualStorage.rotom_sniper_enabled, true, 'Deve persistir enabled no armazenamento real');
  assert.equal(actualStorage.rotom_sniper_config.scanIntervalMs, 40000, 'Deve persistir config no armazenamento real');
  assert.ok(postedMessages.some(m => m.type === 'SET_SNIPER_ENABLED' && m.enabled === true));

  mockWv.executeJavaScript = async () => null;
  const failRes = await SniperPanel.syncVisualWebview(0, settings);
  assert.equal(failRes.ok, false);
  assert.match(failRes.error, /Retorno nulo ou inválido/);
});

test('syncVisualWebview pula corretamente contas em Headless ou Offline', async () => {
  let executed = false;
  const mockWv = {
    executeJavaScript: async () => { executed = true; return { ok: true }; }
  };

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false
  };
  globalThis.PioBattleHud = { isBlasterActive: () => true };

  const resHeadless = await SniperPanel.syncVisualWebview(0, { enabled: true, rules: [] });
  assert.equal(resHeadless.ok, true);
  assert.equal(resHeadless.skipped, true);
  assert.equal(executed, false, 'Não deve injetar em conta headless');
});

// ---------------------------------------------------------------------------
// 6. preseedVisualAccount: Execução Real, Mesclagem e Pulo em Não Configuradas
// ---------------------------------------------------------------------------
test('preseedVisualAccount mescla max(visual, backend) e pula contas não configuradas', async () => {
  const actualLocalStorage = {
    'pio-auto-sniper-v1:rotom_sniper_rules': JSON.stringify([
      { id: 'r_rule', totalBought: 8 }
    ]),
    'pio-auto-sniper-v1:rotom_sniper_enabled': 'true'
  };

  const mockWv = {
    executeJavaScript: async (code) => {
      const mockLocal = {
        getItem: (k) => actualLocalStorage[k],
        setItem: (k, v) => { actualLocalStorage[k] = String(v); }
      };
      const fn = new Function('window', 'localStorage', `return (${code});`);
      return await fn({}, mockLocal);
    }
  };

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };
  globalThis.pokeAPI = {
    sniperGetState: async () => ({
      accounts: [
        {
          index: 0,
          configured: true,
          enabled: false,
          rules: [{ id: 'r_rule', targetType: 'item', targetName: 'Metal Stone', targetId: 87, maxPriceGold: 1000, totalBought: 3 }],
          config: {}
        },
        {
          index: 1,
          configured: false,
          enabled: false,
          rules: [],
          config: {}
        }
      ],
      version: 1
    })
  };

  // Conta 0 (configurada): deve mesclar max(8 visual, 3 backend) = 8
  const res0 = await SniperPanel.preseedVisualAccount(0, mockWv);
  assert.equal(res0.ok, true);
  const parsedRules = JSON.parse(actualLocalStorage['pio-auto-sniper-v1:rotom_sniper_rules']);
  assert.equal(parsedRules[0].totalBought, 8, 'Preseed deve reter maior contador visual para evitar sobre-compra');
  assert.equal(actualLocalStorage['pio-auto-sniper-v1:rotom_sniper_enabled'], 'false');

  // Conta 1 (não configurada): deve pular preservando dados legados do usuário
  const res1 = await SniperPanel.preseedVisualAccount(1, mockWv);
  assert.equal(res1.ok, true);
  assert.equal(res1.skipped, true);
  assert.equal(res1.reason, 'unconfigured');
});

// ---------------------------------------------------------------------------
// 7. applyAll Retém IDs, Zera Input totalBought e Coleta Falhas Visuais
// ---------------------------------------------------------------------------
test('applyAll retém IDs existentes e envia totalBought=0 no payload', async () => {
  let savedIndices = null;
  let savedPayload = null;

  globalThis.pokeAPI = {
    sniperSave: async (indices, settings) => {
      savedIndices = indices;
      savedPayload = settings;
      return {
        accounts: [0, 1, 2, 3].map(i => ({
          index: i,
          configured: true,
          enabled: settings.enabled,
          rules: settings.rules.map(r => ({ ...r, totalBought: i * 2 })),
          config: settings.config,
          logs: []
        })),
        version: 1
      };
    }
  };

  const mockWv = {
    executeJavaScript: async () => ({ ok: true, mergedRules: [] })
  };
  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false,
    ensurePresetLoaded: async () => {}
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  const templateRules = [
    { id: 'stable_id_1', targetType: 'item', targetName: 'Punch Stone', targetId: 106, maxPriceGold: 8000, totalBought: 10 }
  ];

  const res = await SniperPanel.applyAll(templateRules, true, { scanIntervalMs: 50000 });
  assert.equal(res.ok, true);
  assert.deepEqual(savedIndices, [0, 1, 2, 3]);
  assert.equal(savedPayload.rules[0].id, 'stable_id_1');
  assert.equal(savedPayload.rules[0].totalBought, 0);

  const st = SniperPanel.getState();
  assert.equal(st.accounts[0].rules[0].totalBought, 0);
  assert.equal(st.accounts[1].rules[0].totalBought, 2);
  assert.equal(st.accounts[2].rules[0].totalBought, 4);
  assert.equal(st.accounts[3].rules[0].totalBought, 6);
});

test('applyAll coleta falhas individuais de sync visual e reporta pendência', async () => {
  globalThis.pokeAPI = {
    sniperSave: async (indices, settings) => ({
      accounts: indices.map(i => ({ index: i, configured: true, enabled: settings.enabled, rules: settings.rules, config: settings.config, logs: [] })),
      version: 1
    })
  };

  const mockWebviews = [
    { executeJavaScript: async () => ({ ok: true }) },
    { executeJavaScript: async () => ({ ok: false, msg: 'Painel desconectado' }) },
    { executeJavaScript: async () => ({ ok: true }) },
    { executeJavaScript: async () => ({ ok: true }) }
  ];

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: (i) => mockWebviews[i],
    isAccountOff: () => false,
    ensurePresetLoaded: async () => {}
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  const res = await SniperPanel.applyAll([{ id: 'r1', targetType: 'item', targetName: 'Test', targetId: 1, maxPriceGold: 100 }], true);
  assert.equal(res.ok, false);
  assert.equal(res.backendSaved, true);
  assert.equal(res.visualSynced, false);
  assert.equal(res.failures.length, 1);
  assert.match(res.failures[0], /Conta 2/);
});

// ---------------------------------------------------------------------------
// 8. saveAccount Usa Snapshot Autoritativo
// ---------------------------------------------------------------------------
test('saveAccount atualiza estado a partir do snapshot autoritativo retornado', async () => {
  globalThis.pokeAPI = {
    sniperSave: async (indices, settings) => ({
      accounts: [
        {
          index: 0,
          configured: true,
          enabled: settings.enabled,
          rules: [{ id: 'r1', targetType: 'item', targetName: 'Leaf Stone', targetId: 76, maxPriceGold: 1000, totalBought: 9 }],
          config: { scanIntervalMs: 45000, fastScanIntervalMs: 3000 },
          logs: []
        }
      ],
      version: 1
    })
  };

  const mockWv = {
    executeJavaScript: async () => ({ ok: true })
  };
  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false,
    ensurePresetLoaded: async () => {}
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  const st = SniperPanel.getState();
  st.drafts[0] = {
    configured: true,
    enabled: true,
    rules: [{ id: 'r1', targetType: 'item', targetName: 'Leaf Stone', targetId: 76, maxPriceGold: 1000, totalBought: 0 }],
    config: {},
    isDirty: true
  };

  const res = await SniperPanel.saveAccount(0);
  assert.equal(res.ok, true);
  assert.equal(st.accounts[0].rules[0].totalBought, 9, 'Deve adotar o contador autoritativo do snapshot retornado');
});

// ---------------------------------------------------------------------------
// 9. restoreConfiguredVisualAccount Sem Abrir Painel
// ---------------------------------------------------------------------------
test('restoreConfiguredVisualAccount busca backend e sincroniza visual sem abrir o painel', async () => {
  const backendState = {
    accounts: [
      {
        index: 0,
        configured: true,
        enabled: true,
        rules: [{ id: 'rule_bg_1', targetType: 'item', targetName: 'Fire Stone', targetId: 10, maxPriceGold: 5000, totalBought: 2 }],
        config: { scanIntervalMs: 35000 },
        logs: []
      }
    ],
    version: 1
  };

  globalThis.pokeAPI = {
    sniperGetState: async () => backendState
  };

  const actualStorage = {
    rotom_sniper_rules: [],
    rotom_sniper_enabled: false
  };

  const mockWv = {
    executeJavaScript: async (code) => {
      const mockWindow = {
        PIOSniperStorage: {
          get: async () => ({ rotom_sniper_rules: actualStorage.rotom_sniper_rules }),
          set: async (d) => { Object.assign(actualStorage, d); }
        },
        postMessage: () => {}
      };
      const fn = new Function('window', `return (${code});`);
      return await fn(mockWindow);
    }
  };

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false,
    ensurePresetLoaded: async () => {}
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  assert.equal(SniperPanel.isOpen(), false, 'Painel central não deve precisar estar aberto');

  const res = await SniperPanel.restoreConfiguredVisualAccount(0);
  assert.equal(res.ok, true);
  assert.equal(actualStorage.rotom_sniper_enabled, true);
  assert.equal(actualStorage.rotom_sniper_rules.length, 1);
  assert.equal(actualStorage.rotom_sniper_rules[0].id, 'rule_bg_1');
  assert.equal(actualStorage.rotom_sniper_rules[0].totalBought, 2);
});

// ---------------------------------------------------------------------------
// 10. flush(index) Descarrega Logs e Progresso Pré-Blaster
// ---------------------------------------------------------------------------
test('flush(index) envia progress [{id, totalBought}] e logs antes do blaster e desativa visual', async () => {
  let ingestedIndex = null;
  let ingestedLogs = null;
  let ingestedProgress = null;

  globalThis.pokeAPI = {
    sniperGetState: async () => ({
      accounts: [{ index: 0, configured: true, enabled: true, rules: [{ id: 'r_fl', totalBought: 2 }], config: {}, logs: [] }],
      version: 1
    }),
    sniperIngest: async (idx, logs, progress) => {
      ingestedIndex = idx;
      ingestedLogs = logs;
      ingestedProgress = progress;
      return { ok: true };
    }
  };

  let disabledInVisual = false;
  const mockWv = {
    executeJavaScript: async (code) => {
      if (code.includes('rotom_sniper_enabled: false')) disabledInVisual = true;
      return {
        ok: true,
        logs: [{ id: 'l1', msg: 'Bought Water Stone' }],
        rules: [{ id: 'r_fl', totalBought: 4 }]
      };
    }
  };

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  const res = await SniperPanel.flush(0);
  assert.equal(res.ok, true);
  assert.equal(ingestedIndex, 0);
  assert.equal(ingestedLogs.length, 1);
  assert.deepEqual(ingestedProgress, [{ id: 'r_fl', totalBought: 4 }]);
  assert.equal(disabledInVisual, true, 'Deve ter desativado o motor visual para não competir com blaster');
});

test('flush(index) pula contas não configuradas sem erro', async () => {
  globalThis.pokeAPI = {
    sniperGetState: async () => ({
      accounts: [{ index: 1, configured: false, enabled: false, rules: [], config: {}, logs: [] }],
      version: 1
    })
  };

  const res = await SniperPanel.flush(1);
  assert.equal(res.ok, true);
  assert.equal(res.skipped, true);
});

// ---------------------------------------------------------------------------
// 11. Falha de flush Bloqueia Inicialização do Blaster
// ---------------------------------------------------------------------------
test('falha no flush bloqueia blasterStart e blasterStartWithLogin no tauri-bridge', async () => {
  const invokedCommands = [];
  globalThis.window = globalThis;
  globalThis.window.addEventListener = () => {};
  globalThis.window.removeEventListener = () => {};
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.document = {
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add: () => {} } }),
    body: { classList: { contains: () => false } }
  };
  globalThis.customElements = {
    define: () => {}
  };
  globalThis.HTMLElement = class {};

  globalThis.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        invokedCommands.push({ cmd, args });
        return { ok: true };
      }
    },
    event: {
      listen: async () => () => {}
    }
  };

  const bridgeCode = fs.readFileSync('rust-migration/ui/tauri-bridge.js', 'utf8');
  eval(bridgeCode);

  globalThis.PioSniperPanel = {
    flush: async (idx) => {
      throw new Error('Falha simulada no flush da conta ' + idx);
    }
  };

  const startRes = await globalThis.pokeAPI.blasterStart(0);
  assert.equal(startRes.ok, false);
  assert.match(startRes.error, /Falha simulada no flush/);
  assert.equal(invokedCommands.filter(c => c.cmd === 'blaster_start').length, 0, 'blaster_start NÃO deve ser invocado se flush falhar');

  const startLoginRes = await globalThis.pokeAPI.blasterStartWithLogin(0, {});
  assert.equal(startLoginRes.ok, false);
  assert.match(startLoginRes.error, /Falha simulada no flush/);
  assert.equal(invokedCommands.filter(c => c.cmd === 'blaster_start').length, 0, 'blaster_start NÃO deve ser invocado se flush falhar no blasterStartWithLogin');
});

// ---------------------------------------------------------------------------
// 12. Telas de Autenticação / Login Não Recebem Injeção de Scripts
// ---------------------------------------------------------------------------
test('telas de autenticação/login não recebem injeção de userscripts (usNoLogin guard)', async () => {
  const html = fs.readFileSync('rust-migration/ui/index.html', 'utf8');
  const match = html.match(/const usNoLoginUrl = \((.*?)\) => {([\s\S]*?)};/);
  assert.ok(match, 'usNoLoginUrl deve estar presente no index.html');

  const usNoLoginUrl = new Function(match[1], match[2]);

  assert.equal(usNoLoginUrl('https://pokeidle.io/login'), true, 'Deve bloquear /login');
  assert.equal(usNoLoginUrl('https://pokeidle.io/register'), true, 'Deve bloquear /register');
  assert.equal(usNoLoginUrl('https://pokeidle.io/forgot-password'), true, 'Deve bloquear /forgot-password');
  assert.equal(usNoLoginUrl('https://pokeidle.io/verify-email'), true, 'Deve bloquear /verify-email');
  assert.equal(usNoLoginUrl('https://pokeidle.io/game'), false, 'Deve permitir /game');
  assert.equal(usNoLoginUrl('about:blank'), true, 'Deve bloquear about:blank');

  let injected = false;
  const mockLoginWv = {
    getURL: () => 'https://pokeidle.io/login',
    executeJavaScript: async () => { injected = true; }
  };

  const res = await (async (wv) => {
    if (usNoLoginUrl(wv.getURL())) {
      wv.__pgSemScripts = true;
      return { ok: false, reason: 'login_screen' };
    }
    await wv.executeJavaScript('run');
    return { ok: true };
  })(mockLoginWv);

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'login_screen');
  assert.equal(injected, false, 'Não deve injetar na tela de login');
});

// ---------------------------------------------------------------------------
// 13. Verificações de Integração em tauri-bridge, index.html e css
// ---------------------------------------------------------------------------
test('tauri-bridge.js invoca flush antes de blasterStart e blasterStartWithLogin', () => {
  const bridge = fs.readFileSync('rust-migration/ui/tauri-bridge.js', 'utf8');
  assert.ok(bridge.includes('window.PioSniperPanel.flush(index)'), 'Deve chamar flush antes de iniciar o blaster');
  assert.ok(bridge.includes("'#sniperOverlay.show'"), 'Deve registrar #sniperOverlay.show em REAL_MODAL_SELECTORS');
  assert.ok(bridge.includes('sniperIngest: (index, logs, progress)'), 'sniperIngest deve aceitar parâmetro progress');
  assert.ok(bridge.includes('restoreConfiguredVisualAccount(index)'), 'blasterStop deve restaurar conta configurada');
});

test('sniper-panel.css tem tabs row sem overflow vertical e sem halos', () => {
  const css = fs.readFileSync('rust-migration/ui/src/ui/sniper-panel.css', 'utf8');
  assert.equal(css.includes('.sniper-eyebrow'), false, 'sniper-eyebrow deve ser removido');
  assert.equal(css.includes('backdrop-filter'), false, 'backdrop-filter deve ser removido');
  assert.equal(css.includes('inset'), false, 'halo inset deve ser removido');
  assert.ok(css.includes('overflow-y: hidden'), 'tabs row deve ter overflow-y: hidden');
  assert.ok(css.includes('flex-shrink: 0'), 'tabs row deve ter flex-shrink: 0');
});

test('index.html expõe __PIO_SNIPER_INTEGRATION__ e hooks de ciclo de vida', () => {
  const html = fs.readFileSync('rust-migration/ui/index.html', 'utf8');
  assert.ok(html.includes('window.__PIO_SNIPER_INTEGRATION__ ='), 'index.html deve expor __PIO_SNIPER_INTEGRATION__');
  assert.ok(html.includes('restoreConfiguredVisualAccount'), 'injectScripts deve chamar restoreConfiguredVisualAccount');
  assert.ok(html.includes('preseedVisualAccount'), 'injectScripts deve chamar preseedVisualAccount');
  assert.ok(html.includes('id="sniperBtn"'), 'Deve conter o botão de abertura');
});

test('títulos de seção e colunas atendem ao contrato visual (Configuração para as 4 contas, Limite usado)', () => {
  const panelJs = fs.readFileSync('rust-migration/ui/src/ui/sniper-panel.js', 'utf8');
  assert.ok(panelJs.includes('Configuração para as 4 contas'), 'Título da seção universal deve ser "Configuração para as 4 contas"');
  assert.ok(panelJs.includes('Limite usado (inclui ordens pendentes ou incertas)'), 'Coluna deve ter título explicativo de limite usado');
});

// ---------------------------------------------------------------------------
// 14. Paridade 1.5.2: Categorias, Radares, Cadência e Catálogo
// ---------------------------------------------------------------------------
test('validação de regras por categoria canônica aceita categorias válidas e rejeita inválidas', () => {
  const validStone = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 50000,
    maxQty: 10
  });
  assert.equal(validStone.ok, true);
  assert.equal(validStone.rule.targetType, 'category');
  assert.equal(validStone.rule.targetCategory, 'stone');
  assert.equal(validStone.rule.targetName, 'Pedras');
  assert.equal(validStone.rule.targetId, null, 'targetId deve ser null em regras por categoria');
  assert.equal(validStone.rule.maxQty, 10);

  const validTm = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'tm',
    maxPriceGems: 15,
    infinite: true
  });
  assert.equal(validTm.ok, true);
  assert.equal(validTm.rule.targetCategory, 'tm');
  assert.equal(validTm.rule.targetName, 'TMs');
  assert.equal(validTm.rule.targetId, null);
  assert.equal(validTm.rule.infinite, true);

  const invalidCategory = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'pocao_invalida',
    maxPriceGold: 1000
  });
  assert.equal(invalidCategory.ok, false);
  assert.match(invalidCategory.error, /Categoria inválida/);
});

test('validateConfig valida tetos obrigatórios para opções de radar ativas', () => {
  // Shiny ativo sem teto
  const shinyNoCeiling = SniperPanel.validateConfig({
    snipeAnyShiny: true,
    maxPriceShinyGold: 0,
    maxPriceShinyGems: 0
  });
  assert.equal(shinyNoCeiling.ok, false);
  assert.match(shinyNoCeiling.error, /Qualquer Shiny/);

  // Shiny com teto válido
  const shinyValid = SniperPanel.validateConfig({
    snipeAnyShiny: true,
    maxPriceShinyGold: 500000,
    maxPriceShinyGems: 0
  });
  assert.equal(shinyValid.ok, true);

  // P5 ativo sem teto
  const p5NoCeiling = SniperPanel.validateConfig({
    snipeAnyP5: true,
    maxPriceP5Gold: 0,
    maxPriceP5Gems: 0
  });
  assert.equal(p5NoCeiling.ok, false);
  assert.match(p5NoCeiling.error, /Qualquer P5/);

  // P5 com teto de gemas
  const p5Valid = SniperPanel.validateConfig({
    snipeAnyP5: true,
    maxPriceP5Gold: 0,
    maxPriceP5Gems: 25
  });
  assert.equal(p5Valid.ok, true);

  // Nota mínima ativa sem teto
  const noteNoCeiling = SniperPanel.validateConfig({
    snipeByNote: true,
    minNote: 8.5,
    maxPriceNoteGold: 0,
    maxPriceNoteGems: 0
  });
  assert.equal(noteNoCeiling.ok, false);
  assert.match(noteNoCeiling.error, /Nota mínima/);

  // Nota mínima fora do intervalo 1..10
  const noteOutOfRangeLow = SniperPanel.validateConfig({
    snipeByNote: true,
    minNote: 0.5,
    maxPriceNoteGold: 10000
  });
  assert.equal(noteOutOfRangeLow.ok, false);
  assert.match(noteOutOfRangeLow.error, /entre 1.0 e 10.0/);

  const noteOutOfRangeHigh = SniperPanel.validateConfig({
    snipeByNote: true,
    minNote: 11.0,
    maxPriceNoteGold: 10000
  });
  assert.equal(noteOutOfRangeHigh.ok, false);
  assert.match(noteOutOfRangeHigh.error, /entre 1.0 e 10.0/);

  // Nota mínima válida
  const noteValid = SniperPanel.validateConfig({
    snipeByNote: true,
    minNote: 8.5,
    maxPriceNoteGold: 100000
  });
  assert.equal(noteValid.ok, true);
  assert.equal(noteValid.config.minNote, 8.5);
});

test('validateConfig sincroniza aliases de diamantes e gemas e valida slots', () => {
  const cfg = SniperPanel.validateConfig({
    maxPriceShinyGems: 50,
    maxPriceP5Diamonds: 30,
    maxActiveSlots: 10,
    autoMaxAffordable: true
  });
  assert.equal(cfg.ok, true);
  assert.equal(cfg.config.maxPriceShinyDiamonds, 50, 'maxPriceShinyDiamonds deve ser igual a maxPriceShinyGems');
  assert.equal(cfg.config.maxPriceP5Gems, 30, 'maxPriceP5Gems deve ser sincronizado a partir de maxPriceP5Diamonds');
  assert.equal(cfg.config.maxActiveSlots, 10);
  assert.equal(cfg.config.autoMaxAffordable, true);

  const invalidSlots = SniperPanel.validateConfig({ maxActiveSlots: 99 });
  assert.equal(invalidSlots.ok, false);
  assert.match(invalidSlots.error, /slots ativos deve ser entre 1 e 50/);
});

test('modo de cadência padrão é original e preserva intervalos ao alternar para adaptativo', () => {
  const def = SniperPanel.createDefaultConfig();
  assert.equal(def.scanMode, 'original');
  assert.equal(def.scanIntervalMs, 45000);
  assert.equal(def.fastScanIntervalMs, 3000);

  const st = SniperPanel.getState();
  const d = st.drafts[0];
  d.config.scanMode = 'adaptive';
  d.config.scanIntervalMs = 60000;
  d.config.fastScanIntervalMs = 5000;

  // Alterna de volta para original
  d.config.scanMode = 'original';
  assert.equal(d.config.scanIntervalMs, 60000, 'Preserva valor customizado em scanIntervalMs');
  assert.equal(d.config.fastScanIntervalMs, 5000, 'Preserva valor customizado em fastScanIntervalMs');
});

test('applyAll espelha configuração completa de radar e cadência para as 4 contas', async () => {
  let savedIndices = null;
  let savedSettings = null;

  globalThis.pokeAPI = {
    sniperSave: async (indices, settings) => {
      savedIndices = indices;
      savedSettings = settings;
      return {
        accounts: indices.map(idx => ({
          index: idx,
          configured: true,
          enabled: settings.enabled,
          rules: settings.rules,
          config: settings.config,
          logs: []
        }))
      };
    }
  };

  const templateRules = [
    { id: 'r_cat', targetType: 'category', targetCategory: 'stone', targetName: 'Pedras', targetId: null, maxPriceGold: 20000, maxPriceGems: 0, maxQty: 5, active: true }
  ];

  const templateConfig = {
    scanMode: 'adaptive',
    scanIntervalMs: 30000,
    fastScanIntervalMs: 2000,
    snipeAnyShiny: true,
    maxPriceShinyGold: 1000000,
    maxPriceShinyGems: 10,
    maxActiveSlots: 8,
    autoMaxAffordable: true
  };

  const res = await SniperPanel.applyAll(templateRules, true, templateConfig);
  assert.equal(res.ok, true);
  assert.deepEqual(savedIndices, [0, 1, 2, 3]);
  assert.equal(savedSettings.config.snipeAnyShiny, true);
  assert.equal(savedSettings.config.maxPriceShinyGold, 1000000);
  assert.equal(savedSettings.config.maxPriceShinyGems, 10);
  assert.equal(savedSettings.config.maxActiveSlots, 8);
  assert.equal(savedSettings.config.scanMode, 'adaptive');

  // Verifica se o estado local das 4 contas foi atualizado
  const st = SniperPanel.getState();
  for (let i = 0; i < 4; i++) {
    assert.equal(st.accounts[i].config.snipeAnyShiny, true);
    assert.equal(st.accounts[i].config.maxPriceShinyGold, 1000000);
    assert.equal(st.accounts[i].config.maxActiveSlots, 8);
    assert.equal(st.drafts[i].config.snipeAnyShiny, true);
  }
});

test('catálogo compartilhado contém 80 itens e loadCatalog expõe a lista completa com integridade e aliases', async () => {
  const catalog = await SniperPanel.loadCatalog();
  assert.equal(Array.isArray(catalog), true);
  assert.equal(catalog.length, 80, 'Catálogo deve ter exatamente 80 itens mapeados');
  const categories = new Set(catalog.map(c => c.category));
  assert.ok(categories.has('stone'), 'Deve conter categoria stone');
  assert.ok(categories.has('tm'), 'Deve conter categoria tm');
  assert.ok(categories.has('rare_loot'), 'Deve conter categoria rare_loot');
  assert.ok(categories.has('beast'), 'Deve conter categoria beast');
  assert.ok(categories.has('casa'), 'Deve conter categoria casa');
  assert.ok(categories.has('box'), 'Deve conter categoria box');
  assert.ok(categories.has('bicicleta'), 'Deve conter categoria bicicleta');
  assert.ok(categories.has('fragment'), 'Deve conter nova categoria fragment');
  assert.ok(categories.has('ticket'), 'Deve conter nova categoria ticket');

  // rare_loot permanece exclusivamente com os 4 itens originais
  const rareLootItems = catalog.filter(it => it.category === 'rare_loot');
  assert.equal(rareLootItems.length, 4, 'rare_loot deve conter exatamente os 4 itens originais');
  const rareLootIds = rareLootItems.map(it => it.id).sort((a, b) => a - b);
  assert.deepEqual(rareLootIds, [70000, 70011, 70012, 70013]);

  // Aliases mapeados em 7 entradas
  const withAliases = catalog.filter(it => Array.isArray(it.aliases) && it.aliases.length > 0);
  assert.equal(withAliases.length, 17, 'Devem existir 17 itens com aliases mapeados (incluindo casas, bikes e fragmentos)');

  const zmove = catalog.find(it => it.id === 59194);
  assert.ok(zmove && zmove.aliases.includes('Fragmento de Z-Move'), 'TM Disk Piece deve conter alias Fragmento de Z-Move');

  const shinyStoneFrag = catalog.find(it => it.id === 70012);
  assert.ok(shinyStoneFrag && shinyStoneFrag.aliases.includes('Fragmento de Shiny Stone'));

  const keyFrag = catalog.find(it => it.id === 70011);
  assert.ok(keyFrag && keyFrag.aliases.includes('Fragmento de Chave'));

  const bikeFrag = catalog.find(it => it.id === 70013);
  assert.ok(bikeFrag && bikeFrag.aliases.includes('Fragmento de Bicicleta'));

  const megaStoneFrag = catalog.find(it => it.id === 70014);
  assert.ok(megaStoneFrag && megaStoneFrag.aliases.includes('Mega Stone Fragment') && megaStoneFrag.category === 'fragment');

  const megaShinyStoneFrag = catalog.find(it => it.id === 70015);
  assert.ok(megaShinyStoneFrag && megaShinyStoneFrag.aliases.includes('Mega Shiny Stone Fragment') && megaShinyStoneFrag.category === 'fragment');

  const shinyEggFrag = catalog.find(it => it.id === 70017);
  assert.ok(shinyEggFrag && shinyEggFrag.aliases.includes('Shiny Egg Fragment') && shinyEggFrag.category === 'fragment');
});

test('alternância item -> categoria -> pokémon preserva preços e quantidades digitados', () => {
  const st = SniperPanel.getState();
  st.ruleDraft = {
    targetType: 'item',
    targetName: 'Water Stone',
    targetId: '142',
    targetCategory: 'stone',
    catalogCategoryFilter: '',
    maxPriceGold: 7500,
    maxPriceGems: 3,
    maxQty: 12,
    infinite: false,
    active: true
  };

  // Simula alternância para categoria
  st.ruleDraft.targetType = 'category';
  st.ruleDraft.targetCategory = 'tm';
  assert.equal(st.ruleDraft.maxPriceGold, 7500, 'Preserva maxPriceGold ao mudar para category');
  assert.equal(st.ruleDraft.maxPriceGems, 3, 'Preserva maxPriceGems ao mudar para category');
  assert.equal(st.ruleDraft.maxQty, 12, 'Preserva maxQty ao mudar para category');

  // Alterna para pokémon
  st.ruleDraft.targetType = 'pokemon';
  assert.equal(st.ruleDraft.maxPriceGold, 7500, 'Preserva maxPriceGold ao mudar para pokemon');
  assert.equal(st.ruleDraft.maxPriceGems, 3, 'Preserva maxPriceGems ao mudar para pokemon');
  assert.equal(st.ruleDraft.maxQty, 12, 'Preserva maxQty ao mudar para pokemon');
});

test('validateConfig e validateRule rejeitam estritamente valores não inteiros, infinitos, negativos ou desconhecidos', () => {
  // targetType desconhecido
  const unkType = SniperPanel.validateRule({
    targetType: 'item_magico',
    targetName: 'Item',
    maxPriceGold: 1000
  });
  assert.equal(unkType.ok, false);
  assert.match(unkType.error, /Tipo de alvo inválido/);

  // Preço fracionário ou infinito
  const fractPrice = SniperPanel.validateConfig({
    snipeAnyShiny: true,
    maxPriceShinyGold: 10.5
  });
  assert.equal(fractPrice.ok, false);
  assert.match(fractPrice.error, /número inteiro não negativo/);

  const infPrice = SniperPanel.validateConfig({
    snipeAnyShiny: true,
    maxPriceShinyGold: Infinity
  });
  assert.equal(infPrice.ok, false);
  assert.match(infPrice.error, /número inteiro não negativo/);

  const negPrice = SniperPanel.validateConfig({
    snipeAnyShiny: true,
    maxPriceShinyGold: -500
  });
  assert.equal(negPrice.ok, false);
  assert.match(negPrice.error, /número inteiro não negativo/);

  // Nota com mais de uma casa decimal (não arredonda silenciosamente)
  const noteMultiDecimal = SniperPanel.validateConfig({
    snipeByNote: true,
    minNote: 7.25,
    maxPriceNoteGold: 10000
  });
  assert.equal(noteMultiDecimal.ok, false);
  assert.match(noteMultiDecimal.error, /no máximo uma casa decimal/);

  // scanMode desconhecido
  const unkMode = SniperPanel.validateConfig({
    scanMode: 'ultra_fast'
  });
  assert.equal(unkMode.ok, false);
  assert.match(unkMode.error, /Modo de cadência inválido/);

  // scanIntervalMs < 1000
  const lowInterval = SniperPanel.validateConfig({
    scanIntervalMs: 800
  });
  assert.equal(lowInterval.ok, false);
  assert.match(lowInterval.error, /maior ou igual a 1000ms/);

  // fastScanIntervalMs < 500
  const lowFastInterval = SniperPanel.validateConfig({
    fastScanIntervalMs: 200
  });
  assert.equal(lowFastInterval.ok, false);
  assert.match(lowFastInterval.error, /maior ou igual a 500ms/);
});

test('alias legado maxPriceNoteDiamonds:4 é preservado através do fluxo de importação e salvamento', async () => {
  let savedSnapshot = null;
  globalThis.pokeAPI = {
    sniperSave: async (indices, settings) => {
      savedSnapshot = settings;
      return {
        accounts: [{ index: 2, configured: true, enabled: settings.enabled, rules: settings.rules, config: settings.config, logs: [] }]
      };
    }
  };

  const mockWv = {
    executeJavaScript: async (code) => {
      if (code.includes('rotom_sniper_rules')) {
        return {
          ok: true,
          rules: [{ id: 'r_legacy', targetType: 'item', targetName: 'TM Piece', targetId: 40530, maxPriceGold: 5000, maxPriceGems: 0, maxQty: 2, active: true }],
          enabled: true,
          config: {
            snipeByNote: true,
            minNote: 8.0,
            maxPriceNoteDiamonds: 4
            // SEM maxPriceNoteGems explícito no legado
          }
        };
      }
      return { ok: true };
    }
  };

  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => mockWv,
    isAccountOff: () => false,
    ensurePresetLoaded: async () => ({ ok: true })
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  // Importa da conta visual 2
  await SniperPanel.importFromVisual(2);
  const draft = SniperPanel.getState().drafts[2];
  assert.equal(draft.config.maxPriceNoteDiamonds, 4);
  assert.equal(draft.config.maxPriceNoteGems, 4, 'maxPriceNoteGems deve ser normalizado para 4 sem ser mascarado por default 0');

  // Salva no backend
  const saveRes = await SniperPanel.saveAccount(2);
  assert.equal(saveRes.ok, true);
  assert.equal(savedSnapshot.config.maxPriceNoteGems, 4);
  assert.equal(savedSnapshot.config.maxPriceNoteDiamonds, 4);
});

test('intervalos fracionários mantêm precisão em segundos e valores inválidos são rejeitados', async () => {
  // fastScanIntervalMs 2500ms -> 2.5s exato sem Math.round
  const fastMs = 2500;
  const secs = fastMs / 1000;
  assert.equal(secs, 2.5, '2500ms deve ser 2.5s');

  const valid = SniperPanel.validateConfig({
    scanMode: 'adaptive',
    scanIntervalMs: 15000,
    fastScanIntervalMs: 2500
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.config.fastScanIntervalMs, 2500);

  // Tentativa de salvar intervalo inválido é rejeitada no validateConfig
  const zeroInterval = SniperPanel.validateConfig({
    scanIntervalMs: 0
  });
  assert.equal(zeroInterval.ok, false);
  assert.match(zeroInterval.error, /maior ou igual a 1000ms/);

  const negFast = SniperPanel.validateConfig({
    fastScanIntervalMs: -100
  });
  assert.equal(negFast.ok, false);
  assert.match(negFast.error, /maior ou igual a 500ms/);
});


test('validação de regras por categoria com excludedItemIds', () => {
  // Regra válida de categoria stone com exclusão válida e deduplicação
  const valid = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: [142, 53, 142]
  });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.rule.excludedItemIds, [142, 53], 'Deve deduplicar IDs de exclusão');
  assert.equal(valid.rule.targetCategory, 'stone');

  // Regra sem excludedItemIds normaliza para array vazio
  const emptyExcl = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000
  });
  assert.equal(emptyExcl.ok, true);
  assert.deepEqual(emptyExcl.rule.excludedItemIds, []);

  // Rejeita excludedItemIds não array
  const invalidType = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: '142'
  });
  assert.equal(invalidType.ok, false);
  assert.match(invalidType.error, /array de IDs numéricos/);

  // Rejeita ID não inteiro positivo
  const invalidId = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: [142, -5]
  });
  assert.equal(invalidId.ok, false);
  assert.match(invalidId.error, /inteiro positivo/);

  // Rejeita ID de outra categoria (ex: TM Disk Piece 59194 na categoria stone)
  const wrongCat = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: [59194]
  });
  assert.equal(wrongCat.ok, false);
  assert.match(wrongCat.error, /não pertence à categoria 'stone'/);

  // Não muta o objeto original recebido na validação
  const inputRule = {
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: [142, 53]
  };
  const resNonMut = SniperPanel.validateRule(inputRule);
  assert.equal(resNonMut.ok, true);
  assert.notStrictEqual(resNonMut.rule.excludedItemIds, inputRule.excludedItemIds);

  // Rejeita valores coerced como [[2]], true, objetos e strings
  const invalidCoerced1 = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: [[142]]
  });
  assert.equal(invalidCoerced1.ok, false);
  assert.match(invalidCoerced1.error, /inteiro positivo/);

  const invalidCoerced2 = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: [true]
  });
  assert.equal(invalidCoerced2.ok, false);
  assert.match(invalidCoerced2.error, /inteiro positivo/);

  const invalidCoerced3 = SniperPanel.validateRule({
    targetType: 'category',
    targetCategory: 'stone',
    maxPriceGold: 5000,
    excludedItemIds: [{ id: 142 }]
  });
  assert.equal(invalidCoerced3.ok, false);
  assert.match(invalidCoerced3.error, /inteiro positivo/);

  // Regras de item ou pokemon com exclusões não vazias geram erro explícito
  const itemRuleWithExcl = SniperPanel.validateRule({
    targetType: 'item',
    targetName: 'Water Stone',
    targetId: '142',
    maxPriceGold: 5000,
    excludedItemIds: [142]
  });
  assert.equal(itemRuleWithExcl.ok, false);
  assert.match(itemRuleWithExcl.error, /só podem ser configuradas em regras de categoria/);

  // Regras de item ou pokemon com exclusões vazias [] são aceitas
  const itemRuleEmptyExcl = SniperPanel.validateRule({
    targetType: 'item',
    targetName: 'Water Stone',
    targetId: '142',
    maxPriceGold: 5000,
    excludedItemIds: []
  });
  assert.equal(itemRuleEmptyExcl.ok, true);
  assert.deepEqual(itemRuleEmptyExcl.rule.excludedItemIds, []);
});

test('applyAll preserva excludedItemIds replicados defensivamente para todas as 4 contas', async () => {
  globalThis.pokeAPI = {
    sniperSave: async (indices, settings) => ({
      accounts: indices.map(idx => ({
        index: idx,
        configured: true,
        enabled: settings.enabled,
        rules: settings.rules,
        config: settings.config,
        logs: []
      })),
      version: 1
    })
  };

  const templateRules = [
    {
      id: 'r_cat_1',
      targetType: 'category',
      targetCategory: 'stone',
      targetName: 'Pedras',
      maxPriceGold: 10000,
      maxPriceGems: 0,
      maxQty: 10,
      infinite: false,
      active: true,
      excludedItemIds: [142, 53]
    }
  ];

  const res = await SniperPanel.applyAll(templateRules, true, {
    scanMode: 'original',
    scanIntervalMs: 45000,
    fastScanIntervalMs: 3000
  });

  assert.equal(res.ok, true);
  const st = SniperPanel.getState();
  for (let i = 0; i < 4; i++) {
    const accDraft = st.drafts[i];
    assert.ok(accDraft, `Conta ${i} deve ter draft`);
    assert.equal(accDraft.rules.length, 1);
    assert.deepEqual(accDraft.rules[0].excludedItemIds, [142, 53], `Conta ${i} deve ter excludedItemIds preservados`);
    assert.notStrictEqual(accDraft.rules[0].excludedItemIds, templateRules[0].excludedItemIds);
  }
});

test('histórico do painel filtra exclusivamente compras confirmadas e formata item, qtd, vendedor, moeda e anúncio', async () => {
  const nonSuccessStatuses = [
    'AGENDADO', 'DISPARADO', 'PROGRESSO', 'RECUSADO', 'PERDIDO',
    'DIAGNOSTICO', 'INCERTO', 'INCERTO_DESCONEXAO', 'SALDO_INSUFICIENTE',
    'FALHA_ENVIO', 'EXPIRADO', 'error'
  ];
  for (const st of nonSuccessStatuses) {
    assert.equal(SniperPanel.isConfirmedSuccessLog({ id: 'n_' + st, status: st, targetName: 'Cocoon Stone' }), false, `Status ${st} não deve aparecer no histórico`);
  }
  assert.equal(SniperPanel.isConfirmedSuccessLog({ id: 'ok_1', status: 'CONFIRMADO', targetName: 'Leaf Stone' }), true);
  assert.equal(SniperPanel.isConfirmedSuccessLog({ id: 'ok_2', status: 'ok', targetName: 'Fire Stone' }), true);
  assert.equal(SniperPanel.isConfirmedSuccessLog({ id: 'legacy_1', msg: 'Bought Water Stone' }), true);
  assert.equal(SniperPanel.isConfirmedSuccessLog({ id: 'fail_flag', status: 'CONFIRMADO', falha: true }), false);

  const summaryCoinsBatch = SniperPanel.formatConfirmedPurchaseSummary({
    status: 'CONFIRMADO',
    targetName: 'Leaf Stone',
    seller: '@exed',
    qty: 65,
    price: 2,
    currency: 'gold',
    offerId: 48291,
    details: 'Anúncio #48291 · Regra: Pedras'
  });
  assert.match(summaryCoinsBatch, /^65x Leaf Stone de @exed — por 2 Coins\/un \(Total: 130 Coins\) \(#48291\)$/);

  const summaryGemsSingle = SniperPanel.formatConfirmedPurchaseSummary({
    status: 'CONFIRMADO',
    targetName: 'Item #142',
    seller: 'Ash',
    qty: 1,
    price: 15,
    currency: 'orb',
    offerId: 9001
  });
  assert.match(summaryGemsSingle, /^1x Water Stone de @Ash — por 15 Gemas \(#9001\)$/);

  // Regra por categoria gravada anteriormente com targetName="Pedras" e details="✅ Confirmado pelo servidor: 140× Cocoon Stone"
  const summaryLegacyCategory = SniperPanel.formatConfirmedPurchaseSummary({
    status: 'CONFIRMADO',
    targetName: 'Pedras',
    seller: 'Rusuel',
    qty: 140,
    price: 10000,
    currency: 'gold',
    offerId: 623832,
    details: '✅ Confirmado pelo servidor: 140× Cocoon Stone'
  });
  assert.equal(summaryLegacyCategory, '140x Cocoon Stone de @Rusuel — por 10.000 Coins/un (Total: 1.400.000 Coins) (#623832)');

  let ingestedBatch = null;
  globalThis.pokeAPI = {
    sniperGetState: async () => ({
      accounts: [{ index: 0, configured: true, enabled: true, rules: [{ id: 'r1', totalBought: 1 }], config: {}, logs: [] }],
      version: 1
    }),
    sniperIngest: async (_idx, logs) => {
      ingestedBatch = logs;
      return { ok: true };
    }
  };
  globalThis.__PIO_SNIPER_INTEGRATION__ = {
    getWebview: () => ({
      executeJavaScript: async () => ({
        ok: true,
        rules: [{ id: 'r1', totalBought: 2 }],
        logs: [
          { id: 'noise_1', status: 'AGENDADO', targetName: 'Leaf Stone' },
          { id: 'noise_2', status: 'DISPARADO', targetName: 'Leaf Stone' },
          { id: 'noise_3', status: 'RECUSADO', targetName: 'Leaf Stone' },
          { id: 'noise_4', status: 'PERDIDO', targetName: 'Leaf Stone' },
          { id: 'win_1', status: 'CONFIRMADO', targetName: 'Leaf Stone', seller: 'exed', qty: 10, price: 2, currency: 'gold', offerId: 777 }
        ]
      })
    }),
    isAccountOff: () => false
  };
  globalThis.PioBattleHud = { isBlasterActive: () => false };

  const flushRes = await SniperPanel.flush(0);
  assert.equal(flushRes.ok, true);
  assert.equal(ingestedBatch.length, 1, 'Flush só deve enviar logs CONFIRMADO para o backend');
  assert.equal(ingestedBatch[0].id, 'win_1');
});
