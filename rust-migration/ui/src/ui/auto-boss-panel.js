/**
 * Configurador do Auto Boss. O catálogo e a quantidade de tokens vêm do estado
 * autoritativo do supervisor; dados de combate e drops nunca são sintetizados.
 */
((root) => {
  'use strict';

  const MAX_ACCOUNTS = 4;
  const BASE = 'src/ui/assets/boss-drops/';
  // Lista verificada dos arquivos estáticos do catálogo original copiados para o launcher.
  const KNOWN_SPRITES = new Set([
    '70000', '70011', '70012', '70013', '70014', '70015', '70017',
    '70040', '70041', '70042', '70043', '70044', '70060', '70061',
    '70080', '70081', '70082', '70083', '70084', '70090', '70091',
    '70092', '70093', '70094', '70095'
  ]);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const asList = (value) => Array.isArray(value) ? value : [];
  const number = (value, fallback = 0) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
  const nonnegative = value => Math.max(0, Math.floor(number(value)));
  const integer = value => typeof value !== 'boolean' && value != null && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  const fmt = value => nonnegative(value).toLocaleString('pt-BR');
  const STATUS_LABELS = {
    idle: 'Aguardando',
    waiting: 'Aguardando',
    waiting_tokens: 'Aguardando tokens',
    waiting_next: 'Aguardando intervalo do boss',
    entering: 'Entrando na arena',
    fighting: 'Em combate',
    victory: 'Vitória',
    defeat: 'Derrota',
    left: 'Fora da arena',
    completed: 'Concluído',
    uncertain: 'Resultado a verificar',
    disconnected: 'Desconectada',
    save_error: 'Erro ao salvar'
  };
  const statusLabel = value => STATUS_LABELS[String(value || '').toLowerCase()] || String(value || '');
  const pct = value => {
    if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1) return '';
    const n = Math.max(0, Number(value)) * 100;
    return n.toLocaleString('pt-BR', { maximumFractionDigits: n < 0.1 ? 4 : 2 }) + '%';
  };

  function normalizeDrop(drop, items = {}) {
    if (typeof drop === 'string') return { id: '', name: drop, chance: null, quantity: null };
    if (!drop || typeof drop !== 'object') return null;
    const id = String(drop.itemId ?? drop.item_id ?? drop.id ?? '');
    const info = items[id];
    const rawQuantity = Array.isArray(drop.qtd) ? drop.qtd : (Array.isArray(drop.quantity) ? drop.quantity : null);
    const quantity = rawQuantity?.length >= 1 && rawQuantity.length <= 2 &&
      rawQuantity.every(integer) && (rawQuantity.length === 1 || Number(rawQuantity[0]) <= Number(rawQuantity[1]))
      ? rawQuantity.map(Number) : null;
    const rawChance = drop.chance ?? drop.rate;
    const chance = rawChance != null && rawChance !== '' && typeof rawChance !== 'boolean' && Number.isFinite(Number(rawChance))
      && Number(rawChance) >= 0 && Number(rawChance) <= 1 ? Number(rawChance) : null;
    const name = String(info?.name || drop.nome || drop.name || drop.item_name || (id ? 'Item #' + id : 'Item'));
    return {
      id,
      name,
      chance,
      quantity
    };
  }

  function normalizeBoss(raw, items = {}) {
    if (!raw || typeof raw !== 'object' || !raw.key) return null;
    const entry = raw.entrada || {};
    const itemId = entry.itemId ?? raw.item_id ?? raw.item;
    const cost = entry.qtd ?? raw.item_cost ?? (itemId == null ? null : 1);
    const tokenCost = itemId == null || !integer(cost) ? null : Number(cost);
    const drops = asList(raw.drops).map(drop => normalizeDrop(drop, items)).filter(Boolean);
    return {
      key: String(raw.key),
      name: String(raw.nome || raw.name || raw.key),
      level: nonnegative(raw.minNivelTreinador ?? raw.min_trainer_level ?? raw.min_level ?? raw.level ?? raw.nv),
      types: asList(raw.types || raw.tipos || [raw.type1, raw.type2].filter(Boolean)).map(String),
      weaknesses: asList(raw.weaknesses || raw.fraquezas).map(String),
      tokenId: itemId == null || String(itemId).trim() === '' ? null : String(itemId),
      tokenName: itemId == null ? '' : String(entry.nome || raw.item_name || items[String(itemId)]?.name || (String(itemId) === '70000' ? 'Bronze Boss Token' : 'Item #' + String(itemId))),
      tokenCost: itemId == null || String(itemId).trim() === '' ? null : tokenCost,
      drops,
      speciesId: raw.pokeId ?? raw.poke_id ?? raw.species_id ?? null,
      looktype: raw.looktype ?? null
    };
  }

  function sameDistribution(a = [], b = []) {
    const listA = asList(a);
    const listB = asList(b);
    const mapA = new Map();
    const mapB = new Map();
    const seenA = new Set();
    for (const item of listA) {
      if (!item || typeof item !== 'object') return false;
      const key = String(item.bossKey || item.boss_key || '');
      if (!key) continue;
      if (seenA.has(key)) return false;
      seenA.add(key);
      const raw = item.percent ?? item.porcentagem;
      if (raw == null || raw === '') return false;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 100) return false;
      if (n > 0) mapA.set(key, n);
    }
    const seenB = new Set();
    for (const item of listB) {
      if (!item || typeof item !== 'object') return false;
      const key = String(item.bossKey || item.boss_key || '');
      if (!key) continue;
      if (seenB.has(key)) return false;
      seenB.add(key);
      const raw = item.percent ?? item.porcentagem;
      if (raw == null || raw === '') return false;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 100) return false;
      if (n > 0) mapB.set(key, n);
    }
    if (mapA.size !== mapB.size) return false;
    for (const [key, val] of mapA.entries()) {
      if (mapB.get(key) !== val) return false;
    }
    return true;
  }

  function tokenStock(account, tokenId) {
    if (!account) return null;
    if (account.inventoryKnown === false) return null;
    const id = String(tokenId || '70000');
    if (account.inventoryKnown) {
      if (account.inventory && typeof account.inventory === 'object') {
        const val = account.inventory[id];
        return val != null && Number.isFinite(Number(val)) ? Math.max(0, Math.floor(Number(val))) : 0;
      }
      return 0;
    }
    if (account.inventory && typeof account.inventory === 'object') {
      const val = account.inventory[id];
      if (val != null && Number.isFinite(Number(val))) return Math.max(0, Math.floor(Number(val)));
      return 0;
    }
    if (id === '70000' && account.tokens != null && Number.isSafeInteger(Number(account.tokens))) {
      return account.tokens;
    }
    return null;
  }

  function isWaitingTokens(account) {
    if (!account || !account.enabled || account.mode !== 'infinite') return false;
    if (account.inArena || account.pending || account.uncertain) return false;
    if (account.status === 'waiting_tokens') return true;
    if (account.strategy === 'percent') {
      const dist = asList(account.distribution).filter(d => Number(d.percent) > 0);
      const catalog = state.catalogs[account.index]?.bosses || [];
      const weightedBosses = dist.map(d => catalog.find(b => b.key === d.bossKey)).filter(Boolean);
      if (weightedBosses.length > 0) {
        const tokenId = weightedBosses[0]?.tokenId || '70000';
        const cost = weightedBosses[0]?.tokenCost ?? 1;
        const stock = tokenStock(account, tokenId);
        if (stock != null && stock < cost) return true;
      }
    } else {
      const boss = (state.catalogs[account.index]?.bosses || []).find(b => b.key === account.bossKey);
      const cost = boss?.tokenCost ?? 1;
      const tokenId = boss?.tokenId || '70000';
      const stock = tokenStock(account, tokenId);
      if (stock != null && stock < cost) return true;
    }
    return false;
  }

  function normalizeAccount(raw, index, previous = null) {
    const fetchError = raw?.__fetchError ? String(raw.__fetchError) : '';
    if (fetchError) raw = { ...previous, index, __fetchError: fetchError, online: false, tokens: null, live: null,
      inventory: null, inventoryKnown: false, team: [], activeId: null };
    const config = raw?.config && typeof raw.config === 'object' ? raw.config : raw || {};
    const accountId = raw?.account_id ?? raw?.accountId ?? raw?.id ?? raw?.account ?? raw?.panel_index ?? raw?.index ?? index;
    const rawMode = String(config.mode || raw?.live?.mode || raw?.mode || 'demand').toLowerCase();
    const mode = (rawMode === 'infinite') ? 'infinite' : (rawMode === 'all') ? 'all' : (rawMode === 'quantity') ? 'quantity' : 'demand';
    const live = raw?.live || raw?.boss_live || {};
    const inventory = raw?.inventory ?? raw?.invMap ?? raw?.gameplay?.items;
    const inventoryKnown = raw?.inventoryKnown ?? raw?.inventory_known ?? (inventory != null ? true : (raw?.inventoryKnown === false || raw?.inventory_known === false ? false : undefined));
    const available = (inventoryKnown && inventory) ? (inventory['70000'] ?? 0)
      : (inventoryKnown ? 0
      : live.tokenBalance ?? live.token_balance ?? raw?.tokens ?? raw?.token_count ?? raw?.available_tokens);
    const rawDist = config.distribution ?? raw?.distribution ?? live.distribution;
    const distribution = asList(rawDist).map(item => ({
      bossKey: String(item.bossKey || item.boss_key || ''),
      percent: item.percent ?? item.porcentagem
    })).filter(item => item.bossKey);
    const strategy = distribution.some(d => Number(d.percent) > 0) ? 'percent' : 'fixed';
    const entryCounts = (raw?.entryCounts && typeof raw.entryCounts === 'object') ? raw.entryCounts
      : (live.entryCounts && typeof live.entryCounts === 'object') ? live.entryCounts
      : (config.entryCounts && typeof config.entryCounts === 'object') ? config.entryCounts : {};
    const nextBossKey = String(raw?.nextBossKey ?? live.nextBossKey ?? config.nextBossKey ?? raw?.next_boss_key ?? live.next_boss_key ?? '');
    const rawInit = raw?.initialTokens ?? live.initialTokens ?? config.initialTokens ?? raw?.initial_tokens ?? live.initial_tokens;
    const initialTokens = rawInit != null && Number.isSafeInteger(Number(rawInit)) && Number(rawInit) >= 0 ? Number(rawInit) : null;
    const limit = config.quantity ?? live.limit ?? raw?.limit ?? null;
    return {
      index,
      id: String(accountId),
      cid: String(raw?.cid || ''),
      alias: String(raw?.alias ?? raw?.name ?? raw?.account_alias ?? 'Conta ' + String(index + 1).padStart(2, '0')),
      online: raw?.online === true || raw?.connected === true,
      statusError: fetchError,
      error: String(raw?.error ?? ''),
      pending: Boolean(raw?.pending ?? live.pending),
      uncertain: Boolean(raw?.uncertain ?? live.uncertain),
      tokens: inventoryKnown === false || available == null || !Number.isSafeInteger(Number(available)) || Number(available) < 0 ? null : Number(available),
      inventoryKnown,
      inventory: (inventory && typeof inventory === 'object') ? inventory : null,
      team: asList(raw?.team).filter(p => p && typeof p === 'object'),
      activeId: raw?.activeId ?? raw?.active_id ?? null,
      pokemonProfiles: raw?.pokemonProfiles && typeof raw.pokemonProfiles === 'object' ? raw.pokemonProfiles : {},
      pokemonReturnPending: Boolean(raw?.pokemonReturnPending),
      enabled: Boolean(config.enabled ?? config.active ?? false),
      bossKey: String(config.boss_key ?? config.bossKey ?? ''),
      mode,
      legacyMode: (rawMode === 'all' || rawMode === 'quantity') ? rawMode : null,
      quantity: Math.max(1, nonnegative(config.quantity ?? config.max_battles ?? config.maxBattles ?? 1)),
      limit: limit != null ? Number(limit) : null,
      initialTokens,
      nextBossKey,
      entryCounts,
      distribution,
      strategy,
      completed: nonnegative(raw?.completed ?? live.completed ?? raw?.battles_completed ?? raw?.battles_done ?? 0),
      status: config.enabled && Number(raw?.retryAfterMs) > 0 ? 'waiting_next' : String(live.status ?? raw?.status ?? raw?.message ?? ''),
      inArena: Boolean(live.inArena ?? live.in_arena ?? raw?.in_arena ?? raw?.in_boss),
      arenaKey: String(live.bossKey ?? live.boss_key ?? ''),
      busy: Boolean(raw?.busy ?? live.pending)
    };
  }

  const state = {
    isOpen: false,
    busy: false,
    loading: false,
    selectedAccount: 0,
    search: '',
    bosses: [],
    catalogs: Array.from({ length: MAX_ACCOUNTS }, () => ({ bosses: [], raw: [], status: 'missing', error: '', fetchedAt: 0 })),
    accounts: [],
    drafts: [],
    profileDrafts: new Map(),
    items: {},
    sprites: Object.fromEntries([...KNOWN_SPRITES].map(id => [id, id + '.png'])),
    error: '',
    success: '',
    opener: null,
    refreshTimer: null,
    requestId: 0,
    savedFor: -1,
    view: 'setup',
    selectedHistoryBoss: 'all',
    selectedChartBoss: 'all',
    selectedChartItem: 'all',
    selectedChartMetric: 'drops',
    historyError: ''
  };

  function getInvoke() {
    if (typeof root.__PIO_AUTO_BOSS_INVOKE__ === 'function') return root.__PIO_AUTO_BOSS_INVOKE__;
    if (typeof root.__TAURI__?.core?.invoke === 'function') return root.__TAURI__.core.invoke;
    if (typeof root.__TAURI_INTERNALS__?.invoke === 'function') return root.__TAURI_INTERNALS__.invoke;
    return null;
  }

  async function callNative(command, params) {
    const invoke = getInvoke();
    if (!invoke) throw Error('Integração nativa do Auto Boss indisponível neste launcher.');
    return invoke(command, params);
  }

  async function nativeStatus(index) {
    if (typeof root.pokeAPI?.blasterBossStatus === 'function') return root.pokeAPI.blasterBossStatus(index);
    return callNative('blaster_boss_status', { index });
  }

  async function nativeCatalog(index) {
    if (typeof root.pokeAPI?.blasterBossCatalog === 'function') return root.pokeAPI.blasterBossCatalog(index);
    return callNative('blaster_boss_catalog', { index });
  }

  async function nativeConfigure(index, config) {
    const distribution = Array.isArray(config.distribution) ? config.distribution : [];
    const mode = config.mode;
    const quantity = (mode === 'demand' || mode === 'infinite') ? null : (config.quantity ?? null);
    const bossKey = String(config.boss_key ?? config.bossKey ?? '');
    if (typeof root.pokeAPI?.blasterBossConfigure === 'function') {
      if (distribution.length > 0) {
        return root.pokeAPI.blasterBossConfigure(index, config.enabled, bossKey, mode, quantity, distribution);
      }
      return root.pokeAPI.blasterBossConfigure(index, config.enabled, bossKey, mode, quantity);
    }
    return callNative('blaster_boss_configure', { index, enabled: config.enabled, bossKey, mode, quantity, distribution });
  }

  async function readFleet() {
    const statuses = await Promise.all(Array.from({ length: MAX_ACCOUNTS }, (_, i) => nativeStatus(i)
      .then(value => value || {})
      .catch(error => ({ __fetchError: String(error?.message || error) }))));
    // Cada sessão possui seu próprio bossesJogaveis. Nunca compartilhar o
    // catálogo de uma conta com outra, mesmo que os bosses tenham nomes iguais.
    const catalogs = await Promise.all(statuses.map(async (value, i) => {
      const previous = state.catalogs[i] || { raw: [], fetchedAt: 0 };
      const online = !value.__fetchError && value.online === true;
      if (!online) {
        return { raw: previous.raw, fetchedAt: previous.fetchedAt,
          status: value.__fetchError ? 'error' : 'offline', error: value.__fetchError || '' };
      }
      try {
        const result = await nativeCatalog(i);
        const list = Array.isArray(result) ? result :
          result?.bosses ?? result?.bossesJogaveis ?? result?.bosses_jogaveis ?? result?.catalog;
        if (!Array.isArray(list)) throw Error('Formato de catálogo inválido.');
        return list.length
          ? { raw: list, status: 'ready', fetchedAt: Date.now(), error: '' }
          : { raw: previous.raw, status: 'missing', fetchedAt: previous.fetchedAt, error: '' };
      } catch (error) {
        return { raw: previous.raw, status: 'error', fetchedAt: previous.fetchedAt,
          error: String(error?.message || error) };
      }
    }));
    return { accounts: statuses, catalogs };
  }

  function ingest(data) {
    const payload = data?.state || data || {};
    const items = payload.items || state.items;
    const accounts = asList(payload.accounts ?? payload.account_states ?? payload.accountStates).slice(0, MAX_ACCOUNTS);
    state.accounts = Array.from({ length: MAX_ACCOUNTS }, (_, i) => normalizeAccount(accounts[i], i, state.accounts[i]));
    const fallbackCatalog = payload.bosses ?? payload.boss_catalog ?? payload.bosses_jogaveis ?? payload.bossesJogaveis ?? [];
    const sourceCatalogs = Array.isArray(payload.catalogs) ? payload.catalogs : null;
    state.catalogs = state.accounts.map((account, i) => {
      const source = sourceCatalogs?.[i];
      const collection = sourceCatalogs
        ? asList(Array.isArray(source) ? source : source?.raw ?? source?.bosses)
        : asList(fallbackCatalog);
      return {
        raw: collection,
        bosses: collection.map(boss => normalizeBoss(boss, items)).filter(Boolean)
          .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'pt-BR')),
        status: sourceCatalogs ? (source?.status || 'missing') : account.online ? 'ready' : 'offline',
        error: sourceCatalogs ? String(source?.error || '') : '',
        fetchedAt: sourceCatalogs ? (source?.fetchedAt || 0) : Date.now()
      };
    });
    syncSelectedCatalog();
    state.drafts = state.accounts.map((account, i) =>
      state.drafts[i]?.dirty ? state.drafts[i] : {
        bossKey: account.bossKey,
        enabled: account.enabled,
        mode: account.enabled ? account.mode : (account.mode === 'all' || account.mode === 'quantity' ? 'demand' : account.mode),
        strategy: account.strategy || 'fixed',
        distribution: (account.distribution || []).map(d => ({ ...d })),
        quantity: account.quantity,
        dirty: false
      });
    return state;
  }

  function syncSelectedCatalog() {
    state.bosses = state.catalogs[state.selectedAccount]?.bosses || [];
  }

  function selectAccount(index) {
    if (!Number.isInteger(index) || index < 0 || index >= MAX_ACCOUNTS) return false;
    state.selectedAccount = index;
    state.selectedHistoryBoss = 'all';
    state.selectedChartBoss = 'all';
    state.selectedChartItem = 'all';
    state.search = '';
    state.error = '';
    state.success = '';
    syncSelectedCatalog();
    render();
    void loadHistory();
    return true;
  }

  async function loadSprites() {
    if (typeof fetch !== 'function') return;
    try {
      const response = await fetch(BASE + 'catalog.json');
      if (response.ok) {
        const manifest = await response.json();
        if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) state.sprites = { ...state.sprites, ...manifest };
      }
    } catch {}
  }

  async function loadItems() {
    if (typeof fetch !== 'function') return;
    try {
      const response = await fetch('src/ui/sniper-catalog.json');
      if (!response.ok) return;
      const entries = await response.json();
      if (Array.isArray(entries)) {
        state.items = Object.fromEntries(entries.filter(x => x.id != null).map(x => [String(x.id), x]));
      }
    } catch {}
  }

  async function refresh({ initial = false } = {}) {
    if (state.loading || state.busy) return state;
    const requestId = ++state.requestId;
    state.loading = true;
    if (initial) render();
    try {
      const payload = await readFleet();
      if (requestId !== state.requestId) return state;
      ingest(payload);
      await loadHistory();
      if (typeof root.__syncAutoBossBadge === 'function') root.__syncAutoBossBadge();
      if (initial) state.error = '';
    } catch (error) {
      if (requestId === state.requestId) state.error = String(error?.message || error);
    } finally {
      if (requestId === state.requestId) state.loading = false;
      if (state.isOpen && requestId === state.requestId) render();
    }
    return state;
  }

  function chosen() { return state.drafts[state.selectedAccount] || null; }
  function currentAccount() { return state.accounts[state.selectedAccount] || null; }
  function chosenBoss() { return state.bosses.find(b => b.key === chosen()?.bossKey) || null; }
  function sameConfiguration(account, draft) {
    if (!account || !draft) return false;
    if (account.enabled !== draft.enabled) return false;
    const modeMatches = account.mode === draft.mode;
    if (!modeMatches) return false;
    const draftStrategy = draft.strategy || 'fixed';
    const accountStrategy = account.strategy || 'fixed';
    if (draftStrategy !== accountStrategy) return false;
    if (draftStrategy === 'percent') {
      return sameDistribution(account.distribution, draft.distribution);
    }
    if (account.bossKey !== draft.bossKey) return false;
    if (draft.mode === 'quantity' && Number(account.quantity) !== Number(draft.quantity)) return false;
    return true;
  }
  // Rust configure_checked(false, ...) preserves the pending debit/entry,
  // owner, boss key and progress. Only allow this explicit OFF transition
  // when the draft still carries the active job's exact parameters.
  function safePendingOff(account, draft) {
    if (!account || !draft || !account.enabled || draft.enabled) return false;
    if ((!account.pending && !account.uncertain) || account.statusError) return false;
    const modeMatches = account.mode === draft.mode;
    if (!modeMatches) return false;
    const draftStrategy = draft.strategy || 'fixed';
    const accountStrategy = account.strategy || 'fixed';
    if (draftStrategy !== accountStrategy) return false;
    if (draftStrategy === 'percent') {
      return sameDistribution(account.distribution, draft.distribution);
    }
    if (account.mode === 'quantity' && (!integer(account.quantity) || Number(account.quantity) > 100000 || Number(draft.quantity) !== Number(account.quantity))) return false;
    return Boolean(account.bossKey && draft.bossKey === account.bossKey);
  }
  function updateEnabledDraft(account, draft, enabled) {
    if (!account || !draft) return false;
    if (account.pending || account.uncertain) {
      if (!account.enabled || enabled) return false;
      // A pending/uncertain transition can arrive while an older unsaved
      // boss selection is on screen. OFF uses the confirmed active job only.
      draft.bossKey = account.bossKey;
      draft.mode = account.mode;
      draft.quantity = account.quantity;
      if (account.distribution?.length || draft.distribution) {
        draft.distribution = (account.distribution || []).map(d => ({ ...d }));
        draft.strategy = account.strategy || 'fixed';
      }
    }
    draft.enabled = Boolean(enabled);
    draft.dirty = !sameConfiguration(account, draft);
    return true;
  }
  function configurationProblem(account = currentAccount(), draft = chosen(), boss = chosenBoss()) {
    if (!account || !draft) return 'O estado desta conta ainda não foi recebido.';
    if (account.statusError) return 'Não foi possível conferir o estado desta conta no supervisor.';
    if (account.pokemonReturnPending && draft.enabled && !account.enabled) return 'Aguarde a confirmação do retorno do Pokémon principal.';
    if (account.pending || account.uncertain) {
      if (safePendingOff(account, draft)) return '';
      if (!draft.enabled && account.enabled) {
        return 'Para desligar com segurança, preserve o boss, modo e quantidade ativos nesta conta.';
      }
      return account.uncertain
        ? 'Há uma entrada com resultado incerto. Somente desligar o Auto Boss é permitido até a conferência.'
        : 'Existe uma entrada pendente de confirmação. Somente desligar o Auto Boss é permitido até a resposta do servidor.';
    }
    if (account.inArena && draft.enabled) {
      return 'A conta está na arena. Aguarde o fim da luta para alterar boss, modo ou quantidade; é possível somente desligar.';
    }
    if (draft.mode === 'quantity' && (!integer(draft.quantity) || Number(draft.quantity) > 100000)) {
      return 'Informe uma quantidade inteira entre 1 e 100.000.';
    }
    if (!draft.enabled) return '';
    if (!account.online) return 'Conecte esta conta ao supervisor para iniciar o Auto Boss.';
    if (state.catalogs[account.index]?.status !== 'ready') {
      return 'O catálogo atualizado desta conta está indisponível. Consulte novamente antes de ativar.';
    }
    const isPercent = draft.strategy === 'percent';
    if (!isPercent) {
      if (!boss) return 'Escolha um boss válido do catálogo desta conta.';
      if (state.profileDrafts.has(profileDraftKey(account, boss))) return 'Salve a escalação de Pokémon deste boss antes de ativar o Auto Boss.';
      if (boss.tokenCost == null || !boss.tokenId) return 'O jogo ainda não informou o custo de entrada deste boss.';
      if (draft.mode === 'demand') {
        const stock = tokenStock(account, boss.tokenId);
        if (stock == null) {
          return 'O saldo de tokens desta conta ainda não foi confirmado pelo servidor.';
        }
        if (stock < boss.tokenCost) {
          return `Modo por demanda indisponível: o saldo atual é de ${fmt(stock)} tokens (requer ao menos ${fmt(boss.tokenCost)} para uma entrada). Use o modo Infinito para aguardar novos tokens.`;
        }
      }
    } else {
      const catalogBosses = state.catalogs[account.index]?.bosses || [];
      const dist = asList(draft.distribution);
      for (const item of dist) {
        const raw = item.percent;
        if (raw === '' || raw == null || !Number.isInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > 100) {
          return 'A porcentagem de cada boss deve ser um número inteiro entre 0 e 100.';
        }
      }
      const total = dist.reduce((sum, item) => sum + nonnegative(item.percent), 0);
      if (total !== 100) {
        return `A soma das porcentagens deve ser exatamente 100% (atual: ${total}%).`;
      }
      const weighted = dist.filter(item => nonnegative(item.percent) > 0);
      if (!weighted.length) {
        return 'Defina ao menos um boss com porcentagem maior que zero.';
      }
      for (const item of weighted) {
        const b = catalogBosses.find(x => x.key === item.bossKey);
        if (!b) return `Boss "${item.bossKey}" não está no catálogo válido desta conta.`;
        if (b.tokenCost == null || !b.tokenId) return `O jogo ainda não informou o custo de entrada de ${b.name}.`;
        if (state.profileDrafts.has(profileDraftKey(account, b))) return `Salve a escalação de Pokémon de ${b.name} antes de ativar o Auto Boss.`;
      }
      const firstBoss = catalogBosses.find(x => x.key === weighted[0].bossKey);
      const expectedTokenId = firstBoss?.tokenId;
      const expectedTokenCost = firstBoss?.tokenCost;
      for (const item of weighted) {
        const b = catalogBosses.find(x => x.key === item.bossKey);
        if (b && (b.tokenId !== expectedTokenId || b.tokenCost !== expectedTokenCost)) {
          return 'Todos os bosses com peso positivo na distribuição devem usar a mesma moeda e ter o mesmo custo de entrada.';
        }
      }
      if (draft.mode === 'demand') {
        let hasAffordable = false;
        let confirmed = true;
        for (const item of weighted) {
          const b = catalogBosses.find(x => x.key === item.bossKey);
          if (!b) continue;
          const stock = tokenStock(account, b.tokenId);
          if (stock == null) {
            confirmed = false;
            break;
          }
          if (stock >= b.tokenCost) {
            hasAffordable = true;
          }
        }
        if (!confirmed) return 'O saldo de tokens desta conta ainda não foi confirmado pelo servidor.';
        if (!hasAffordable) {
          return 'Modo por demanda indisponível: o saldo atual é de 0 tokens utilizáveis para os bosses configurados. Use o modo Infinito para aguardar novos tokens.';
        }
      }
    }
    return '';
  }
  function catalogMessage(account = currentAccount()) {
    const catalog = state.catalogs[account?.index] || {};
    if (account?.statusError) return 'Sem comunicação com esta conta. As informações anteriores são apenas para consulta.';
    if (catalog.status === 'offline') return 'Conta desconectada. O catálogo anterior pode estar desatualizado; conecte para conferir.';
    if (catalog.status === 'missing') return 'Aguardando bossesJogaveis desta conta. Nenhum boss pode ser ativado até receber o catálogo.';
    if (catalog.status === 'error') return 'Falha ao consultar o catálogo desta conta. Os últimos dados podem estar desatualizados.';
    return '';
  }
  function dropQuantity(value) {
    if (!value?.length) return '';
    return value.length === 1 || value[0] === value[1] ? '×' + fmt(value[0]) : '×' + fmt(value[0]) + '–' + fmt(value[1]);
  }
  function spriteFor(drop) {
    if (!drop.id) return '';
    const asset = state.sprites[drop.id];
    return typeof asset === 'string' && /^[a-zA-Z0-9_./-]+\.(png|gif|webp)$/.test(asset) && !asset.includes('..')
      ? BASE + asset : '';
  }
  function bossPortrait(boss) {
    let dex = Number(boss?.speciesId);
    if (!Number.isInteger(dex) || dex <= 0 || dex > 1025) {
      // O catálogo jogável pode informar somente a key/nome do boss. A mesma
      // correspondência exata por espécie usada pelo seletor de referência evita
      // mostrar ícones genéricos quando a Pokédex original já conhece o boss.
      const clean = value => String(value || '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
      const names = [clean(boss?.name), clean(boss?.key)].filter(Boolean);
      const themes = Array.isArray(root.PIW_ALL_POKEMON_THEMES) ? root.PIW_ALL_POKEMON_THEMES : [];
      const species = themes.find(item => names.includes(clean(item?.name)));
      dex = Number(species?.dex);
    }
    // IDs nacionais válidos, confirmados pelo servidor ou pela Pokédex local.
    return Number.isInteger(dex) && dex > 0 && dex <= 1025
      ? 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + dex + '.png' : '';
  }
  function renderBossButton(boss) {
    const chosenBossKey = chosen()?.bossKey;
    const portrait = bossPortrait(boss);
    const active = chosenBossKey === boss.key;
    const locked = state.busy || currentAccount()?.inArena || currentAccount()?.pending || currentAccount()?.uncertain;
    return `<button type="button" class="pio-boss-option${active ? ' is-selected' : ''}" data-boss-key="${escapeHtml(boss.key)}" aria-pressed="${active}" ${locked ? 'disabled' : ''} title="Selecionar ${escapeHtml(boss.name)}">
      <span class="pio-boss-avatar">${portrait ? `<img src="${escapeHtml(portrait)}" alt="" loading="lazy"><span class="pio-boss-image-fallback" hidden aria-hidden="true">⚔</span>` : '<span>⚔</span>'}</span>
      <span class="pio-boss-option-label"><strong>${escapeHtml(boss.name)}</strong><small>${boss.drops.length} drops catalogados</small></span>
      <span class="pio-boss-level">Nv ${fmt(boss.level)}</span>
    </button>`;
  }
  function renderDrop(drop) {
    const sprite = spriteFor(drop);
    return `<div class="pio-boss-drop">
      <span class="pio-boss-drop-icon">${sprite ? `<img src="${escapeHtml(sprite)}" alt="" loading="lazy"><span class="pio-boss-image-fallback" hidden aria-hidden="true">◆</span>` : '<span aria-hidden="true">◆</span>'}</span>
      <span class="pio-boss-drop-info"><strong title="${escapeHtml(drop.name)}">${escapeHtml(drop.name)}</strong><small>${dropQuantity(drop.quantity)}</small></span>
      <span class="pio-boss-drop-chance">${drop.chance != null ? pct(drop.chance) : '—'}</span>
    </div>`;
  }
  function renderPokemonProfile(account, boss) {
    if (!boss) return '<p class="pio-boss-empty pio-boss-empty-small">Selecione um boss para definir seus Pokémon.</p>';
    const team = account?.team || [];
    const stored = account?.pokemonProfiles?.[boss.key];
    const staged = state.profileDrafts.get(profileDraftKey(account, boss));
    const profile = staged || stored;
    const active = team.some(pokemon => String(pokemon.id) === String(account.activeId)) ? account.activeId : null;
    const primary = profile?.primaryId ?? active;
    const fighter = profile?.fighterId ?? active;
    const locked = state.busy || !account?.online || account.statusError || account.enabled || account.inArena
      || account.pending || account.uncertain || account.pokemonReturnPending || !team.length;
    const options = selected => `<option value="" ${selected == null ? 'selected' : ''} disabled>Escolha um Pokémon</option>`
      + team.map(pokemon => `<option value="${escapeHtml(pokemon.id)}" ${selected != null && String(selected) === String(pokemon.id) ? 'selected' : ''}>${escapeHtml(pokemon.name || 'Pokémon #' + (pokemon.sid || '?'))} · Nv ${fmt(pokemon.level)}</option>`).join('');
    return `<div class="pio-boss-profile">
      <div class="pio-boss-profile-heading"><strong>Escalação de ${escapeHtml(boss.name)}</strong><span>${staged ? 'Alterações não salvas' : stored ? 'Salva para este boss' : 'Usa o Pokémon atual até configurar'}</span></div>
      <div class="pio-boss-profile-fields">
        <label>Pokémon principal <small>Volta após encerrar o Auto Boss</small><select data-field="pokemon-primary" aria-label="Pokémon principal para ${escapeHtml(boss.name)}" ${locked ? 'disabled' : ''}>${options(primary)}</select></label>
        <label>Combatente do boss <small>Entra antes da primeira batalha</small><select data-field="pokemon-fighter" aria-label="Combatente para ${escapeHtml(boss.name)}" ${locked ? 'disabled' : ''}>${options(fighter)}</select></label>
      </div>
      <div class="pio-boss-profile-bottom"><p>O mesmo Pokémon pode cumprir as duas funções. Cada boss guarda sua escalação.</p><button type="button" data-action="save-profile" ${locked ? 'disabled' : ''}>Salvar escalação</button></div>
    </div>`;
  }
  function profileDraftKey(account, boss) { return `${account?.index}:${account?.cid}:${boss?.key}`; }
  function accountTabs() {
    return state.accounts.map((account, i) => {
      const draft = state.drafts[i];
      const active = i === state.selectedAccount;
      return `<button type="button" class="pio-boss-account ${active ? 'is-selected' : ''}" data-account-index="${i}" aria-pressed="${active}">
        <span class="pio-boss-account-num">0${i + 1}</span>
        <span class="pio-boss-account-meta"><strong>${escapeHtml(account.alias)}</strong><small>${account.tokens == null ? 'Tokens: a verificar' : fmt(account.tokens) + ' tokens disponíveis'}</small></span>
        <span class="pio-boss-dot ${account.enabled ? 'enabled' : ''} ${draft?.dirty ? 'unsaved' : ''}" title="${draft?.dirty ? 'Alterações não salvas; indicador mostra o estado atual' : account.enabled ? 'Auto Boss ativado no supervisor' : 'Auto Boss desligado no supervisor'}"></span>
      </button>`;
    }).join('');
  }
  function historyRows() {
    const index = state.selectedAccount;
    const cid = root.stCache?.[index]?.d?.cid || '';
    return root.PioBossHistory?.read(index, cid) || [];
  }
  async function loadHistory() {
    const index = state.selectedAccount;
    const cid = root.stCache?.[index]?.d?.cid || '';
    try {
      await root.PioBossHistory?.loadNative(index, cid);
      state.historyError = '';
    } catch (error) {
      state.historyError = String(error?.message || error);
    }
    if (state.isOpen && index === state.selectedAccount) render();
  }
  function renderHistoryContent() {
    const entries = historyRows();
    const groups = root.PioBossHistory?.summarize(entries) || [];
    const selected = state.selectedHistoryBoss;
    const visible = selected === 'all' ? entries : entries.filter(row => (row.bossKey || row.bossName) === selected);
    const group = groups.find(row => row.key === selected);
    const count = entries.length;
    const wins = entries.filter(row => row.result === 'victory').length;
    const date = value => Number.isFinite(Number(value)) ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data indisponível';
    return `
      <div class="pio-boss-head">
        <div class="pio-boss-heading-icon" aria-hidden="true">♜</div>
        <div><h2 id="pioBossTitle">Histórico de bosses</h2><p>Resultados confirmados e itens recebidos nesta conta.</p></div>
        <div class="pio-boss-view-tabs" role="group" aria-label="Área do Auto Boss"><button type="button" data-action="view-setup">Configuração</button><button type="button" class="is-active" data-action="view-history" aria-current="page">Histórico</button></div>
        <button type="button" class="pio-boss-x" data-action="close" aria-label="Fechar Auto Boss">×</button>
      </div>
      <div class="pio-boss-account-strip" role="group" aria-label="Selecionar conta">${accountTabs()}</div>
      <div class="pio-boss-columns"><div class="pio-boss-history">
        <div class="pio-boss-history-intro"><div><strong>${fmt(count)} ${count === 1 ? 'batalha' : 'batalhas'}</strong><span>${fmt(wins)} ${wins === 1 ? 'vitória' : 'vitórias'} · ${fmt(count - wins)} ${count - wins === 1 ? 'derrota' : 'derrotas'}</span></div><p>Todos os resultados confirmados neste perfil. Os drops vêm do servidor, independentemente dos itens rastreados no Headless.</p></div>
        <div class="pio-boss-history-layout">
          <nav class="pio-boss-history-groups" aria-label="Filtrar histórico por boss">
            <button type="button" class="${selected === 'all' ? 'is-selected' : ''}" data-history-boss="all" aria-pressed="${selected === 'all'}"><strong>Todos os bosses</strong><span>${fmt(entries.length)} batalhas</span></button>
            ${groups.map(row => `<button type="button" class="${selected === row.key ? 'is-selected' : ''}" data-history-boss="${escapeHtml(row.key)}" aria-pressed="${selected === row.key}"><strong>${escapeHtml(row.name)}</strong><span>${fmt(row.battles)} batalhas · ${fmt(row.victories)} vitórias</span></button>`).join('')}
          </nav>
          <div class="pio-boss-history-detail">
            <div class="pio-boss-section-head"><h3>${escapeHtml(group?.name || 'Todas as batalhas')}</h3><span>${fmt(visible.length)} registros</span></div>
            ${state.historyError ? `<p class="pio-boss-history-warning">Falha ao ler o histórico nativo: ${escapeHtml(state.historyError)}</p>` : ''}
            ${group?.items.length ? `<div class="pio-boss-history-items" aria-label="Itens recebidos deste boss">${group.items.map(item => `<span title="${escapeHtml(item.name)}">${escapeHtml(item.name)} <strong>+${fmt(item.qty)}</strong></span>`).join('')}</div>` : ''}
            ${visible.length ? `<div class="pio-boss-history-list">${visible.map(row => {
              const rewards = row.drops == null ? 'Recompensas não informadas pelo servidor' : row.drops.length === 0 ? 'Sem itens nesta batalha'
                : row.drops.map(item => `${fmt(item.qty)}× ${escapeHtml(item.name)}`).join(' · ');
              return `<article class="pio-boss-history-entry"><div><strong>${escapeHtml(row.bossName || row.bossKey)}</strong><span class="${row.result === 'victory' ? 'is-victory' : 'is-defeat'}">${row.result === 'victory' ? 'Vitória' : 'Derrota'}</span></div><small>${escapeHtml(date(row.at))}${row.durationMs != null ? ` · ${escapeHtml(formatDuration(row.durationMs))}` : ''}${row.attacks != null ? ` · ${fmt(row.attacks)} ataques` : ''}${row.accountName ? ` · ${escapeHtml(row.accountName)}` : ''}</small><p>${rewards}</p></article>`;
            }).join('')}</div>` : '<p class="pio-boss-empty">Nenhuma batalha confirmada para esta conta e filtro. O próximo resultado aparecerá aqui automaticamente.</p>'}
          </div>
        </div>
      </div>
      ${renderChartsContent()}</div>
      <footer class="pio-boss-footer"><span class="pio-boss-feedback">O histórico continua disponível após fechar e abrir o launcher neste perfil.</span><div><button type="button" class="pio-boss-refresh" data-action="refresh">Atualizar</button></div></footer>`;
  }
  function formatDuration(value) {
    return value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
      ? `${(Number(value) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : 'Duração indisponível';
  }
  const liveSeries = new Map();
  function observeBattle({index, state: packet} = {}) {
    if (!Number.isInteger(index) || index < 0 || index > 3 || !packet) return;
    const live = packet.bossLive;
    if (!live && packet.live !== false) return;
    if (packet.live === false || !live?.inArena || live.winner) {
      liveSeries.delete(index);
    } else {
      const key = JSON.stringify([packet.cid, live.bossKey, live.startedAtMs]);
      const series = liveSeries.get(index)?.key === key ? liveSeries.get(index) : {key, points: []};
      const now = Date.now();
      if (live.currentHp != null && live.maxHp > 0) {
        const percent = Math.max(0, Math.min(100, live.currentHp * 100 / live.maxHp));
        series.points.push([now, percent]);
        if (series.points.length > 120) series.points.shift();
      }
      Object.assign(series, {live, now});
      liveSeries.set(index, series);
    }
    if (state.isOpen && state.selectedAccount === index) {
      const el = document.querySelector('#pioAutoBossOverlay .pio-boss-live-chart');
      if (el) el.innerHTML = renderLiveChart();
    }
  }

  function renderLiveChart() {
    const series = liveSeries.get(state.selectedAccount);
    if (!series) return '<strong>Arena</strong><p>Nenhuma batalha em andamento.</p>';
    const {live, points, now} = series;
    const start = points[0]?.[0] ?? now;
    const coords = points.map(([at, hp]) => [8 + 244 * (at - start) / Math.max(1, now - start), 5 + (100 - hp) * 0.65]);
    const last = coords.at(-1);
    return `<strong>${escapeHtml(live.bossName || live.bossKey || 'Boss')} · Ao vivo</strong>
      <p>${live.currentHp == null || !live.maxHp ? 'Aguardando HP' : fmt(live.currentHp) + ' / ' + fmt(live.maxHp) + ' HP'} · ${fmt(live.turn ?? 0)} ataques${live.startedAtMs == null ? '' : ' · ' + formatDuration(now - live.startedAtMs)}</p>
      ${last ? `<svg viewBox="0 0 260 76" role="img" aria-label="Vida do boss ao longo da batalha"><path d="M8 5H252 M8 37.5H252 M8 70H252" stroke="currentColor" opacity=".18"/><polyline points="${coords.map(pair => pair.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="currentColor"/></svg><small>Vida · ${formatDuration(now - start)} de acompanhamento</small>` : ''}`;
  }

  function renderChartsContent() {
    const entries = historyRows();
    const groups = root.PioBossHistory?.summarize(entries) || [];
    const bossKey = state.selectedChartBoss;
    const bossEntries = bossKey === 'all' ? entries : entries.filter(row => (row.bossKey || row.bossName) === bossKey);
    const itemOptions = new Map();
    for (const row of bossEntries) for (const item of Array.isArray(row.drops) ? row.drops : []) itemOptions.set(item.id || item.name, item.name);
    if (!itemOptions.has(state.selectedChartItem) && state.selectedChartItem !== 'all') state.selectedChartItem = 'all';
    const selectedItem = state.selectedChartItem;
    const metric = state.selectedChartMetric;
    const rows = [...bossEntries].sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    const values = rows.map(row => metric === 'duration'
      ? (row.durationMs != null && Number.isFinite(Number(row.durationMs)) ? Number(row.durationMs) / 1000 : null)
      : metric === 'attacks' ? (row.attacks != null && Number.isFinite(Number(row.attacks)) ? Number(row.attacks) : null)
        : selectedItem === 'all'
          ? (Array.isArray(row.drops) ? row.drops.reduce((sum, item) => sum + Number(item.qty || 0), 0) : null)
          : (Array.isArray(row.drops) ? row.drops.filter(item => (item.id || item.name) === selectedItem).reduce((sum, item) => sum + Number(item.qty || 0), 0) : null));
    const knownWins = rows.filter(row => row.result === 'victory' && Array.isArray(row.drops));
    const averageTotal = knownWins.length ? knownWins.reduce((sum, row) => sum + (selectedItem === 'all'
      ? row.drops.reduce((qty, item) => qty + Number(item.qty || 0), 0)
      : row.drops.filter(item => (item.id || item.name) === selectedItem).reduce((qty, item) => qty + Number(item.qty || 0), 0)), 0) / knownWins.length : null;
    const max = Math.max(1, ...values.filter(value => value != null));
    const width = Math.max(260, rows.length * 74);
    const xAt = i => rows.length === 1 ? width / 2 : 36 + i * (width - 72) / (rows.length - 1);
    const yAt = value => 130 - value / max * 94;
    const segments = []; let segment = [];
    values.forEach((value, i) => { if (value == null) { if (segment.length) segments.push(segment.join(' ')); segment = []; } else segment.push(`${xAt(i)},${yAt(value)}`); });
    if (segment.length) segments.push(segment.join(' '));
    const hasMetricValues = values.some(value => value != null);
    const scale = [0, max / 2, max];
    const metricLabel = metric === 'duration' ? 'Duração (segundos)' : metric === 'attacks' ? 'Ataques' : selectedItem === 'all' ? 'Itens recebidos por batalha' : `Quantidade de ${escapeHtml(itemOptions.get(selectedItem) || '')} por batalha`;
    const date = value => Number.isFinite(Number(value)) ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data indisponível';
    return `<aside class="pio-boss-chart-page" aria-label="Gráficos de batalha"><div class="pio-boss-live-chart">${renderLiveChart()}</div><div class="pio-boss-chart-controls"><label>Boss<select data-chart-filter="boss"><option value="all" ${bossKey === 'all' ? 'selected' : ''}>Todos os bosses</option>${groups.map(group => `<option value="${escapeHtml(group.key)}" ${bossKey === group.key ? 'selected' : ''}>${escapeHtml(group.name)}</option>`).join('')}</select></label><label>Métrica<select data-chart-filter="metric"><option value="drops" ${metric === 'drops' ? 'selected' : ''}>Drops</option><option value="duration" ${metric === 'duration' ? 'selected' : ''}>Duração</option><option value="attacks" ${metric === 'attacks' ? 'selected' : ''}>Ataques</option></select></label>${metric === 'drops' ? `<label>Recompensa<select data-chart-filter="item"><option value="all" ${selectedItem === 'all' ? 'selected' : ''}>Total de itens</option>${[...itemOptions].map(([key, name]) => `<option value="${escapeHtml(key)}" ${selectedItem === key ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>` : ''}</div>
      ${rows.length ? `<section class="pio-boss-temporal-chart"><div class="pio-boss-chart-heading"><h3>${metricLabel}</h3><span>${metric === 'drops' ? averageTotal == null ? 'Média indisponível' : `Média por vitória: ${averageTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} · ${fmt(knownWins.length)} vitórias com drops conhecidos` : 'Cada ponto corresponde a uma batalha'}</span></div><div class="pio-boss-temporal-scroll"><svg class="pio-boss-temporal-svg" style="min-width:${width}px;width:100%" viewBox="0 0 ${width} 190" role="img" aria-label="${escapeHtml(metricLabel)} ao longo das batalhas"><line x1="28" y1="130" x2="${width - 22}" y2="130"/><line x1="28" y1="36" x2="28" y2="130"/>${scale.map(value => `<text class="pio-boss-chart-y-label" x="2" y="${yAt(value) + 3}">${hasMetricValues ? value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</text>`).join('')}${segments.map(points => `<polyline points="${points}"/>`).join('')}${rows.map((row, i) => `<g>${values[i] == null ? '' : `<circle class="${row.result === 'victory' ? 'is-win' : 'is-loss'}" cx="${xAt(i)}" cy="${yAt(values[i])}" r="5"><title>${escapeHtml(date(row.at))} · ${values[i].toLocaleString('pt-BR', { maximumFractionDigits: 1 })} · ${row.result === 'victory' ? 'Vitória' : 'Derrota'}</title></circle>`}<text class="pio-boss-chart-x-label" x="${xAt(i)}" y="148">#${i + 1}</text><text class="pio-boss-chart-date-label" x="${xAt(i)}" y="164">${escapeHtml(date(row.at).split(',')[0])}</text></g>`).join('')}</svg></div><div class="pio-boss-chart-legend"><span><i class="is-win"></i>Vitória</span><span><i class="is-loss"></i>Derrota</span><small>Valores desconhecidos deixam lacunas.</small></div></section>
      <section class="pio-boss-chart-battles"><h3>Batalhas no período <span>${fmt(rows.length)}</span></h3>${rows.map((row, i) => `<article class="pio-boss-chart-battle"><div><strong>#${i + 1} · ${escapeHtml(row.bossName || row.bossKey || 'Boss')}</strong><span class="${row.result === 'victory' ? 'is-victory' : 'is-defeat'}">${row.result === 'victory' ? 'Vitória' : 'Derrota'}</span></div><small>${escapeHtml(date(row.at))} · ${escapeHtml(formatDuration(row.durationMs))}</small><p>${row.drops == null ? 'Drops não informados pelo servidor' : row.drops.length ? row.drops.map(item => `${fmt(item.qty)}× ${escapeHtml(item.name)}`).join(' · ') : row.result === 'victory' ? 'Vitória sem itens' : 'Sem itens nesta batalha'}</p>${values[i] == null ? '<em>Métrica indisponível</em>' : `<em>${metric === 'duration' ? 'Duração' : metric === 'attacks' ? 'Ataques' : selectedItem === 'all' ? 'Total' : escapeHtml(itemOptions.get(selectedItem) || 'Item')}: ${fmt(values[i])}${metric === 'duration' ? ' s' : ''}</em>`}</article>`).join('')}</section>` : `<section class="pio-boss-chart-empty-state"><span aria-hidden="true">⌁</span><h3>Ainda não há batalhas para exibir</h3><p>Resultados confirmados aparecerão aqui com horário, duração, resultado e recompensas.</p></section>`}</aside>`;
  }
  function renderDistributionEditor(account, draft) {
    const catalogBosses = state.bosses || [];
    if (!catalogBosses.length) {
      return '<p class="pio-boss-empty pio-boss-empty-small">Aguardando catálogo para configurar a distribuição percentual.</p>';
    }
    const dist = draft?.distribution || [];
    const editLocked = state.busy || Boolean(account?.statusError)
      || account?.pending || account?.uncertain || account?.inArena;

    const rows = catalogBosses.map(b => {
      const entry = dist.find(d => d.bossKey === b.key);
      const val = entry ? (entry.percent ?? '') : 0;
      const count = account?.entryCounts?.[b.key];
      const portrait = bossPortrait(b);
      return `<div class="pio-boss-dist-row">
        <span class="pio-boss-avatar pio-boss-avatar-small">${portrait ? `<img src="${escapeHtml(portrait)}" alt="" loading="lazy"><span class="pio-boss-image-fallback" hidden aria-hidden="true">⚔</span>` : '<span aria-hidden="true">⚔</span>'}</span>
        <div class="pio-boss-dist-info">
          <strong>${escapeHtml(b.name)}</strong>
          <small>Nv ${fmt(b.level)}${b.tokenCost != null ? ' · Custo: ' + fmt(b.tokenCost) + ' ' + escapeHtml(b.tokenName) : ''}${count != null ? ' · Concluídas: ' + fmt(count) : ''}</small>
        </div>
        <label class="pio-boss-dist-input-label">
          <input type="number" min="0" max="100" step="1" data-distribution-boss="${escapeHtml(b.key)}" value="${escapeHtml(val)}" ${editLocked ? 'disabled' : ''} aria-label="Porcentagem para ${escapeHtml(b.name)}">
          <span>%</span>
        </label>
      </div>`;
    }).join('');

    const totalPercent = dist.reduce((sum, item) => sum + (Number.isFinite(Number(item.percent)) ? Number(item.percent) : 0), 0);
    const hasInvalid = dist.some(item => item.percent === '' || item.percent == null || !Number.isInteger(Number(item.percent)) || Number(item.percent) < 0 || Number(item.percent) > 100);
    const isValid = totalPercent === 100 && !hasInvalid;

    return `<div class="pio-boss-distribution-editor" aria-label="Distribuição percentual entre bosses">
      <div class="pio-boss-distribution-list">${rows}</div>
      <div class="pio-boss-percent-total ${isValid ? 'is-valid' : 'is-invalid'}" role="status">
        <span>Soma dos pesos: <strong>${fmt(totalPercent)}%</strong> / 100%</span>
        <span>${isValid ? 'Distribuição válida (100%)' : totalPercent < 100 ? `Faltam ${100 - totalPercent}%` : `Excesso de ${totalPercent - 100}%`}</span>
      </div>
    </div>`;
  }

  function renderContent() {
    if (state.view === 'history') return renderHistoryContent();
    const account = currentAccount();
    const draft = chosen();
    const boss = chosenBoss();
    const filter = state.search.trim().toLocaleLowerCase('pt-BR');
    const bosses = state.bosses.filter(b => b.name.toLocaleLowerCase('pt-BR').includes(filter) || b.key.toLocaleLowerCase('pt-BR').includes(filter));
    const tokenCost = boss?.tokenCost ?? null;
    const itemId = boss?.tokenId || '70000';
    const stock = boss?.tokenId ? tokenStock(account, boss.tokenId) : tokenStock(account, '70000');
    const available = stock != null && Number.isSafeInteger(Number(stock)) && Number(stock) >= 0 ? Number(stock) : null;
    const required = draft?.mode === 'quantity' && tokenCost != null ? draft.quantity * tokenCost : null;
    const problem = configurationProblem(account, draft, boss);
    const locked = state.busy || Boolean(account?.statusError)
      || ((account?.pending || account?.uncertain) && (!account.enabled || !draft?.enabled));
    const editLocked = state.busy || Boolean(account?.statusError)
      || account?.pending || account?.uncertain || account?.inArena;
    return `
      <div class="pio-boss-head">
        <div class="pio-boss-heading-icon" aria-hidden="true">♜</div>
        <div><span class="pio-boss-eyebrow">AUTOMAÇÃO · QUATRO CONTAS</span><h2 id="pioBossTitle">Central de Auto Boss</h2><p>Escolha o boss e configure o consumo de tokens de cada conta.</p></div>
        <div class="pio-boss-view-tabs" role="group" aria-label="Área do Auto Boss"><button type="button" class="is-active" data-action="view-setup" aria-current="page">Configuração</button><button type="button" data-action="view-history">Histórico</button></div>
        <button type="button" class="pio-boss-x" data-action="close" aria-label="Fechar Auto Boss">×</button>
      </div>
      <div class="pio-boss-account-strip" role="group" aria-label="Selecionar conta">${accountTabs()}</div>
      ${catalogMessage(account) ? `<div class="pio-boss-notice is-warning" role="status">${escapeHtml(catalogMessage(account))}</div>` : ''}
      ${account?.uncertain || account?.pending ? `<div class="pio-boss-notice is-alert" role="alert">${account.uncertain ? 'Existe uma entrada com resultado incerto.' : 'Existe uma entrada aguardando confirmação.'} ${account.enabled ? 'Você pode desligar o Auto Boss sem alterar o boss, modo ou quantidade; isso não cancela a entrada já enviada e a confirmação ainda será acompanhada.' : 'O Auto Boss está desligado; a entrada anterior ainda precisa ser conferida.'}</div>` : ''}
      ${account?.error ? `<div class="pio-boss-notice is-alert" role="alert">Supervisor: ${escapeHtml(account.error)}</div>` : ''}
      <div class="pio-boss-columns"><div class="pio-boss-workspace">
        <aside class="pio-boss-catalog">
          <div class="pio-boss-section-head"><h3>Catálogo de bosses</h3><span>${state.bosses.length}</span></div>
          <label class="pio-boss-search"><span aria-hidden="true">⌕</span><input type="search" id="pioBossSearch" autocomplete="off" placeholder="Buscar boss…" value="${escapeHtml(state.search)}" aria-label="Buscar boss"></label>
          <div class="pio-boss-list" aria-label="Bosses jogáveis">
            ${bosses.length ? bosses.map(renderBossButton).join('') : `<p class="pio-boss-empty">${state.loading ? 'Consultando bosses disponíveis…' : state.bosses.length ? 'Nenhum boss corresponde à busca.' : 'O jogo ainda não forneceu o catálogo de bosses jogáveis.'}</p>`}
          </div>
          <p class="pio-boss-data-note">${state.catalogs[state.selectedAccount]?.status === 'ready' ? 'Bosses e chances do catálogo desta conta, recebido do servidor.' : 'Catálogo anterior exibido somente para consulta, quando disponível.'}</p>
        </aside>
        <main class="pio-boss-details">
          <section class="pio-boss-hero">
            <div class="pio-boss-hero-portrait">${boss && bossPortrait(boss) ? `<img src="${escapeHtml(bossPortrait(boss))}" alt=""><span class="pio-boss-image-fallback" hidden aria-hidden="true">⚔</span>` : '<span aria-hidden="true">⚔</span>'}</div>
            <div class="pio-boss-hero-copy">
              <span class="pio-boss-eyebrow">BOSS SELECIONADO · CONTA 0${state.selectedAccount + 1}</span>
              <h3>${escapeHtml(boss?.name || (draft?.bossKey ? 'Boss indisponível: ' + draft.bossKey : 'Selecione um boss'))}</h3>
              ${boss ? `<div class="pio-boss-tags"><span>Treinador Nv ${fmt(boss.level)}+</span>${boss.types.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : '<p>Selecione um boss da lista para consultar seus drops e programar a execução.</p>'}
            </div>
          </section>
          <section class="pio-boss-rewards">
            <div class="pio-boss-section-head"><h3>Drops do boss</h3><span>${boss?.drops.length || 0} itens</span></div>
            ${boss?.drops.length ? `<div class="pio-boss-drop-grid">${[...boss.drops].sort((a, b) => (b.chance ?? -1) - (a.chance ?? -1)).map(renderDrop).join('')}</div>`
              : '<p class="pio-boss-empty pio-boss-empty-small">Nenhum drop individual foi fornecido para este boss.</p>'}
          </section>
          <section class="pio-boss-team-section" aria-label="Equipe desta conta">
            <div class="pio-boss-section-head"><h3>Pokémon do Auto Boss</h3><span>Equipe da conta</span></div>
            ${renderPokemonProfile(account, boss)}
            <p class="pio-boss-progress">Troca manual: selecione abaixo quem fica em campo agora.</p>
            <div class="pio-boss-team">${account?.team.length ? account.team.map((pokemon, index) => {
              const active = account.activeId != null ? String(pokemon.id) === String(account.activeId) : pokemon.ld === true;
              const disabled = state.busy || !account.online || account.statusError || account.enabled || account.inArena || account.pending || account.uncertain || pokemon.id == null || active;
              const portrait = bossPortrait({ speciesId: pokemon.sid, name: pokemon.name });
              return `<button type="button" class="pio-boss-member ${active ? 'is-selected' : ''}" data-team-index="${index}" aria-pressed="${active}" ${disabled ? 'disabled' : ''}>
                ${portrait ? `<img data-team-portrait src="${escapeHtml(portrait)}" alt="" loading="lazy">` : ''}<span><strong>${escapeHtml(pokemon.name || 'Pokémon #' + (pokemon.sid || '?'))}</strong><small>Nv ${fmt(pokemon.level)}${pokemon.shiny ? ' · Shiny' : ''}${active ? ' · Em campo' : ''}</small></span></button>`;
            }).join('') : '<p class="pio-boss-empty pio-boss-empty-small">Aguardando a equipe desta conta conectada.</p>'}</div>
            ${account?.enabled || account?.pending || account?.uncertain || account?.inArena || account?.pokemonReturnPending ? '<p class="pio-boss-progress">Desligue o Auto Boss e aguarde o retorno do principal antes de alterar a escalação.</p>' : ''}
          </section>
          <section class="pio-boss-configuration">
            <div class="pio-boss-section-head">
              <h3>Execução desta conta</h3>
              <span>${account?.uncertain ? 'Resultado incerto' : account?.pending ? 'Entrada pendente' : account?.inArena ? 'Em batalha' : (isWaitingTokens(account) ? 'Aguardando tokens' : account?.status ? escapeHtml(statusLabel(account.status)) : 'Configuração individual')}</span>
            </div>
            <label class="pio-boss-switch-line"><span><strong>Auto Boss</strong><small>Ativar as batalhas automáticas para esta conta.</small></span>
              <input type="checkbox" data-field="enabled" ${draft?.enabled ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="Habilitar Auto Boss para esta conta"><span class="pio-boss-switch" aria-hidden="true"></span>
            </label>
            <div class="pio-boss-mode-row" role="group" aria-label="Modo de execução">
              <label class="pio-boss-mode ${draft?.mode === 'demand' ? 'is-selected' : ''}"><input type="radio" name="pioBossMode" value="demand" ${draft?.mode === 'demand' ? 'checked' : ''} ${editLocked ? 'disabled' : ''}><span><strong>Por demanda</strong><small>Usa o saldo inicial de tokens ao ativar. Novos tokens ficam para depois.</small></span></label>
              <label class="pio-boss-mode ${draft?.mode === 'infinite' ? 'is-selected' : ''}"><input type="radio" name="pioBossMode" value="infinite" ${draft?.mode === 'infinite' ? 'checked' : ''} ${editLocked ? 'disabled' : ''}><span><strong>Infinito</strong><small>Aguarda caçando com 0 tokens e entra quando receber novos tokens.</small></span></label>
              ${draft?.mode === 'all' || draft?.mode === 'quantity' ? `<label class="pio-boss-mode is-selected"><input type="radio" name="pioBossMode" value="${draft.mode}" checked disabled><span><strong>${draft.mode === 'all' ? 'Todos os tokens disponíveis' : 'Quantidade definida'}</strong><small>Execução anterior. Os novos modos ficam disponíveis para a próxima execução.</small></span></label>` : ''}
            </div>
            <div class="pio-boss-strategy-row" role="group" aria-label="Seleção de boss">
              <label class="pio-boss-strategy ${draft?.strategy !== 'percent' ? 'is-selected' : ''}"><input type="radio" name="pioBossStrategy" value="fixed" ${draft?.strategy !== 'percent' ? 'checked' : ''} ${editLocked ? 'disabled' : ''}><span><strong>Boss fixo</strong><small>Enfrenta apenas o boss selecionado no catálogo.</small></span></label>
              <label class="pio-boss-strategy ${draft?.strategy === 'percent' ? 'is-selected' : ''}"><input type="radio" name="pioBossStrategy" value="percent" ${draft?.strategy === 'percent' ? 'checked' : ''} ${editLocked ? 'disabled' : ''}><span><strong>Porcentagem</strong><small>Distribui batalhas entre bosses por pesos inteiros (soma 100%).</small></span></label>
            </div>
            ${draft?.strategy === 'percent' ? renderDistributionEditor(account, draft) : ''}
            ${draft?.mode === 'quantity' ? `<label class="pio-boss-limit">Total de batalhas a executar <input id="pioBossQuantity" type="number" min="1" max="100000" step="1" value="${draft.quantity}" ${editLocked ? 'disabled' : ''} aria-label="Quantidade de batalhas"></label>` : ''}
            <p class="pio-boss-progress">Entradas confirmadas: <strong>${fmt(account?.completed ?? 0)}</strong>${(account?.limit != null || (account?.mode === 'demand' && account?.initialTokens != null && tokenCost)) ? ' / ' + fmt(account?.limit ?? Math.floor(account.initialTokens / tokenCost)) : account?.mode === 'quantity' ? ' / ' + fmt(account?.quantity ?? 0) : ''}${account?.inArena ? ' · A luta atual pode continuar ao desligar.' : ''}</p>
            ${account?.nextBossKey ? `<p class="pio-boss-upcoming">Próximo boss: <strong>${escapeHtml(state.bosses.find(b => b.key === account.nextBossKey)?.name || account.nextBossKey)}</strong></p>` : ''}
            ${isWaitingTokens(account) ? '<p class="pio-boss-waiting-tokens" role="status">Aguardando tokens</p>' : ''}
            <div class="pio-boss-supplies">
              <span><img src="src/ui/assets/markitems/boss_token.png" alt=""> <strong>${available == null ? '—' : fmt(available)}</strong> ${escapeHtml(boss?.tokenName || 'Bronze Boss Tokens')} no inventário</span>
              <span>${boss ? tokenCost != null ? `Custo: ${fmt(tokenCost)} × ${escapeHtml(boss.tokenName)} por entrada` : 'Custo: não informado pelo jogo' : 'Custo: selecione um boss'}</span>
              ${required != null && available != null && required > available ? `<span class="pio-boss-warn">O estoque atual cobre ${fmt(Math.floor(available / tokenCost))} entradas.</span>` : ''}
              ${draft?.mode === 'demand' && tokenCost != null && available != null && available < tokenCost ? '<span class="pio-boss-warn">Saldo zero ou insuficiente para demanda. Adquira tokens ou use o modo Infinito.</span>' : ''}
            </div>
            ${draft?.dirty && problem ? `<p class="pio-boss-inline-alert" role="status">${escapeHtml(problem)}</p>` : ''}
          </section>
        </main>
      </div>
      ${renderChartsContent()}</div>
      <footer class="pio-boss-footer">
        <span class="pio-boss-feedback" role="status" aria-live="polite">${escapeHtml(state.error || state.success || (state.loading && !state.accounts.length ? 'Consultando as quatro contas…' : draft?.dirty ? 'Alterações ainda não salvas.' : 'Configuração sincronizada.'))}</span>
        <div><button type="button" class="pio-boss-refresh" data-action="refresh" ${state.loading || state.busy ? 'disabled' : ''}>Atualizar</button>
          <button type="button" class="pio-boss-once" data-action="once" ${!canRunOnce(account, draft, boss) || state.busy ? 'disabled' : ''} title="${escapeHtml(oneShotProblem(account, draft, boss) || 'Entrar no boss uma vez')}" aria-label="Entrar no boss uma vez">Entrar uma vez</button>
          <button type="button" class="pio-boss-save" data-action="save" ${!draft?.dirty || problem || state.busy ? 'disabled' : ''} title="${escapeHtml(problem || 'Gravar configuração da conta selecionada')}">${state.busy ? 'Salvando…' : 'Salvar esta conta'}</button>
        </div>
      </footer>`;
  }
  function oneShotConfig(draft) {
    return { enabled: true, boss_key: draft.bossKey, mode: 'quantity', quantity: 1 };
  }
  function oneShotProblem(account = currentAccount(), draft = chosen(), boss = chosenBoss()) {
    if (!account || !draft) return 'O estado desta conta ainda não foi recebido.';
    if (account.enabled) return 'Desligue o Auto Boss atual antes de iniciar uma entrada única.';
    if (account.statusError) return 'Não foi possível conferir o estado desta conta no supervisor.';
    if (account.pokemonReturnPending) return 'Aguarde a confirmação do retorno do Pokémon principal.';
    if (account.pending || account.uncertain) return account.uncertain
      ? 'Há uma entrada com resultado incerto. Aguarde a conferência antes de iniciar outra.'
      : 'Existe uma entrada aguardando confirmação. Aguarde a resposta do servidor.';
    if (account.inArena) return 'A conta já está em uma arena.';
    if (!account.online) return 'Conecte esta conta ao supervisor para entrar no boss.';
    if (state.catalogs[account.index]?.status !== 'ready') return 'O catálogo atualizado desta conta está indisponível.';
    if (!boss || boss.key !== draft.bossKey) return 'Escolha um boss válido do catálogo desta conta.';
    if (state.profileDrafts.has(profileDraftKey(account, boss))) return 'Salve a escalação de Pokémon deste boss antes de entrar.';
    if (boss.tokenCost == null || !boss.tokenId) return 'O jogo ainda não informou o custo de entrada deste boss.';
    const stock = tokenStock(account, boss.tokenId);
    if (stock == null) return 'O saldo de tokens desta conta ainda não foi confirmado.';
    if (stock < boss.tokenCost) return 'Esta conta não tem tokens suficientes para uma entrada.';
    return '';
  }
  function canRunOnce(account = currentAccount(), draft = chosen(), boss = chosenBoss()) {
    return !oneShotProblem(account, draft, boss);
  }
  async function runOnce() {
    const account = currentAccount(), draft = chosen(), boss = chosenBoss();
    const problem = oneShotProblem(account, draft, boss);
    if (state.busy || problem) {
      state.error = state.busy ? 'Aguarde a operação atual.' : problem;
      render(); return false;
    }
    state.busy = true; state.error = ''; state.success = ''; render();
    try {
      const result = await nativeConfigure(account.index, oneShotConfig(draft));
      if (result?.enabled === false) throw Error('O supervisor não aceitou a entrada única. Atualize esta conta.');
      state.success = `Solicitação de ${boss.name} iniciada para ${account.alias}. Acompanhe o estado da batalha nesta tela.`;
      return true;
    } catch (error) {
      state.error = String(error?.message || error); return false;
    } finally {
      state.busy = false; render();
      if (!state.error) await refresh();
    }
  }
  function build() {
    if (typeof document === 'undefined') return null;
    let overlay = document.getElementById('pioAutoBossOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'pioAutoBossOverlay';
    overlay.className = 'pio-boss-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="pio-boss-dialog" role="dialog" aria-modal="true" aria-labelledby="pioBossTitle" tabindex="-1"></div>';
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
      const button = event.target.closest('[data-action],[data-boss-key],[data-account-index],[data-team-index],[data-history-boss]');
      if (!button || !overlay.contains(button)) return;
      if (button.dataset.action === 'close') return close();
      if (button.dataset.action === 'view-setup') { state.view = 'setup'; render(); return; }
      if (button.dataset.action === 'view-history') { state.view = 'history'; render(); void loadHistory(); return; }
      if (button.dataset.action === 'save') return void save();
      if (button.dataset.action === 'save-profile') return void savePokemonProfile();
      if (button.dataset.action === 'once') return void runOnce();
      if (button.dataset.action === 'refresh') return void refresh({ initial: true });
      if (button.hasAttribute('data-team-index')) return void selectPokemon(Number(button.dataset.teamIndex));
      if (button.hasAttribute('data-account-index')) {
        if (!state.busy) selectAccount(Number(button.dataset.accountIndex));
      }
      if (button.hasAttribute('data-history-boss')) {
        state.selectedHistoryBoss = button.dataset.historyBoss;
        state.selectedChartBoss = state.selectedHistoryBoss;
        state.selectedChartItem = 'all';
        render();
        return;
      }
      if (button.hasAttribute('data-boss-key')) {
        const draft = chosen();
        const account = currentAccount();
        if (draft && !state.busy && !account?.pending && !account?.uncertain &&
            !account?.inArena && state.bosses.some(b => b.key === button.dataset.bossKey)) {
          draft.bossKey = button.dataset.bossKey;
          draft.dirty = !sameConfiguration(account, draft);
          state.error = ''; state.success = '';
          render();
        }
      }
    });
    overlay.addEventListener('change', event => {
      if (event.target.matches('[data-chart-filter="boss"]')) { state.selectedChartBoss = event.target.value; state.selectedChartItem = 'all'; render(); return; }
      if (event.target.matches('[data-chart-filter="metric"]')) { state.selectedChartMetric = event.target.value; render(); return; }
      if (event.target.matches('[data-chart-filter="item"]')) { state.selectedChartItem = event.target.value; render(); return; }
      const draft = chosen();
      const account = currentAccount();
      if (!draft || state.busy || account?.statusError) return;
      if (event.target.matches('[data-field="pokemon-primary"],[data-field="pokemon-fighter"]')) {
        updatePokemonProfileDraft(event.target.dataset.field, event.target.value);
        return;
      }
      if (event.target.matches('[data-field="enabled"]')) {
        if (!updateEnabledDraft(account, draft, event.target.checked)) return;
      }
      else if (account?.pending || account?.uncertain) return;
      else if (!currentAccount()?.inArena && event.target.name === 'pioBossMode') draft.mode = event.target.value;
      else if (!currentAccount()?.inArena && event.target.name === 'pioBossStrategy') {
        draft.strategy = event.target.value;
        if (draft.strategy === 'percent' && (!draft.distribution || !draft.distribution.length)) {
          draft.distribution = state.bosses.map(b => ({
            bossKey: b.key,
            percent: b.key === draft.bossKey ? 100 : 0
          }));
        }
      }
      else if (!currentAccount()?.inArena && event.target.dataset.distributionBoss) {
        const bKey = event.target.dataset.distributionBoss;
        const rawVal = event.target.value;
        const val = rawVal === '' ? '' : (Number.isFinite(Number(rawVal)) ? Number(rawVal) : rawVal);
        if (!draft.distribution) draft.distribution = [];
        let item = draft.distribution.find(d => d.bossKey === bKey);
        if (!item) {
          item = { bossKey: bKey, percent: val };
          draft.distribution.push(item);
        } else {
          item.percent = val;
        }
      }
      else if (!currentAccount()?.inArena && event.target.id === 'pioBossQuantity') {
        const rawQty = event.target.value;
        draft.quantity = rawQty === '' ? '' : (Number.isFinite(Number(rawQty)) ? Number(rawQty) : rawQty);
      }
      else return;
      draft.dirty = !sameConfiguration(account, draft);
      state.error = ''; state.success = '';
      render();
    });
    overlay.addEventListener('input', event => {
      if (event.target.dataset.distributionBoss) {
        const bKey = event.target.dataset.distributionBoss;
        const rawVal = event.target.value;
        const val = rawVal === '' ? '' : (Number.isFinite(Number(rawVal)) ? Number(rawVal) : rawVal);
        const draft = chosen();
        const account = currentAccount();
        if (draft && !account?.inArena) {
          if (!draft.distribution) draft.distribution = [];
          let item = draft.distribution.find(d => d.bossKey === bKey);
          if (!item) {
            item = { bossKey: bKey, percent: val };
            draft.distribution.push(item);
          } else {
            item.percent = val;
          }
          draft.dirty = !sameConfiguration(account, draft);
          render();
        }
      }
      if (event.target.id === 'pioBossSearch') {
        state.search = event.target.value;
        const scroll = overlay.querySelector('.pio-boss-list');
        const scrollTop = scroll?.scrollTop || 0;
        const list = overlay.querySelector('.pio-boss-list');
        const filter = state.search.trim().toLocaleLowerCase('pt-BR');
        const bosses = state.bosses.filter(b => b.name.toLocaleLowerCase('pt-BR').includes(filter) || b.key.toLocaleLowerCase('pt-BR').includes(filter));
        if (list) { list.innerHTML = bosses.length ? bosses.map(renderBossButton).join('') : '<p class="pio-boss-empty">Nenhum boss corresponde à busca.</p>'; list.scrollTop = scrollTop; }
      }
    });
    overlay.addEventListener('error', event => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      if (image.hasAttribute('data-team-portrait')) { image.hidden = true; return; }
      const fallback = image.nextElementSibling;
      if (fallback?.classList.contains('pio-boss-image-fallback')) {
        image.hidden = true;
        fallback.hidden = false;
      }
    }, true);
    document.body.appendChild(overlay);
    return overlay;
  }
  function render() {
    if (!state.isOpen) return;
    const overlay = build();
    const dialog = overlay?.querySelector('.pio-boss-dialog');
    if (!dialog) return;
    const active = document.activeElement;
    const focus = active?.id === 'pioBossSearch' ? 'pioBossSearch' : active?.id === 'pioBossQuantity' ? 'pioBossQuantity' : '';
    const focusDist = active?.dataset?.distributionBoss ? active.dataset.distributionBoss : '';
    const focusProfile = active?.dataset?.field === 'pokemon-primary' || active?.dataset?.field === 'pokemon-fighter'
      ? active.dataset.field : '';
    const start = active?.selectionStart ?? null;
    const focusButton = active?.dataset?.accountIndex != null ? '[data-account-index="' + active.dataset.accountIndex + '"]'
      : active?.dataset?.bossKey != null ? '[data-boss-key="' + CSS.escape(active.dataset.bossKey) + '"]'
      : active?.dataset?.action ? '[data-action="' + active.dataset.action + '"]' : '';
    const scrollPositions = [...dialog.querySelectorAll('.pio-boss-list,.pio-boss-details,.pio-boss-drop-grid,.pio-boss-chart-page,.pio-boss-distribution-editor')]
      .map(element => [element.className.split(' ')[0], element.scrollTop]);
    dialog.innerHTML = renderContent();
    for (const [selector, top] of scrollPositions) {
      const element = dialog.querySelector('.' + selector);
      if (element) element.scrollTop = top;
    }
    if (focus && dialog.querySelector('#' + focus)) {
      const input = dialog.querySelector('#' + focus);
      input.focus();
      if (start != null && input.type === 'search') input.setSelectionRange(start, start);
    } else if (focusDist && dialog.querySelector('[data-distribution-boss="' + CSS.escape(focusDist) + '"]')) {
      const input = dialog.querySelector('[data-distribution-boss="' + CSS.escape(focusDist) + '"]');
      input.focus();
    } else if (focusProfile) {
      dialog.querySelector('[data-field="' + focusProfile + '"]')?.focus({ preventScroll: true });
    } else if (focusButton) {
      dialog.querySelector(focusButton)?.focus({ preventScroll: true });
    }
  }
  async function save() {
    const draft = chosen();
    const account = currentAccount();
    if (!draft || !account || state.busy) return;
    const problem = configurationProblem(account, draft);
    if (!problem && !account.statusError && !account.pending && !account.uncertain && sameConfiguration(account, draft)) {
      draft.dirty = false;
      state.error = '';
      state.success = 'Nenhuma alteração necessária nesta conta.';
      render();
      return;
    }
    if (problem) { state.error = problem; render(); return; }
    state.busy = true; state.error = ''; state.success = ''; render();
    const pendingOff = safePendingOff(account, draft);
    const isPercent = !pendingOff && !account.inArena && draft.strategy === 'percent';
    const distribution = isPercent
      ? (draft.distribution || []).filter(d => nonnegative(d.percent) > 0).map(d => ({ bossKey: String(d.bossKey), percent: nonnegative(d.percent) }))
      : [];
    const mode = pendingOff || account.inArena ? account.mode : draft.mode;
    const quantity = (mode === 'demand' || mode === 'infinite') ? null
      : (pendingOff || account.inArena
          ? (account.mode === 'quantity' ? Number(account.quantity) : null)
          : (draft.mode === 'quantity' ? Number(draft.quantity) : null));
    const bossKey = pendingOff || account.inArena
      ? (account.bossKey || '')
      : (isPercent ? (draft.bossKey || distribution[0]?.bossKey || '') : (draft.bossKey || ''));
    const config = {
      enabled: draft.enabled,
      boss_key: bossKey,
      mode,
      quantity,
      distribution
    };
    try {
      const result = await nativeConfigure(account.index, config);
      if (typeof result?.enabled === 'boolean' && result.enabled !== config.enabled) {
        throw Error('O supervisor não confirmou o estado solicitado. Atualize esta conta.');
      }
      draft.dirty = false;
      state.success = 'Configuração aceita para ' + account.alias + '.';
    } catch (error) {
      state.error = String(error?.message || error);
    } finally {
      state.busy = false;
      render();
    }
    if (!state.error) await refresh();
  }
  function updatePokemonProfileDraft(role, value) {
    const account = currentAccount();
    const boss = chosenBoss();
    const selected = account?.team.find(pokemon => String(pokemon.id) === String(value));
    if (!boss || !selected || state.busy || !account.online || account.enabled || account.inArena
      || account.pending || account.uncertain || account.pokemonReturnPending) return false;
    const base = state.profileDrafts.get(profileDraftKey(account, boss)) || account.pokemonProfiles?.[boss.key];
    const active = account.team.find(pokemon => String(pokemon.id) === String(account.activeId))?.id;
    const primaryId = role === 'pokemon-primary' ? selected.id : base?.primaryId ?? active ?? selected.id;
    const fighterId = role === 'pokemon-fighter' ? selected.id : base?.fighterId ?? active ?? selected.id;
    state.profileDrafts.set(profileDraftKey(account, boss), { primaryId, fighterId });
    render();
    return true;
  }
  async function savePokemonProfile(role, value) {
    const account = currentAccount();
    const boss = chosenBoss();
    const selected = role ? account?.team.find(pokemon => String(pokemon.id) === String(value)) : null;
    if (!boss || (role && !selected) || state.busy || !account.online || account.statusError || account.enabled
      || account.inArena || account.pending || account.uncertain || account.pokemonReturnPending) return false;
    const profile = state.profileDrafts.get(profileDraftKey(account, boss)) || account.pokemonProfiles?.[boss.key];
    const active = account.team.find(pokemon => String(pokemon.id) === String(account.activeId))?.id;
    const find = id => account.team.find(pokemon => String(pokemon.id) === String(id))?.id;
    const primaryId = role === 'pokemon-primary' ? selected.id : find(profile?.primaryId ?? active) ?? selected?.id;
    const fighterId = role === 'pokemon-fighter' ? selected.id : find(profile?.fighterId ?? active) ?? selected?.id;
    if (primaryId == null || fighterId == null) { state.error = 'Escolha principal e combatente antes de salvar.'; render(); return false; }
    state.busy = true; state.error = ''; state.success = '';
    render();
    try {
      const result = typeof root.pokeAPI?.blasterBossPokemonConfigure === 'function'
        ? await root.pokeAPI.blasterBossPokemonConfigure(account.index, boss.key, primaryId, fighterId)
        : await callNative('blaster_boss_pokemon_configure', { index: account.index, bossKey: boss.key, primaryId, fighterId });
      const confirmed = normalizeAccount(result, account.index);
      const saved = confirmed.pokemonProfiles?.[boss.key];
      if (String(saved?.primaryId) !== String(primaryId) || String(saved?.fighterId) !== String(fighterId)) {
        throw Error('O supervisor não confirmou a escalação deste boss.');
      }
      state.accounts[account.index] = confirmed;
      state.profileDrafts.delete(profileDraftKey(account, boss));
      state.success = `Escalação de ${boss.name} salva: principal e combatente definidos.`;
      return true;
    } catch (error) {
      state.error = String(error?.message || error);
      return false;
    } finally {
      state.busy = false;
      render();
    }
  }
  async function selectPokemon(teamIndex) {
    const account = currentAccount();
    const pokemon = account?.team[teamIndex];
    if (!Number.isInteger(teamIndex) || !pokemon || pokemon.id == null || state.busy || !account.online || account.statusError
      || account.enabled || account.inArena || account.pending || account.uncertain || account.pokemonReturnPending) return false;
    state.busy = true; state.error = ''; state.success = ''; render();
    try {
      const accepted = typeof root.pokeAPI?.blasterBossSelectPokemon === 'function'
        ? await root.pokeAPI.blasterBossSelectPokemon(account.index, pokemon.id)
        : await callNative('blaster_boss_select_pokemon', { index: account.index, pokemonId: pokemon.id });
      if (accepted !== true) throw Error('Não foi possível enviar a troca de Pokémon. Confira a conexão desta conta.');
      // Envio não confirma troca: apenas o activeId recebido do servidor marca o Pokémon.
      for (let attempt = 0; attempt < 20; attempt++) {
        const status = await nativeStatus(account.index);
        const confirmed = normalizeAccount(status, account.index);
        state.accounts[account.index] = confirmed;
        if (confirmed.activeId != null && String(confirmed.activeId) === String(pokemon.id)) {
          state.success = 'Pokémon em campo confirmado: ' + (pokemon.name || pokemon.id) + '.';
          return true;
        }
        if (!confirmed.online || confirmed.inArena || confirmed.pending || confirmed.uncertain) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw Error('O servidor ainda não confirmou a troca. Atualize a equipe antes de ativar o Auto Boss.');
    } catch (error) {
      state.error = String(error?.message || error);
      return false;
    } finally { state.busy = false; render(); }
  }
  function onKeydown(event) {
    if (!state.isOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const focusables = [...(build()?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])].filter(el => el.getClientRects().length);
    if (!focusables.length) return;
    if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables[focusables.length - 1].focus(); }
    if (!event.shiftKey && document.activeElement === focusables[focusables.length - 1]) { event.preventDefault(); focusables[0].focus(); }
  }
  async function open() {
    if (state.isOpen || typeof document === 'undefined') return;
    state.opener = document.activeElement;
    state.isOpen = true; state.error = ''; state.success = '';
    const overlay = build();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    render();
    overlay.querySelector('[data-action="close"]')?.focus();
    document.addEventListener('keydown', onKeydown, true);
    await Promise.all([loadItems(), loadSprites()]);
    if (state.isOpen) await refresh({ initial: true });
    clearInterval(state.refreshTimer);
    if (state.isOpen) state.refreshTimer = setInterval(() => void refresh(), 5000);
  }
  async function openHistory(index) {
    if (Number.isInteger(index) && index >= 0 && index < MAX_ACCOUNTS) {
      state.selectedAccount = index;
      state.selectedHistoryBoss = 'all';
      syncSelectedCatalog();
    }
    state.view = 'history';
    if (state.isOpen) { render(); await loadHistory(); return; }
    await open();
  }
  function close() {
    if (!state.isOpen) return;
    state.isOpen = false;
    state.view = 'setup';
    ++state.requestId;
    state.loading = false;
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
    document.removeEventListener('keydown', onKeydown, true);
    const overlay = document.getElementById('pioAutoBossOverlay');
    if (overlay) { overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); }
    state.opener?.focus?.();
  }

  const api = { open, openHistory, close, refresh, selectAccount, getState: () => state, normalizeBoss, normalizeDrop, normalizeAccount,
    ingest, escapeHtml, save, runOnce, oneShotConfig, oneShotProblem, canRunOnce, selectPokemon, updatePokemonProfileDraft, savePokemonProfile, spriteFor, bossPortrait, configurationProblem, catalogMessage, safePendingOff, updateEnabledDraft, sameDistribution, tokenStock, isWaitingTokens, renderDistributionEditor, renderContent, renderChartsContent };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PioAutoBossPanel = api;
  root.pokeAPI?.onBlasterUpdate?.(observeBattle);
  root.addEventListener?.('pio:boss-history-updated', () => { if (state.isOpen) void loadHistory(); });
})(typeof window !== 'undefined' ? window : globalThis);
