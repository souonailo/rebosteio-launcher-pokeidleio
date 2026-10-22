// ==UserScript==
// @name         Auto-Sniper
// @namespace    https://github.com/panicguy/Scripts-PIO
// @version      1.5.2.1-pio
// @description  Sniper, mercado, farm, hunts, bosses e oferendas. Conversão da extensão 1.5.2.
// @author       Dudu (conversão); autores da extensão original (motor e cockpit)
// @match        https://pokeidle.io/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/panicguy/Scripts-PIO/main/auto-sniper.user.js
// @downloadURL  https://raw.githubusercontent.com/panicguy/Scripts-PIO/main/auto-sniper.user.js
// ==/UserScript==
(() => {
'use strict';
if (window.top !== window || window.__PIO_AUTO_SNIPER__) return;
window.__PIO_AUTO_SNIPER__ = true;
// Private compatibility adapter: never replaces the browser's window.chrome.
const prefix = 'pio-auto-sniper-v1:';
const storageListeners = new Set();
const runtimeListeners = new Set();
// PIO: acesso ao armazenamento do Sniper para o grid aplicar regras pedidas pelo Claude (sempre com clique do usuário).
window.PIOSniperStorage = { set: d => chrome.storage.local.set(d), get: k => chrome.storage.local.get(k) };
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function readKey(key) {
  const raw = localStorage.getItem(prefix + key);
  try { return raw === null ? undefined : JSON.parse(raw); } catch { return undefined; }
}
function notify(changes) {
  if (!Object.keys(changes).length) return;
  queueMicrotask(() => storageListeners.forEach(fn => {
    try { fn(clone(changes), 'local'); } catch (error) { console.error('[Auto-Sniper]', error); }
  }));
}
const chrome = {
  storage: {
    local: {
      get(keys, callback) {
        const result = {};
        const names = keys == null ? Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)) : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        names.forEach(key => {
          const value = readKey(key);
          if (value !== undefined) result[key] = value;
          else if (keys && !Array.isArray(keys) && typeof keys === 'object') result[key] = keys[key];
        });
        if (callback) queueMicrotask(() => callback(clone(result)));
        return Promise.resolve(clone(result));
      },
      set(data, callback) {
        const changes = {};
        for (const [key, value] of Object.entries(data)) {
          const oldValue = readKey(key);
          const encoded = JSON.stringify(value);
          if (encoded === undefined || JSON.stringify(oldValue) === encoded) continue;
          localStorage.setItem(prefix + key, encoded);
          changes[key] = {oldValue, newValue: clone(value)};
        }
        notify(changes);
        if (callback) queueMicrotask(callback);
        return Promise.resolve();
      },
      remove(keys, callback) {
        const changes = {};
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          const oldValue = readKey(key);
          localStorage.removeItem(prefix + key);
          if (oldValue !== undefined) changes[key] = {oldValue};
        }
        notify(changes);
        if (callback) queueMicrotask(callback);
        return Promise.resolve();
      }
    },
    onChanged: {addListener: fn => storageListeners.add(fn), removeListener: fn => storageListeners.delete(fn)}
  },
  runtime: {
    id: 'pio-auto-sniper-userscript',
    onMessage: {addListener: fn => runtimeListeners.add(fn), removeListener: fn => runtimeListeners.delete(fn)},
    sendMessage(message, callback) {
      if (message.action === 'OPEN_COCKPIT') openPanel();
      else runtimeListeners.forEach(fn => fn(clone(message), {}, () => {}));
      if (callback) queueMicrotask(() => callback({ok:true}));
      return Promise.resolve({ok:true});
    }
  },
  tabs: {
    query(query, callback) { queueMicrotask(() => callback([{id:1, url:location.href}])); },
    sendMessage(id, message, callback) { return chrome.runtime.sendMessage(message, callback); }
  }
};
window.addEventListener('storage', event => {
  if (!event.key?.startsWith(prefix)) return;
  const parse = value => { try { return value === null ? undefined : JSON.parse(value); } catch { return undefined; } };
  notify({[event.key.slice(prefix.length)]: {oldValue:parse(event.oldValue), newValue:parse(event.newValue)}});
});
if (readKey('rotom_sniper_enabled') === undefined) {
  chrome.storage.local.set({rotom_sniper_enabled:false});
}

// Catálogo Canônico Oficial do Mercado da Comunidade PokéIdle (74 Itens Negociáveis)
// Ordem de apresentação oficial:
// 1. Pedras (18 clássicas + 18 shiny stones)
// 2. TMs (AoE TM Disk, AoE TM Disk Piece, TM Disk Piece e 18 TMs Elementais)
// 3. Loots Raros (Shiny Stone Fragment, Key Fragment, Bronze Boss Token, Bicycle Fragment)
// 4. Beast Balls (Beast Ball)
// 5. Casas (Casas Comum, Incomum, Rara, Mítica, Lendária)
// 6. Boxes (Founder Box e Co-Founder Box)
// 7. Bicicletas (Bicicletas Comum, Incomum, Rara, Mítica, Lendária)
const POKEIDLE_ITEMS_DB = [{"id": 999999, "name": "Diamantes", "icon": "https://pokeidle.io/img/moeda-diamante.png", "category": "diamante", "categoryLabel": "Diamantes", "type": "CAMBIO", "npcPrice": 0}, {"id": 2, "name": "Ancient Stone", "icon": "/assets/stones/ancient_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "DRAGON", "npcPrice": 0}, {"id": 23, "name": "Cocoon Stone", "icon": "cocoon_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "BUG", "npcPrice": 0}, {"id": 28, "name": "Crystal Stone", "icon": "crystal_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ICE", "npcPrice": 0}, {"id": 31, "name": "Darkness Stone", "icon": "darkness_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "DARK", "npcPrice": 0}, {"id": 40, "name": "Earth Stone", "icon": "earth_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "GROUND", "npcPrice": 0}, {"id": 45, "name": "Enigma Stone", "icon": "enigma_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "PSYCHIC", "npcPrice": 0}, {"id": 49, "name": "Feather Stone", "icon": "/assets/stones/feather_stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FLYING", "npcPrice": 0}, {"id": 53, "name": "Fire Stone", "icon": "fire_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "FIRE", "npcPrice": 0}, {"id": 66, "name": "Heart Stone", "icon": "heart_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "NORMAL", "npcPrice": 0}, {"id": 71, "name": "Ice Stone", "icon": "ice_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ICE", "npcPrice": 0}, {"id": 76, "name": "Leaf Stone", "icon": "leaf_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "GRASS", "npcPrice": 0}, {"id": 87, "name": "Metal Stone", "icon": "/assets/stones/metal_stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "STEEL", "npcPrice": 0}, {"id": 106, "name": "Punch Stone", "icon": "punch_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "FIGHTING", "npcPrice": 0}, {"id": 109, "name": "Rock Stone", "icon": "rock_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ROCK", "npcPrice": 0}, {"id": 209, "name": "Sun Stone", "icon": "/assets/stones/sun_stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FIRE", "npcPrice": 0}, {"id": 133, "name": "Thunder Stone", "icon": "thunder_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ELECTRIC", "npcPrice": 0}, {"id": 139, "name": "Venom Stone", "icon": "venom_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "POISON", "npcPrice": 0}, {"id": 142, "name": "Water Stone", "icon": "water_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "WATER", "npcPrice": 0}, {"id": 70031, "name": "Bug Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "BUG", "npcPrice": 0}, {"id": 70035, "name": "Dark Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "DARK", "npcPrice": 0}, {"id": 70034, "name": "Dragon Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "DRAGON", "npcPrice": 0}, {"id": 70024, "name": "Electric Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "ELECTRIC", "npcPrice": 0}, {"id": 70037, "name": "Fairy Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FAIRY", "npcPrice": 0}, {"id": 70026, "name": "Fighting Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FIGHTING", "npcPrice": 0}, {"id": 70021, "name": "Fire Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FIRE", "npcPrice": 0}, {"id": 70029, "name": "Flying Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FLYING", "npcPrice": 0}, {"id": 70033, "name": "Ghost Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "GHOST", "npcPrice": 0}, {"id": 70023, "name": "Grass Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "GRASS", "npcPrice": 0}, {"id": 70028, "name": "Ground Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "GROUND", "npcPrice": 0}, {"id": 70025, "name": "Ice Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "ICE", "npcPrice": 0}, {"id": 70020, "name": "Normal Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "NORMAL", "npcPrice": 0}, {"id": 70027, "name": "Poison Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "POISON", "npcPrice": 0}, {"id": 70030, "name": "Psychic Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "PSYCHIC", "npcPrice": 0}, {"id": 70032, "name": "Rock Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "ROCK", "npcPrice": 0}, {"id": 70036, "name": "Steel Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "STEEL", "npcPrice": 0}, {"id": 70022, "name": "Water Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "WATER", "npcPrice": 0}, {"id": 40575, "name": "AoE TM Disk", "icon": "/assets/items/tm_disk_aoe.png", "category": "tm", "categoryLabel": "TMs", "type": null, "npcPrice": 0}, {"id": 40530, "name": "AoE TM Disk Piece", "icon": "/assets/items/tm_piece_aoe.png", "category": "tm", "categoryLabel": "TMs", "type": null, "npcPrice": 0}, {"id": 59194, "name": "TM Disk Piece", "icon": "/assets/items/tm_disk_piece.png", "category": "tm", "categoryLabel": "TMs", "type": null, "npcPrice": 0}, {"id": 59200, "name": "Normal-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "NORMAL", "npcPrice": 0}, {"id": 59201, "name": "Fire-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FIRE", "npcPrice": 0}, {"id": 59202, "name": "Water-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "WATER", "npcPrice": 0}, {"id": 59203, "name": "Grass-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "GRASS", "npcPrice": 0}, {"id": 59204, "name": "Electric-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "ELECTRIC", "npcPrice": 0}, {"id": 59205, "name": "Ice-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "ICE", "npcPrice": 0}, {"id": 59206, "name": "Fighting-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FIGHTING", "npcPrice": 0}, {"id": 59207, "name": "Poison-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "POISON", "npcPrice": 0}, {"id": 59208, "name": "Ground-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "GROUND", "npcPrice": 0}, {"id": 59209, "name": "Flying-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FLYING", "npcPrice": 0}, {"id": 59210, "name": "Psychic-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "PSYCHIC", "npcPrice": 0}, {"id": 59211, "name": "Bug-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "BUG", "npcPrice": 0}, {"id": 59212, "name": "Rock-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "ROCK", "npcPrice": 0}, {"id": 59213, "name": "Ghost-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "GHOST", "npcPrice": 0}, {"id": 59214, "name": "Dragon-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "DRAGON", "npcPrice": 0}, {"id": 59215, "name": "Dark-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "DARK", "npcPrice": 0}, {"id": 59216, "name": "Steel-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "STEEL", "npcPrice": 0}, {"id": 59247, "name": "Fairy-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FAIRY", "npcPrice": 0}, {"id": 70012, "name": "Shiny Stone Fragment", "icon": "/img/itens/shiny-stone.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 0}, {"id": 70011, "name": "Key Fragment", "icon": "/img/itens/fragmento-chave.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 0}, {"id": 70000, "name": "Bronze Boss Token", "icon": "/assets/items/bronze_boss_token.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 250000}, {"id": 70013, "name": "Bicycle Fragment", "icon": "/img/itens/fragmento-bicicleta.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 0}, {"id": 5, "name": "Beast Ball", "icon": "/img/ball-beast.png", "category": "beast", "categoryLabel": "Beast Balls", "type": null, "npcPrice": 0}, {"id": 70040, "name": "Common House", "icon": "/img/itens/casa-comum.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70041, "name": "Uncommon House", "icon": "/img/itens/casa-incomum.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70042, "name": "Rare House", "icon": "/img/itens/casa-rara.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70043, "name": "Mythic House", "icon": "/img/itens/casa-mitica.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70044, "name": "Legendary House", "icon": "/img/itens/casa-lendaria.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70060, "name": "Founder Box", "icon": "/img/itens/caixa-fundador.png", "category": "box", "categoryLabel": "Boxes", "type": null, "npcPrice": 0}, {"id": 70061, "name": "Co-Founder Box", "icon": "/img/itens/caixa-cofundador.png", "category": "box", "categoryLabel": "Boxes", "type": null, "npcPrice": 0}, {"id": 70080, "name": "Common Bicycle", "icon": "/img/itens/bicicleta-comum.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70081, "name": "Uncommon Bicycle", "icon": "/img/itens/bicicleta-incomum.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70082, "name": "Rare Bicycle", "icon": "/img/itens/bicicleta-rara.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70083, "name": "Mythic Bicycle", "icon": "/img/itens/bicicleta-mitica.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70084, "name": "Legendary Bicycle", "icon": "/img/itens/bicicleta-lendaria.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}];

const POKEIDLE_ITEMS_BY_ID = {};
POKEIDLE_ITEMS_DB.forEach(function(item) {
  POKEIDLE_ITEMS_BY_ID[item.id] = item;
});

// ── Itens novos, aprendidos do próprio jogo ──
//
// A lista acima é a curadoria; o jogo lança itens novos (Mega Shiny Stone, ...) que chegam no pacote
// `welcome` (`itensNossos`), na ficha de cada anúncio do Mercado e no catálogo `/assets/items.json`.
// O injected.js junta esses itens e os guarda no storage (`rotom_items_dynamic`); a página do jogo e o
// cockpit registram aqui, e o resto (busca, ícone, sniper) passa a enxergá-los sem atualizar a extensão.
var ROTOM_CATEGORIA_LABEL = {
  stone: 'Pedras', tm: 'TMs', rare_loot: 'Loots Raros', beast: 'Beast Balls', casa: 'Casas',
  box: 'Boxes', bicicleta: 'Bicicletas', diamante: 'Diamantes', skin: 'Skins', outros: 'Outros'
};

function categoriaRotomItem(nome, categoria, id) {
  var n = String(nome || '').toLowerCase();
  // As pedras Mega têm nome próprio (Gengarite, Shiny Gengarite) e moram em 71xxx/72xxx no jogo.
  if (Number(id) >= 71000 && Number(id) < 73000) return 'stone';
  if (n.indexOf('skin') !== -1) return 'skin';
  if (n.indexOf('beast ball') !== -1) return 'beast';
  if (n.indexOf('stone') !== -1 && n.indexOf('fragment') === -1) return 'stone';
  if (/\btm\b|tm disk/.test(n)) return 'tm';
  if (n.indexOf('fragment') !== -1 || n.indexOf('token') !== -1) return 'rare_loot';
  if (n.indexOf('box') !== -1) return 'box';
  if (n.indexOf('house') !== -1) return 'casa';
  if (n.indexOf('bicycle') !== -1) return 'bicicleta';
  var c = String(categoria || '').toLowerCase();
  return ROTOM_CATEGORIA_LABEL[c] ? c : 'outros';
}

/** Registra itens do jogo que a curadoria não conhece. Devolve quantos entraram. */
function registerRotomItems(lista) {
  if (!Array.isArray(lista)) return 0;
  var novos = 0;
  for (var i = 0; i < lista.length; i++) {
    var it = lista[i];
    var id = Number(it && it.id);
    var nome = it && (it.name || it.nome);
    if (!id || !nome || POKEIDLE_ITEMS_BY_ID[id]) continue;
    var cat = categoriaRotomItem(nome, it.category || it.categoria, id);
    var item = {
      id: id, name: String(nome), icon: it.icon || it.icone || '', category: cat,
      categoryLabel: ROTOM_CATEGORIA_LABEL[cat] || 'Outros', type: '',
      npcPrice: Number(it.npcPrice) || 0, dinamico: true
    };
    POKEIDLE_ITEMS_DB.push(item);
    POKEIDLE_ITEMS_BY_ID[id] = item;
    novos++;
  }
  return novos;
}

/**
 * Troca o nome dos itens pelo nome que o JOGO mostra ({id: nome}), calculado na página com os módulos
 * do próprio jogo (tradução, Shiny Stone por tipo, casas, skins...). O nome antigo vira apelido: regra
 * de sniper salva com o nome em inglês continua achando o item, e a busca acha pelos dois.
 */
function registerRotomNames(mapa) {
  if (!mapa || typeof mapa !== 'object') return 0;
  var n = 0;
  for (var id in mapa) {
    var item = POKEIDLE_ITEMS_BY_ID[Number(id)];
    var nome = mapa[id];
    if (!item || !nome || item.name === nome) continue;
    item.aliases = item.aliases || [];
    if (item.aliases.indexOf(item.name) === -1) item.aliases.push(item.name);
    item.name = String(nome);
    n++;
  }
  return n;
}

function nomesDoItem(it) {
  return [it.name].concat(it.aliases || []);
}

function getRotomItem(idOrName) {
  if (idOrName == null) return null;
  if (typeof idOrName === 'number' || (!isNaN(Number(idOrName)) && String(idOrName).trim() !== '')) {
    return POKEIDLE_ITEMS_BY_ID[Number(idOrName)] || null;
  }
  var q = String(idOrName || '').toLowerCase().trim();
  for (var i = 0; i < POKEIDLE_ITEMS_DB.length; i++) {
    var nomes = nomesDoItem(POKEIDLE_ITEMS_DB[i]);
    for (var j = 0; j < nomes.length; j++) {
      if (String(nomes[j]).toLowerCase() === q) return POKEIDLE_ITEMS_DB[i];
    }
  }
  return null;
}

function searchRotomItems(query, category) {
  var q = String(query || '').toLowerCase().trim();
  var cat = String(category || 'all').toLowerCase().trim();
  var results = [];
  for (var i = 0; i < POKEIDLE_ITEMS_DB.length; i++) {
    var it = POKEIDLE_ITEMS_DB[i];
    if (cat && cat !== 'all') {
      var itCat = (it.category || '').toLowerCase();
      if (itCat !== cat) {
        if ((cat === 'pedras' || cat === 'stone') && itCat === 'stone') { /* ok */ }
        else if ((cat === 'tms' || cat === 'tm') && itCat === 'tm') { /* ok */ }
        else if ((cat === 'rare_loot' || cat === 'loot_raro' || cat === 'loots raros' || cat === 'fragment' || cat === 'boss') && itCat === 'rare_loot') { /* ok */ }
        else if ((cat === 'beast' || cat === 'beast balls' || cat === 'beast ball') && itCat === 'beast') { /* ok */ }
        else if ((cat === 'casas' || cat === 'casa') && itCat === 'casa') { /* ok */ }
        else if ((cat === 'boxes' || cat === 'box') && itCat === 'box') { /* ok */ }
        else if ((cat === 'bicicletas' || cat === 'bicicleta') && itCat === 'bicicleta') { /* ok */ }
        else continue;
      }
    }
    if (!q || nomesDoItem(it).join('\n').toLowerCase().indexOf(q) !== -1 || String(it.id) === q) {
      results.push(it);
      if (results.length >= 100) break;
    }
  }
  return results;
}

function getItemIconUrl(itemOrIcon) {
  if (!itemOrIcon) return '';
  var icon = '';

  // 1. Se for objeto (regra salva ou item), busca sempre a referência canônica oficial no catálogo do jogo
  if (typeof itemOrIcon === 'object') {
    var it = null;
    if (itemOrIcon.targetId) it = getRotomItem(itemOrIcon.targetId);
    if (!it && itemOrIcon.id) it = getRotomItem(itemOrIcon.id);
    if (!it && itemOrIcon.targetName) it = getRotomItem(itemOrIcon.targetName);
    if (!it && itemOrIcon.name) it = getRotomItem(itemOrIcon.name);

    if (it && it.icon) {
      icon = it.icon;
    } else if (itemOrIcon.icon) {
      icon = itemOrIcon.icon;
    }
  } else if (typeof itemOrIcon === 'number') {
    var it = getRotomItem(itemOrIcon);
    if (it && it.icon) icon = it.icon;
  } else if (typeof itemOrIcon === 'string') {
    if (itemOrIcon.indexOf('icon16') !== -1 || itemOrIcon.indexOf('icon48') !== -1 || itemOrIcon.indexOf('icons/') === 0) {
      return '';
    }
    var it = getRotomItem(itemOrIcon);
    if (it && it.icon) {
      icon = it.icon;
    } else if (itemOrIcon.indexOf('/') !== -1 || itemOrIcon.indexOf('.png') !== -1 || itemOrIcon.indexOf('.gif') !== -1) {
      icon = itemOrIcon;
    }
  }

  // 2. Rejeitar caminhos locais legados da extensão
  if (!icon || icon.indexOf('icon16') !== -1 || icon.indexOf('icon48') !== -1 || icon.indexOf('icons/') === 0) {
    return '';
  }

  if (icon.indexOf('http://') === 0 || icon.indexOf('https://') === 0) return icon;
  if (icon.indexOf('/assets/site/') === 0) return 'https://pokeidle.io' + icon;
  if (icon.indexOf('/img/') === 0) return 'https://pokeidle.io' + icon;
  if (icon.indexOf('/assets/stones/') === 0) return 'https://pokeidle.io/assets/site' + icon;
  if (icon.indexOf('/assets/items/') === 0) return 'https://pokeidle.io/assets/site' + icon;
  if (icon.indexOf('/assets/cards/') === 0) return 'https://pokeidle.io' + icon;
  if (icon.indexOf('/assets/markitems/') === 0) {
    return 'https://pokeidle.io/assets/site/assets/markitems/' + icon.replace('/assets/markitems/', '');
  }

  var STONES_SPECIAL = ['ancient_stone.gif', 'feather_stone.png', 'metal_stone.png', 'rough_gemstone.png', 'sun_stone.png', 'moon_stone.png'];
  var base = icon.replace('/assets/stones/', '').replace('/assets/items/', '');
  if (base.charAt(0) === '/') base = base.substring(1);
  if (STONES_SPECIAL.indexOf(base) !== -1) {
    return 'https://pokeidle.io/assets/site/assets/stones/' + base;
  }
  return 'https://pokeidle.io/assets/site/assets/items/' + base;
}


// Dicionário Canônico National Dex (1025 Pokémons da Gen 1 a Gen 9)
const POKEMON_NAME_TO_DEX_ID = {"bulbasaur": 1, "ivysaur": 2, "venusaur": 3, "charmander": 4, "charmeleon": 5, "charizard": 6, "squirtle": 7, "wartortle": 8, "blastoise": 9, "caterpie": 10, "metapod": 11, "butterfree": 12, "weedle": 13, "kakuna": 14, "beedrill": 15, "pidgey": 16, "pidgeotto": 17, "pidgeot": 18, "rattata": 19, "raticate": 20, "spearow": 21, "fearow": 22, "ekans": 23, "arbok": 24, "pikachu": 25, "raichu": 26, "sandshrew": 27, "sandslash": 28, "nidoran f": 29, "nidoran-f": 29, "nidorina": 30, "nidoqueen": 31, "nidoran m": 32, "nidoran-m": 32, "nidorino": 33, "nidoking": 34, "clefairy": 35, "clefable": 36, "vulpix": 37, "ninetales": 38, "jigglypuff": 39, "wigglytuff": 40, "zubat": 41, "golbat": 42, "oddish": 43, "gloom": 44, "vileplume": 45, "paras": 46, "parasect": 47, "venonat": 48, "venomoth": 49, "diglett": 50, "dugtrio": 51, "meowth": 52, "persian": 53, "psyduck": 54, "golduck": 55, "mankey": 56, "primeape": 57, "growlithe": 58, "arcanine": 59, "poliwag": 60, "poliwhirl": 61, "poliwrath": 62, "abra": 63, "kadabra": 64, "alakazam": 65, "machop": 66, "machoke": 67, "machamp": 68, "bellsprout": 69, "weepinbell": 70, "victreebel": 71, "tentacool": 72, "tentacruel": 73, "geodude": 74, "graveler": 75, "golem": 76, "ponyta": 77, "rapidash": 78, "slowpoke": 79, "slowbro": 80, "magnemite": 81, "magneton": 82, "farfetchd": 83, "doduo": 84, "dodrio": 85, "seel": 86, "dewgong": 87, "grimer": 88, "muk": 89, "shellder": 90, "cloyster": 91, "gastly": 92, "haunter": 93, "gengar": 94, "onix": 95, "drowzee": 96, "hypno": 97, "krabby": 98, "kingler": 99, "voltorb": 100, "electrode": 101, "exeggcute": 102, "exeggutor": 103, "cubone": 104, "marowak": 105, "hitmonlee": 106, "hitmonchan": 107, "lickitung": 108, "koffing": 109, "weezing": 110, "rhyhorn": 111, "rhydon": 112, "chansey": 113, "tangela": 114, "kangaskhan": 115, "horsea": 116, "seadra": 117, "goldeen": 118, "seaking": 119, "staryu": 120, "starmie": 121, "mr mime": 122, "mr-mime": 122, "scyther": 123, "jynx": 124, "electabuzz": 125, "magmar": 126, "pinsir": 127, "tauros": 128, "magikarp": 129, "gyarados": 130, "lapras": 131, "ditto": 132, "eevee": 133, "vaporeon": 134, "jolteon": 135, "flareon": 136, "porygon": 137, "omanyte": 138, "omastar": 139, "kabuto": 140, "kabutops": 141, "aerodactyl": 142, "snorlax": 143, "articuno": 144, "zapdos": 145, "moltres": 146, "dratini": 147, "dragonair": 148, "dragonite": 149, "mewtwo": 150, "mew": 151, "chikorita": 152, "bayleef": 153, "meganium": 154, "cyndaquil": 155, "quilava": 156, "typhlosion": 157, "totodile": 158, "croconaw": 159, "feraligatr": 160, "sentret": 161, "furret": 162, "hoothoot": 163, "noctowl": 164, "ledyba": 165, "ledian": 166, "spinarak": 167, "ariados": 168, "crobat": 169, "chinchou": 170, "lanturn": 171, "pichu": 172, "cleffa": 173, "igglybuff": 174, "togepi": 175, "togetic": 176, "natu": 177, "xatu": 178, "mareep": 179, "flaaffy": 180, "ampharos": 181, "bellossom": 182, "marill": 183, "azumarill": 184, "sudowoodo": 185, "politoed": 186, "hoppip": 187, "skiploom": 188, "jumpluff": 189, "aipom": 190, "sunkern": 191, "sunflora": 192, "yanma": 193, "wooper": 194, "quagsire": 195, "espeon": 196, "umbreon": 197, "murkrow": 198, "slowking": 199, "misdreavus": 200, "unown": 201, "wobbuffet": 202, "girafarig": 203, "pineco": 204, "forretress": 205, "dunsparce": 206, "gligar": 207, "steelix": 208, "snubbull": 209, "granbull": 210, "qwilfish": 211, "scizor": 212, "shuckle": 213, "heracross": 214, "sneasel": 215, "teddiursa": 216, "ursaring": 217, "slugma": 218, "magcargo": 219, "swinub": 220, "piloswine": 221, "corsola": 222, "remoraid": 223, "octillery": 224, "delibird": 225, "mantine": 226, "skarmory": 227, "houndour": 228, "houndoom": 229, "kingdra": 230, "phanpy": 231, "donphan": 232, "porygon2": 233, "stantler": 234, "smeargle": 235, "tyrogue": 236, "hitmontop": 237, "smoochum": 238, "elekid": 239, "magby": 240, "miltank": 241, "blissey": 242, "raikou": 243, "entei": 244, "suicune": 245, "larvitar": 246, "pupitar": 247, "tyranitar": 248, "lugia": 249, "ho oh": 250, "ho-oh": 250, "celebi": 251, "treecko": 252, "grovyle": 253, "sceptile": 254, "torchic": 255, "combusken": 256, "blaziken": 257, "mudkip": 258, "marshtomp": 259, "swampert": 260, "poochyena": 261, "mightyena": 262, "zigzagoon": 263, "linoone": 264, "wurmple": 265, "silcoon": 266, "beautifly": 267, "cascoon": 268, "dustox": 269, "lotad": 270, "lombre": 271, "ludicolo": 272, "seedot": 273, "nuzleaf": 274, "shiftry": 275, "taillow": 276, "swellow": 277, "wingull": 278, "pelipper": 279, "ralts": 280, "kirlia": 281, "gardevoir": 282, "surskit": 283, "masquerain": 284, "shroomish": 285, "breloom": 286, "slakoth": 287, "vigoroth": 288, "slaking": 289, "nincada": 290, "ninjask": 291, "shedinja": 292, "whismur": 293, "loudred": 294, "exploud": 295, "makuhita": 296, "hariyama": 297, "azurill": 298, "nosepass": 299, "skitty": 300, "delcatty": 301, "sableye": 302, "mawile": 303, "aron": 304, "lairon": 305, "aggron": 306, "meditite": 307, "medicham": 308, "electrike": 309, "manectric": 310, "plusle": 311, "minun": 312, "volbeat": 313, "illumise": 314, "roselia": 315, "gulpin": 316, "swalot": 317, "carvanha": 318, "sharpedo": 319, "wailmer": 320, "wailord": 321, "numel": 322, "camerupt": 323, "torkoal": 324, "spoink": 325, "grumpig": 326, "spinda": 327, "trapinch": 328, "vibrava": 329, "flygon": 330, "cacnea": 331, "cacturne": 332, "swablu": 333, "altaria": 334, "zangoose": 335, "seviper": 336, "lunatone": 337, "solrock": 338, "barboach": 339, "whiscash": 340, "corphish": 341, "crawdaunt": 342, "baltoy": 343, "claydol": 344, "lileep": 345, "cradily": 346, "anorith": 347, "armaldo": 348, "feebas": 349, "milotic": 350, "castform": 351, "kecleon": 352, "shuppet": 353, "banette": 354, "duskull": 355, "dusclops": 356, "tropius": 357, "chimecho": 358, "absol": 359, "wynaut": 360, "snorunt": 361, "glalie": 362, "spheal": 363, "sealeo": 364, "walrein": 365, "clamperl": 366, "huntail": 367, "gorebyss": 368, "relicanth": 369, "luvdisc": 370, "bagon": 371, "shelgon": 372, "salamence": 373, "beldum": 374, "metang": 375, "metagross": 376, "regirock": 377, "regice": 378, "registeel": 379, "latias": 380, "latios": 381, "kyogre": 382, "groudon": 383, "rayquaza": 384, "jirachi": 385, "deoxys normal": 386, "deoxys-normal": 386, "turtwig": 387, "grotle": 388, "torterra": 389, "chimchar": 390, "monferno": 391, "infernape": 392, "piplup": 393, "prinplup": 394, "empoleon": 395, "starly": 396, "staravia": 397, "staraptor": 398, "bidoof": 399, "bibarel": 400, "kricketot": 401, "kricketune": 402, "shinx": 403, "luxio": 404, "luxray": 405, "budew": 406, "roserade": 407, "cranidos": 408, "rampardos": 409, "shieldon": 410, "bastiodon": 411, "burmy": 412, "wormadam plant": 413, "wormadam-plant": 413, "mothim": 414, "combee": 415, "vespiquen": 416, "pachirisu": 417, "buizel": 418, "floatzel": 419, "cherubi": 420, "cherrim": 421, "shellos": 422, "gastrodon": 423, "ambipom": 424, "drifloon": 425, "drifblim": 426, "buneary": 427, "lopunny": 428, "mismagius": 429, "honchkrow": 430, "glameow": 431, "purugly": 432, "chingling": 433, "stunky": 434, "skuntank": 435, "bronzor": 436, "bronzong": 437, "bonsly": 438, "mime jr": 439, "mime-jr": 439, "happiny": 440, "chatot": 441, "spiritomb": 442, "gible": 443, "gabite": 444, "garchomp": 445, "munchlax": 446, "riolu": 447, "lucario": 448, "hippopotas": 449, "hippowdon": 450, "skorupi": 451, "drapion": 452, "croagunk": 453, "toxicroak": 454, "carnivine": 455, "finneon": 456, "lumineon": 457, "mantyke": 458, "snover": 459, "abomasnow": 460, "weavile": 461, "magnezone": 462, "lickilicky": 463, "rhyperior": 464, "tangrowth": 465, "electivire": 466, "magmortar": 467, "togekiss": 468, "yanmega": 469, "leafeon": 470, "glaceon": 471, "gliscor": 472, "mamoswine": 473, "porygon z": 474, "porygon-z": 474, "gallade": 475, "probopass": 476, "dusknoir": 477, "froslass": 478, "rotom": 479, "uxie": 480, "mesprit": 481, "azelf": 482, "dialga": 483, "palkia": 484, "heatran": 485, "regigigas": 486, "giratina altered": 487, "giratina-altered": 487, "cresselia": 488, "phione": 489, "manaphy": 490, "darkrai": 491, "shaymin land": 492, "shaymin-land": 492, "arceus": 493, "victini": 494, "snivy": 495, "servine": 496, "serperior": 497, "tepig": 498, "pignite": 499, "emboar": 500, "oshawott": 501, "dewott": 502, "samurott": 503, "patrat": 504, "watchog": 505, "lillipup": 506, "herdier": 507, "stoutland": 508, "purrloin": 509, "liepard": 510, "pansage": 511, "simisage": 512, "pansear": 513, "simisear": 514, "panpour": 515, "simipour": 516, "munna": 517, "musharna": 518, "pidove": 519, "tranquill": 520, "unfezant": 521, "blitzle": 522, "zebstrika": 523, "roggenrola": 524, "boldore": 525, "gigalith": 526, "woobat": 527, "swoobat": 528, "drilbur": 529, "excadrill": 530, "audino": 531, "timburr": 532, "gurdurr": 533, "conkeldurr": 534, "tympole": 535, "palpitoad": 536, "seismitoad": 537, "throh": 538, "sawk": 539, "sewaddle": 540, "swadloon": 541, "leavanny": 542, "venipede": 543, "whirlipede": 544, "scolipede": 545, "cottonee": 546, "whimsicott": 547, "petilil": 548, "lilligant": 549, "basculin red striped": 550, "basculin-red-striped": 550, "sandile": 551, "krokorok": 552, "krookodile": 553, "darumaka": 554, "darmanitan standard": 555, "darmanitan-standard": 555, "maractus": 556, "dwebble": 557, "crustle": 558, "scraggy": 559, "scrafty": 560, "sigilyph": 561, "yamask": 562, "cofagrigus": 563, "tirtouga": 564, "carracosta": 565, "archen": 566, "archeops": 567, "trubbish": 568, "garbodor": 569, "zorua": 570, "zoroark": 571, "minccino": 572, "cinccino": 573, "gothita": 574, "gothorita": 575, "gothitelle": 576, "solosis": 577, "duosion": 578, "reuniclus": 579, "ducklett": 580, "swanna": 581, "vanillite": 582, "vanillish": 583, "vanilluxe": 584, "deerling": 585, "sawsbuck": 586, "emolga": 587, "karrablast": 588, "escavalier": 589, "foongus": 590, "amoonguss": 591, "frillish male": 592, "frillish-male": 592, "jellicent male": 593, "jellicent-male": 593, "alomomola": 594, "joltik": 595, "galvantula": 596, "ferroseed": 597, "ferrothorn": 598, "klink": 599, "klang": 600, "klinklang": 601, "tynamo": 602, "eelektrik": 603, "eelektross": 604, "elgyem": 605, "beheeyem": 606, "litwick": 607, "lampent": 608, "chandelure": 609, "axew": 610, "fraxure": 611, "haxorus": 612, "cubchoo": 613, "beartic": 614, "cryogonal": 615, "shelmet": 616, "accelgor": 617, "stunfisk": 618, "mienfoo": 619, "mienshao": 620, "druddigon": 621, "golett": 622, "golurk": 623, "pawniard": 624, "bisharp": 625, "bouffalant": 626, "rufflet": 627, "braviary": 628, "vullaby": 629, "mandibuzz": 630, "heatmor": 631, "durant": 632, "deino": 633, "zweilous": 634, "hydreigon": 635, "larvesta": 636, "volcarona": 637, "cobalion": 638, "terrakion": 639, "virizion": 640, "tornadus incarnate": 641, "tornadus-incarnate": 641, "thundurus incarnate": 642, "thundurus-incarnate": 642, "reshiram": 643, "zekrom": 644, "landorus incarnate": 645, "landorus-incarnate": 645, "kyurem": 646, "keldeo ordinary": 647, "keldeo-ordinary": 647, "meloetta aria": 648, "meloetta-aria": 648, "genesect": 649, "chespin": 650, "quilladin": 651, "chesnaught": 652, "fennekin": 653, "braixen": 654, "delphox": 655, "froakie": 656, "frogadier": 657, "greninja": 658, "bunnelby": 659, "diggersby": 660, "fletchling": 661, "fletchinder": 662, "talonflame": 663, "scatterbug": 664, "spewpa": 665, "vivillon": 666, "litleo": 667, "pyroar male": 668, "pyroar-male": 668, "flabebe": 669, "floette": 670, "florges": 671, "skiddo": 672, "gogoat": 673, "pancham": 674, "pangoro": 675, "furfrou": 676, "espurr": 677, "meowstic male": 678, "meowstic-male": 678, "honedge": 679, "doublade": 680, "aegislash shield": 681, "aegislash-shield": 681, "spritzee": 682, "aromatisse": 683, "swirlix": 684, "slurpuff": 685, "inkay": 686, "malamar": 687, "binacle": 688, "barbaracle": 689, "skrelp": 690, "dragalge": 691, "clauncher": 692, "clawitzer": 693, "helioptile": 694, "heliolisk": 695, "tyrunt": 696, "tyrantrum": 697, "amaura": 698, "aurorus": 699, "sylveon": 700, "hawlucha": 701, "dedenne": 702, "carbink": 703, "goomy": 704, "sliggoo": 705, "goodra": 706, "klefki": 707, "phantump": 708, "trevenant": 709, "pumpkaboo average": 710, "pumpkaboo-average": 710, "gourgeist average": 711, "gourgeist-average": 711, "bergmite": 712, "avalugg": 713, "noibat": 714, "noivern": 715, "xerneas": 716, "yveltal": 717, "zygarde 50": 718, "zygarde-50": 718, "diancie": 719, "hoopa": 720, "volcanion": 721, "rowlet": 722, "dartrix": 723, "decidueye": 724, "litten": 725, "torracat": 726, "incineroar": 727, "popplio": 728, "brionne": 729, "primarina": 730, "pikipek": 731, "trumbeak": 732, "toucannon": 733, "yungoos": 734, "gumshoos": 735, "grubbin": 736, "charjabug": 737, "vikavolt": 738, "crabrawler": 739, "crabominable": 740, "oricorio baile": 741, "oricorio-baile": 741, "cutiefly": 742, "ribombee": 743, "rockruff": 744, "lycanroc midday": 745, "lycanroc-midday": 745, "wishiwashi solo": 746, "wishiwashi-solo": 746, "mareanie": 747, "toxapex": 748, "mudbray": 749, "mudsdale": 750, "dewpider": 751, "araquanid": 752, "fomantis": 753, "lurantis": 754, "morelull": 755, "shiinotic": 756, "salandit": 757, "salazzle": 758, "stufful": 759, "bewear": 760, "bounsweet": 761, "steenee": 762, "tsareena": 763, "comfey": 764, "oranguru": 765, "passimian": 766, "wimpod": 767, "golisopod": 768, "sandygast": 769, "palossand": 770, "pyukumuku": 771, "type null": 772, "type-null": 772, "silvally": 773, "minior red meteor": 774, "minior-red-meteor": 774, "komala": 775, "turtonator": 776, "togedemaru": 777, "mimikyu disguised": 778, "mimikyu-disguised": 778, "bruxish": 779, "drampa": 780, "dhelmise": 781, "jangmo o": 782, "jangmo-o": 782, "hakamo o": 783, "hakamo-o": 783, "kommo o": 784, "kommo-o": 784, "tapu koko": 785, "tapu-koko": 785, "tapu lele": 786, "tapu-lele": 786, "tapu bulu": 787, "tapu-bulu": 787, "tapu fini": 788, "tapu-fini": 788, "cosmog": 789, "cosmoem": 790, "solgaleo": 791, "lunala": 792, "nihilego": 793, "buzzwole": 794, "pheromosa": 795, "xurkitree": 796, "celesteela": 797, "kartana": 798, "guzzlord": 799, "necrozma": 800, "magearna": 801, "marshadow": 802, "poipole": 803, "naganadel": 804, "stakataka": 805, "blacephalon": 806, "zeraora": 807, "meltan": 808, "melmetal": 809, "grookey": 810, "thwackey": 811, "rillaboom": 812, "scorbunny": 813, "raboot": 814, "cinderace": 815, "sobble": 816, "drizzile": 817, "inteleon": 818, "skwovet": 819, "greedent": 820, "rookidee": 821, "corvisquire": 822, "corviknight": 823, "blipbug": 824, "dottler": 825, "orbeetle": 826, "nickit": 827, "thievul": 828, "gossifleur": 829, "eldegoss": 830, "wooloo": 831, "dubwool": 832, "chewtle": 833, "drednaw": 834, "yamper": 835, "boltund": 836, "rolycoly": 837, "carkol": 838, "coalossal": 839, "applin": 840, "flapple": 841, "appletun": 842, "silicobra": 843, "sandaconda": 844, "cramorant": 845, "arrokuda": 846, "barraskewda": 847, "toxel": 848, "toxtricity amped": 849, "toxtricity-amped": 849, "sizzlipede": 850, "centiskorch": 851, "clobbopus": 852, "grapploct": 853, "sinistea": 854, "polteageist": 855, "hatenna": 856, "hattrem": 857, "hatterene": 858, "impidimp": 859, "morgrem": 860, "grimmsnarl": 861, "obstagoon": 862, "perrserker": 863, "cursola": 864, "sirfetchd": 865, "mr rime": 866, "mr-rime": 866, "runerigus": 867, "milcery": 868, "alcremie": 869, "falinks": 870, "pincurchin": 871, "snom": 872, "frosmoth": 873, "stonjourner": 874, "eiscue ice": 875, "eiscue-ice": 875, "indeedee male": 876, "indeedee-male": 876, "morpeko full belly": 877, "morpeko-full-belly": 877, "cufant": 878, "copperajah": 879, "dracozolt": 880, "arctozolt": 881, "dracovish": 882, "arctovish": 883, "duraludon": 884, "dreepy": 885, "drakloak": 886, "dragapult": 887, "zacian": 888, "zamazenta": 889, "eternatus": 890, "kubfu": 891, "urshifu single strike": 892, "urshifu-single-strike": 892, "zarude": 893, "regieleki": 894, "regidrago": 895, "glastrier": 896, "spectrier": 897, "calyrex": 898, "wyrdeer": 899, "kleavor": 900, "ursaluna": 901, "basculegion male": 902, "basculegion-male": 902, "sneasler": 903, "overqwil": 904, "enamorus incarnate": 905, "enamorus-incarnate": 905, "sprigatito": 906, "floragato": 907, "meowscarada": 908, "fuecoco": 909, "crocalor": 910, "skeledirge": 911, "quaxly": 912, "quaxwell": 913, "quaquaval": 914, "lechonk": 915, "oinkologne male": 916, "oinkologne-male": 916, "tarountula": 917, "spidops": 918, "nymble": 919, "lokix": 920, "pawmi": 921, "pawmo": 922, "pawmot": 923, "tandemaus": 924, "maushold family of four": 925, "maushold-family-of-four": 925, "fidough": 926, "dachsbun": 927, "smoliv": 928, "dolliv": 929, "arboliva": 930, "squawkabilly green plumage": 931, "squawkabilly-green-plumage": 931, "nacli": 932, "naclstack": 933, "garganacl": 934, "charcadet": 935, "armarouge": 936, "ceruledge": 937, "tadbulb": 938, "bellibolt": 939, "wattrel": 940, "kilowattrel": 941, "maschiff": 942, "mabosstiff": 943, "shroodle": 944, "grafaiai": 945, "bramblin": 946, "brambleghast": 947, "toedscool": 948, "toedscruel": 949, "klawf": 950, "capsakid": 951, "scovillain": 952, "rellor": 953, "rabsca": 954, "flittle": 955, "espathra": 956, "tinkatink": 957, "tinkatuff": 958, "tinkaton": 959, "wiglett": 960, "wugtrio": 961, "bombirdier": 962, "finizen": 963, "palafin zero": 964, "palafin-zero": 964, "varoom": 965, "revavroom": 966, "cyclizar": 967, "orthworm": 968, "glimmet": 969, "glimmora": 970, "greavard": 971, "houndstone": 972, "flamigo": 973, "cetoddle": 974, "cetitan": 975, "veluza": 976, "dondozo": 977, "tatsugiri curly": 978, "tatsugiri-curly": 978, "annihilape": 979, "clodsire": 980, "farigiraf": 981, "dudunsparce two segment": 982, "dudunsparce-two-segment": 982, "kingambit": 983, "great tusk": 984, "great-tusk": 984, "scream tail": 985, "scream-tail": 985, "brute bonnet": 986, "brute-bonnet": 986, "flutter mane": 987, "flutter-mane": 987, "slither wing": 988, "slither-wing": 988, "sandy shocks": 989, "sandy-shocks": 989, "iron treads": 990, "iron-treads": 990, "iron bundle": 991, "iron-bundle": 991, "iron hands": 992, "iron-hands": 992, "iron jugulis": 993, "iron-jugulis": 993, "iron moth": 994, "iron-moth": 994, "iron thorns": 995, "iron-thorns": 995, "frigibax": 996, "arctibax": 997, "baxcalibur": 998, "gimmighoul": 999, "gholdengo": 1000, "wo chien": 1001, "wo-chien": 1001, "chien pao": 1002, "chien-pao": 1002, "ting lu": 1003, "ting-lu": 1003, "chi yu": 1004, "chi-yu": 1004, "roaring moon": 1005, "roaring-moon": 1005, "iron valiant": 1006, "iron-valiant": 1006, "koraidon": 1007, "miraidon": 1008, "walking wake": 1009, "walking-wake": 1009, "iron leaves": 1010, "iron-leaves": 1010, "dipplin": 1011, "poltchageist": 1012, "sinistcha": 1013, "okidogi": 1014, "munkidori": 1015, "fezandipiti": 1016, "ogerpon": 1017, "archaludon": 1018, "hydrapple": 1019, "gouging fire": 1020, "gouging-fire": 1020, "raging bolt": 1021, "raging-bolt": 1021, "iron boulder": 1022, "iron-boulder": 1022, "iron crown": 1023, "iron-crown": 1023, "terapagos": 1024, "pecharunt": 1025};

function getRotomPokemonDexId(nameOrObj) {
  if (!nameOrObj) return 0;
  if (typeof nameOrObj === 'number') {
    if (nameOrObj > 0 && nameOrObj <= 1025) return nameOrObj;
    return 0;
  }
  if (typeof nameOrObj === 'object') {
    var numId = Number(nameOrObj.pokemonId || nameOrObj.speciesId || nameOrObj.pokeId || nameOrObj.dexId || nameOrObj.id || 0);
    if (numId > 0 && numId <= 1025) return numId;
    var name = String(nameOrObj.nome || nameOrObj.name || '').toLowerCase().trim();
    if (name && POKEMON_NAME_TO_DEX_ID[name]) return POKEMON_NAME_TO_DEX_ID[name];
    // Tenta sem caracteres especiais
    var clean = name.replace(/[^a-z0-9]/g, '');
    for (var k in POKEMON_NAME_TO_DEX_ID) {
      if (k.replace(/[^a-z0-9]/g, '') === clean) return POKEMON_NAME_TO_DEX_ID[k];
    }
    return 0;
  }
  var q = String(nameOrObj || '').toLowerCase().trim();
  if (POKEMON_NAME_TO_DEX_ID[q]) return POKEMON_NAME_TO_DEX_ID[q];
  var cleanQ = q.replace(/[^a-z0-9]/g, '');
  for (var k in POKEMON_NAME_TO_DEX_ID) {
    if (k.replace(/[^a-z0-9]/g, '') === cleanQ) return POKEMON_NAME_TO_DEX_ID[k];
  }
  return 0;
}

function getRotomPokemonSprite(nameOrObj, isShiny) {
  var dexId = getRotomPokemonDexId(nameOrObj);
  if (dexId > 0) {
    if (isShiny) {
      return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/' + dexId + '.png';
    }
    return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + dexId + '.png';
  }
  return 'https://pokeidle.io/assets/site/assets/ui/ball-poke.png';
}

function getRotomPokemonAttributesHtml(pk, options) {
  if (!pk) return '';
  options = options || {};
  var compacto = Boolean(options.compacto);

  // 1. Potência (P1 a P5)
  var pot = Number(pk.potencia) || 1;
  var potClass = 't' + Math.min(5, Math.max(1, pot));
  var potBg = pot === 5 ? 'linear-gradient(180deg, #ff8a3c, #e8322a)' : (pot === 4 ? '#8a3a92' : (pot === 3 ? '#5aa93e' : (pot === 2 ? '#4a86e8' : '#5a5668')));
  var potHtml = '<span class="pk-selo ' + potClass + '" style="background: ' + potBg + '; color: #fff; font-weight: 800; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="Potência P' + pot + '">P' + pot + '</span>';

  // 2. Qualidade (Q) - Número decimal (ex: 1.050, 1.250, 1.540, 1.789), NUNCA porcentagem
  var q = pk.quality !== undefined ? pk.quality : pk.qualidade;
  var qHtml = '';
  if (q !== undefined && q !== null && !isNaN(Number(q)) && Number(q) > 0) {
    var qNum = Number(q);
    if (qNum > 5) qNum = qNum / 100;
    var qStr = qNum.toFixed(3);
    var qVal = Number(qStr);
    var qBg = qVal >= 1.6 ? 'linear-gradient(180deg, #ff8a3c, #e8322a)' : (qVal >= 1.5 ? '#8a3a92' : (qVal >= 1.3 ? '#5aa93e' : (qVal >= 1.1 ? '#4a86e8' : '#5a5668')));
    qHtml = '<span class="pk-selo" style="background: ' + qBg + '; color: #fff; font-weight: 700; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="Qualidade: ' + qStr + '">Q ' + qStr + '</span>';
  }

  // 3. IV Total
  var iv = pk.ivTotal !== undefined ? pk.ivTotal : pk.iv;
  if (iv == null && pk.ivs && typeof pk.ivs === 'object') {
    iv = Object.values(pk.ivs).reduce(function(s, v) { return s + (Number(v) || 0); }, 0);
  }
  var ivHtml = '';
  if (iv !== undefined && iv !== null && !isNaN(Number(iv))) {
    var ivVal = Math.round(Number(iv));
    var ivBg = ivVal >= 163 ? 'linear-gradient(180deg, #ff8a3c, #e8322a)' : (ivVal >= 134 ? '#8a3a92' : (ivVal >= 96 ? '#5aa93e' : (ivVal >= 70 ? '#4a86e8' : '#5a5668')));
    ivHtml = '<span class="pk-selo" style="background: ' + ivBg + '; color: #fff; font-weight: 700; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="IV Total: ' + ivVal + ' / 192">IV ' + ivVal + '</span>';
  }

  // 4. Nota Oficial (N)
  var n = pk.nota;
  var nHtml = '';
  if (n !== undefined && n !== null && !isNaN(Number(n))) {
    var nNum = Number(n);
    var nStr = nNum.toFixed(2);
    var nBg = nNum >= 8.5 ? '#e2a93f' : (nNum >= 7.0 ? '#8a3a92' : (nNum >= 5.5 ? '#5aa93e' : (nNum >= 4.0 ? '#4a86e8' : '#5a5668')));
    var nColor = nNum >= 8.5 ? '#000' : '#fff';
    nHtml = '<span class="pk-selo" style="background: ' + nBg + '; color: ' + nColor + '; font-weight: 800; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="Nota Oficial: ' + nStr + '">N ' + nStr + '</span>';
  }

  var gap = compacto ? '3px' : '4px';
  return '<div class="pk-selos" style="display: flex; flex-wrap: wrap; gap: ' + gap + '; align-items: center;">' +
    potHtml + qHtml + ivHtml + nHtml +
  '</div>';
}

if (typeof window !== 'undefined') {
  window.POKEMON_NAME_TO_DEX_ID = POKEMON_NAME_TO_DEX_ID;
  window.getRotomPokemonDexId = getRotomPokemonDexId;
  window.getRotomPokemonSprite = getRotomPokemonSprite;
  window.getRotomPokemonAttributesHtml = getRotomPokemonAttributesHtml;

  window.POKEIDLE_ITEMS_DB = POKEIDLE_ITEMS_DB;
  window.POKEIDLE_ITEMS_BY_ID = POKEIDLE_ITEMS_BY_ID;
  window.ROTOM_ITEMS_DB = POKEIDLE_ITEMS_DB;
  window.getAllRotomItems = function() { return POKEIDLE_ITEMS_DB; };
  window.registerRotomItems = registerRotomItems;
  window.categoriaRotomItem = categoriaRotomItem;
  window.registerRotomNames = registerRotomNames;
  window.getRotomItem = getRotomItem;
  window.searchRotomItems = searchRotomItems;
  window.getItemIconUrl = getItemIconUrl;
}

// PokéIdle Rotom Sniper - Content Script v1.4.3
// Faz a ponte entre a página oficial (injected.js) e o Cockpit/Background

(function() {
  console.log('[PokéIdle Rotom Sniper]: Inicializando Content Script v1.4.3...');

  // Verifica com segurança se o contexto da extensão ainda está ativo no Chrome
  function isExtensionContextValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // Wrapper seguro para leitura do chrome.storage.local
  function safeStorageGet(keys, callback) {
    if (!isExtensionContextValid()) return;
    try {
      chrome.storage.local.get(keys, (res) => {
        try {
          if (!isExtensionContextValid()) return;
          if (chrome.runtime && chrome.runtime.lastError) return;
          if (callback) callback(res || {});
        } catch (err) {}
      });
    } catch (err) {}
  }

  // Wrapper seguro para escrita no chrome.storage.local
  function safeStorageSet(data, callback) {
    if (!isExtensionContextValid()) return;
    try {
      chrome.storage.local.set(data, () => {
        try {
          if (!isExtensionContextValid()) return;
          if (chrome.runtime && chrome.runtime.lastError) return;
          if (callback) callback();
        } catch (err) {}
      });
    } catch (err) {}
  }

      safeStorageGet(['rotom_sniper_rules', 'rotom_sniper_config', 'rotom_sniper_enabled'], (res) => {
        window.postMessage({
          source: 'ROTOM_POPUP',
          type: 'INIT_SNIPER',
          enabled: res.rotom_sniper_enabled !== undefined ? Boolean(res.rotom_sniper_enabled) : false,
          rules: res.rotom_sniper_rules || [],
          globalConfig: res.rotom_sniper_config || {
            snipeAnyShiny: false,
            maxPriceShinyGold: 50000,
            maxPriceShinyGems: 0,
            maxPriceShinyDiamonds: 0,
            snipeAnyP5: false,
            maxPriceP5Gold: 100000,
            maxPriceP5Gems: 0,
            maxPriceP5Diamonds: 0,
            snipeByNote: false,
            minNote: 7.0,
            maxPriceNoteGold: 50000,
            maxPriceNoteGems: 0,
            maxPriceNoteDiamonds: 0,
            maxActiveSlots: 5
          }
        }, '*');
  
      });
  // Escuta mensagens do injected.js com auto-desvinculação quando o contexto for invalidado
  function handleWindowMessage(event) {
    if (event.source !== window || !event.data || event.data.source !== 'ROTOM_SNIPER') return;

    // Se o contexto da extensão foi descarregado/recarregado no Chrome, desvincula o listener imediatamente
    if (!isExtensionContextValid()) {
      window.removeEventListener('message', handleWindowMessage);
      return;
    }

    try {
      if (event.data.type === 'SNIPER_LOG') {
        safeStorageGet(['rotom_sniper_logs'], (res) => {
          const logs = res.rotom_sniper_logs || [];
          const updatedLogs = [event.data.log, ...logs].slice(0, 100);
          safeStorageSet({ rotom_sniper_logs: updatedLogs });
        });
      } else if (event.data.type === 'SNIPER_BOUGHT') {
        const { ruleId, offerId, qty } = event.data;
        safeStorageGet(['rotom_sniper_rules'], (res) => {
          const rules = res.rotom_sniper_rules || [];
          let changed = false;
          rules.forEach(r => {
            if (r.id === ruleId) {
              r.totalBought = (r.totalBought || 0) + (qty || 1);
              changed = true;
            }
          });
          if (changed) {
            safeStorageSet({ rotom_sniper_rules: rules });
          }
        });
      } else if (event.data.type === 'BALANCE_UPDATE') {
        const { gold, diamonds, orbs } = event.data;
        const patch = {};
        if (typeof gold === 'number' && gold >= 0) patch.rotom_player_gold = gold;
        if (typeof diamonds === 'number' && diamonds >= 0) patch.rotom_player_diamonds = diamonds;
        if (typeof orbs === 'number' && orbs >= 0) patch.rotom_player_orbs = orbs;
        safeStorageSet(patch);
      } else if (event.data.type === 'VIP_STATUS_UPDATE') {
        const isVip = Boolean(event.data.isVip);
        safeStorageSet({ rotom_player_vip: isVip });
      } else if (event.data.type === 'MY_LISTINGS_UPDATE') {
        safeStorageSet({ rotom_my_listings: event.data.listings || [] });
      } else if (event.data.type === 'MARKET_CATALOG_UPDATE') {
        safeStorageSet({ rotom_market_catalog: event.data.resumo || {} });
      } else if (event.data.type === 'ITEMS_NAMES') {
        // Nome que o jogo mostra para cada item ({id: nome}), no idioma do jogador.
        safeStorageGet(['rotom_items_names'], (res) => {
          safeStorageSet({ rotom_items_names: Object.assign({}, res.rotom_items_names || {}, event.data.nomes || {}) });
        });
      } else if (event.data.type === 'ITEMS_CATALOG') {
        // Itens novos do jogo aprendidos na página: soma ao que já foi aprendido em sessões anteriores.
        safeStorageGet(['rotom_items_dynamic'], (res) => {
          const porId = {};
          (res.rotom_items_dynamic || []).forEach(it => { if (it && it.id) porId[it.id] = it; });
          (event.data.items || []).forEach(it => { if (it && it.id) porId[it.id] = it; });
          safeStorageSet({ rotom_items_dynamic: Object.values(porId) });
        });
      } else if (event.data.type === 'ITEM_OFFERS_UPDATE') {
        safeStorageSet({
          rotom_item_offers: {
            itemId: event.data.itemId,
            itemName: event.data.itemName,
            moeda: event.data.moeda,
            linhas: event.data.linhas || [],
            offers: event.data.linhas || [],
            timestamp: Date.now()
          }
        });
      } else if (event.data.type === 'DIAMOND_OFFERS_UPDATE') {
        const diamondPayload = {
          offers: event.data.offers || [],
          timestamp: Date.now()
        };
        safeStorageSet({ rotom_diamond_offers: diamondPayload });
        try {
          chrome.runtime.sendMessage({
            action: 'DIAMOND_OFFERS_UPDATE',
            offers: event.data.offers || []
          }).catch(() => {});
        } catch (e) {}
      } else if (event.data.type === 'FARM_STATS_UPDATE') {
        const stats = event.data.stats || {};
        safeStorageSet({
          rotom_farm_stats: stats,
          rotom_hunts_telemetry: stats.hunts || {}
        });
        try {
          chrome.runtime.sendMessage({
            action: 'FARM_STATS_UPDATE',
            stats: stats
          }).catch(() => {});
        } catch (e) {}
      } else if (event.data.type === 'BOSSES_UPDATE') {
        safeStorageSet({
          rotom_bosses_jogaveis: event.data.bossesJogaveis || null,
          rotom_bosses_catalogo: event.data.bossesCatalogo || null
        });
        try {
          chrome.runtime.sendMessage({
            action: 'BOSSES_UPDATE',
            bossesJogaveis: event.data.bossesJogaveis || null,
            bossesCatalogo: event.data.bossesCatalogo || null
          }).catch(() => {});
        } catch (e) {}
      } else if (event.data.type === 'OFERENDA_CANDIDATES_RESULT') {
        safeStorageSet({ rotom_oferenda_candidates: event.data });
      } else if (event.data.type === 'OFERENDA_BATCH_PROGRESS') {
        safeStorageSet({ rotom_oferenda_progress: event.data });
      } else if (event.data.type === 'OFERENDA_BATCH_COMPLETED') {
        safeStorageSet({ rotom_oferenda_completed: event.data });
      }
    } catch (err) {
      if (!isExtensionContextValid()) {
        window.removeEventListener('message', handleWindowMessage);
      }
    }
  }

  window.addEventListener('message', handleWindowMessage);

  // Sincronização reativa instantânea via chrome.storage.onChanged (funciona entre todas as janelas/abas)
  if (isExtensionContextValid() && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !isExtensionContextValid()) return;

        if (changes.rotom_sniper_enabled !== undefined) {
          const enabled = Boolean(changes.rotom_sniper_enabled.newValue);
          window.postMessage({ source: 'ROTOM_POPUP', type: 'SET_SNIPER_ENABLED', enabled }, '*');
        }

        if (changes.rotom_sniper_rules !== undefined) {
          const rules = Array.isArray(changes.rotom_sniper_rules.newValue) ? changes.rotom_sniper_rules.newValue : [];
          window.postMessage({ source: 'ROTOM_POPUP', type: 'UPDATE_SNIPER_RULES', rules }, '*');
        }

        if (changes.rotom_sniper_config !== undefined) {
          const config = changes.rotom_sniper_config.newValue || {};
          window.postMessage({ source: 'ROTOM_POPUP', type: 'UPDATE_SNIPER_CONFIG', config }, '*');
        }

        if (changes.rotom_action_fetch_oferendas && changes.rotom_action_fetch_oferendas.newValue) {
          const req = changes.rotom_action_fetch_oferendas.newValue;
          window.postMessage({
            source: 'ROTOM_POPUP',
            type: 'FETCH_OFERENDA_CANDIDATES',
            maxNota: req.maxNota,
            elemento: req.elemento
          }, '*');
        }

        if (changes.rotom_action_execute_oferendas && changes.rotom_action_execute_oferendas.newValue) {
          const req = changes.rotom_action_execute_oferendas.newValue;
          window.postMessage({
            source: 'ROTOM_POPUP',
            type: 'EXECUTE_OFERENDA_BATCH',
            pokemonIds: req.pokemonIds,
            pacingMs: req.pacingMs
          }, '*');
        }
      });
    } catch (e) {}
  }

  // Escuta comandos diretos enviados via runtime.sendMessage / tabs.sendMessage
  if (isExtensionContextValid() && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!isExtensionContextValid()) return;
        try {
          if (request.action === 'SET_SNIPER_ENABLED') {
            safeStorageSet({ rotom_sniper_enabled: request.enabled });
            sendResponse({ ok: true });
          } else if (request.action === 'UPDATE_SNIPER_RULES') {
            safeStorageSet({ rotom_sniper_rules: request.rules });
            sendResponse({ ok: true });
          } else if (request.action === 'UPDATE_SNIPER_CONFIG') {
            safeStorageSet({ rotom_sniper_config: request.config });
            sendResponse({ ok: true });
          } else if (request.action === 'CLEAR_SNIPER_LOGS') {
            safeStorageSet({ rotom_sniper_logs: [] });
            sendResponse({ ok: true });
          } else if (request.action === 'FETCH_MY_LISTINGS') {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'FETCH_MY_LISTINGS' }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'CANCEL_MARKET_OFFER') {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'CANCEL_MARKET_OFFER', offerId: request.offerId ?? request.id }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'FETCH_COMMUNITY_CATALOG') {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'FETCH_COMMUNITY_CATALOG' }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'FETCH_ITEM_OFFERS') {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'FETCH_ITEM_OFFERS', itemId: request.itemId, moeda: request.moeda }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'BUY_MANUAL_OFFER') {
            window.postMessage({
              source: 'ROTOM_POPUP',
              type: 'BUY_MANUAL_OFFER',
              offerId: request.offerId,
              qty: request.qty,
              price: request.price,
              moeda: request.moeda,
              targetName: request.targetName,
              seller: request.seller
            }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'FETCH_DIAMOND_OFFERS') {
            window.postMessage({
              source: 'ROTOM_POPUP',
              type: 'FETCH_DIAMOND_OFFERS',
              moeda: request.moeda
            }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'CREATE_MARKET_LISTING') {
            window.postMessage({
              source: 'ROTOM_POPUP',
              type: 'CREATE_MARKET_LISTING',
              tipo: request.tipo,
              itemId: request.itemId,
              pokemonId: request.pokemonId,
              qtd: request.qtd,
              preco: request.preco,
              moeda: request.moeda,
              dias: request.dias
            }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'FETCH_FARM_STATS') {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'FETCH_FARM_STATS' }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'RESET_FARM_STATS') {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'RESET_FARM_STATS' }, '*');
            safeStorageSet({ rotom_farm_stats: null, rotom_hunts_telemetry: null });
            sendResponse({ ok: true });
          } else if (request.action === 'RESET_HUNTS_STATS') {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'RESET_HUNTS_STATS' }, '*');
            safeStorageSet({ rotom_hunts_telemetry: null });
            sendResponse({ ok: true });
          } else if (request.action === 'FETCH_OFERENDA_CANDIDATES') {
            window.postMessage({
              source: 'ROTOM_POPUP',
              type: 'FETCH_OFERENDA_CANDIDATES',
              maxNota: request.maxNota !== undefined ? request.maxNota : request.notaMax,
              elemento: request.elemento !== undefined ? request.elemento : request.tipo
            }, '*');
            sendResponse({ ok: true });
          } else if (request.action === 'EXECUTE_OFERENDA_BATCH') {
            window.postMessage({
              source: 'ROTOM_POPUP',
              type: 'EXECUTE_OFERENDA_BATCH',
              pokemonIds: request.pokemonIds,
              pacingMs: request.pacingMs
            }, '*');
            sendResponse({ ok: true });
          }
        } catch (err) {}
        return true;
      });
    } catch (e) {}
  }
})();
// PokéIdle Rotom Sniper - Injected Script v1.4.3 (Executa no contexto real da página)
// Módulos: Interceptador WebSocket, Monitoramento Autônomo de Mercado, Auto-Snipe e HUD Toasts

(function() {
  console.log('[PokéIdle Rotom Sniper]: Inicializando Injected Engine v1.4.3...');

  let activeWebSocket = null;
  let lastDiamondRequestTime = 0;
  let accumulatedDiamondOffers = [];
  const OriginalWebSocket = window.WebSocket;
  const originalProtoSend = OriginalWebSocket.prototype.send;
  const originalProtoAddEventListener = OriginalWebSocket.prototype.addEventListener;

  let playerPokemonsCache = [];
  let oferendaStonesAccumulator = {};
  let isOferendaBatchRunning = false;

  function hookWebSocketInstance(ws) {
    if (!ws) return;
    activeWebSocket = ws;
    window.__activeGameWs = ws;
    if (ws.__rotomHooked) return;
    ws.__rotomHooked = true;

    try {
      originalProtoAddEventListener.call(ws, 'message', function(event) {
        if (typeof event.data === 'string') {
          try {
            const packet = JSON.parse(event.data);
            handleMarketPacket(packet);
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  // Hook no construtor WebSocket para capturar a conexão do jogo
  try {
    window.WebSocket = function(...args) {
      const ws = new OriginalWebSocket(...args);
      hookWebSocketInstance(ws);
      return ws;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  } catch (e) {}

  // Hook de segurança no prototype.send para capturar instâncias existentes
  try {
    OriginalWebSocket.prototype.send = function(...args) {
      hookWebSocketInstance(this);
      return originalProtoSend.apply(this, args);
    };
  } catch (e) {}

  // Hook de segurança no addEventListener
  try {
    OriginalWebSocket.prototype.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        hookWebSocketInstance(this);
      }
      return originalProtoAddEventListener.call(this, type, listener, options);
    };
  } catch (e) {}

  function getGameWs() {
    if (activeWebSocket && activeWebSocket.readyState === WebSocket.OPEN) {
      hookWebSocketInstance(activeWebSocket);
      return activeWebSocket;
    }
    if (window.estado && window.estado.ws && window.estado.ws.readyState === WebSocket.OPEN) {
      activeWebSocket = window.estado.ws;
      hookWebSocketInstance(activeWebSocket);
      return activeWebSocket;
    }
    if (window.__activeGameWs && window.__activeGameWs.readyState === WebSocket.OPEN) {
      activeWebSocket = window.__activeGameWs;
      hookWebSocketInstance(activeWebSocket);
      return activeWebSocket;
    }
    return null;
  }

  function sendRaw(payloadObj) {
    const ws = getGameWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[Rotom Sniper]: WebSocket indisponível ou fechado.');
      return false;
    }
    const str = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
    try {
      ws.send(str);
      return true;
    } catch (e) {
      try {
        originalProtoSend.call(ws, str);
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  // =========================================================================
  // 1. ROTOM IN-GAME HUD TOAST (Alertas Visuais Cyberdeck no Próprio Jogo)
  // =========================================================================
  function ensureRotomToastContainer() {
    let container = document.getElementById('rotom-hud-toasts');
    if (!container) {
      container = document.createElement('div');
      container.id = 'rotom-hud-toasts';
      container.style.cssText = [
        'position: fixed',
        'top: 14px',
        'right: 14px',
        'z-index: 9999999',
        'display: flex',
        'flex-direction: column',
        'gap: 6px',
        'pointer-events: none',
        'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        'max-width: 330px',
        'width: 100%'
      ].join(';');
      document.body.appendChild(container);
    }
    return container;
  }

  // =========================================================================
  // =========================================================================
  // TELEMETRIA DA SESSÃO DE FARM DO JOGADOR AO VIVO (XP/H, GOLD/H, DROPS)
  // E DASHBOARD DE RENDIMENTO POR HUNT COM MÉDIAS E PERSISTÊNCIA
  // =========================================================================
  let farmSession = {
    startTime: Date.now(),
    trainerXp: 0,
    pokemonXp: 0,
    gold: 0,
    kills: 0,
    captures: 0,
    catches: 0,
    ballAttempts: 0,
    shiniesSeen: 0,
    shiniesCaught: 0,
    bossTokens: 0,
    keyFragments: 0,
    shinyFragments: 0,
    bikeFragments: 0,
    dropsCount: 0,
    drops: {},
    activeHuntSlug: '',
    activeHuntName: '',
    inCenter: false,
    hunts: {} // { [slug]: { slug, name, durationMs, kills, captures, catches, attempts, pokemonXp, trainerXp, gold, dropsCount, drops: {}, shiniesSeen, shiniesCaught, lastSeen } }
  };

  let playerInPokemonCenter = false;
  const seenWildShiniesMap = new Map(); // key -> timestamp
  const recentCapturesMap = new Map();
  let lastBattleEventTs = 0;

  function formatHuntName(slug) {
    if (!slug) return 'Hunt Geral';
    if (typeof window.ROTOM_HUNTS_DB !== 'undefined' && Array.isArray(window.ROTOM_HUNTS_DB)) {
      const found = window.ROTOM_HUNTS_DB.find(h => h.slug === slug || (h.nome || '').toLowerCase().replace(/[\s-]+/g, '_') === slug);
      if (found) return found.nome;
    }
    return slug
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function getOrCreateHuntStat(slug, name) {
    if (!slug || slug === 'centro_pokemon') return null;
    if (!farmSession.hunts) farmSession.hunts = {};
    if (!farmSession.hunts[slug]) {
      farmSession.hunts[slug] = {
        slug: slug,
        name: name || formatHuntName(slug),
        durationMs: 0,
        kills: 0,
        captures: 0,
        catches: 0,
        attempts: 0,
        pokemonXp: 0,
        trainerXp: 0,
        gold: 0,
        dropsCount: 0,
        drops: {},
        shiniesSeen: 0,
        shiniesCaught: 0,
        lastSeen: Date.now()
      };
    }
    if (name && farmSession.hunts[slug].name !== name && !farmSession.hunts[slug].name.includes('Tier')) {
      farmSession.hunts[slug].name = name;
    }
    farmSession.hunts[slug].lastSeen = Date.now();
    return farmSession.hunts[slug];
  }

  // Ticker a cada 1s para contabilizar tempo ativo na hunt atual enquanto o combate estiver acontecendo
  setInterval(() => {
    const now = Date.now();
    if (now - lastBattleEventTs < 15000 && farmSession.activeHuntSlug && !playerInPokemonCenter) {
      const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
      if (currentHunt) {
        currentHunt.durationMs = (currentHunt.durationMs || 0) + 1000;
      }
    }
  }, 1000);

  try {
    const savedFarm = localStorage.getItem('rotom_farm_session');
    if (savedFarm) {
      const parsed = JSON.parse(savedFarm);
      if (parsed && typeof parsed === 'object') {
        farmSession = Object.assign(farmSession, parsed);
        if (!farmSession.hunts) farmSession.hunts = {};
      }
    }
  } catch (e) {}

  let farmStatsEmitDebounce = null;
  function emitFarmStats() {
    clearTimeout(farmStatsEmitDebounce);
    farmStatsEmitDebounce = setTimeout(() => {
      try {
        localStorage.setItem('rotom_farm_session', JSON.stringify(farmSession));
        window.postMessage({
          source: 'ROTOM_SNIPER',
          type: 'FARM_STATS_UPDATE',
          stats: farmSession
        }, '*');
      } catch (e) {}
    }, 120);
  }

  let lastToastKey = '';
  let lastToastTime = 0;

  function showRotomHudToast(title, message, type) {
    try {
      const now = Date.now();
      const toastKey = `${title}::${message}`;
      if (toastKey === lastToastKey && (now - lastToastTime) < 1500) {
        return; // Ignora toast idêntico disparado repetidamente
      }
      lastToastKey = toastKey;
      lastToastTime = now;

      const container = ensureRotomToastContainer();
      const toast = document.createElement('div');
      
      let badgeTag = '[SNIPER]';
      let tagBg = '#ba5ad1';
      let tagColor = '#fff';

      if (type === 'success' || type === 'confirmed') {
        badgeTag = '[SUCESSO]';
        tagBg = '#4e9c62';
      } else if (type === 'warning' || type === 'slot_limit' || type === 'scheduled') {
        badgeTag = '[AVISO]';
        tagBg = '#f0a03c';
        tagColor = '#4a3608';
      } else if (type === 'error' || type === 'rejected') {
        badgeTag = '[ERRO]';
        tagBg = '#d8574a';
      } else if (type === 'shiny') {
        badgeTag = '[SHINY]';
        tagBg = '#e2a93f';
        tagColor = '#4a3608';
      }

      toast.style.cssText = [
        'background: linear-gradient(180deg, #914850 0 8px, #bd6951 8px calc(100% - 8px), #df824c calc(100% - 8px) 100%)',
        'box-shadow: inset 0 0 0 2px #480e1e, inset 0 0 0 4px #f1d3b7, 0 4px 0 #722c3f, 0 10px 30px rgba(0, 0, 0, 0.75)',
        'color: #fff6ef',
        'padding: 8px 12px',
        'font-family: Tahoma, Verdana, "Segoe UI", sans-serif',
        'font-weight: 700',
        'font-size: 11px',
        'pointer-events: auto',
        'border-radius: 6px',
        'transition: all 0.2s ease',
        'display: flex',
        'flex-direction: column',
        'gap: 4px'
      ].join(';');

      toast.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(72,14,30,0.4); padding-bottom: 3px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="background: ${tagBg}; color: ${tagColor}; font-size: 8px; padding: 1px 4px; border-radius: 3px; box-shadow: inset 0 0 0 1px #480e1e; font-weight: 900; letter-spacing: 0.5px;">${badgeTag}</span>
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; text-shadow: -1px -1px 0 #722c3f, 1px -1px 0 #722c3f, -1px 1px 0 #722c3f, 1px 1px 0 #722c3f;">${title}</span>
          </div>
          <span style="font-size: 8px; color: #f5cdb9; text-transform: uppercase; letter-spacing: 0.5px;">AUTO-SNIPER</span>
        </div>
        <div style="font-size: 10.5px; line-height: 1.35; color: #fff6ef; text-shadow: 0 1px 1px rgba(0,0,0,0.5);">
          ${message}
        </div>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => toast.remove(), 250);
      }, 4500);
    } catch (e) {
      console.error('[Rotom Toast Error]', e);
    }
  }

  // =========================================================================
  // 2. ESTADO E ENGINE DO AUTO-SNIPE
  // =========================================================================
  const sniperState = {
    enabled: false,
    rules: [],
    globalConfig: {
      snipeAnyShiny: false,
      maxPriceShinyGold: 50000,
      maxPriceShinyGems: 0,
      maxPriceShinyDiamonds: 0,
      snipeAnyP5: false,
      maxPriceP5Gold: 100000,
      maxPriceP5Gems: 0,
      maxPriceP5Diamonds: 0,
      snipeByNote: false,
      minNote: 7.0,
      maxPriceNoteGold: 50000,
      maxPriceNoteGems: 0,
      maxPriceNoteDiamonds: 0,
      maxActiveSlots: 5,
      autoMaxAffordable: true // Calibração por Saldo (Eficiência Máxima de Coins)
    },
    playerGold: -1,
    playerDiamonds: -1,
    playerOrbs: -1,
    isPlayerVip: false,
    boughtOffers: {},      // offerId -> timestamp
    scheduledOffers: {},   // offerId -> timeoutId ou array de timers
    confirmedOffers: {},   // offerId -> bool (compra confirmada)
    knownItems: {},        // itemId -> itemObj
    lastBuyAttempt: null   // { offerId, targetName, timestamp }
  };

  // RELÓGIO DO SERVIDOR: o `compravelEm` dos anúncios é um instante do relógio do SERVIDOR.
  // Comparar com Date.now() (relógio do PC do jogador) atrasava o disparo exatamente o quanto o
  // relógio do Windows estivesse atrasado: com 10 s de atraso, o sniper comprava 10 s depois de o
  // selo "Retido" sumir, fora da janela de 3 s do sorteio, e recebia "anúncio não existe mais".
  // Mesma correção do cliente oficial (app.js: estado.desvioServidor / agoraDoServidor).
  let desvioServidor = 0; // Date.now() − servidorAgora do último estado recebido
  let desvioAvisado = false;
  const agoraDoServidor = () => Date.now() - desvioServidor;

  function atualizarRelogioServidor(servidorAgora) {
    const s = Number(servidorAgora);
    if (!s || isNaN(s)) return;
    desvioServidor = Date.now() - s;
    if (!desvioAvisado && Math.abs(desvioServidor) > 1500) {
      desvioAvisado = true;
      console.warn(`[Rotom Sniper]: Relógio do PC ${desvioServidor > 0 ? 'adiantado' : 'atrasado'} ${(Math.abs(desvioServidor) / 1000).toFixed(1)}s em relação ao servidor. O sniper usa o horário do servidor para disparar na liberação.`);
    }
  }

  /* PIO: relógio em Web Worker. Com o jogo oculto (modo Simples + Eco) o navegador freia setTimeout/setInterval
     da página para cerca de 1 vez por minuto; dentro de um Worker os relógios seguem no tempo certo e o aviso
     volta para a página como mensagem, que não é freada. Se o Worker não puder ser criado, usa o relógio normal. */
  const pioRelogio = (() => {
    let w = null, seq = 0;
    const P = new Map(); /* id -> { fn, r, ms, t0, nat } */
    const nativo = (id, e, ms) => { e.nat = e.r ? setInterval(() => roda(id), ms) : setTimeout(() => roda(id), ms); };
    function roda(id) {
      const e = P.get(id); if (!e) return;
      if (!e.r) P.delete(id);
      try { e.fn(); } catch (x) { console.error('[Rotom Sniper]: erro em tarefa do relógio:', x); }
    }
    function caiParaNormal(motivo) {
      if (!w) return;
      try { w.terminate(); } catch (x) { }
      w = null; window.__pioRelogio = 'normal';
      console.warn('[Rotom Sniper]: relógio em Worker indisponível (' + motivo + '); usando o relógio normal da página.');
      const agora = Date.now();
      for (const [id, e] of P) if (e.nat == null) nativo(id, e, e.r ? e.ms : Math.max(0, e.ms - (agora - e.t0)));
    }
    try {
      const codigo = 'var T={};onmessage=function(e){var d=e.data;if(d.c==="s"){T[d.id]=(d.r?setInterval:setTimeout)(function(){postMessage(d.id);if(!d.r)delete T[d.id];},d.ms);}else if(d.c==="x"){if(T[d.id]!=null){clearTimeout(T[d.id]);clearInterval(T[d.id]);delete T[d.id];}}};';
      w = new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })));
      w.onmessage = ev => roda(ev.data);
      w.onerror = ev => { try { ev.preventDefault(); } catch (x) { } caiParaNormal((ev && ev.message) || 'erro ao carregar'); };
      window.__pioRelogio = 'worker';
      console.log('[Rotom Sniper]: relógio em Worker ativo (disparos e varredura sem freio com o jogo oculto).');
    } catch (x) { w = null; window.__pioRelogio = 'normal'; console.warn('[Rotom Sniper]: Worker bloqueado; usando o relógio normal.', x); }
    function agenda(fn, ms, r) {
      const id = 'pr' + (++seq), e = { fn, r, ms: Math.max(0, Number(ms) || 0), t0: Date.now(), nat: null };
      P.set(id, e);
      if (w) { try { w.postMessage({ c: 's', id, ms: e.ms, r }); return id; } catch (x) { caiParaNormal('postMessage'); return id; } }
      nativo(id, e, e.ms);
      return id;
    }
    return {
      timeout: (fn, ms) => agenda(fn, ms, false),
      intervalo: (fn, ms) => agenda(fn, ms, true),
      limpar: id => {
        if (typeof id !== 'string') { clearTimeout(id); clearInterval(id); return; }
        const e = P.get(id); if (!e) return;
        P.delete(id);
        if (e.nat != null) { clearTimeout(e.nat); clearInterval(e.nat); }
        else if (w) { try { w.postMessage({ c: 'x', id }); } catch (x) { } }
      }
    };
  })();

  function clearOfferTimers(offerId) {
    if (sniperState.scheduledOffers[offerId]) {
      const timers = Array.isArray(sniperState.scheduledOffers[offerId])
        ? sniperState.scheduledOffers[offerId]
        : [sniperState.scheduledOffers[offerId]];
      timers.forEach(t => pioRelogio.limpar(t));
      delete sniperState.scheduledOffers[offerId];
    }
  }

  // Carrega catálogo canônico
  if (typeof window.POKEIDLE_ITEMS_DB !== 'undefined' && Array.isArray(window.POKEIDLE_ITEMS_DB)) {
    window.POKEIDLE_ITEMS_DB.forEach(it => {
      sniperState.knownItems[it.id] = it;
    });
  }

  // ── Itens novos do jogo (nomeados dinamicamente) ──
  //
  // O jogo lança itens que o items_db.js não conhece (ex.: Mega Shiny Stone). Eles chegam no `welcome`
  // (`itensNossos`), na ficha de cada anúncio do Mercado e no catálogo base `/assets/items.json`.
  // Aqui eles entram no catálogo da página e vão para o storage (`rotom_items_dynamic`) via
  // content_script, de onde o cockpit os lê para o sniper poder escolhê-los.
  const itensDinamicos = {};
  let timerCatalogoItens = 0;
  let espelhoItens = null;
  const CATEGORIAS_SEM_MERCADO = ['heal', 'potion'];

  function aprenderItens(lista, soNegociaveis) {
    if (!Array.isArray(lista)) return;
    const novos = [];
    for (const it of lista) {
      const id = Number(it && it.id);
      const nome = it && (it.name || it.nome);
      if (!id || !nome || String(nome).startsWith('Item #')) continue;
      const categoria = String(it.category || it.categoria || '').toLowerCase();
      if (CATEGORIAS_SEM_MERCADO.includes(categoria)) continue;
      // Do welcome vêm também itens da Loja que não vão ao Mercado: só entram os que têm cara de negociáveis.
      if (soNegociaveis && typeof window.categoriaRotomItem === 'function' &&
          window.categoriaRotomItem(nome, categoria, id) === 'outros') continue;
      const icone = it.icon || it.icone || '';
      if (!sniperState.knownItems[id]) sniperState.knownItems[id] = { id, name: String(nome), icon: icone, category: categoria };
      const curado = window.POKEIDLE_ITEMS_BY_ID && window.POKEIDLE_ITEMS_BY_ID[id] && !window.POKEIDLE_ITEMS_BY_ID[id].dinamico;
      if (curado || itensDinamicos[id]) continue;
      itensDinamicos[id] = { id, name: String(nome), icon: icone, category: categoria, npcPrice: Number(it.npcPrice) || 0 };
      novos.push(itensDinamicos[id]);
    }
    if (!novos.length) return;
    if (typeof window.registerRotomItems === 'function') window.registerRotomItems(novos);
    clearTimeout(timerCatalogoItens);
    timerCatalogoItens = setTimeout(() => {
      try {
        window.postMessage({ source: 'ROTOM_SNIPER', type: 'ITEMS_CATALOG', items: Object.values(itensDinamicos) }, '*');
      } catch (e) {}
    }, 1500);
    publicarNomesDoJogo();
  }

  // ── O nome que o jogo MOSTRA ──
  //
  // O jogo não exibe o `name` cru do catálogo: a função `nomeItem` do cliente traduz os itens dele
  // (fragmentos, Name Tag, Exp. Share, caixas, ovos, Mystic Ticket), monta "Shiny Stone {tipo}",
  // "Casa Rara", "Bicicleta Lendária", "Skin {nome}", e só no resto acerta as maiúsculas do inglês.
  // Aqui a mesma regra roda com os MÓDULOS do próprio jogo (tradução no idioma do jogador), importados
  // pelo endereço do site: este script vem de chrome-extension://, e um caminho relativo iria para lá.
  let nomeadorDoJogo = null;
  let pedrasShinyDoJogo = [];
  let timerNomes = 0;
  const RAR_CASA = { 70040: 'comum', 70041: 'incomum', 70042: 'rara', 70043: 'mitica', 70044: 'lendaria' };
  const RAR_BICICLETA = { 70080: 'comum', 70081: 'incomum', 70082: 'rara', 70083: 'mitica', 70084: 'lendaria' };

  function carregarNomeadorDoJogo() {
    if (nomeadorDoJogo) return nomeadorDoJogo;
    const imp = (p) => import(location.origin + p).catch(() => null);
    nomeadorDoJogo = Promise.all([
      imp('/i18n.mjs'), imp('/shared/titulo-item.mjs'), imp('/shared/skins.mjs'),
      imp('/shared/mistico.mjs'), imp('/shared/chocadeira.mjs'), imp('/shared/ovo-shiny.mjs'),
    ]).then(([i18n, titulo, skins, mistico, chocadeira, ovoShiny]) => {
      if (!i18n || typeof i18n.t !== 'function') return null;
      // Espelho de NOSSOS_ITENS_I18N do cliente (app.js).
      const chaves = {
        70010: 'item.escapeRope', 70011: 'item.fragmentoChave', 70012: 'item.fragmentoShiny',
        70013: 'item.fragmentoBicicleta', 70014: 'item.fragmentoMega', 70015: 'item.fragmentoMegaShiny',
        70016: 'item.nameTag', 70050: 'item.xpShareHeld',
        70060: 'caixas.nome.fundador', 70061: 'caixas.nome.cofundador',
      };
      if (mistico && mistico.MYSTIC_TICKET_ID) chaves[mistico.MYSTIC_TICKET_ID] = 'item.mysticTicket';
      ((chocadeira && chocadeira.TODOS_OS_OVOS) || []).forEach(o => { chaves[o.itemId] = `item.ovo.${o.id}`; });
      if (ovoShiny && ovoShiny.FRAGMENTO_OVO_SHINY_ID) chaves[ovoShiny.FRAGMENTO_OVO_SHINY_ID] = 'item.fragmentoOvoShiny';
      return {
        t: i18n.t, chaves,
        titulo: (titulo && titulo.tituloInglesItem) || (s => s),
        skins: skins && skins.SKIN_POR_ITEM,
      };
    });
    return nomeadorDoJogo;
  }

  function nomeComoNoJogo(n, id, nomeCatalogo) {
    const tr = (k, p) => { const v = n.t(k, p); return v && v !== k ? v : null; };
    const skin = n.skins && typeof n.skins.get === 'function' ? n.skins.get(id) : null;
    if (skin) {
      let nomeSkin = tr('skin.nome', { especie: skin.especie, estilo: tr(`skin.estilo.${skin.estilo}`) || skin.estilo }) || skin.especie;
      if (skin.shiny) nomeSkin = tr('skin.nomeShiny', { nome: nomeSkin }) || nomeSkin;
      const v = tr('skin.itemNome', { nome: nomeSkin });
      if (v) return v;
    }
    if (RAR_CASA[id]) { const v = tr(`item.casa.${RAR_CASA[id]}`); if (v) return v; }
    if (RAR_BICICLETA[id]) { const v = tr(`item.bicicleta.${RAR_BICICLETA[id]}`); if (v) return v; }
    if (n.chaves[id]) { const v = tr(n.chaves[id]); if (v) return v; }
    const pedra = pedrasShinyDoJogo.find(p => Number(p.itemId) === id);
    if (pedra) { const v = tr('pedra.nome', { tipo: pedra.tipo }); if (v) return v; }
    return n.titulo(nomeCatalogo || '');
  }

  // Calcula o nome de todos os itens conhecidos, aplica na página e manda ao cockpit (storage).
  function publicarNomesDoJogo() {
    clearTimeout(timerNomes);
    timerNomes = setTimeout(() => {
      carregarNomeadorDoJogo().then(n => {
        if (!n) return;
        const mapa = {};
        const vistos = new Set();
        const lista = (window.POKEIDLE_ITEMS_DB || []).concat(Object.values(sniperState.knownItems));
        for (const it of lista) {
          const id = Number(it && it.id);
          if (!id || vistos.has(id)) continue;
          vistos.add(id);
          const original = (it.aliases && it.aliases[0]) || it.name || it.nome || '';
          const nome = nomeComoNoJogo(n, id, original);
          if (nome) mapa[id] = nome;
        }
        if (typeof window.registerRotomNames === 'function') window.registerRotomNames(mapa);
        try { window.postMessage({ source: 'ROTOM_SNIPER', type: 'ITEMS_NAMES', nomes: mapa }, '*'); } catch (e) {}
      });
    }, 2000);
  }

  // Ids à venda que ninguém nomeou ainda: o catálogo base do jogo dá o nome (baixado uma vez só).
  function nomearPeloCatalogoDoJogo(ids) {
    const faltam = ids.filter(id => id && !sniperState.knownItems[id]);
    if (!faltam.length) return;
    if (!espelhoItens) {
      espelhoItens = fetch('/assets/items.json').then(r => r.json()).then(d => d.items || []).catch(() => []);
    }
    espelhoItens.then(lista => {
      const porId = {};
      lista.forEach(i => { porId[i.id] = i; });
      aprenderItens(faltam.map(id => porId[id]).filter(Boolean), false);
    });
  }

  function updatePlayerBalance(gold, diamonds, orbs) {
    let changed = false;
    if (typeof gold === 'number' && !isNaN(gold) && gold >= 0 && gold !== sniperState.playerGold) {
      sniperState.playerGold = gold;
      changed = true;
    }
    if (typeof diamonds === 'number' && !isNaN(diamonds) && diamonds >= 0 && diamonds !== sniperState.playerDiamonds) {
      sniperState.playerDiamonds = diamonds;
      changed = true;
    }
    if (typeof orbs === 'number' && !isNaN(orbs) && orbs >= 0 && orbs !== sniperState.playerOrbs) {
      sniperState.playerOrbs = orbs;
      changed = true;
    }

    if (changed) {
      try {
        window.postMessage({
          source: 'ROTOM_SNIPER',
          type: 'BALANCE_UPDATE',
          gold: sniperState.playerGold,
          diamonds: sniperState.playerDiamonds,
          orbs: sniperState.playerOrbs,
          gems: sniperState.playerOrbs
        }, '*');
      } catch (e) {}
    }
  }

  function checkPlayerVip() {
    try {
      if (window.estado && window.estado.eu && window.estado.eu.loja) {
        const l = window.estado.eu.loja;
        if (l.vip) return true;
        if (l.vipAte && l.vipAte > Date.now()) return true;
      }
    } catch (e) {}
    try {
      if (document.querySelector('.loja-selo.vip, .pvp-auto-selo, .selo-vip')) return true;
    } catch (e) {}
    return false;
  }

  function updatePlayerVipStatus() {
    const isVip = checkPlayerVip();
    if (sniperState.isPlayerVip !== isVip) {
      sniperState.isPlayerVip = isVip;
      try {
        window.postMessage({
          source: 'ROTOM_SNIPER',
          type: 'VIP_STATUS_UPDATE',
          isVip: isVip
        }, '*');
      } catch (e) {}
      console.log('[Rotom Sniper]: Status VIP do PokéIdle atualizado:', isVip ? 'ATIVO (15 Slots)' : 'BÁSICO (5 Slots)');
    }
    return isVip;
  }

  function getPlayerGold() {
    // 1. Leitura direta no DOM do PokéIdle (#tr-gold)
    try {
      const el = document.getElementById('tr-gold') || document.querySelector('#tr-gold');
      if (el && el.textContent) {
        const clean = el.textContent.replace(/[^\d]/g, '');
        if (clean.length > 0) {
          const val = parseInt(clean, 10);
          if (!isNaN(val) && val >= 0) {
            if (val !== sniperState.playerGold) {
              sniperState.playerGold = val;
              updatePlayerBalance(val, sniperState.playerDiamonds, sniperState.playerOrbs);
            }
            return val;
          }
        }
      }
    } catch (e) {}

    // 2. Leitura via objeto de estado em memória
    try {
      if (typeof window !== 'undefined') {
        const est = window.estado || (window.__estado && window.__estado.eu) || null;
        if (est) {
          const g = (est.eu && typeof est.eu.gold === 'number') ? est.eu.gold : (typeof est.gold === 'number' ? est.gold : null);
          if (typeof g === 'number' && g >= 0) {
            sniperState.playerGold = g;
            return g;
          }
        }
      }
    } catch (e) {}

    // 3. Fallback do último valor recebido via WebSocket
    if (typeof sniperState.playerGold === 'number' && sniperState.playerGold >= 0) {
      return sniperState.playerGold;
    }
    return -1;
  }

  function getPlayerGems() {
    // 1. Leitura direta no DOM do PokéIdle (#tr-gemas)
    try {
      const el = document.getElementById('tr-gemas') || document.querySelector('#tr-gemas');
      if (el && el.textContent) {
        const clean = el.textContent.replace(/[^\d]/g, '');
        if (clean.length > 0) {
          const val = parseInt(clean, 10);
          if (!isNaN(val) && val >= 0) {
            if (val !== sniperState.playerOrbs) {
              sniperState.playerOrbs = val;
              updatePlayerBalance(sniperState.playerGold, sniperState.playerDiamonds, val);
            }
            return val;
          }
        }
      }
    } catch (e) {}

    // 2. Leitura via objeto de estado em memória
    try {
      if (typeof window !== 'undefined') {
        const est = window.estado || (window.__estado && window.__estado.eu) || null;
        if (est) {
          const o = (est.eu && typeof est.eu.orbs === 'number') ? est.eu.orbs : (typeof est.orbs === 'number' ? est.orbs : (est.eu && typeof est.eu.gemas === 'number' ? est.eu.gemas : null));
          if (typeof o === 'number' && o >= 0) {
            sniperState.playerOrbs = o;
            return o;
          }
        }
      }
    } catch (e) {}

    // 3. Fallback do último valor recebido via WebSocket
    if (typeof sniperState.playerOrbs === 'number' && sniperState.playerOrbs >= 0) {
      return sniperState.playerOrbs;
    }
    return -1;
  }

  function getPlayerDiamonds() {
    // 1. Leitura direta no DOM do PokéIdle (#tr-diamantes)
    try {
      const el = document.getElementById('tr-diamantes') || document.querySelector('#tr-diamantes');
      if (el && el.textContent) {
        const clean = el.textContent.replace(/[^\d]/g, '');
        if (clean.length > 0) {
          const val = parseInt(clean, 10);
          if (!isNaN(val) && val >= 0) {
            if (val !== sniperState.playerDiamonds) {
              sniperState.playerDiamonds = val;
              updatePlayerBalance(sniperState.playerGold, val, sniperState.playerOrbs);
            }
            return val;
          }
        }
      }
    } catch (e) {}

    // 2. Leitura via objeto de estado em memória
    try {
      if (typeof window !== 'undefined') {
        const est = window.estado || (window.__estado && window.__estado.eu) || null;
        if (est) {
          const d = (est.eu && typeof est.eu.diamonds === 'number') ? est.eu.diamonds : (typeof est.diamonds === 'number' ? est.diamonds : null);
          if (typeof d === 'number' && d >= 0) {
            sniperState.playerDiamonds = d;
            return d;
          }
        }
      }
    } catch (e) {}

    // 3. Fallback do último valor recebido via WebSocket
    if (typeof sniperState.playerDiamonds === 'number' && sniperState.playerDiamonds >= 0) {
      return sniperState.playerDiamonds;
    }
    return -1;
  }

  function hasSufficientBalance(preco, qty, moeda) {
    const unitPrice = Number(preco) || 0;
    const count = Number(qty) || 1;
    const totalCost = unitPrice * count;
    if (totalCost <= 0) return true;

    const mClean = String(moeda || 'gold').toLowerCase();
    const isGold = (mClean === 'gold' || mClean === 'coins' || mClean === 'coin');
    const isGems = (mClean === 'orb' || mClean === 'orbs' || mClean === 'gemas' || mClean === 'gema' || mClean === 'gems' || mClean === 'pontos');
    const isDiamonds = (mClean === 'diamante' || mClean === 'diamantes' || mClean === 'diamonds');

    let currentBalance = -1;
    if (isGold) currentBalance = getPlayerGold();
    else if (isGems) currentBalance = getPlayerGems();
    else if (isDiamonds) currentBalance = getPlayerDiamonds();

    // Se o saldo for conhecido e menor que o preço unitário (não paga nem 1), bloqueia imediatamente!
    if (currentBalance >= 0 && currentBalance < unitPrice) {
      return false;
    }
    return currentBalance >= 0 ? (currentBalance >= totalCost) : true;
  }

  function emitSniperLog(logObj) {
    try {
      window.postMessage({
        source: 'ROTOM_SNIPER',
        type: 'SNIPER_LOG',
        log: logObj
      }, '*');
    } catch (e) {}
  }

  function emitSniperBought(ruleId, offerId, qty) {
    try {
      window.postMessage({
        source: 'ROTOM_SNIPER',
        type: 'SNIPER_BOUGHT',
        ruleId,
        offerId,
        qty
      }, '*');
    } catch (e) {}
  }

  function executeBuyOrder(offerId, buyQty, preco, moeda, targetName, ruleId, ruleDesc, seller, isRetry = false) {
    if (!sniperState.enabled) {
      console.log(`[Rotom Sniper]: Compra cancelada para #${offerId} (${targetName}): Auto-Sniper está desativado.`);
      return;
    }
    if (sniperState.confirmedOffers[offerId]) return;

    // VALIDAÇÃO FINAL ESTREITA CONTRA GASTO INDEVIDO DE GEMAS:
    const mClean = String(moeda || 'gold').toLowerCase();
    const isOrderGems = (mClean === 'orb' || mClean === 'orbs' || mClean === 'gemas' || mClean === 'gema' || mClean === 'gems' || mClean === 'pontos' || mClean === 'diamante');
    if (isOrderGems) {
      let allowedGemsCeiling = 0;
      if (ruleId && sniperState.rules && sniperState.rules.length > 0) {
        const foundRule = sniperState.rules.find(r => String(r.id) === String(ruleId) || r.targetName === targetName);
        if (foundRule) {
          allowedGemsCeiling = Number(foundRule.maxPriceGems !== undefined ? foundRule.maxPriceGems : (foundRule.maxPriceDiamonds || 0));
        }
      } else {
        // Radar Global de Pokémon:
        const gCfg = sniperState.globalConfig;
        const shinyGems = gCfg.snipeAnyShiny ? Number(gCfg.maxPriceShinyGems !== undefined ? gCfg.maxPriceShinyGems : (gCfg.maxPriceShinyDiamonds || 0)) : 0;
        const p5Gems = gCfg.snipeAnyP5 ? Number(gCfg.maxPriceP5Gems !== undefined ? gCfg.maxPriceP5Gems : (gCfg.maxPriceP5Diamonds || 0)) : 0;
        const noteGems = gCfg.snipeByNote ? Number(gCfg.maxPriceNoteGems !== undefined ? gCfg.maxPriceNoteGems : (gCfg.maxPriceNoteDiamonds || 0)) : 0;
        allowedGemsCeiling = Math.max(shinyGems, p5Gems, noteGems);
      }

      if (allowedGemsCeiling <= 0 || preco > allowedGemsCeiling) {
        console.warn(`[Rotom Sniper]: 🛑 ORDEM DESCARTADA: Preço em Gemas (${preco}) excede teto configurado (${allowedGemsCeiling}) para #${offerId} (${targetName}).`);
        return;
      }
    }

    // REGRA DE PROTEÇÃO DE SALDO (Só envia se o jogador tiver a moeda suficiente):
    const unitPrice = Number(preco) || 0;
    let orderQty = Number(buyQty) || 1;
    let currentBalance = -1;
    let moedaLabel = 'Coins';

    if (isOrderGems) {
      currentBalance = getPlayerGems();
      moedaLabel = 'Gemas';
    } else if (mClean === 'gold' || mClean === 'coins' || mClean === 'coin') {
      currentBalance = getPlayerGold();
      moedaLabel = 'Coins';
    } else {
      currentBalance = getPlayerDiamonds();
      moedaLabel = 'Diamantes';
    }

    if (unitPrice > 0) {
      // Se o saldo for conhecido e menor que o preço unitário (não paga nem 1), cancela imediatamente!
      if (currentBalance >= 0 && currentBalance < unitPrice) {
        console.warn(`[Rotom Sniper]: 🛑 COMPRA ABORTADA: Saldo insuficiente em ${moedaLabel} (Saldo: ${currentBalance.toLocaleString('pt-BR')} / Preço Unitário: ${unitPrice.toLocaleString('pt-BR')}) para #${offerId} (${targetName}).`);
        showRotomHudToast(
          'SALDO INSUFICIENTE',
          `Snipe de ${targetName} abortado. Saldo: ${currentBalance.toLocaleString('pt-BR')} ${moedaLabel} (Preço: ${unitPrice.toLocaleString('pt-BR')}).`,
          'warning'
        );
        emitSniperLog({
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          timestamp: Date.now(),
          ruleId: ruleId || '',
          targetName: targetName,
          seller: seller || '',
          offerId: offerId,
          price: unitPrice,
          qty: orderQty,
          currency: moeda,
          status: 'SALDO_INSUFICIENTE',
          details: `Saldo insuficiente em ${moedaLabel}: ${currentBalance.toLocaleString('pt-BR')} (Preço: ${unitPrice.toLocaleString('pt-BR')})`
        });
        return;
      }

      // Se o total excede o saldo, calibra para o máximo que o saldo suporta
      if (currentBalance >= unitPrice && currentBalance < (unitPrice * orderQty)) {
        const maxAffordable = Math.floor(currentBalance / unitPrice);
        if (maxAffordable <= 0) return;
        orderQty = maxAffordable;
      }
    }
    buyQty = orderQty;

    if (ruleId && sniperState.rules && sniperState.rules.length > 0) {
      const foundRule = sniperState.rules.find(r => String(r.id) === String(ruleId) || r.targetName === targetName);
      if (foundRule && !foundRule.active) {
        console.log(`[Rotom Sniper]: Compra cancelada para #${offerId} (${targetName}): A regra está pausada.`);
        return;
      }
    }

    sniperState.boughtOffers[offerId] = Date.now();
    sniperState.lastBuyAttempt = {
      offerId: offerId,
      targetName: targetName,
      seller: seller || '',
      price: preco,
      currency: moeda,
      qty: buyQty,
      timestamp: Date.now()
    };

    const payload = {
      t: 'market.comprar',
      id: Number(offerId),
      qtd: Number(buyQty) || 1,
      preco: Number(preco),
      moeda: String(moeda || 'gold')
    };

    console.log(`[Rotom Sniper]: DISPARANDO COMPRA #${offerId} (${targetName}${seller ? ' de @' + seller : ''}):`, payload);
    const sent = sendRaw(payload);

    if (sent) {
      if (!isRetry) {
        // Otimização Preventiva de Saldo: decrementa preventivamente para evitar estouro em compras simultâneas apenas no primeiro disparo
        const mClean = String(moeda || 'gold').toLowerCase();
        if ((mClean === 'gold' || mClean === 'coins' || mClean === 'coin') && sniperState.playerGold >= 0) {
          sniperState.playerGold = Math.max(0, sniperState.playerGold - (Number(buyQty) * Number(preco)));
          updatePlayerBalance(sniperState.playerGold, sniperState.playerDiamonds, sniperState.playerOrbs);
        } else if ((mClean === 'orb' || mClean === 'orbs' || mClean === 'gemas' || mClean === 'gema' || mClean === 'gems' || mClean === 'pontos' || mClean === 'diamante') && sniperState.playerOrbs >= 0) {
          sniperState.playerOrbs = Math.max(0, sniperState.playerOrbs - (Number(buyQty) * Number(preco)));
          updatePlayerBalance(sniperState.playerGold, sniperState.playerDiamonds, sniperState.playerOrbs);
        }

        const sellerStr = seller ? ` de @${seller}` : '';
        const moedaNome = (mClean === 'orb' || mClean === 'orbs' || mClean === 'gemas' || mClean === 'gema') ? 'Gemas' : 'Coins';
        const precoFmt = Number(preco).toLocaleString('pt-BR');

        showRotomHudToast(
          'DISPARANDO COMPRA',
          `Comprando ${buyQty}x ${targetName}${sellerStr} por ${precoFmt} ${moedaNome} (#${offerId})`,
          'success'
        );

        const logEntry = {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          timestamp: Date.now(),
          ruleId: ruleId || '',
          targetName: targetName,
          seller: seller || '',
          offerId: offerId,
          price: preco,
          qty: buyQty,
          currency: moeda,
          status: 'DISPARADO',
          details: ruleDesc || 'Ordem enviada'
        };

        emitSniperLog(logEntry);
        if (ruleId) {
          emitSniperBought(ruleId, offerId, buyQty);
        }

        /* PIO: registrar perda. O jogo não manda erro quando outro jogador leva o anúncio (ou ganha o sorteio):
           sem confirmação nem recusa em 5 s após o 1º disparo, grava PERDIDO no histórico. */
        const perdas = sniperState.pioPerdaAgendada = sniperState.pioPerdaAgendada || {};
        if (!perdas[offerId]) {
          perdas[offerId] = Date.now();
          pioRelogio.timeout(() => {
            delete perdas[offerId];
            const rec = sniperState.pioRecusados || {};
            if (sniperState.confirmedOffers[offerId] || (rec[offerId] && Date.now() - rec[offerId] < 60000)) return;
            emitSniperLog({
              id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              timestamp: Date.now(),
              ruleId: ruleId || '',
              targetName: targetName,
              seller: seller || '',
              offerId: offerId,
              price: preco,
              qty: buyQty,
              currency: moeda,
              status: 'PERDIDO',
              details: 'Sem confirmação em 5 s após o disparo: outro comprador levou ou o sorteio foi para outro'
            });
          }, 5000);
        }
      } else {
        console.log(`[Rotom Sniper]: 🔁 Ordem de reforço #${offerId} enviada ao servidor dentro da janela de 3s.`);
      }
    } else {
      showRotomHudToast(
        'ERRO AO DISPARAR',
        `Não foi possível enviar a ordem de compra para #${offerId}. WebSocket desconectado.`,
        'error'
      );
    }
  }

  function processMarketAnuncios(anunciosList) {
    if (!sniperState.enabled || !Array.isArray(anunciosList) || anunciosList.length === 0) return;

    const now = Date.now();
    const activeRules = sniperState.rules.filter(r => r.active);
    const isVip = updatePlayerVipStatus();
    const maxSlots = isVip ? 15 : (sniperState.globalConfig.maxActiveSlots || 5);

    for (let i = 0; i < anunciosList.length; i++) {
      const an = anunciosList[i];
      if (!an) continue;

      const offerId = Number(an.id);
      if (!offerId || isNaN(offerId)) continue;

      // Evita compras duplicadas na mesma oferta se já confirmada, agendada ou comprada
      if (sniperState.confirmedOffers[offerId]) continue;
      if (sniperState.scheduledOffers[offerId]) continue;
      if (sniperState.boughtOffers[offerId] && (now - sniperState.boughtOffers[offerId] < 20000)) continue;
      if (an.estado && an.estado !== 'aberto') continue;
      // Blindagem estrita: Se o registro possui comprador ou data de liquidação 'em' sem preco ativo, é histórico
      if (an.comprador) continue;
      if (an.em && !an.preco && (an.bruto || an.valor)) continue;

      const seller = String(an.vendedor || an.vendedorNome || an.seller || an.dono || '').trim();
      const preco = Number(an.preco) || 0;
      const qtd = Number(an.qtd) || 1;
      const moeda = String(an.moeda || 'gold').toLowerCase();
      const isGold = (moeda === 'gold' || moeda === 'coins' || moeda === 'coin');
      const isGems = (moeda === 'orb' || moeda === 'orbs' || moeda === 'gemas' || moeda === 'gema' || moeda === 'gems' || moeda === 'pontos' || moeda === 'diamante');
      const isDiamonds = (moeda === 'diamantes' || moeda === 'diamonds'); // PIO: faltava; uma moeda desconhecida derrubava a varredura com ReferenceError
      const ficha = an.ficha || null;

      // Identificação robusta do Item
      const itemId = Number(an.itemId || (ficha && ficha.itemId) || 0);
      const rotomDbItem = (typeof window.getRotomItem === 'function' && itemId > 0) ? window.getRotomItem(itemId) : null;
      let itemName = String(
        (rotomDbItem && rotomDbItem.name) ||
        (an.itemNome && !an.itemNome.startsWith('Item #') ? an.itemNome : '') ||
        (an.nome && !an.nome.startsWith('Item #') ? an.nome : '') ||
        (sniperState.knownItems[itemId] && sniperState.knownItems[itemId].name) ||
        ''
      );
      const isItem = Boolean(itemId > 0 || an.itemNome || an.tipo === 'item' || an.tipoItem === 'item');

      // Identificação robusta de Pokémon
      const isPokemon = !isItem && Boolean(an.pokemonNome || (ficha && ficha.speciesId) || an.tipo === 'pokemon' || an.tipoItem === 'pokemon');
      const pokeName = String(an.pokemonNome || (ficha && ficha.nome) || an.nome || '');

      let matched = false;
      let matchedRule = null;
      let matchedDesc = '';
      let targetDisplayName = '';

      // --- A. REGRAS CUSTOMIZADAS DE ITENS CONFIGURADAS PELO JOGADOR ---
      for (let r = 0; r < activeRules.length; r++) {
        const rule = activeRules[r];
        if (rule.maxQty > 0 && (rule.totalBought || 0) >= rule.maxQty) continue;

        if (rule.targetType === 'item' || !rule.targetType) {
          let itemMatches = false;
          if (rule.targetId && Number(rule.targetId) === itemId) {
            itemMatches = true;
          } else if (rule.targetName) {
            const tLower = rule.targetName.toLowerCase().trim();
            const iLower = itemName.toLowerCase().trim();
            if (iLower && (iLower === tLower || iLower.includes(tLower))) {
              itemMatches = true;
            }
          }

          if (itemMatches) {
            const maxGold = Number(rule.maxPriceGold || 0);
            const maxGems = Number(rule.maxPriceGems !== undefined ? rule.maxPriceGems : (rule.maxPriceDiamonds || 0));

            let priceOk = false;
            if (isGold && maxGold > 0 && preco <= maxGold) priceOk = true;
            else if (isGems && maxGems > 0 && preco <= maxGems) priceOk = true;

            if (priceOk) {
              matched = true;
              matchedRule = rule;
              targetDisplayName = (rotomDbItem && rotomDbItem.name) || rule.targetName || itemName || `Item #${itemId}`;
              const tetoStr = isGold
                ? maxGold.toLocaleString('pt-BR') + ' Coins'
                : maxGems.toLocaleString('pt-BR') + ' Gemas';
              matchedDesc = `Regra: ${rule.targetName} (Teto: ${tetoStr})`;
              break;
            }
          }
        }

        // Regra Customizada de Pokémon por Espécie
        if (rule.targetType === 'pokemon' && isPokemon) {
          let pokeMatches = false;
          if (rule.targetId && ficha && Number(ficha.speciesId) === Number(rule.targetId)) {
            pokeMatches = true;
          } else if (rule.targetName && pokeName) {
            const tLower = rule.targetName.toLowerCase().trim();
            const pLower = pokeName.toLowerCase().trim();
            if (pLower === tLower || pLower.includes(tLower)) {
              pokeMatches = true;
            }
          }

          if (pokeMatches) {
            const maxGold = Number(rule.maxPriceGold || 0);
            const maxGems = Number(rule.maxPriceGems !== undefined ? rule.maxPriceGems : (rule.maxPriceDiamonds || 0));

            let priceOk = false;
            if (isGold && maxGold > 0 && preco <= maxGold) priceOk = true;
            else if (isGems && maxGems > 0 && preco <= maxGems) priceOk = true;

            if (priceOk) {
              matched = true;
              matchedRule = rule;
              const tetoStr = isGold
                ? maxGold.toLocaleString('pt-BR') + ' Coins'
                : maxGems.toLocaleString('pt-BR') + ' Gemas';
              matchedDesc = `Regra: ${rule.targetName} (Teto: ${tetoStr})`;
              targetDisplayName = pokeName || rule.targetName;
              break;
            }
          }
        }
      }

      // --- B. REGRAS GLOBAIS DE POKÉMON (Shiny, P5 e Nota) ---
      if (!matched && isPokemon && pokeName) {
        const isShiny = Boolean(
          an.shiny || an.isShiny || an.lookShiny ||
          (ficha && (ficha.shiny || ficha.isShiny || ficha.lookShiny)) ||
          pokeName.toLowerCase().includes('shiny')
        );

        let potencia = Number(an.potencia || (ficha && ficha.potencia) || 1);
        let nota = Number((ficha && ficha.nota) || an.nota || 0);

        const gCfg = sniperState.globalConfig;
        const maxShinyGold = Number(gCfg.maxPriceShinyGold || 0);
        const maxShinyGems = Number(gCfg.maxPriceShinyGems !== undefined ? gCfg.maxPriceShinyGems : (gCfg.maxPriceShinyDiamonds || 0));
        const maxP5Gold = Number(gCfg.maxPriceP5Gold || 0);
        const maxP5Gems = Number(gCfg.maxPriceP5Gems !== undefined ? gCfg.maxPriceP5Gems : (gCfg.maxPriceP5Diamonds || 0));
        const maxNoteGold = Number(gCfg.maxPriceNoteGold || 0);
        const maxNoteGems = Number(gCfg.maxPriceNoteGems !== undefined ? gCfg.maxPriceNoteGems : (gCfg.maxPriceNoteDiamonds || 0));

        // 1. Match Qualquer Shiny
        if (gCfg.snipeAnyShiny && isShiny) {
          let shinyPriceOk = false;
          if (isGold && maxShinyGold > 0 && preco <= maxShinyGold) shinyPriceOk = true;
          else if (isGems && maxShinyGems > 0 && preco <= maxShinyGems) shinyPriceOk = true;

          if (shinyPriceOk) {
            matched = true;
            const tetoStr = isGold ? maxShinyGold.toLocaleString('pt-BR') + ' Coins' : maxShinyGems.toLocaleString('pt-BR') + ' Gemas';
            matchedDesc = `Shiny Global (Teto: ${tetoStr})`;
            targetDisplayName = `✨ Shiny ${pokeName}`;
          }
        }

        // 2. Match Qualquer P5 (Potência 5)
        if (!matched && gCfg.snipeAnyP5 && potencia >= 5) {
          let p5PriceOk = false;
          if (isGold && maxP5Gold > 0 && preco <= maxP5Gold) p5PriceOk = true;
          else if (isGems && maxP5Gems > 0 && preco <= maxP5Gems) p5PriceOk = true;

          if (p5PriceOk) {
            matched = true;
            const tetoStr = isGold ? maxP5Gold.toLocaleString('pt-BR') + ' Coins' : maxP5Gems.toLocaleString('pt-BR') + ' Gemas';
            matchedDesc = `P5 Global (Teto: ${tetoStr})`;
            targetDisplayName = `⚡ P5 ${pokeName}`;
          }
        }

        // 3. Match Por Nota Mínima
        if (!matched && gCfg.snipeByNote && gCfg.minNote > 0 && nota >= gCfg.minNote) {
          let notePriceOk = false;
          if (isGold && maxNoteGold > 0 && preco <= maxNoteGold) notePriceOk = true;
          else if (isGems && maxNoteGems > 0 && preco <= maxNoteGems) notePriceOk = true;

          if (notePriceOk) {
            matched = true;
            const tetoStr = isGold ? Number(gCfg.maxPriceNoteGold).toLocaleString('pt-BR') + ' Coins' : Number(maxNoteGems).toLocaleString('pt-BR') + ' Gemas';
            matchedDesc = `Nota Oficial >= ${gCfg.minNote} (Teto: ${tetoStr})`;
            targetDisplayName = `★ Nota ${nota.toFixed(1)} ${pokeName}`;
          }
        }
      }

      // Se deu match, executa compra ou agenda pré-fire
      if (matched) {
        // Salvaguarda de slots de regras
        if (activeRules.length > maxSlots && matchedRule) {
          showRotomHudToast(
            'SLOTS LOTADOS',
            `${targetDisplayName} avistado por ${preco} ${moeda}, mas o limite de ${maxSlots} slots está ativo.`,
            'slot_limit'
          );
          emitSniperLog({
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: Date.now(),
            targetName: targetDisplayName,
            seller: seller || '',
            offerId: offerId,
            price: preco,
            qty: qtd,
            currency: moeda,
            status: 'SLOTS_LOTADOS',
            details: `Limite de ${maxSlots} slots atingido. Não comprado.`
          });
          continue;
        }

        // Limite de compra: VIP permite quantidade infinita ou customizada; Básico limita em 20
        let buyQty = qtd;
        if (matchedRule) {
          const isInfinite = Boolean(matchedRule.infinite || matchedRule.maxQty <= 0 || matchedRule.maxQty >= 99999);
          if (isVip && isInfinite) {
            buyQty = qtd; // Modo Infinito VIP: compra todo o estoque do anúncio (respeitando saldo)
          } else if (isVip && matchedRule.maxQty > 0) {
            const rem = Math.max(0, matchedRule.maxQty - (matchedRule.totalBought || 0));
            buyQty = Math.min(qtd, rem);
          } else {
            // Versão Basic: Máximo de 20 unidades por regra
            const effectiveRuleMax = (matchedRule.maxQty !== undefined && matchedRule.maxQty > 0)
              ? Math.min(matchedRule.maxQty, 20)
              : 20;
            const rem = Math.max(0, effectiveRuleMax - (matchedRule.totalBought || 0));
            buyQty = Math.min(qtd, rem);
          }
        } else {
          // Radar Global de Pokémon
          buyQty = 1;
        }

        if (buyQty <= 0) continue;

        // REGRA DE PROTEÇÃO DE SALDO E CALIBRAÇÃO (Só snipa se a pessoa tiver a moeda suficiente):
        if (preco > 0) {
          let currentBalance = -1;
          let moedaNome = 'Coins';
          if (isGold) {
            currentBalance = getPlayerGold();
            moedaNome = 'Coins';
          } else if (isGems) {
            currentBalance = getPlayerGems();
            moedaNome = 'Gemas';
          } else if (isDiamonds) {
            currentBalance = getPlayerDiamonds();
            moedaNome = 'Diamantes';
          }

          // Se o saldo for conhecido e menor que o preço unitário (não paga nem 1), descarta o snipe!
          if (currentBalance >= 0 && currentBalance < preco) {
            console.log(`[Rotom Sniper]: 🛑 Snipe descartado por saldo insuficiente em ${moedaNome} para #${offerId} (${targetDisplayName}): saldo ${currentBalance.toLocaleString('pt-BR')}, preço unitário ${preco.toLocaleString('pt-BR')}.`);
            continue; // Evita ordem rejeitada pelo servidor por falta de saldo
          }

          if (currentBalance >= preco) {
            const maxAffordable = Math.floor(currentBalance / preco);
            if (buyQty > maxAffordable) {
              console.log(`[Rotom Sniper]: Calibração por Saldo #${offerId} (${targetDisplayName}): ajustando compra de ${buyQty} para ${maxAffordable} unidades (Saldo: ${currentBalance.toLocaleString('pt-BR')} ${moedaNome}).`);
              buyQty = maxAffordable;
              matchedDesc += ` [Saldo máx: ${buyQty}x]`;
            }
          }
        }

        if (buyQty <= 0) continue;

        // Checa carência / cooldown antes de liberar o anúncio:
        const compravelEm = Number(an.compravelEm || an.compravelEmMs || 0);
        // Sempre no relógio do SERVIDOR (ver agoraDoServidor), nunca no Date.now() do PC.
        const agoraSrv = agoraDoServidor();
        const isFutureCooldown = compravelEm > (agoraSrv + 50);

        if (isFutureCooldown) {
          // O anúncio ainda está no cooldown ANTES de liberar.
          // NÃO DISPARAR ANTES! Quem tenta comprar antes cai em sorteio ou é recusado.
          // O disparo é agendado para LOGO APÓS A LIBERAÇÃO (+100ms) e mantido dentro dos 3s posteriores.
          const releaseDelayMs = Math.max(50, (compravelEm - agoraSrv) + 100);
          const waitSec = Math.ceil((compravelEm - agoraSrv) / 1000);
          const sellerStr = seller ? ` de @${seller}` : '';
          console.log(`[Rotom Sniper]: ⏳ Anúncio #${offerId} (${targetDisplayName}${sellerStr}) em cooldown. Disparo pós-liberação garantido em ${releaseDelayMs}ms.`);

          showRotomHudToast(
            'DISPARO AGENDADO',
            `${targetDisplayName}${sellerStr} agendado para compra logo após liberação (${waitSec}s)! (#${offerId})`,
            'scheduled'
          );

          emitSniperLog({
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: Date.now(),
            targetName: targetDisplayName,
            seller: seller || '',
            offerId: offerId,
            price: preco,
            qty: buyQty,
            currency: moeda,
            status: 'AGENDADO',
            details: `Cooldown ativo (${waitSec}s) · Disparo garantido após liberação · ${matchedDesc}`
          });

          const timers = [];

          // 1º Disparo: +100ms após a liberação (garante que o anúncio já está liberado no servidor e front)
          timers.push(pioRelogio.timeout(() => {
            // Diagnóstico: quanto depois da liberação (no relógio do servidor) o disparo saiu.
            // Acima de ~1s indica aba em segundo plano com timers freados pelo navegador.
            const atrasoMs = agoraDoServidor() - compravelEm;
            console.log(`[Rotom Sniper]: Disparo #${offerId} ${atrasoMs}ms após a liberação (desvio do relógio do PC: ${desvioServidor}ms).`);
            try { const A = window.__pioSniperAtrasos = window.__pioSniperAtrasos || []; A.push({ id: Date.now() + '-' + offerId, t: Date.now(), anuncio: offerId, item: targetDisplayName, atraso: atrasoMs, oculto: document.hidden }); if (A.length > 50) A.shift(); } catch (e) {}
            executeBuyOrder(offerId, buyQty, preco, moeda, targetDisplayName, matchedRule ? matchedRule.id : '', matchedDesc, seller, false);
          }, releaseDelayMs));

          // 2º Disparo (Garantia dentro dos 3s): +700ms após liberação se ainda não confirmado
          timers.push(pioRelogio.timeout(() => {
            if (!sniperState.confirmedOffers[offerId]) {
              console.log(`[Rotom Sniper]: 🔄 Reforço de compra pós-liberação #${offerId} (+700ms)...`);
              executeBuyOrder(offerId, buyQty, preco, moeda, targetDisplayName, matchedRule ? matchedRule.id : '', matchedDesc, seller, true);
            }
          }, releaseDelayMs + 600));

          // 3º Disparo (Reforço final dentro dos 3s): +1500ms após liberação se ainda não confirmado
          timers.push(pioRelogio.timeout(() => {
            if (!sniperState.confirmedOffers[offerId]) {
              console.log(`[Rotom Sniper]: 🔄 Reforço final de compra pós-liberação #${offerId} (+1500ms)...`);
              executeBuyOrder(offerId, buyQty, preco, moeda, targetDisplayName, matchedRule ? matchedRule.id : '', matchedDesc, seller, true);
            }
            clearOfferTimers(offerId);
          }, releaseDelayMs + 1400));

          sniperState.scheduledOffers[offerId] = timers;

        } else {
          // Anúncio JÁ ESTÁ LIBERADO! (compravelEm <= now ou sem carência)
          // Compra imediata e reforço de garantia dentro da janela de 3s
          executeBuyOrder(offerId, buyQty, preco, moeda, targetDisplayName, matchedRule ? matchedRule.id : '', matchedDesc, seller, false);

          const timers = [];
          timers.push(pioRelogio.timeout(() => {
            if (!sniperState.confirmedOffers[offerId]) {
              executeBuyOrder(offerId, buyQty, preco, moeda, targetDisplayName, matchedRule ? matchedRule.id : '', matchedDesc, seller, true);
            }
          }, 700));
          timers.push(pioRelogio.timeout(() => {
            if (!sniperState.confirmedOffers[offerId]) {
              executeBuyOrder(offerId, buyQty, preco, moeda, targetDisplayName, matchedRule ? matchedRule.id : '', matchedDesc, seller, true);
            }
            clearOfferTimers(offerId);
          }, 1500));

          sniperState.scheduledOffers[offerId] = timers;
        }
      }
    }
  }

  function handleMarketPacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    const t = packet.t || '';

    // Detecção de Centro Pokémon e Hunt a partir de pacotes de mapa
    if (t === 'campo' || t === 'campo.init') {
      const isCentro = Boolean(packet.centro || (packet.campo && packet.campo.centro) || packet.slug === 'centro_pokemon' || (packet.campo && packet.campo.slug === 'centro_pokemon'));
      playerInPokemonCenter = isCentro;
      farmSession.inCenter = isCentro;
      if (!isCentro) {
        const cSlug = packet.slug || (packet.campo && packet.campo.slug);
        if (cSlug && cSlug !== 'centro_pokemon') {
          farmSession.activeHuntSlug = cSlug;
          farmSession.activeHuntName = formatHuntName(cSlug);
          getOrCreateHuntStat(cSlug, farmSession.activeHuntName);
        }
      }
    }

    // Limpeza de criaturas que saíram da tela no mapa de shinies vistos
    const foraList = packet.fora || (packet.campo && packet.campo.fora);
    if (Array.isArray(foraList)) {
      for (const fSlot of foraList) {
        for (const key of seenWildShiniesMap.keys()) {
          if (key.startsWith(`${fSlot}_`)) {
            seenWildShiniesMap.delete(key);
          }
        }
      }
    }

    // Atualiza saldo e pokémons em tempo real a partir de qualquer pacote de estado ou envelope
    const est = packet.estado || (packet.payload && packet.payload.estado) || (t === 'estado' ? packet : null);
    // Relógio do servidor: `servidorAgora` vem no welcome (raiz) e nos estados.
    if (packet.servidorAgora) atualizarRelogioServidor(packet.servidorAgora);
    else if (est && est.servidorAgora) atualizarRelogioServidor(est.servidorAgora);
    if (est) {
      updatePlayerBalance(est.gold, est.diamonds, est.orbs);
      if (est.noCentro || est.huntSlug === 'centro_pokemon') {
        playerInPokemonCenter = true;
        farmSession.inCenter = true;
      } else if (est.huntSlug) {
        playerInPokemonCenter = false;
        farmSession.inCenter = false;
        farmSession.activeHuntSlug = est.huntSlug;
        const tierTxt = est.outlandTier ? ` [Tier ${est.outlandTier}]` : '';
        farmSession.activeHuntName = formatHuntName(est.huntSlug) + tierTxt;
        getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
      }
    } else if (typeof packet.gold === 'number') {
      updatePlayerBalance(packet.gold, packet.diamonds, packet.orbs);
    }

    // Captura GLOBAL e IMEDIATA de Pokémons do Jogador (welcome, estado ou envelopes)
    const rawPks = (est && Array.isArray(est.pokemons)) ? est.pokemons :
                   (packet.pokemons && Array.isArray(packet.pokemons)) ? packet.pokemons :
                   (packet.depot && Array.isArray(packet.depot)) ? packet.depot : null;
    if (rawPks && rawPks.length > 0) {
      playerPokemonsCache = rawPks;
      window.__rotomPlayerPokemons = rawPks;
    }

    // Captura bosses oficiais do servidor (welcome, estado ou envelopes)
    const serverBossesJogaveis = packet.bossesJogaveis || (packet.payload && packet.payload.bossesJogaveis);
    const serverBossesCatalogo = packet.bossesCatalogo || (packet.payload && packet.payload.bossesCatalogo);
    if (Array.isArray(serverBossesJogaveis) || Array.isArray(serverBossesCatalogo)) {
      try {
        window.postMessage({
          source: 'ROTOM_SNIPER',
          type: 'BOSSES_UPDATE',
          bossesJogaveis: serverBossesJogaveis || null,
          bossesCatalogo: serverBossesCatalogo || null
        }, '*');
      } catch (e) {}
    }

    // 1. Catálogo inicial no Welcome
    if (t === 'welcome') {
      if (Array.isArray(packet.itensNossos)) {
        packet.itensNossos.forEach(it => {
          if (it && it.id) sniperState.knownItems[it.id] = it;
        });
      }
      if (packet.mercado && Array.isArray(packet.mercado.catalogo)) {
        packet.mercado.catalogo.forEach(it => {
          if (it && it.id) sniperState.knownItems[it.id] = it;
        });
      }
      // A tabela das Shiny Stones (itemId → tipo) vem no welcome; o nome delas sai dela.
      if (packet.shinyStone && Array.isArray(packet.shinyStone.pedras)) pedrasShinyDoJogo = packet.shinyStone.pedras;
      aprenderItens(packet.itensNossos, true);
      aprenderItens(packet.mercado && packet.mercado.catalogo, false);
      publicarNomesDoJogo();
      return;
    }

    // 2. Pacote market vindo do servidor
    if (t === 'market') {
      const aba = packet.aba || '';

      // Blindagem contra Histórico: Nunca processar históricoGlobal, historicoCompras ou historico como compras ativas
      if (aba.startsWith('historico') || aba === 'historico') {
        return;
      }

      // Meus Anúncios (o que o jogador botou pra vender)
      if (aba === 'meus') {
        const myList = Array.isArray(packet.linhas) ? packet.linhas : [];
        try {
          window.postMessage({
            source: 'ROTOM_SNIPER',
            type: 'MY_LISTINGS_UPDATE',
            listings: myList
          }, '*');
        } catch (e) {}
        return;
      }

      // Anúncio cancelado com sucesso
      if (aba === 'cancelado' || packet.cancelado) {
        showRotomHudToast('ANÚNCIO CANCELADO', 'Seu anúncio foi removido do mercado e devolvido ao depot.', 'confirmed');
        sendRaw({ t: 'market.meus' });
        return;
      }

      // Resumo de todos os itens do mercado
      if (aba === 'itens' && packet.resumo) {
        nomearPeloCatalogoDoJogo(Object.keys(packet.resumo).map(Number));
        // PIO: foto de preços (mínimo em Coins e em gemas por item), no máximo 1 por hora, 14 dias guardados.
        try {
          const K = 'pio-precos-v1';
          const db = JSON.parse(localStorage.getItem(K) || '{}') || {};
          const agora = new Date(Date.now() - 3 * 3600000); // horário de Brasília
          const dia = agora.toISOString().slice(0, 10), hora = agora.getUTCHours();
          if (db.ultimaHora !== dia + 'T' + hora) {
            db.ultimaHora = dia + 'T' + hora;
            const d = db[dia] = db[dia] || {};
            for (const [id, r] of Object.entries(packet.resumo)) {
              if (!r) continue;
              const it = (typeof window.getRotomItem === 'function' && window.getRotomItem(Number(id))) || sniperState.knownItems[id] || {};
              const e = d[id] = d[id] || { n: it.name || '', g: [], o: [] };
              if (!e.n && it.name) e.n = it.name;
              if (Number(r.minGold) > 0) e.g.push(Number(r.minGold));
              if (Number(r.minOrb) > 0) e.o.push(Number(r.minOrb));
            }
            const dias = Object.keys(db).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
            while (dias.length > 14) delete db[dias.shift()];
            localStorage.setItem(K, JSON.stringify(db));
          }
        } catch (e) {}
        try {
          window.postMessage({
            source: 'ROTOM_SNIPER',
            type: 'MARKET_CATALOG_UPDATE',
            resumo: packet.resumo
          }, '*');
        } catch (e) {}

        if (sniperState.enabled) {
        const activeRules = sniperState.rules.filter(r => r.active && (r.targetType === 'item' || !r.targetType));
        for (let r = 0; r < activeRules.length; r++) {
          const rule = activeRules[r];
          if (rule.maxQty > 0 && (rule.totalBought || 0) >= rule.maxQty) continue;

          let itId = Number(rule.targetId);
          if (!itId && rule.targetName && typeof window.getRotomItem === 'function') {
            const it = window.getRotomItem(rule.targetName);
            if (it && it.id) itId = it.id;
          }
          if (!itId) continue;

          const resumoItem = packet.resumo[itId] || packet.resumo[String(itId)];
          if (resumoItem) {
            const minGold = Number(resumoItem.minGold || 0);
            const minOrb = Number(resumoItem.minOrb || 0);

            let shouldFetch = false;
            let fetchMoeda = 'gold';

            const maxGold = Number(rule.maxPriceGold || 0);
            const maxGems = Number(rule.maxPriceGems !== undefined ? rule.maxPriceGems : (rule.maxPriceDiamonds || 0));

            if (maxGold > 0 && minGold > 0 && minGold <= maxGold) {
              shouldFetch = true;
              fetchMoeda = 'gold';
            } else if (maxGems > 0 && minOrb > 0 && minOrb <= maxGems) {
              shouldFetch = true;
              fetchMoeda = 'orb';
            }

            if (shouldFetch) {
              sniperState.pioQuenteAte = Date.now() + 150000; // alvo à vista: ritmo rápido por 2,5 min
              sendRaw({
                t: 'market.item',
                itemId: itId,
                moeda: fetchMoeda
              });
            }
          }
        }
        }
        return;
      }

      // Vendedores de um item específico (m.aba === 'item')
      if (aba === 'item' && Array.isArray(packet.linhas)) {
        const itemId = Number(packet.itemId || 0);
        const moeda = String(packet.moeda || 'gold');
        // A ficha do anúncio traz o nome oficial do item (vale para item que acabou de ser lançado).
        const fichaItem = (packet.linhas.find(l => l && l.ficha && l.ficha.nome) || {}).ficha;
        if (itemId && fichaItem) {
          aprenderItens([{ id: itemId, name: fichaItem.nome, icon: fichaItem.icone, category: fichaItem.categoria }], false);
        }
        const rotomItem = (typeof window.getRotomItem === 'function' && window.getRotomItem(itemId)) || sniperState.knownItems[itemId];
        const itemName = (rotomItem && rotomItem.name) || (sniperState.knownItems[itemId] && sniperState.knownItems[itemId].name) || `Item #${itemId}`;

        const enrichedLinhas = packet.linhas.map(line => ({
          ...line,
          itemId: itemId,
          itemNome: (rotomItem && rotomItem.name) || line.itemNome || itemName,
          moeda: line.moeda || moeda
        }));

        try {
          window.postMessage({
            source: 'ROTOM_SNIPER',
            type: 'ITEM_OFFERS_UPDATE',
            itemId: itemId,
            itemName: itemName,
            moeda: moeda,
            linhas: enrichedLinhas,
            offers: enrichedLinhas
          }, '*');
        } catch (e) {}

        processMarketAnuncios(enrichedLinhas);
        return;
      }

      // Lista geral (Pokémons, diamantes ou listagem paginada)
      let list = [];
      if (Array.isArray(packet.anuncios)) list = list.concat(packet.anuncios);
      if (Array.isArray(packet.itens)) list = list.concat(packet.itens);
      if (Array.isArray(packet.linhas)) list = list.concat(packet.linhas);
      if (packet.anuncio && typeof packet.anuncio === 'object') list.push(packet.anuncio);

      // Detecção precisa de resposta de ofertas de diamantes
      const isDiamondPacket = (Date.now() - lastDiamondRequestTime < 4500) ||
                              packet.tipo === 'diamante' ||
                              aba === 'diamantes' ||
                              (list.length > 0 && list.some(a => a && (a.tipo === 'diamante' || a?.ficha?.diamante || a.itemId === 999999)));

      if (isDiamondPacket) {
        const diamondRows = list.map(a => ({
          id: a.id,
          vendedor: a.vendedor || 'Comunidade',
          vendedorId: a.vendedorId,
          qtd: Number(a.qtd || a.quantidade || 1),
          preco: Number(a.preco || a.unitPrice || 0),
          moeda: a.moeda || 'gold',
          tipo: 'diamante',
          expiraEm: a.expiraEm,
          compravelEm: a.compravelEm
        }));

        for (const row of diamondRows) {
          if (!accumulatedDiamondOffers.some(o => o.id === row.id)) {
            accumulatedDiamondOffers.push(row);
          }
        }

        try {
          window.postMessage({
            source: 'ROTOM_SNIPER',
            type: 'DIAMOND_OFFERS_UPDATE',
            offers: accumulatedDiamondOffers.slice()
          }, '*');
        } catch (e) {}

        if (list.length > 0) processMarketAnuncios(list);
        return;
      }

      if (list.length > 0) {
        processMarketAnuncios(list);
      }
      return;
    }

    // 3. Processamento de Batalha & Telemetria de Farm ao Vivo
    if (t === 'batalha' && Array.isArray(packet.ev)) {
      lastBattleEventTs = Date.now();
      let statsChanged = false;

      for (const e of packet.ev) {
        if (!e) continue;
        const evKey = String(e.k || e.t || '');

        if (evKey === 'marketComprado') {
          const desc = e.descricao || 'Item entregue na mochila/depot!';
          const ultCompra = sniperState.lastBuyAttempt || null;
          if (ultCompra && ultCompra.offerId) {
            const offId = ultCompra.offerId;
            sniperState.confirmedOffers[offId] = true;
            clearOfferTimers(offId);
          }
          showRotomHudToast('COMPRA CONFIRMADA!', desc, 'confirmed');
          /* PIO: a confirmação do jogo não traz anúncio nem preço; vêm da última ordem enviada.
             A quantidade sai do texto do jogo ("3× Item"), senão da ordem. */
          const qtdDesc = /^\s*(\d+)\s*[x×]/i.exec(String(desc));
          emitSniperLog({
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: Date.now(),
            targetName: desc,
            offerId: ultCompra ? ultCompra.offerId : undefined,
            price: ultCompra ? ultCompra.price : undefined,
            currency: ultCompra ? ultCompra.currency : undefined,
            qty: qtdDesc ? Number(qtdDesc[1]) : (ultCompra ? ultCompra.qty : undefined),
            status: 'CONFIRMADO',
            details: `✅ Confirmado pelo servidor: ${desc}`
          });
        }

        // Se ainda não temos slug de hunt ativa, inferir pelo monstro
        if (!farmSession.activeHuntSlug && e.nome) {
          const inferredSlug = String(e.nome).toLowerCase().replace(/[\s-]+/g, '_');
          farmSession.activeHuntSlug = inferredSlug;
          farmSession.activeHuntName = e.nome;
          getOrCreateHuntStat(inferredSlug, e.nome);
        }

        // Tentativas de captura com Pokébola
        if (evKey === 'bola') {
          farmSession.ballAttempts = (farmSession.ballAttempts || 0) + 1;
          const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
          currentHunt.attempts = (currentHunt.attempts || 0) + 1;
          statsChanged = true;
        }

        // Capturas de Pokémon (k: "capturado", k: "bola" com sucesso, ou k: "captura"/"catch")
        const isCapturado = (evKey === 'capturado');
        const isBolaSucesso = (evKey === 'bola' && (e.sucesso === true || e.sucesso === 1 || e.success));
        const isCatchKey = (evKey === 'captura' || evKey === 'catch');

        if (isCapturado || isBolaSucesso || isCatchKey) {
          const catchId = (e.pokemon && e.pokemon.id) ? 'pk_' + e.pokemon.id : (e.slot ? 'slot_' + e.slot : null);
          const now = Date.now();
          let duplicate = false;

          if (catchId) {
            const lastTs = recentCapturesMap.get(catchId);
            if (lastTs && (now - lastTs) < 4000) {
              duplicate = true;
            } else {
              recentCapturesMap.set(catchId, now);
              if (recentCapturesMap.size > 200) {
                for (const [k, ts] of recentCapturesMap.entries()) {
                  if (now - ts > 10000) recentCapturesMap.delete(k);
                }
              }
            }
          }

          if (!duplicate) {
            farmSession.captures = (farmSession.captures || 0) + 1;
            farmSession.catches = farmSession.captures;

            const isShiny = Boolean(e.shiny || e.isShiny || e.lookShiny || (e.pokemon && (e.pokemon.shiny || e.pokemon.isShiny)));
            if (isShiny) {
              farmSession.shiniesCaught = (farmSession.shiniesCaught || 0) + 1;
            }

            const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
            if (currentHunt) {
              currentHunt.captures = (currentHunt.captures || 0) + 1;
              currentHunt.catches = currentHunt.captures;
              if (isShiny) {
                currentHunt.shiniesCaught = (currentHunt.shiniesCaught || 0) + 1;
                if ((currentHunt.shiniesSeen || 0) < currentHunt.shiniesCaught) {
                  currentHunt.shiniesSeen = currentHunt.shiniesCaught;
                }
              }
            }
            if (isShiny && (farmSession.shiniesSeen || 0) < farmSession.shiniesCaught) {
              farmSession.shiniesSeen = farmSession.shiniesCaught;
            }

            const pokeNome = (e.pokemon && e.pokemon.nome) || e.nome || 'Pokémon';
            // Sem notificação de shiny (pedido da equipe); a captura comum continua avisando.
            if (!isShiny) {
              showRotomHudToast('🎯 CAPTURA REALIZADA!', `${pokeNome} capturado com sucesso!`, 'confirmed');
            }
            statsChanged = true;
          }
        }

        // Kills / Derrotas de monstros selvagens
        if (evKey === 'morte' || evKey === 'kill' || evKey === 'derrota' || evKey === 'monstro_morto') {
          farmSession.kills = (farmSession.kills || 0) + 1;
          const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
          if (currentHunt) {
            currentHunt.kills = (currentHunt.kills || 0) + 1;
          }
          statsChanged = true;

          if (e.shiny || e.isShiny) {
            const mobSlot = e.slot || e.s;
            const mobKey = mobSlot ? `${mobSlot}_${e.nome || ''}` : null;
            if (!mobKey || !seenWildShiniesMap.has(mobKey)) {
              if (mobKey) seenWildShiniesMap.set(mobKey, Date.now());
              farmSession.shiniesSeen = (farmSession.shiniesSeen || 0) + 1;
              if (currentHunt) {
                currentHunt.shiniesSeen = (currentHunt.shiniesSeen || 0) + 1;
              }
            }
          }

          // XP embutido no evento de morte
          const xpVal = Number(e.xp || e.qtd || e.valor || 0);
          if (xpVal > 0) {
            farmSession.pokemonXp += xpVal;
            farmSession.trainerXp += Math.round(xpVal * 0.5);
            currentHunt.pokemonXp = (currentHunt.pokemonXp || 0) + xpVal;
            currentHunt.trainerXp = (currentHunt.trainerXp || 0) + Math.round(xpVal * 0.5);
          }

          // Ouro embutido no evento de morte
          const ouroVal = Number(e.ouro || e.gold || 0);
          if (ouroVal > 0) {
            farmSession.gold += ouroVal;
            currentHunt.gold = (currentHunt.gold || 0) + ouroVal;
          }

          // Drops embutidos no evento de morte
          if (Array.isArray(e.drops)) {
            for (const d of e.drops) {
              if (!d) continue;
              let dNome = d.nome || d.name || '';
              if (!dNome && d.itemId && typeof window.getRotomItem === 'function') {
                const rIt = window.getRotomItem(d.itemId);
                if (rIt) dNome = rIt.name;
              }
              if (!dNome) dNome = `Item #${d.itemId || '?'}`;
              const dQtd = Number(d.qtd || d.quantidade || 1);

              farmSession.dropsCount += dQtd;
              farmSession.drops[dNome] = (farmSession.drops[dNome] || 0) + dQtd;

              currentHunt.dropsCount = (currentHunt.dropsCount || 0) + dQtd;
              if (!currentHunt.drops) currentHunt.drops = {};
              currentHunt.drops[dNome] = (currentHunt.drops[dNome] || 0) + dQtd;

              const nLower = dNome.toLowerCase();
              if (nLower.includes('boss token')) farmSession.bossTokens += dQtd;
              if (nLower.includes('key fragment') || nLower.includes('fragmento de chave')) farmSession.keyFragments += dQtd;
              if (nLower.includes('shiny stone') || nLower.includes('fragmento de shiny')) farmSession.shinyFragments += dQtd;
              if (nLower.includes('bicicleta') || nLower.includes('bike')) farmSession.bikeFragments += dQtd;
            }
          }
        }

        // Ganho de XP avulso
        if (evKey === 'xp') {
          const val = Number(e.qtd || e.valor || e.xp || 0);
          if (val > 0) {
            const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
            if (e.tipo === 'treinador' || e.dest === 'treinador') {
              farmSession.trainerXp += val;
              currentHunt.trainerXp = (currentHunt.trainerXp || 0) + val;
            } else {
              farmSession.pokemonXp += val;
              currentHunt.pokemonXp = (currentHunt.pokemonXp || 0) + val;
            }
            statsChanged = true;
          }
        }

        // Ganho de Gold avulso
        if (evKey === 'gold' || evKey === 'ouro') {
          const val = Number(e.qtd || e.valor || e.gold || e.ouro || 0);
          if (val > 0) {
            farmSession.gold += val;
            const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
            currentHunt.gold = (currentHunt.gold || 0) + val;
            statsChanged = true;
          }
        }

        // Drops avulsos
        if (evKey === 'drop' || evKey === 'item') {
          let nomeItem = e.nome || e.itemNome || '';
          if (!nomeItem && e.itemId && typeof window.getRotomItem === 'function') {
            const rItem = window.getRotomItem(e.itemId);
            if (rItem) nomeItem = rItem.name;
          }
          if (!nomeItem) nomeItem = `Item #${e.itemId || '?'}`;
          const qtd = Number(e.qtd || e.quantidade || 1);

          farmSession.dropsCount += qtd;
          farmSession.drops[nomeItem] = (farmSession.drops[nomeItem] || 0) + qtd;

          const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
          currentHunt.dropsCount = (currentHunt.dropsCount || 0) + qtd;
          if (!currentHunt.drops) currentHunt.drops = {};
          currentHunt.drops[nomeItem] = (currentHunt.drops[nomeItem] || 0) + qtd;

          const nLower = nomeItem.toLowerCase();
          if (nLower.includes('boss token')) farmSession.bossTokens += qtd;
          if (nLower.includes('key fragment') || nLower.includes('fragmento de chave')) farmSession.keyFragments += qtd;
          if (nLower.includes('shiny stone') || nLower.includes('fragmento de shiny')) farmSession.shinyFragments += qtd;
          if (nLower.includes('bicicleta') || nLower.includes('bike')) farmSession.bikeFragments += qtd;

          statsChanged = true;
        }
      }

      if (statsChanged) {
        emitFarmStats();
      }
    }

    // Shinies selvagens avistados no mapa (pacote campo, campo.init ou envelope)
    // CRÍTICO: No Centro Pokémon, TODOS os mobs pertencem a outros jogadores ou NPCs, NUNCA selvagens.
    if (!playerInPokemonCenter) {
      const monstrosList = packet.mobs || (packet.campo && packet.campo.mobs) || packet.monstros || (packet.campo && packet.campo.monstros);
      if (Array.isArray(monstrosList)) {
        let sawShiny = false;
        const now = Date.now();
        for (const m of monstrosList) {
          if (!m) continue;
          // Ignora monstro de treinador/jogador (m.tr > 0) ou cadáver (m.x > 0)
          const isTrainerMob = Boolean((m.tr && m.tr > 0) || (m.Tr && m.Tr > 0) || m.jogador || m.player);
          const isDead = Boolean((m.x && m.x > 0) || (m.X && m.X > 0) || m.morto);
          const slot = Number(m.s !== undefined ? m.s : (m.slot !== undefined ? m.slot : -1));
          // Criaturas selvagens ocupam slots 5 em diante no PokéIdle
          const isWild = !isTrainerMob && !isDead && (slot >= 5 || slot === -1);
          const isShiny = Boolean(m.sh === 1 || m.Sh === 1 || m.shiny || m.isShiny || m.lookShiny === 1 || m.LookShiny === 1);

          if (isWild && isShiny) {
            const mobKey = `${slot}_${m.n || m.nome || 'poke'}_${m.nv || m.level || 0}`;
            if (!seenWildShiniesMap.has(mobKey)) {
              seenWildShiniesMap.set(mobKey, now);
              farmSession.shiniesSeen = (farmSession.shiniesSeen || 0) + 1;
              if (farmSession.activeHuntSlug && farmSession.activeHuntSlug !== 'centro_pokemon') {
                const currentHunt = getOrCreateHuntStat(farmSession.activeHuntSlug, farmSession.activeHuntName);
                if (currentHunt) {
                  currentHunt.shiniesSeen = (currentHunt.shiniesSeen || 0) + 1;
                }
              }
              sawShiny = true; // só conta nas estatísticas; sem notificação de shiny (pedido da equipe)
            }
          }
        }
        if (sawShiny) emitFarmStats();

        // Limpeza periódica do mapa de slots se crescer muito
        if (seenWildShiniesMap.size > 200) {
          for (const [k, ts] of seenWildShiniesMap.entries()) {
            if (now - ts > 180000) seenWildShiniesMap.delete(k);
          }
        }
      }
    }

    // Captura de Pokémon Herói Ativo (pacote estado, welcome ou envelope)
    const pks = packet.pokemons || (packet.estado && packet.estado.pokemons) || (packet.payload && packet.payload.estado && packet.payload.estado.pokemons) || (packet.depot && Array.isArray(packet.depot) ? packet.depot : null);
    if (Array.isArray(pks) && pks.length > 0) {
      playerPokemonsCache = pks;
      const actId = packet.activeId || (packet.estado && packet.estado.activeId) || (packet.payload && packet.payload.estado && packet.payload.estado.activeId);
      const activePk = pks.find(p => p && p.id === actId) || pks[0];
      if (activePk) {
        farmSession.activePokemon = {
          id: activePk.id,
          speciesId: activePk.speciesId || activePk.pokemonId || activePk.pId || 1,
          nome: activePk.nome || activePk.name || 'Pokémon',
          level: Number(activePk.level || activePk.lvl || 1),
          shiny: Boolean(activePk.shiny),
          potencia: Number(activePk.potencia || 1),
          qualidade: Number(activePk.qualidade || activePk.quality || 0),
          ivTotal: Number(activePk.ivTotal || 0),
          nota: Number(activePk.nota || 0)
        };
        emitFarmStats();
      }
    }

    // Evento de Oferenda Executada no Servidor Oficial
    if (t === 'oferenda') {
      const pedraObj = packet.pedra || packet.item || {};
      const pedraNome = pedraObj.nome || pedraObj.name || (pedraObj.id ? `Pedra #${pedraObj.id}` : 'Pedra Evolutiva');
      oferendaStonesAccumulator[pedraNome] = (oferendaStonesAccumulator[pedraNome] || 0) + 1;
      showRotomHudToast('OFERENDA REALIZADA', `Obteve: ${pedraNome}`, 'success');
    }

    // 4. Tratamento de Erros e Recusas do Servidor
    if (t === 'erro') {
      const errMsg = packet.msg || packet.chave || 'Operação recusada pelo servidor';
      if (errMsg.includes('Devagar')) {
        showRotomHudToast('AVISO ANTI-FLOOD', 'O servidor pediu para desacelerar as mensagens.', 'warning');
      } else if (sniperState.lastBuyAttempt && (Date.now() - sniperState.lastBuyAttempt.timestamp < 12000)) {
        // Se houve uma tentativa de compra recente, reportar a recusa exata
        const last = sniperState.lastBuyAttempt;
        delete sniperState.boughtOffers[last.offerId];
        delete sniperState.confirmedOffers[last.offerId];
        (sniperState.pioRecusados = sniperState.pioRecusados || {})[last.offerId] = Date.now();
        showRotomHudToast('COMPRA RECUSADA', `${last.targetName}: ${errMsg}`, 'error');
        emitSniperLog({
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          timestamp: Date.now(),
          targetName: last.targetName,
          offerId: last.offerId,
          status: 'RECUSADO',
          details: `❌ Recusado pelo servidor: ${errMsg}`
        });
      }
    }
  }

  // =========================================================================
  // 3. LOOP DE MONITORAMENTO AUTÔNOMO EM SEGUNDO PLANO (SEM ABRIR JANELA)
  // =========================================================================
  // PIO: ritmo adaptativo. Procurando: uma varredura completa a cada 45 s (o anúncio novo fica 2 min em
  // carência, então nenhum escapa). Achou alvo (disparo agendado ou preço dentro da regra): volta aos 3 s
  // até a compra sair, para não perder nada na liberação.
  const PIO_LENTO_MS = 45000, PIO_RAPIDO_MS = 3000;
  let scanCycle = 0;
  const pioModoRapido = () => Object.keys(sniperState.scheduledOffers || {}).length > 0 || (sniperState.pioQuenteAte || 0) > Date.now();
  let pioUltimaVarredura = 0;
  pioRelogio.intervalo(() => {
    if (!sniperState.enabled) return;
    const ws = getGameWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const rapido = pioModoRapido();
    if (Date.now() - pioUltimaVarredura < (rapido ? PIO_RAPIDO_MS : PIO_LENTO_MS) - 250) return;
    pioUltimaVarredura = Date.now();

    scanCycle++;

    // Mantém leitura de VIP e saldo atualizada continuamente
    updatePlayerVipStatus();
    getPlayerGold();
    getPlayerGems();
    getPlayerDiamonds();

    const activeRules = sniperState.rules.filter(r => r.active);
    const hasItemRules = activeRules.some(r => r.targetType === 'item' || !r.targetType);
    const gCfg = sniperState.globalConfig;
    const hasPokeRules = gCfg.snipeAnyShiny || gCfg.snipeAnyP5 || gCfg.snipeByNote || activeRules.some(r => r.targetType === 'pokemon');

    // 1. Varredura de Itens (a cada 3s)
    if (hasItemRules) {
      sendRaw({ t: 'market.itens' });
    }

    // 2. Varredura de Pokémons (alternando ordenações para pegar novidades)
    if (hasPokeRules) {
      const listar = k => {
        switch (k % 3) {
          case 0:
            sendRaw({ t: 'market.listar', tipo: 'pokemon', ordem: 'recentes', moeda: '', busca: '', criterios: [], elemento: '' });
            break;
          case 1:
            sendRaw({ t: 'market.listar', tipo: 'pokemon', ordem: 'menor_preco', moeda: 'gold', busca: '', criterios: [], elemento: '' });
            break;
          case 2:
            sendRaw({ t: 'market.listar', tipo: 'pokemon', ordem: 'menor_preco', moeda: 'orb', busca: '', criterios: [], elemento: '' });
            break;
        }
      };
      if (rapido) {
        pioRelogio.timeout(() => { if (sniperState.enabled) listar(scanCycle); }, 700);
      } else {
        // No modo lento cada varredura cobre as 3 ordenações, espaçadas.
        [0, 1, 2].forEach(k => pioRelogio.timeout(() => { if (sniperState.enabled) listar(k); }, 700 * (k + 1)));
      }
    }
  }, 1000);

  // =========================================================================
  // 4. INTERCEPTAÇÃO DE WEBSOCKET
  // =========================================================================
  WebSocket.prototype.send = function(data) {
    hookWebSocketInstance(this);
    return originalProtoSend.apply(this, arguments);
  };

  window.WebSocket = function(url, protocols) {
    const ws = new OriginalWebSocket(url, protocols);
    hookWebSocketInstance(ws);
    console.log('[PokéIdle Rotom Sniper]: Conexão WebSocket interceptada:', url);
    return ws;
  };

  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;

  // =========================================================================
  // 5. ESCUTAR COMANDOS DO POPUP
  // =========================================================================
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'ROTOM_POPUP') return;

    if (event.data.type === 'INIT_SNIPER') {
      sniperState.enabled = Boolean(event.data.enabled);
      if (Array.isArray(event.data.rules)) sniperState.rules = event.data.rules;
      if (event.data.globalConfig) sniperState.globalConfig = Object.assign(sniperState.globalConfig, event.data.globalConfig);
      console.log('[Rotom Sniper]: Inicializado. Ativo:', sniperState.enabled, 'Regras:', sniperState.rules.length);
    } else if (event.data.type === 'SET_SNIPER_ENABLED') {
      const newEnabled = Boolean(event.data.enabled);
      if (sniperState.enabled === newEnabled) return; // Deduplicação: não repete se já estiver no mesmo estado
      sniperState.enabled = newEnabled;
      if (!sniperState.enabled) {
        // Cancela todos os disparos agendados e limpa a fila
        Object.keys(sniperState.scheduledOffers).forEach(clearOfferTimers);
        sniperState.scheduledOffers = {};
      }
      showRotomHudToast(
        sniperState.enabled ? 'AUTO-SNIPE ATIVADO' : 'AUTO-SNIPE PAUSADO',
        sniperState.enabled ? 'Varrendo o mercado a cada 45 s; a cada 3 s quando há alvo à vista.' : 'Compras automáticas temporariamente suspensas.',
        sniperState.enabled ? 'success' : 'warning'
      );
    } else if (event.data.type === 'UPDATE_SNIPER_RULES') {
      sniperState.rules = Array.isArray(event.data.rules) ? event.data.rules : [];
      // Se não há regras ativas de itens, limpa agendamentos
      const activeRuleIds = new Set(sniperState.rules.filter(r => r.active).map(r => r.id));
      if (activeRuleIds.size === 0 && !sniperState.globalConfig.snipeAnyShiny && !sniperState.globalConfig.snipeAnyP5 && !sniperState.globalConfig.snipeByNote) {
        Object.keys(sniperState.scheduledOffers).forEach(clearOfferTimers);
        sniperState.scheduledOffers = {};
      }
      console.log('[Rotom Sniper]: Regras atualizadas:', sniperState.rules.length);
    } else if (event.data.type === 'UPDATE_SNIPER_CONFIG') {
      if (event.data.config) {
        sniperState.globalConfig = Object.assign(sniperState.globalConfig, event.data.config);
      }
    } else if (event.data.type === 'FETCH_MY_LISTINGS') {
      sendRaw({ t: 'market.meus' });
    } else if (event.data.type === 'CANCEL_MARKET_OFFER') {
      sendRaw({ t: 'market.cancelar', id: Number(event.data.offerId || event.data.id) });
    } else if (event.data.type === 'FETCH_COMMUNITY_CATALOG') {
      sendRaw({ t: 'market.itens', elemento: '', categoria: '' });
    } else if (event.data.type === 'FETCH_ITEM_OFFERS') {
      sendRaw({ t: 'market.item', itemId: Number(event.data.itemId), moeda: event.data.moeda || 'gold' });
    } else if (event.data.type === 'BUY_MANUAL_OFFER') {
      executeBuyOrder(event.data.offerId, event.data.qty || 1, event.data.price, event.data.moeda, event.data.targetName, '', 'Compra manual pelo Cockpit', event.data.seller);
    } else if (event.data.type === 'FETCH_DIAMOND_OFFERS') {
      lastDiamondRequestTime = Date.now();
      accumulatedDiamondOffers = [];
      const moedaReq = event.data.moeda;
      if (moedaReq === 'orb' || moedaReq === 'gold') {
        sendRaw({
          t: 'market.listar',
          tipo: 'diamante',
          moeda: moedaReq,
          ordem: 'baratos',
          pagina: 0,
          busca: '',
          criterios: [],
          elemento: '',
          categoria: '',
          soShiny: false,
          soP5: false
        });
      } else {
        // Envia requisições para Coins e Gemas cobrindo todas as ofertas ativas
        sendRaw({
          t: 'market.listar',
          tipo: 'diamante',
          moeda: 'gold',
          ordem: 'baratos',
          pagina: 0,
          busca: '',
          criterios: [],
          elemento: '',
          categoria: '',
          soShiny: false,
          soP5: false
        });
        setTimeout(() => {
          sendRaw({
            t: 'market.listar',
            tipo: 'diamante',
            moeda: 'orb',
            ordem: 'baratos',
            pagina: 0,
            busca: '',
            criterios: [],
            elemento: '',
            categoria: '',
            soShiny: false,
            soP5: false
          });
        }, 120);
      }
    } else if (event.data.type === 'CREATE_MARKET_LISTING') {
      sendRaw({
        t: 'market.criar',
        tipo: event.data.tipo || 'item',
        itemId: event.data.itemId ? Number(event.data.itemId) : undefined,
        pokemonId: event.data.pokemonId ? Number(event.data.pokemonId) : undefined,
        qtd: Number(event.data.qtd) || 1,
        preco: Number(event.data.preco) || 1,
        moeda: event.data.moeda || 'gold',
        dias: event.data.dias ? Number(event.data.dias) : null
      });
      showRotomHudToast('ANÚNCIO PUBLICADO', 'Sua oferta foi enviada ao mercado da comunidade.', 'confirmed');
      setTimeout(() => { sendRaw({ t: 'market.meus' }); }, 600);
    } else if (event.data.type === 'FETCH_FARM_STATS') {
      emitFarmStats();
    } else if (event.data.type === 'RESET_FARM_STATS') {
      const curSlug = farmSession.activeHuntSlug || '';
      const curName = farmSession.activeHuntName || '';
      farmSession = {
        startTime: Date.now(),
        trainerXp: 0,
        pokemonXp: 0,
        gold: 0,
        kills: 0,
        catches: 0,
        captures: 0,
        ballAttempts: 0,
        shiniesSeen: 0,
        shiniesCaught: 0,
        bossTokens: 0,
        keyFragments: 0,
        shinyFragments: 0,
        bikeFragments: 0,
        dropsCount: 0,
        drops: {},
        activeHuntSlug: curSlug,
        activeHuntName: curName,
        hunts: {}
      };
      emitFarmStats();
      showRotomHudToast('SESSÃO REINICIADA', 'Os contadores de farm e histórico de hunts foram zerados.', 'info');
    } else if (event.data.type === 'RESET_HUNTS_STATS') {
      farmSession.hunts = {};
      emitFarmStats();
      showRotomHudToast('HUNTS RESETADAS', 'O histórico de rendimento por hunt foi zerado.', 'info');
    } else if (event.data.type === 'FETCH_OFERENDA_CANDIDATES') {
      const maxNota = typeof event.data.maxNota === 'number' ? event.data.maxNota : 5.0;
      const elemFilter = (event.data.elemento || '').toLowerCase().trim();
      processOferendaCandidates(maxNota, elemFilter, 0);
    } else if (event.data.type === 'EXECUTE_OFERENDA_BATCH') {
      if (isOferendaBatchRunning) return;
      const ids = Array.isArray(event.data.pokemonIds) ? event.data.pokemonIds : [];
      const pacingMs = Math.max(250, Number(event.data.pacingMs || 800));
      if (ids.length < 5) {
        showRotomHudToast('ALTAR DE OFERENDAS', 'Selecione ao menos 5 Pokémons para oferenda.', 'warning');
        return;
      }

      isOferendaBatchRunning = true;
      oferendaStonesAccumulator = {};

      const batches = [];
      for (let i = 0; i + 4 < ids.length; i += 5) {
        batches.push(ids.slice(i, i + 5));
      }

      const totalBatches = batches.length;
      let currentBatchIdx = 0;

      showRotomHudToast('ALTAR DE OFERENDAS', `Iniciando oferenda em lote: ${totalBatches * 5} Pokémons em ${totalBatches} giros.`, 'info');

      function runNextBatch() {
        if (currentBatchIdx >= totalBatches) {
          isOferendaBatchRunning = false;
          window.postMessage({
            source: 'ROTOM_SNIPER',
            type: 'OFERENDA_BATCH_COMPLETED',
            totalSacrificed: totalBatches * 5,
            batchesExecuted: totalBatches,
            stonesReceived: oferendaStonesAccumulator
          }, '*');
          showRotomHudToast('ALTAR CONCLUÍDO', `${totalBatches * 5} Pokémons sacrificados com sucesso!`, 'confirmed');
          return;
        }

        const chunk = batches[currentBatchIdx];
        currentBatchIdx++;

        window.postMessage({
          source: 'ROTOM_SNIPER',
          type: 'OFERENDA_BATCH_PROGRESS',
          batch: currentBatchIdx,
          totalBatches: totalBatches,
          sacrificed: currentBatchIdx * 5
        }, '*');

        sendRaw({ t: 'oferenda.girar', pokemonIds: chunk });

        setTimeout(runNextBatch, pacingMs);
      }

      runNextBatch();
    }
  });

  function getPlayerAllPokemons() {
    if (Array.isArray(playerPokemonsCache) && playerPokemonsCache.length > 0) {
      return playerPokemonsCache;
    }
    if (Array.isArray(window.__rotomPlayerPokemons) && window.__rotomPlayerPokemons.length > 0) {
      return window.__rotomPlayerPokemons;
    }
    if (window.estado && window.estado.eu && Array.isArray(window.estado.eu.pokemons) && window.estado.eu.pokemons.length > 0) {
      return window.estado.eu.pokemons;
    }
    if (window.estado && Array.isArray(window.estado.pokemons) && window.estado.pokemons.length > 0) {
      return window.estado.pokemons;
    }
    if (window.estado && window.estado.depot && Array.isArray(window.estado.depot)) {
      return window.estado.depot;
    }
    return [];
  }

  function processOferendaCandidates(maxNota, elemFilter, retryCount = 0) {
    let allPks = getPlayerAllPokemons();

    // Se estiver vazio e temos conexão ativa, tenta forçar envio de estado pelo servidor
    if ((!allPks || allPks.length === 0) && retryCount < 3) {
      sendRaw({ t: 'auto.set' });
      setTimeout(() => {
        processOferendaCandidates(maxNota, elemFilter, retryCount + 1);
      }, 350);
      return;
    }

    const cleanFilter = elemFilter ? elemFilter.toLowerCase().trim() : '';
    const isFilterAll = !cleanFilter || cleanFilter === 'all' || cleanFilter === 'todos' || cleanFilter === 'qualquer';

    let depotCount = 0;
    let protectedCount = 0;
    const candidates = [];

    for (let i = 0; i < allPks.length; i++) {
      const pk = allPks[i];
      if (!pk) continue;

      const inTeam = pk.slot !== undefined && pk.slot !== null && pk.slot !== '' && Number(pk.slot) >= 0;
      if (inTeam) continue;

      depotCount++;

      const isShiny = Boolean(pk.shiny);
      const isP5 = Number(pk.potencia || 1) >= 5;
      const isLocked = Boolean(pk.travado || pk.lock || pk.locked || pk.pokemonTravado);
      const hasRefinement = Number(pk.refino || pk.refinement || 0) > 0;
      const hasTm = Boolean(pk.tm || pk.tm1 || pk.tm2);
      const isStarter = Boolean(pk.inicial || pk.starter);

      if (isShiny || isP5 || isLocked || hasRefinement || hasTm || isStarter) {
        protectedCount++;
        continue;
      }

      let pkNota = (pk.nota !== undefined && pk.nota !== null && !isNaN(Number(pk.nota))) ? Number(pk.nota) : -1;
      if (pkNota < 0) {
        const ivTot = Object.values(pk.ivs || {}).reduce((s, v) => s + Number(v || 0), 0);
        const qual = Number(pk.qualidade || pk.quality || 0);
        pkNota = Number(((ivTot / 192) * 5 + (qual / 100) * 5).toFixed(1));
      }
      if (isNaN(pkNota) || pkNota < 0) pkNota = 0;

      if (maxNota < 10.0 && pkNota > maxNota) {
        protectedCount++;
        continue;
      }

      if (!isFilterAll) {
        const tipos = Array.isArray(pk.tipos) ? pk.tipos.map(t => String(t).toLowerCase()) : [];
        const t1 = String(pk.tipo1 || pk.elemento || pk.tipo || '').toLowerCase();
        const t2 = String(pk.tipo2 || '').toLowerCase();
        const match = tipos.some(t => t.includes(cleanFilter)) || t1.includes(cleanFilter) || t2.includes(cleanFilter);
        if (!match) {
          continue;
        }
      }

      candidates.push({
        id: pk.id,
        speciesId: pk.speciesId || pk.pokemonId || pk.pId || 1,
        nome: pk.nome || pk.name || 'Pokémon',
        nota: pkNota,
        level: Number(pk.level || pk.lvl || 1),
        potencia: Number(pk.potencia || 1),
        qualidade: Number(pk.qualidade || pk.quality || 0),
        tipo1: pk.tipo1 || pk.elemento || (Array.isArray(pk.tipos) ? pk.tipos[0] : '') || '',
        tipo2: pk.tipo2 || (Array.isArray(pk.tipos) && pk.tipos.length > 1 ? pk.tipos[1] : '') || ''
      });
    }

    candidates.sort((a, b) => a.nota - b.nota);

    window.postMessage({
      source: 'ROTOM_SNIPER',
      type: 'OFERENDA_CANDIDATES_RESULT',
      candidates: candidates,
      protectedCount: protectedCount,
      totalDepot: depotCount
    }, '*');
  }

  console.log('[PokéIdle Rotom Sniper]: Motor de Auto-Snipe e Telemetria pronto!');
})();
const cockpitHTML = "<!DOCTYPE html>\n<html lang=\"pt-BR\">\n\n<head>\n  <meta charset=\"UTF-8\">\n  <title>PokéIdle — Cockpit Auto-Sniper</title>\n  <style>\n    :root {\n      /* Fundo xadrez azul oficial PokéIdle */\n      --xadrez-esc: #3357e3;\n      --xadrez-clr: #587aff;\n\n      /* Moldura de madeira: quadros, botões, degraus */\n      --mad-linha: #480e1e;\n      --mad-luz: #f1d3b7;\n      --mad-luz2: #e7a86d;\n      --mad: #bd6951;\n      --mad-esc: #914850;\n      --mad-quente: #df824c;\n      --mad-base: #722c3f;\n\n      /* Miolo roxo dos botões ligados */\n      --rx-luz: #ffdef0;\n      --rx-esc: #8d49b8;\n      --rx: #ba5ad1;\n      --rx-clr: #e77ad2;\n      --rx-rosa: #ffa7d7;\n\n      /* Vãos: áreas recuadas escuras */\n      --vao: #33202b;\n      --vao2: #462b39;\n      --vao-luz: #5c3948;\n\n      /* Texto */\n      --sobre-mad: #fff6ef;\n      --sobre-mad-dim: #f5cdb9;\n      --vao-dim: #c9a9b4;\n\n      /* Sinais */\n      --verde: #6fd08a;\n      --verde-esc: #4e9c62;\n      --vermelho: #d8574a;\n      --vermelho-esc: #a03428;\n      --laranja: #f0a03c;\n\n      /* Ouro & Moedas */\n      --ouro-luz: #ffe9a3;\n      --ouro: #e2a93f;\n      --ouro-esc: #7d5313;\n      --ouro-vao: #efe4d2;\n      --coins: #fbbf24;\n      --gemas: #ffa7d7;\n\n      /* Selo VIP Oficial */\n      --vip-luz: #9fe4ff;\n      --vip: #2f8fc4;\n      --vip-texto: #06202e;\n\n      /* Véu modal */\n      --veu: #1a0f16d9;\n    }\n\n    .selo-vip {\n      background: linear-gradient(180deg, var(--vip-luz) 0 4px, var(--vip) 4px 100%);\n      color: var(--vip-texto);\n      font-weight: 800;\n      border-radius: 0px;\n    }\n\n    * {\n      box-sizing: border-box;\n      margin: 0;\n      padding: 0;\n    }\n\n    body {\n      font-family: Tahoma, Verdana, \"Segoe UI\", sans-serif;\n      font-weight: 700;\n      font-size: 12px;\n      color: var(--sobre-mad);\n      background-color: var(--xadrez-esc);\n      background-image: conic-gradient(\n        var(--xadrez-clr) 0 25%, var(--xadrez-esc) 0 50%,\n        var(--xadrez-clr) 0 75%, var(--xadrez-esc) 0);\n      background-size: 64px 64px;\n      height: 100vh;\n      overflow: hidden;\n      user-select: none;\n      display: flex;\n      flex-direction: column;\n    }\n\n    *, *::before, *::after {\n      box-sizing: border-box;\n    }\n\n    img, canvas {\n      image-rendering: pixelated;\n    }\n\n    /* Barra de rolagem oficial de madeira */\n    * {\n      scrollbar-width: thin;\n      scrollbar-color: var(--mad-base) transparent;\n    }\n    *::-webkit-scrollbar {\n      width: 8px;\n      height: 8px;\n    }\n    *::-webkit-scrollbar-thumb {\n      background: var(--mad);\n      border-radius: 4px;\n      box-shadow: inset 0 0 0 2px var(--mad-linha);\n    }\n    *::-webkit-scrollbar-track {\n      background: transparent;\n    }\n\n    /* TOP BAR (Quadro Superior Estilo Menu) */\n    .top-bar {\n      flex: none;\n      background: linear-gradient(180deg,\n        var(--mad-esc) 0 8px,\n        var(--mad) 8px calc(100% - 10px),\n        var(--mad-quente) calc(100% - 10px) calc(100% - 4px),\n        var(--mad) calc(100% - 4px) 100%);\n      box-shadow:\n        inset 0 0 0 2px var(--mad-linha),\n        inset 0 0 0 4px var(--mad-luz),\n        0 4px 0 var(--mad-base),\n        0 6px 0 var(--mad-linha);\n      padding: 8px 16px;\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 16px;\n      z-index: 10;\n    }\n\n    .brand-group {\n      display: flex;\n      align-items: center;\n      gap: 10px;\n    }\n\n    .brand-title {\n      font-size: 16px;\n      text-transform: uppercase;\n      letter-spacing: 1.2px;\n      color: #fff;\n      text-shadow:\n        -2px -2px 0 var(--mad-base), 2px -2px 0 var(--mad-base),\n        -2px 2px 0 var(--mad-base), 2px 2px 0 var(--mad-base);\n    }\n\n    .brand-badge {\n      background: var(--vao);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 1px 0 var(--mad-luz2);\n      border-radius: 0px;\n      padding: 2px 6px;\n      font-size: 9px;\n      color: var(--ouro-luz);\n      letter-spacing: 0.8px;\n    }\n\n    .telemetry-group {\n      display: flex;\n      align-items: center;\n      flex-wrap: wrap;\n      gap: 10px;\n    }\n\n    .moeda-box {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      background: var(--vao);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 1px 0 var(--mad-luz2);\n      border-radius: 0px;\n      padding: 4px 8px;\n      font-size: 11px;\n    }\n\n    .moeda-label {\n      color: var(--vao-dim);\n      font-size: 9px;\n      text-transform: uppercase;\n    }\n\n    .moeda-valor-coins {\n      color: var(--coins);\n      font-variant-numeric: tabular-nums;\n    }\n\n    .moeda-valor-gemas {\n      color: var(--gemas);\n      font-variant-numeric: tabular-nums;\n    }\n\n    .slot-pill {\n      background: var(--vao);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), inset 0 0 0 4px var(--rx);\n      border-radius: 0px;\n      padding: 4px 8px;\n      font-size: 10px;\n      color: var(--rx-luz);\n      letter-spacing: 0.5px;\n    }\n\n    .master-switch-box {\n      display: flex;\n      align-items: center;\n      gap: 8px;\n      background: var(--vao);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 1px 0 var(--mad-luz2);\n      border-radius: 0px;\n      padding: 4px 10px;\n    }\n\n    .master-switch-title {\n      font-size: 10px;\n      text-transform: uppercase;\n      letter-spacing: 0.5px;\n      color: var(--sobre-mad);\n    }\n\n    /* INTERRUPTOR OFICIAL POKÉIDLE */\n    input[type=\"checkbox\"] {\n      appearance: none;\n      -webkit-appearance: none;\n      position: relative;\n      flex: none;\n      cursor: pointer;\n      width: 44px;\n      height: 22px;\n      margin: 0;\n      border: 0;\n      border-radius: 0px;\n      background: var(--vao);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 2px 0 var(--mad-base);\n      transition: background .12s;\n    }\n\n    input[type=\"checkbox\"]::before {\n      content: \"\";\n      position: absolute;\n      top: 3px;\n      left: 3px;\n      width: 16px;\n      height: 16px;\n      border-radius: 0px;\n      background: linear-gradient(180deg,\n        var(--mad-luz2) 0 4px, var(--mad) 4px calc(100% - 3px), var(--mad-base) calc(100% - 3px) 100%);\n      box-shadow: inset 0 0 0 2px var(--mad-linha);\n      transition: left .12s, background .12s;\n    }\n\n    input[type=\"checkbox\"]:checked {\n      background: var(--rx-esc);\n    }\n\n    input[type=\"checkbox\"]:checked::before {\n      left: 25px;\n      background: linear-gradient(180deg,\n        var(--rx-luz) 0 4px, var(--rx) 4px calc(100% - 3px), var(--rx-rosa) calc(100% - 3px) 100%);\n    }\n\n    /* Variante Miniatura para Cards de Regra */\n    input[type=\"checkbox\"].chk-mini {\n      width: 36px;\n      height: 18px;\n    }\n\n    input[type=\"checkbox\"].chk-mini::before {\n      top: 2px;\n      left: 2px;\n      width: 14px;\n      height: 14px;\n      border-radius: 3px;\n    }\n\n    input[type=\"checkbox\"].chk-mini:checked::before {\n      left: 20px;\n    }\n\n    input[type=\"checkbox\"]:hover {\n      filter: brightness(1.12);\n    }\n\n    input[type=\"checkbox\"]:active::before {\n      top: 4px;\n    }\n\n    /* ÁREA PRINCIPAL COM 3 COLUNAS */\n    .cockpit-grid {\n      flex: 1;\n      display: grid;\n      grid-template-columns: 360px 1fr 340px;\n      gap: 14px;\n      padding: 14px;\n      min-height: 0;\n      overflow: hidden;\n    }\n\n    /* COLUNA ESQUERDA: CADASTRO & RADAR COM SCROLL SEGURO E SEM ENCOLHIMENTO */\n    .cockpit-col-left {\n      display: flex;\n      flex-direction: column;\n      gap: 10px;\n      min-height: 0;\n      overflow-y: auto;\n      overflow-x: hidden;\n      padding-right: 4px;\n    }\n\n    .cockpit-col-left > .quadro {\n      flex-shrink: 0 !important;\n      min-height: min-content;\n    }\n\n    /* QUADROS OFICIAIS */\n    .quadro {\n      background: linear-gradient(180deg,\n        var(--mad-esc) 0 10px,\n        var(--mad) 10px calc(100% - 14px),\n        var(--mad-quente) calc(100% - 14px) calc(100% - 7px),\n        var(--mad) calc(100% - 7px) 100%);\n      border: 0;\n      border-radius: 0px;\n      padding: 12px;\n      color: var(--sobre-mad);\n      box-shadow:\n        inset 0 0 0 2px var(--mad-linha),\n        inset 0 0 0 4px var(--mad-luz),\n        inset 0 0 0 6px var(--mad),\n        0 4px 0 var(--mad-base),\n        0 6px 0 var(--mad-linha);\n      display: flex;\n      flex-direction: column;\n      gap: 10px;\n      min-height: 0;\n    }\n\n    .quadro-header {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      border-bottom: 2px solid var(--mad-linha);\n      padding-bottom: 6px;\n    }\n\n    .quadro-titulo {\n      font-size: 12px;\n      font-weight: 700;\n      text-transform: uppercase;\n      letter-spacing: 0.8px;\n      color: #fff;\n      text-shadow:\n        -1px -1px 0 var(--mad-base), 1px -1px 0 var(--mad-base),\n        -1px 1px 0 var(--mad-base), 1px 1px 0 var(--mad-base);\n    }\n\n    .quadro-sub {\n      font-size: 9.5px;\n      color: var(--sobre-mad-dim);\n      font-weight: 400;\n    }\n\n    /* VÃOS */\n    .vao {\n      background: var(--vao);\n      border: 0;\n      border-radius: 0px;\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 1px 0 var(--mad-luz2);\n    }\n\n    /* CAMPOS DE TEXTO OFICIAIS */\n    .campo {\n      height: 30px;\n      padding: 0 10px;\n      background: var(--vao);\n      color: var(--sobre-mad);\n      border: 0;\n      border-radius: 0px;\n      font-family: inherit;\n      font-size: 11.5px;\n      font-weight: 700;\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 1px 0 var(--mad-luz2);\n      width: 100%;\n    }\n\n    .campo::placeholder {\n      color: var(--vao-dim);\n      font-weight: 400;\n    }\n\n    .campo:focus {\n      outline: none;\n      box-shadow: inset 0 0 0 2px var(--mad-linha), inset 0 0 0 4px var(--rx), 0 1px 0 var(--mad-luz2);\n    }\n\n    /* BOTÕES PIXEL OFICIAIS */\n    .btn {\n      height: 32px;\n      padding: 0 12px;\n      border: 0;\n      border-radius: 0px;\n      cursor: pointer;\n      font-family: inherit;\n      font-weight: 700;\n      font-size: 11px;\n      text-transform: uppercase;\n      letter-spacing: 0.5px;\n      color: #fff;\n      text-shadow:\n        -1px -1px 0 var(--rx-esc), 1px -1px 0 var(--rx-esc),\n        -1px 1px 0 var(--rx-esc), 1px 1px 0 var(--rx-esc);\n      background: linear-gradient(180deg,\n        var(--rx-luz) 0 6px,\n        var(--rx-esc) 6px 13px,\n        var(--rx) 13px calc(100% - 13px),\n        var(--rx-clr) calc(100% - 13px) calc(100% - 7px),\n        var(--rx-rosa) calc(100% - 7px) 100%);\n      box-shadow:\n        inset 0 0 0 2px var(--mad-linha),\n        inset 0 0 0 4px var(--mad-luz2),\n        inset 0 0 0 5px var(--mad),\n        0 2px 0 var(--mad-base);\n      transition: filter .1s, transform .06s, box-shadow .06s;\n      display: inline-flex;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      white-space: nowrap;\n    }\n\n    #btn-add-rule {\n      width: 100%;\n      height: 32px;\n      flex-shrink: 0;\n      margin-top: 4px;\n      display: inline-flex;\n      font-weight: 800;\n      font-size: 11px;\n    }\n\n    .btn:hover:not(:disabled) {\n      filter: brightness(1.12);\n    }\n\n    .btn:active:not(:disabled) {\n      transform: translateY(2px);\n      box-shadow:\n        inset 0 0 0 2px var(--mad-linha),\n        inset 0 0 0 4px var(--mad-luz2),\n        inset 0 0 0 5px var(--mad);\n    }\n\n    .btn:disabled {\n      opacity: .45;\n      cursor: default;\n    }\n\n    /* Botão Apagado (Madeira) */\n    .btn.apagado, .btn:not(.on):not(.btn-roxo) {\n      background: linear-gradient(180deg,\n        var(--mad-luz2) 0 6px,\n        var(--mad-esc) 6px 13px,\n        var(--mad) 13px calc(100% - 10px),\n        var(--mad-quente) calc(100% - 10px) 100%);\n      color: var(--sobre-mad-dim);\n      text-shadow:\n        -1px -1px 0 var(--mad-base), 1px -1px 0 var(--mad-base),\n        -1px 1px 0 var(--mad-base), 1px 1px 0 var(--mad-base);\n    }\n\n    .btn.on, .btn-roxo {\n      background: linear-gradient(180deg,\n        var(--rx-luz) 0 6px,\n        var(--rx-esc) 6px 13px,\n        var(--rx) 13px calc(100% - 13px),\n        var(--rx-clr) calc(100% - 13px) calc(100% - 7px),\n        var(--rx-rosa) calc(100% - 7px) 100%);\n      color: #fff;\n      text-shadow:\n        -1px -1px 0 var(--rx-esc), 1px -1px 0 var(--rx-esc),\n        -1px 1px 0 var(--rx-esc), 1px 1px 0 var(--rx-esc);\n    }\n\n    /* CHIPS DE FILTRO RÁPIDO */\n    .chips-row {\n      display: flex;\n      flex-wrap: wrap;\n      gap: 5px;\n    }\n\n    .chip-btn {\n      height: 24px;\n      padding: 0 8px;\n      font-size: 9px;\n      letter-spacing: 0.3px;\n    }\n\n    /* FORMULÁRIO DE NOVA REGRA */\n    .form-group {\n      display: flex;\n      flex-direction: column;\n      gap: 4px;\n    }\n\n    .form-label {\n      font-size: 10px;\n      color: var(--sobre-mad-dim);\n      text-transform: uppercase;\n      letter-spacing: 0.5px;\n    }\n\n    .preview-box {\n      display: flex;\n      align-items: center;\n      gap: 8px;\n      padding: 6px 8px;\n    }\n\n    .preview-img {\n      width: 24px;\n      height: 24px;\n      object-fit: contain;\n      flex: none;\n    }\n\n    .preview-info {\n      flex: 1;\n      min-width: 0;\n    }\n\n    .preview-name {\n      font-size: 11.5px;\n      color: #fff;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      white-space: nowrap;\n    }\n\n    .preview-cat {\n      font-size: 9px;\n      color: var(--vao-dim);\n      text-transform: uppercase;\n    }\n\n    /* AUTOCOMPLETE DROPDOWN */\n    .sug-box {\n      position: relative;\n    }\n\n    .sug-list {\n      position: absolute;\n      top: 100%;\n      left: 0;\n      right: 0;\n      max-height: 160px;\n      overflow-y: auto;\n      z-index: 50;\n      margin-top: 3px;\n      display: flex;\n      flex-direction: column;\n    }\n\n    .sug-item {\n      display: flex;\n      align-items: center;\n      gap: 8px;\n      padding: 6px 8px;\n      cursor: pointer;\n      border-bottom: 1px solid rgba(72, 14, 30, 0.4);\n      transition: background 0.1s;\n    }\n\n    .sug-item:hover {\n      background: var(--vao2);\n    }\n\n    .sug-img {\n      width: 20px;\n      height: 20px;\n      object-fit: contain;\n      flex: none;\n    }\n\n    .sug-text {\n      flex: 1;\n      font-size: 11px;\n      color: #fff;\n    }\n\n    .sug-cat {\n      font-size: 8.5px;\n      color: var(--vao-dim);\n      text-transform: uppercase;\n    }\n\n    /* RADAR GLOBAL DE POKÉMON */\n    .global-row {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 6px;\n      padding: 6px 8px;\n    }\n\n    .global-title {\n      font-size: 10px;\n      color: #fff;\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      cursor: pointer;\n      flex: none;\n      white-space: nowrap;\n    }\n\n    .inputs-pair {\n      display: flex;\n      align-items: center;\n      gap: 4px;\n      flex: 1;\n      justify-content: flex-end;\n      min-width: 0;\n    }\n\n    .inputs-pair .campo {\n      height: 26px;\n      font-size: 10px;\n      padding: 0 4px;\n      text-align: center;\n      width: 76px;\n      max-width: 82px;\n      min-width: 46px;\n      flex: 1 1 76px;\n    }\n\n    .inputs-pair .campo-note-val {\n      flex: 0 0 40px;\n      width: 40px;\n      max-width: 40px;\n      min-width: 40px;\n      padding: 0 2px;\n    }\n\n    /* LISTA DE REGRAS ATIVAS */\n    .rules-container {\n      flex: 1;\n      overflow-y: auto;\n      display: flex;\n      flex-direction: column;\n      gap: 6px;\n      padding-right: 2px;\n    }\n\n    .rule-card {\n      display: flex;\n      flex-direction: column;\n      gap: 6px;\n      padding: 8px 10px;\n      transition: background 0.1s;\n    }\n\n    .rule-card-top {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 8px;\n    }\n\n    .rule-target-info {\n      display: flex;\n      align-items: center;\n      gap: 8px;\n      min-width: 0;\n      flex: 1;\n    }\n\n    .rule-icon {\n      width: 28px;\n      height: 28px;\n      object-fit: contain;\n      flex: none;\n    }\n\n    .rule-name-box {\n      display: flex;\n      flex-direction: column;\n      min-width: 0;\n    }\n\n    .rule-name {\n      font-size: 12px;\n      color: #fff;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      white-space: nowrap;\n    }\n\n    .rule-meta {\n      font-size: 10px;\n      color: var(--sobre-mad-dim);\n      font-weight: 400;\n    }\n\n    .rule-prices {\n      display: flex;\n      align-items: center;\n      gap: 8px;\n      font-size: 10.5px;\n    }\n\n    .rule-price-coins {\n      color: var(--coins);\n    }\n\n    .rule-price-gemas {\n      color: var(--gemas);\n    }\n\n    .rule-card-bottom {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 8px;\n      border-top: 1px solid rgba(72, 14, 30, 0.4);\n      padding-top: 5px;\n    }\n\n    .rule-progress-bar {\n      flex: 1;\n      position: relative;\n      height: 10px;\n      background: var(--mad-base);\n      border-radius: 4px;\n      overflow: hidden;\n      box-shadow: inset 0 0 0 1px var(--mad-linha);\n    }\n\n    .rule-progress-fill {\n      height: 100%;\n      background: linear-gradient(90deg, var(--verde-esc), var(--verde));\n      transition: width 0.2s ease;\n    }\n\n    .rule-actions-group {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n    }\n\n    .btn-mini {\n      height: 22px;\n      padding: 0 6px;\n      font-size: 8.5px;\n      border-radius: 4px;\n    }\n\n    /* TERMINAL DE LOGS */\n    .logs-container {\n      flex: 1;\n      overflow-y: auto;\n      display: flex;\n      flex-direction: column;\n      gap: 4px;\n      padding: 6px;\n    }\n\n    .log-row {\n      display: flex;\n      flex-direction: column;\n      gap: 2px;\n      padding: 5px 6px;\n      border-bottom: 1px solid rgba(72, 14, 30, 0.4);\n      font-size: 9.5px;\n    }\n\n    .log-row-top {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 6px;\n    }\n\n    .log-target-group {\n      display: flex;\n      align-items: center;\n      gap: 5px;\n      min-width: 0;\n      flex: 1;\n      overflow: hidden;\n    }\n\n    .log-time {\n      color: var(--vao-dim);\n      font-size: 8.5px;\n      flex-shrink: 0;\n      font-family: var(--fonte-mono, monospace);\n    }\n\n    .log-item-icon {\n      width: 14px;\n      height: 14px;\n      object-fit: contain;\n      image-rendering: pixelated;\n      flex-shrink: 0;\n    }\n\n    .log-target {\n      color: #fff;\n      font-weight: 700;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      white-space: nowrap;\n      font-size: 9.5px;\n    }\n\n    .log-seller {\n      font-size: 8px;\n      color: var(--ouro);\n      background: rgba(255, 170, 0, 0.12);\n      border: 1px solid rgba(255, 170, 0, 0.35);\n      padding: 0 4px;\n      border-radius: 0px;\n      font-weight: 600;\n      white-space: nowrap;\n      text-overflow: ellipsis;\n      overflow: hidden;\n      max-width: 120px;\n      flex-shrink: 0;\n    }\n\n    .log-seller b {\n      color: #fff;\n      font-weight: 700;\n    }\n\n    .log-status-tag {\n      font-size: 8px;\n      padding: 1px 4px;\n      border-radius: 0px;\n      text-transform: uppercase;\n      font-weight: 900;\n      flex: none;\n    }\n\n    .log-status-tag.disparado {\n      background: var(--rx);\n      color: #fff;\n    }\n\n    .log-status-tag.sucesso {\n      background: var(--verde-esc);\n      color: #fff;\n    }\n\n    .log-status-tag.aviso {\n      background: var(--laranja);\n      color: #4a3608;\n    }\n\n    .log-status-tag.erro {\n      background: var(--vermelho);\n      color: #fff;\n    }\n\n    .log-detail {\n      font-size: 8.5px;\n      color: var(--vao-dim);\n      font-weight: 400;\n      margin-top: 2px;\n      line-height: 1.35;\n    }\n\n    .log-price {\n      color: #f1f5f9;\n      font-weight: 600;\n    }\n\n    .log-desc {\n      color: var(--vao-dim);\n    }\n\n    /* BOTÃO PIX */\n    .btn-pix {\n      background: linear-gradient(180deg, #10b981 0 4px, #059669 4px calc(100% - 3px), #047857 calc(100% - 3px) 100%) !important;\n      color: #fff !important;\n      text-shadow: -1px -1px 0 #064e3b, 1px -1px 0 #064e3b, -1px 1px 0 #064e3b, 1px 1px 0 #064e3b !important;\n      border: 0 !important;\n      border-radius: 0px !important;\n      cursor: pointer;\n      font-weight: 700;\n      display: inline-flex;\n      align-items: center;\n      justify-content: center;\n      gap: 4px;\n      box-shadow: 0 2px 0 #064e3b !important;\n      user-select: none;\n    }\n\n    .btn-pix:hover {\n      filter: brightness(1.1);\n    }\n\n    .btn-pix:active {\n      transform: translateY(1px);\n      box-shadow: 0 1px 0 #064e3b !important;\n    }\n\n    /* MODAL DE EDIÇÃO */\n    .modal-overlay {\n      position: fixed;\n      inset: 0;\n      z-index: 1000;\n      background: var(--veu);\n      display: none;\n      align-items: center;\n      justify-content: center;\n      padding: 16px;\n    }\n\n    .modal-overlay.open {\n      display: flex;\n    }\n\n    .modal-caixa {\n      width: min(480px, 94vw);\n      background: linear-gradient(180deg,\n        var(--mad-esc) 0 12px,\n        var(--mad) 12px calc(100% - 16px),\n        var(--mad-quente) calc(100% - 16px) calc(100% - 8px),\n        var(--mad) calc(100% - 8px) 100%);\n      box-shadow:\n        inset 0 0 0 2px var(--mad-linha),\n        inset 0 0 0 4px var(--mad-luz),\n        inset 0 0 0 6px var(--mad),\n        0 6px 0 var(--mad-base),\n        0 24px 70px rgba(0, 0, 0, 0.85);\n      border-radius: 0px;\n      max-height: 90vh;\n      overflow-y: auto;\n      padding: 14px 16px;\n      display: flex;\n      flex-direction: column;\n      gap: 12px;\n    }\n\n    .modal-header {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      border-bottom: 2px solid var(--mad-linha);\n      padding-bottom: 6px;\n    }\n\n    .modal-title {\n      font-size: 13px;\n      text-transform: uppercase;\n      letter-spacing: 0.8px;\n      color: #fff;\n      text-shadow:\n        -2px -2px 0 var(--mad-base), 2px -2px 0 var(--mad-base),\n        -2px 2px 0 var(--mad-base), 2px 2px 0 var(--mad-base);\n    }\n\n    .modal-body {\n      display: flex;\n      flex-direction: column;\n      gap: 10px;\n    }\n\n    .modal-footer {\n      display: flex;\n      align-items: center;\n      justify-content: flex-end;\n      gap: 8px;\n      border-top: 2px solid var(--mad-linha);\n      padding-top: 8px;\n    }\n\n    /* NAVEGAÇÃO SUPERIOR DO COCKPIT */\n    .nav-bar-tabs {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      padding: 6px 14px 0 14px;\n      background: var(--vao);\n      border-bottom: 2px solid var(--mad-linha);\n      flex: none;\n    }\n\n    .tab-nav-btn {\n      height: 28px;\n      padding: 0 14px;\n      font-size: 10.5px;\n      letter-spacing: 0.5px;\n      text-transform: uppercase;\n      border-bottom-left-radius: 0;\n      border-bottom-right-radius: 0;\n      border-bottom: 0;\n      cursor: pointer;\n    }\n\n    .tab-nav-btn.on {\n      background: linear-gradient(180deg, var(--rx-luz) 0 4px, var(--rx) 4px calc(100% - 3px), var(--rx-rosa) calc(100% - 3px) 100%) !important;\n      color: #fff !important;\n      box-shadow: inset 0 0 0 2px var(--rx-borda), 0 -2px 0 var(--rx-luz) !important;\n    }\n\n    .btn-cancelar {\n      background: linear-gradient(180deg, #fca5a5 0 4px, #ef4444 4px calc(100% - 3px), #b91c1c calc(100% - 3px) 100%) !important;\n      color: #fff !important;\n      box-shadow: inset 0 0 0 2px #7f1d1d, 0 3px 0 #7f1d1d !important;\n    }\n\n    .btn-cancelar:hover {\n      filter: brightness(1.15);\n    }\n\n    .btn-cancelar:active {\n      transform: translateY(2px);\n      box-shadow: inset 0 0 0 2px #7f1d1d, 0 1px 0 #7f1d1d !important;\n    }\n\n    /* TELA DO MERCADO DA COMUNIDADE */\n    .market-view-container {\n      flex: 1;\n      display: flex;\n      flex-direction: column;\n      gap: 10px;\n      padding: 12px 14px;\n      min-height: 0;\n      overflow: hidden;\n    }\n\n    .market-subnav {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 8px;\n      flex: none;\n    }\n\n    .market-subnav-left {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n    }\n\n    .market-content-panel {\n      flex: 1;\n      min-height: 0;\n      display: flex;\n      flex-direction: column;\n      gap: 10px;\n      overflow: hidden;\n    }\n\n    .market-cards-grid {\n      flex: 1;\n      min-height: 0;\n      overflow-y: auto;\n      display: grid;\n      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));\n      gap: 10px;\n      padding: 4px 6px 12px 2px;\n      align-content: start;\n    }\n\n    .catalog-section-title {\n      grid-column: 1 / -1;\n      background: var(--vao);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 2px 0 var(--mad-base);\n      padding: 6px 10px;\n      font-size: 10px;\n      color: var(--ouro);\n      text-transform: uppercase;\n      letter-spacing: 0.8px;\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      margin-top: 6px;\n    }\n\n    .catalog-section-title:first-child {\n      margin-top: 0;\n    }\n\n    .my-listing-card {\n      background: var(--mad);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), inset 0 0 0 4px var(--mad-luz), 0 3px 0 var(--mad-base);\n      padding: 10px;\n      display: flex;\n      flex-direction: column;\n      gap: 8px;\n      border-radius: 0px;\n    }\n\n    .community-item-card {\n      background: var(--mad);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), inset 0 0 0 4px var(--mad-luz), 0 3px 0 var(--mad-base);\n      padding: 10px;\n      display: flex;\n      flex-direction: column;\n      gap: 8px;\n      border-radius: 0px;\n      transition: filter 0.1s;\n    }\n\n    .community-item-card:hover {\n      filter: brightness(1.06);\n    }\n\n    /* =================================================== */\n    /* ESTILOS DA ABA 3: ESTATÍSTICAS DE FARM AO VIVO      */\n    /* =================================================== */\n    .stats-view-container {\n      flex: 1;\n      display: flex;\n      flex-direction: column;\n      gap: 10px;\n      padding: 12px 14px;\n      min-height: 0;\n      overflow: hidden;\n    }\n\n    .stats-header-bar {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 10px;\n      background: var(--vao);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), 0 2px 0 var(--mad-base);\n      padding: 6px 12px;\n      border-radius: 0px;\n      flex: none;\n    }\n\n    .stats-live-badge {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      font-size: 10px;\n      font-weight: 800;\n      color: var(--verde-luz);\n      letter-spacing: 0.6px;\n      text-transform: uppercase;\n    }\n\n    .live-dot {\n      width: 7px;\n      height: 7px;\n      background: var(--verde-luz);\n      box-shadow: 0 0 6px var(--verde-luz);\n      border-radius: 0px;\n      animation: pulse-live 1.6s infinite;\n    }\n\n    @keyframes pulse-live {\n      0%, 100% { opacity: 1; }\n      50% { opacity: 0.35; }\n    }\n\n    .stats-timer-label {\n      font-family: var(--fonte-mono, monospace);\n      font-size: 11px;\n      color: var(--ouro);\n      font-weight: 700;\n      background: rgba(0, 0, 0, 0.4);\n      padding: 2px 8px;\n      border-radius: 0px;\n      box-shadow: inset 0 0 0 1px var(--mad-linha);\n    }\n\n    .stats-summary-grid {\n      display: grid;\n      grid-template-columns: repeat(6, 1fr);\n      gap: 8px;\n      flex: none;\n    }\n\n    .stats-metric-card {\n      padding: 8px 10px;\n      display: flex;\n      flex-direction: column;\n      gap: 4px;\n      min-width: 0;\n      border-radius: 0px;\n    }\n\n    .stats-card-top {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 4px;\n    }\n\n    .stats-card-label {\n      font-size: 9px;\n      color: var(--sobre-mad-dim);\n      text-transform: uppercase;\n      font-weight: 700;\n      letter-spacing: 0.4px;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    .stats-card-icon {\n      font-size: 11px;\n      flex: none;\n    }\n\n    .stats-card-main-val {\n      font-size: 15px;\n      font-weight: 800;\n      color: #fff;\n      font-variant-numeric: tabular-nums;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    .stats-card-rate {\n      font-size: 9px;\n      color: var(--ouro-luz);\n      font-weight: 600;\n      font-variant-numeric: tabular-nums;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    .stats-lower-split {\n      flex: 1;\n      min-height: 0;\n      display: flex;\n      gap: 10px;\n      overflow: hidden;\n    }\n\n    .stats-drops-grid {\n      flex: 1;\n      min-height: 0;\n      overflow-y: auto;\n      display: grid;\n      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));\n      gap: 8px;\n      padding: 4px 6px 12px 2px;\n      align-content: start;\n    }\n\n    .stat-drop-card {\n      background: var(--mad);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), inset 0 0 0 4px var(--mad-luz), 0 2px 0 var(--mad-base);\n      padding: 6px 8px;\n      display: flex;\n      align-items: center;\n      gap: 8px;\n      border-radius: 0px;\n    }\n\n    .stat-drop-icon {\n      width: 24px;\n      height: 24px;\n      object-fit: contain;\n      image-rendering: pixelated;\n      flex-shrink: 0;\n    }\n\n    /* Estilos do Dashboard de Hunts */\n    .stat-active-hunt-banner {\n      background: rgba(0, 0, 0, 0.4);\n      box-shadow: inset 0 0 0 1px var(--mad-linha);\n      border-radius: 0px;\n    }\n\n    .stat-hunts-scroll {\n      scrollbar-width: thin;\n      scrollbar-color: var(--mad-luz) var(--mad);\n    }\n\n    .stat-hunt-card {\n      background: var(--mad);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), inset 0 0 0 4px var(--mad-luz), 0 2px 0 var(--mad-base);\n      padding: 8px 10px;\n      display: flex;\n      flex-direction: column;\n      gap: 6px;\n      border-radius: 0px;\n      transition: all 0.15s ease;\n    }\n\n    .stat-hunt-card.active-hunt-highlight {\n      box-shadow: inset 0 0 0 2px var(--verde-luz), inset 0 0 0 4px var(--mad-luz), 0 2px 0 var(--mad-base);\n      background: linear-gradient(180deg, rgba(20, 45, 30, 0.6) 0%, var(--mad) 100%);\n    }\n\n    .stat-hunt-card-header {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 8px;\n    }\n\n    .stat-hunt-badges-row {\n      display: flex;\n      align-items: center;\n      gap: 4px;\n      flex-wrap: wrap;\n    }\n\n    .stat-hunt-pill {\n      font-size: 8px;\n      font-weight: 800;\n      padding: 1px 5px;\n      border-radius: 0px;\n      text-transform: uppercase;\n      letter-spacing: 0.3px;\n    }\n\n    .stat-hunt-grid {\n      display: grid;\n      grid-template-columns: repeat(4, 1fr);\n      gap: 6px;\n      background: rgba(0, 0, 0, 0.3);\n      padding: 6px 8px;\n      box-shadow: inset 0 0 0 1px var(--mad-linha);\n    }\n\n    .stat-hunt-col {\n      display: flex;\n      flex-direction: column;\n      gap: 2px;\n      min-width: 0;\n    }\n\n    .stat-hunt-col-label {\n      font-size: 8px;\n      color: var(--sobre-mad-dim);\n      text-transform: uppercase;\n      font-weight: 700;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    .stat-hunt-col-val {\n      font-size: 11px;\n      font-weight: 800;\n      font-variant-numeric: tabular-nums;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    .stat-hunt-col-sub {\n      font-size: 8.5px;\n      color: var(--sobre-mad-dim);\n      font-variant-numeric: tabular-nums;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    /* =================================================== */\n    /* ESTILOS DA ABA 4: HUNTS, ROTAS DE UP & BOSSES       */\n    /* =================================================== */\n    .hunts-view-container {\n      flex: 1;\n      display: flex;\n      flex-direction: column;\n      gap: 8px;\n      padding: 10px 14px;\n      min-height: 0;\n      overflow: hidden;\n    }\n\n    .hunts-subnav {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 8px;\n      flex: none;\n    }\n\n    .hunts-cards-grid {\n      flex: 1;\n      min-height: 0;\n      overflow-y: auto;\n      display: grid;\n      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));\n      gap: 10px;\n      padding: 4px 6px 12px 2px;\n      align-content: start;\n    }\n\n    .hunt-card {\n      background: var(--mad);\n      box-shadow: inset 0 0 0 2px var(--mad-linha), inset 0 0 0 4px var(--mad-luz), 0 3px 0 var(--mad-base);\n      padding: 10px;\n      display: flex;\n      flex-direction: column;\n      gap: 8px;\n      border-radius: 0px;\n      transition: filter 0.1s;\n    }\n\n    .hunt-card:hover {\n      filter: brightness(1.06);\n    }\n\n    .hunt-card-top {\n      display: flex;\n      align-items: center;\n      gap: 10px;\n    }\n\n    .hunt-poke-sprite {\n      width: 48px;\n      height: 48px;\n      object-fit: contain;\n      image-rendering: pixelated;\n      flex-shrink: 0;\n      background: var(--vao);\n      box-shadow: inset 0 0 0 1px var(--mad-linha);\n      padding: 2px;\n      border-radius: 0px;\n    }\n\n    .hunt-poke-info {\n      flex: 1;\n      min-width: 0;\n      display: flex;\n      flex-direction: column;\n      gap: 2px;\n    }\n\n    .hunt-poke-name {\n      color: #fff;\n      font-weight: 800;\n      font-size: 12.5px;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n    }\n\n    .hunt-poke-meta {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      font-size: 9.5px;\n      color: var(--sobre-mad-dim);\n    }\n\n    .hunt-type-badge {\n      font-size: 8px;\n      padding: 1px 5px;\n      color: #fff;\n      font-weight: 800;\n      text-transform: uppercase;\n      border-radius: 0px;\n      letter-spacing: 0.3px;\n    }\n\n    .hunt-weak-row {\n      display: flex;\n      align-items: center;\n      gap: 4px;\n      flex-wrap: wrap;\n    }\n\n    .hunt-weak-chip-4x {\n      font-size: 8px;\n      padding: 1px 4px;\n      background: #dc2626;\n      color: #fff;\n      font-weight: 900;\n      border-radius: 0px;\n      letter-spacing: 0.3px;\n      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.3);\n    }\n\n    .hunt-weak-chip-2x {\n      font-size: 8px;\n      padding: 1px 4px;\n      background: #d97706;\n      color: #fff;\n      font-weight: 800;\n      border-radius: 0px;\n      letter-spacing: 0.3px;\n      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.3);\n    }\n\n    .hunt-yield-bar {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 6px;\n      background: var(--vao);\n      padding: 4px 8px;\n      border-radius: 0px;\n      font-size: 9.5px;\n      box-shadow: inset 0 0 0 1px var(--mad-linha);\n    }\n\n    .hunt-drops-container {\n      display: flex;\n      flex-direction: column;\n      gap: 3px;\n      background: rgba(0, 0, 0, 0.25);\n      padding: 5px 8px;\n      border-radius: 0px;\n      box-shadow: inset 0 0 0 1px var(--mad-linha);\n    }\n\n    .hunt-drop-row {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 6px;\n      font-size: 9px;\n      color: var(--sobre-mad);\n    }\n\n    .hunt-drop-chance {\n      font-weight: 700;\n      color: var(--ouro-luz);\n      font-variant-numeric: tabular-nums;\n    }\n\n    /* FOOTER BAR */\n    .footer-bar {\n      flex: none;\n      background: var(--vao);\n      box-shadow: inset 0 2px 0 var(--mad-linha);\n      padding: 6px 16px;\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      font-size: 10px;\n      color: var(--vao-dim);\n    }\n\n    /* =================================================== */\n    /* REGRAS RESPONSIVAS MULTI-RESOLUÇÃO & MULTI-ALTURA  */\n    /* =================================================== */\n\n    @media (max-width: 1280px) {\n      .cockpit-grid {\n        grid-template-columns: 330px 1fr 310px;\n        gap: 10px;\n        padding: 10px;\n      }\n      .top-bar {\n        padding: 6px 12px;\n        gap: 10px;\n      }\n      .telemetry-group {\n        gap: 8px;\n      }\n    }\n\n    @media (max-width: 1100px) {\n      .cockpit-grid {\n        grid-template-columns: 310px 1fr 280px;\n        gap: 8px;\n        padding: 8px;\n      }\n      .brand-title {\n        font-size: 14px;\n      }\n      .moeda-box {\n        padding: 3px 6px;\n        font-size: 10px;\n      }\n      .slot-pill {\n        padding: 3px 6px;\n        font-size: 9px;\n      }\n      .market-cards-grid {\n        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));\n      }\n      .stats-summary-grid {\n        grid-template-columns: repeat(3, 1fr);\n      }\n      .hunts-cards-grid {\n        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));\n      }\n    }\n\n    @media (max-width: 960px) {\n      body {\n        overflow-y: auto !important;\n        height: auto !important;\n        min-height: 100vh;\n      }\n      .top-bar {\n        flex-direction: column;\n        align-items: stretch;\n        gap: 8px;\n      }\n      .brand-group {\n        justify-content: space-between;\n      }\n      .telemetry-group {\n        justify-content: flex-start;\n        flex-wrap: wrap;\n      }\n      .stats-summary-grid {\n        grid-template-columns: repeat(2, 1fr);\n      }\n      .stats-lower-split {\n        flex-direction: column;\n        height: auto;\n      }\n      .stats-drops-grid, .hunts-cards-grid {\n        max-height: 480px;\n      }\n      .cockpit-grid {\n        display: flex;\n        flex-direction: column;\n        overflow: visible;\n        gap: 12px;\n        padding: 10px;\n      }\n      .cockpit-col-left {\n        overflow-y: visible;\n        max-height: none;\n      }\n      .cockpit-col-left > .quadro {\n        flex-shrink: 0;\n      }\n      .rules-container, .logs-container {\n        max-height: 380px;\n      }\n    }\n\n    /* TELAS DE BAIXA ALTURA (NOTEBOOKS 720p/768p OU COM ZOOM/DPI DO WINDOWS) */\n    @media (max-height: 780px) {\n      .top-bar {\n        padding: 4px 10px;\n        gap: 8px;\n      }\n      .brand-title {\n        font-size: 13.5px;\n      }\n      .nav-bar-tabs {\n        padding: 3px 10px 0 10px;\n      }\n      .tab-nav-btn {\n        height: 24px;\n        font-size: 9.5px;\n        padding: 0 10px;\n      }\n      .cockpit-grid {\n        padding: 8px;\n        gap: 8px;\n      }\n      .quadro {\n        padding: 8px 10px;\n        gap: 6px;\n      }\n      .quadro-header {\n        padding-bottom: 4px;\n      }\n      .campo {\n        height: 24px;\n        font-size: 10.5px;\n      }\n      .chips-row .chip-btn {\n        height: 20px;\n        font-size: 8px;\n        padding: 0 5px;\n      }\n      .footer-bar {\n        padding: 3px 10px;\n        font-size: 9px;\n      }\n    }\n\n    @media (max-height: 680px) {\n      .top-bar {\n        padding: 3px 8px;\n      }\n      .brand-title {\n        font-size: 12px;\n      }\n      .nav-bar-tabs {\n        padding: 2px 8px 0 8px;\n      }\n      .cockpit-grid {\n        padding: 6px;\n        gap: 6px;\n      }\n      .quadro {\n        padding: 6px 8px;\n        gap: 5px;\n      }\n      .rules-container, .logs-container {\n        gap: 4px;\n      }\n    }\n  </style>\n</head>\n\n<body>\n\n  <!-- TOP BAR DE TELEMETRIA -->\n  <header class=\"top-bar\">\n    <div class=\"brand-group\">\n      <h1 class=\"brand-title\">PokéIdle Auto-Sniper</h1>\n      <button type=\"button\" id=\"btn-open-pix\" class=\"btn btn-pix\" style=\"height: 24px; padding: 0 8px; font-size: 9.5px; margin-left: 6px; border-radius: 0px;\" title=\"Me pague um café\">\n        Me pague um café\n      </button>\n    </div>\n\n    <div class=\"telemetry-group\">\n      <div class=\"moeda-box\">\n        <span class=\"moeda-label\">Coins:</span>\n        <strong id=\"val-coins\" class=\"moeda-valor-coins\">-- GP</strong>\n      </div>\n      <div class=\"moeda-box\">\n        <span class=\"moeda-label\">Gemas:</span>\n        <strong id=\"val-gemas\" class=\"moeda-valor-gemas\">-- Gemas</strong>\n      </div>\n      <div class=\"moeda-box\">\n        <img src=\"https://pokeidle.io/img/moeda-diamante.png\" style=\"width: 14px; height: 14px; object-fit: contain; flex-shrink: 0;\" alt=\"Diamantes\">\n        <span class=\"moeda-label\" style=\"color: #9fe4ff;\">Diamantes:</span>\n        <strong id=\"val-diamantes\" class=\"moeda-valor-diamantes\" style=\"color: #9fe4ff;\">-- Diamantes</strong>\n      </div>\n      <button type=\"button\" id=\"btn-open-diamantes-modal\" class=\"btn btn-roxo btn-mini\" style=\"height: 24px; padding: 0 8px; font-size: 9.5px; border-radius: 0px;\" title=\"Câmbio e Negociação de Diamantes\">\n        💎 Diamantes\n      </button>\n      <div class=\"slot-pill\" id=\"val-slots\">0 / 5 SLOTS ATIVOS</div>\n      <div id=\"badge-vip-status\" class=\"selo-vip\" style=\"display: none; padding: 2px 7px; font-size: 8.5px; letter-spacing: 0.6px; text-transform: uppercase; box-shadow: 0 0 6px rgba(47, 143, 196, 0.5);\">\n        👑 VIP POKÉIDLE\n      </div>\n      <div class=\"master-switch-box\">\n        <span class=\"master-switch-title\">Auto-Snipe:</span>\n        <input type=\"checkbox\" id=\"toggle-master-sniper\" checked title=\"Ativar ou desativar Auto-Snipe\">\n      </div>\n    </div>\n  </header>\n\n  <!-- BARRA DE NAVEGAÇÃO PRINCIPAL -->\n  <nav class=\"nav-bar-tabs\">\n    <button type=\"button\" id=\"tab-nav-sniper\" class=\"btn tab-nav-btn on\">\n      🎯 Painel Sniper\n    </button>\n    <button type=\"button\" id=\"tab-nav-market\" class=\"btn tab-nav-btn apagado\">\n      🛒 Mercado da Comunidade\n    </button>\n    <button type=\"button\" id=\"tab-nav-stats\" class=\"btn tab-nav-btn apagado\">\n      📊 Estatísticas de Farm\n    </button>\n    <button type=\"button\" id=\"tab-nav-hunts\" class=\"btn tab-nav-btn apagado\">\n      🗺️ Hunts & Rotas\n    </button>\n    <button type=\"button\" id=\"tab-nav-oferendas\" class=\"btn tab-nav-btn apagado\">\n      🔮 Altar de Oferendas\n    </button>\n  </nav>\n\n  <!-- ÁREA PRINCIPAL: 3 COLUNAS -->\n  <main class=\"cockpit-grid\" id=\"view-sniper\">\n\n    <!-- COLUNA 1: CADASTRO DE REGRAS & RADAR GLOBAL -->\n    <div class=\"cockpit-col-left\">\n\n      <!-- Quadro 1: Cadastrar Regra de Item -->\n      <section class=\"quadro\">\n        <div class=\"quadro-header\">\n          <div>\n            <h2 class=\"quadro-titulo\">Nova Regra de Compra</h2>\n            <span class=\"quadro-sub\">Selecione o item ou digite o nome</span>\n          </div>\n        </div>\n\n        <!-- Filtros Rápidos de Categoria (Ordem Solicitada) -->\n        <div class=\"chips-row\">\n          <button type=\"button\" class=\"btn chip-btn on\" data-cat=\"all\">Todas</button>\n          <button type=\"button\" class=\"btn chip-btn apagado\" data-cat=\"stone\">Pedras</button>\n          <button type=\"button\" class=\"btn chip-btn apagado\" data-cat=\"tm\">TMs</button>\n          <button type=\"button\" class=\"btn chip-btn apagado\" data-cat=\"rare_loot\">Loots Raros</button>\n          <button type=\"button\" class=\"btn chip-btn apagado\" data-cat=\"beast\">Beast Balls</button>\n          <button type=\"button\" class=\"btn chip-btn apagado\" data-cat=\"casa\">Casas</button>\n          <button type=\"button\" class=\"btn chip-btn apagado\" data-cat=\"box\">Boxes</button>\n          <button type=\"button\" class=\"btn chip-btn apagado\" data-cat=\"bicicleta\">Bicicletas</button>\n        </div>\n\n        <!-- Campo de Busca com Autocomplete -->\n        <div class=\"form-group sug-box\">\n          <label class=\"form-label\" for=\"input-search-item\">Buscar Item / Pokémon:</label>\n          <input type=\"text\" id=\"input-search-item\" class=\"campo\" placeholder=\"Ex: Fire Stone, TM AoE, Founder Box, Beast Ball...\" autocomplete=\"off\">\n          <div id=\"dropdown-suggestions\" class=\"sug-list vao\" style=\"display: none;\"></div>\n        </div>\n\n        <!-- Card de Item Selecionado -->\n        <div id=\"box-selected-preview\" class=\"vao preview-box\" style=\"display: none;\">\n          <img id=\"img-selected-item\" class=\"preview-img\" src=\"\" alt=\"Icone\">\n          <div class=\"preview-info\">\n            <div id=\"lbl-selected-name\" class=\"preview-name\">Nome do Item</div>\n            <div id=\"lbl-selected-cat\" class=\"preview-cat\">Categoria</div>\n          </div>\n          <button type=\"button\" id=\"btn-clear-selection\" class=\"btn apagado btn-mini\" title=\"Limpar seleção\">Limpar</button>\n        </div>\n\n        <!-- Preço Teto em Coins e Gemas -->\n        <div style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 8px;\">\n          <div class=\"form-group\" id=\"group-rule-coins\">\n            <label class=\"form-label\" for=\"input-rule-coins\">Teto em Coins (GP):</label>\n            <input type=\"number\" id=\"input-rule-coins\" class=\"campo\" placeholder=\"Ex: 100000 (ou 0)\" min=\"0\" style=\"height: 26px; font-size: 11px;\">\n          </div>\n          <div class=\"form-group\" id=\"group-rule-gemas\">\n            <label class=\"form-label\" for=\"input-rule-gemas\">Teto em Gemas:</label>\n            <input type=\"number\" id=\"input-rule-gemas\" class=\"campo\" placeholder=\"Ex: 10 (ou 0)\" min=\"0\" style=\"height: 26px; font-size: 11px;\">\n          </div>\n        </div>\n\n        <div class=\"form-group\">\n          <div style=\"display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;\">\n            <label class=\"form-label\" for=\"input-rule-qty\" id=\"lbl-input-qty-title\" style=\"margin-bottom: 0;\">Quantidade Máxima (Máx 20 un):</label>\n            <button type=\"button\" id=\"btn-toggle-infinite-new\" class=\"btn apagado btn-mini\" style=\"font-size: 8px; padding: 1px 6px; height: 18px; border-radius: 0px;\" title=\"Alternar para compra infinita\">\n              ∞ Infinito\n            </button>\n          </div>\n          <input type=\"number\" id=\"input-rule-qty\" class=\"campo\" value=\"1\" min=\"1\" max=\"20\" placeholder=\"1 a 20\" style=\"height: 26px; font-size: 11px;\">\n        </div>\n\n        <button type=\"button\" id=\"btn-add-rule\" class=\"btn btn-roxo\" style=\"width: 100%; height: 32px; flex-shrink: 0; margin-top: 4px;\">\n          Cadastrar Regra de Compra\n        </button>\n      </section>\n\n      <!-- Quadro 2: Radar Global de Pokémons -->\n      <section class=\"quadro\">\n        <div class=\"quadro-header\">\n          <div>\n            <h2 class=\"quadro-titulo\">Radar Global de Pokémon</h2>\n            <span class=\"quadro-sub\">1 Slot por cada Auto-Snipe Ativo</span>\n          </div>\n          <span id=\"lbl-radar-slot-badge\" class=\"badge-slot\" style=\"font-size: 8px; padding: 2px 6px; background: rgba(0,0,0,0.3); border-radius: 0px;\">\n            0 / 3 Slots Usados\n          </span>\n        </div>\n\n        <!-- Qualquer Shiny -->\n        <div class=\"vao\" style=\"padding: 6px 8px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 4px;\">\n          <div style=\"display: flex; align-items: center; justify-content: space-between;\">\n            <label for=\"chk-global-shiny\" style=\"display: flex; align-items: center; gap: 6px; cursor: pointer;\">\n              <input type=\"checkbox\" id=\"chk-global-shiny\">\n              <span style=\"font-size: 10.5px; font-weight: 700; color: #fff;\">Auto-Snipe Qualquer Shiny</span>\n            </label>\n            <span class=\"badge-slot\" style=\"font-size: 7.5px; color: var(--ouro); background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 0px;\">\n              1 Slot\n            </span>\n          </div>\n          <div style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 2px;\">\n            <div>\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); display: block; margin-bottom: 2px; text-transform: uppercase;\">Teto em Coins:</span>\n              <input type=\"number\" id=\"cfg-shiny-coins\" class=\"campo\" placeholder=\"Ex: 500000\" title=\"Preço Máximo em Coins\" style=\"height: 24px; font-size: 9.5px; width: 100%;\">\n            </div>\n            <div>\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); display: block; margin-bottom: 2px; text-transform: uppercase;\">Teto em Gemas:</span>\n              <input type=\"number\" id=\"cfg-shiny-gemas\" class=\"campo\" placeholder=\"Ex: 50\" title=\"Preço Máximo em Gemas\" style=\"height: 24px; font-size: 9.5px; width: 100%;\">\n            </div>\n          </div>\n        </div>\n\n        <!-- Qualquer P5 -->\n        <div class=\"vao\" style=\"padding: 6px 8px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 4px;\">\n          <div style=\"display: flex; align-items: center; justify-content: space-between;\">\n            <label for=\"chk-global-p5\" style=\"display: flex; align-items: center; gap: 6px; cursor: pointer;\">\n              <input type=\"checkbox\" id=\"chk-global-p5\">\n              <span style=\"font-size: 10.5px; font-weight: 700; color: #fff;\">Auto-Snipe Qualquer P5 (Potência 5)</span>\n            </label>\n            <span class=\"badge-slot\" style=\"font-size: 7.5px; color: #38bdf8; background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 0px;\">\n              1 Slot\n            </span>\n          </div>\n          <div style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 2px;\">\n            <div>\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); display: block; margin-bottom: 2px; text-transform: uppercase;\">Teto em Coins:</span>\n              <input type=\"number\" id=\"cfg-p5-coins\" class=\"campo\" placeholder=\"Ex: 300000\" title=\"Preço Máximo em Coins\" style=\"height: 24px; font-size: 9.5px; width: 100%;\">\n            </div>\n            <div>\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); display: block; margin-bottom: 2px; text-transform: uppercase;\">Teto em Gemas:</span>\n              <input type=\"number\" id=\"cfg-p5-gemas\" class=\"campo\" placeholder=\"Ex: 30\" title=\"Preço Máximo em Gemas\" style=\"height: 24px; font-size: 9.5px; width: 100%;\">\n            </div>\n          </div>\n        </div>\n\n        <!-- Nota Mínima -->\n        <div class=\"vao\" style=\"padding: 6px 8px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 4px;\">\n          <div style=\"display: flex; align-items: center; justify-content: space-between;\">\n            <label for=\"chk-global-note\" style=\"display: flex; align-items: center; gap: 6px; cursor: pointer;\">\n              <input type=\"checkbox\" id=\"chk-global-note\">\n              <span style=\"font-size: 10.5px; font-weight: 700; color: #fff;\">Auto-Snipe por Nota Mínima</span>\n            </label>\n            <span class=\"badge-slot\" style=\"font-size: 7.5px; color: #c084fc; background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 0px;\">\n              1 Slot\n            </span>\n          </div>\n          <div style=\"display: grid; grid-template-columns: 0.9fr 1.1fr 1fr; gap: 4px; margin-top: 2px;\">\n            <div>\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); display: block; margin-bottom: 2px; text-transform: uppercase;\">Nota Corte:</span>\n              <input type=\"number\" id=\"cfg-note-val\" class=\"campo\" placeholder=\"7.0\" step=\"0.1\" min=\"1\" max=\"10\" title=\"Nota de corte oficial\" style=\"height: 24px; font-size: 9.5px; width: 100%;\">\n            </div>\n            <div>\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); display: block; margin-bottom: 2px; text-transform: uppercase;\">Teto Coins:</span>\n              <input type=\"number\" id=\"cfg-note-coins\" class=\"campo\" placeholder=\"Ex: 250000\" title=\"Preço Máximo em Coins\" style=\"height: 24px; font-size: 9.5px; width: 100%;\">\n            </div>\n            <div>\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); display: block; margin-bottom: 2px; text-transform: uppercase;\">Teto Gemas:</span>\n              <input type=\"number\" id=\"cfg-note-gemas\" class=\"campo\" placeholder=\"Ex: 25\" title=\"Preço Máximo em Gemas\" style=\"height: 24px; font-size: 9.5px; width: 100%;\">\n            </div>\n          </div>\n        </div>\n\n        <!-- Informativo de Slot e Calibração Nativa -->\n        <div class=\"vao\" style=\"padding: 6px 8px; font-size: 8.5px; color: var(--sobre-mad-dim); display: flex; align-items: center; justify-content: space-between;\">\n          <span>Consumo do Radar:</span>\n          <b id=\"lbl-radar-slot-status\" style=\"color: var(--ouro);\">Inativo (0 slots)</b>\n        </div>\n      </section>\n\n    </div>\n\n    <!-- COLUNA 2: LISTA DE REGRAS ATIVAS & PROGRESSO -->\n    <section class=\"quadro\" style=\"min-height: 0;\">\n      <div class=\"quadro-header\">\n        <div>\n          <h2 class=\"quadro-titulo\">Regras de Compra Ativas</h2>\n          <span class=\"quadro-sub\" id=\"lbl-rules-count\">0 de 5 slots utilizados</span>\n        </div>\n        <div class=\"brand-badge\">Proteção de Saldo</div>\n      </div>\n\n      <!-- Feed de Regras -->\n      <div id=\"container-rules-list\" class=\"rules-container\">\n        <div style=\"text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);\">\n          Nenhuma regra cadastrada. Cadastre até 5 regras no painel à esquerda.\n        </div>\n      </div>\n    </section>\n\n    <!-- COLUNA 3: TERMINAL DE LOGS & HISTÓRICO AO VIVO -->\n    <section class=\"quadro\" style=\"min-height: 0;\">\n      <div class=\"quadro-header\">\n        <div>\n          <h2 class=\"quadro-titulo\">Feed de Eventos</h2>\n          <span class=\"quadro-sub\">Histórico de ofertas e disparos</span>\n        </div>\n        <button type=\"button\" id=\"btn-clear-logs\" class=\"btn apagado btn-mini\">Limpar</button>\n      </div>\n\n      <!-- Container do Feed -->\n      <div id=\"container-logs-list\" class=\"vao logs-container\">\n        <div style=\"text-align: center; padding: 30px 10px; color: var(--vao-dim); font-size: 10px;\">\n          Aguardando anúncios do mercado...\n        </div>\n      </div>\n    </section>\n\n  </main>\n\n  <!-- TELA 2: MERCADO DA COMUNIDADE & MEUS ANÚNCIOS -->\n  <section class=\"market-view-container\" id=\"view-market\" style=\"display: none;\">\n    <!-- SUB-NAVEGAÇÃO DO MERCADO -->\n    <div class=\"market-subnav\">\n      <div class=\"market-subnav-left\">\n        <button type=\"button\" id=\"subtab-my-listings\" class=\"btn chip-btn on\">\n          💼 Meus Anúncios à Venda\n        </button>\n        <button type=\"button\" id=\"subtab-community-items\" class=\"btn chip-btn apagado\">\n          📦 Catálogo da Comunidade\n        </button>\n      </div>\n\n      <div style=\"display: flex; align-items: center; gap: 8px;\">\n        <button type=\"button\" id=\"btn-refresh-market\" class=\"btn btn-roxo btn-mini\" style=\"height: 26px; padding: 0 10px;\" title=\"Atualizar dados do mercado agora\">\n          🔄 Atualizar Dados\n        </button>\n      </div>\n    </div>\n\n    <!-- PAINEL A: MEUS ANÚNCIOS (O QUE O JOGADOR BOTOU PRA VENDER) -->\n    <div id=\"panel-my-listings\" class=\"market-content-panel\">\n      <div class=\"quadro\" style=\"flex: 1; min-height: 0;\">\n        <div class=\"quadro-header\">\n          <div>\n            <h2 class=\"quadro-titulo\">Meus Anúncios à Venda</h2>\n            <span class=\"quadro-sub\">O que você colocou à venda no mercado da comunidade</span>\n          </div>\n          <div id=\"lbl-my-listings-summary\" class=\"brand-badge\">\n            0 anúncios ativos\n          </div>\n        </div>\n\n        <!-- Grid de Anúncios do Jogador -->\n        <div id=\"container-my-listings-list\" class=\"market-cards-grid\">\n          <div style=\"grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);\">\n            Carregando seus anúncios à venda...\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- PAINEL B: CATÁLOGO DE ITENS DA COMUNIDADE -->\n    <div id=\"panel-community-items\" class=\"market-content-panel\" style=\"display: none;\">\n      <div class=\"quadro\" style=\"flex: 1; min-height: 0;\">\n        <div class=\"quadro-header\">\n          <div>\n            <h2 class=\"quadro-titulo\">Catálogo da Comunidade</h2>\n            <span class=\"quadro-sub\">Visão organizada com menores preços em Coins e Gemas</span>\n          </div>\n          <div class=\"search-box\" style=\"width: min(220px, 100%);\">\n            <input type=\"text\" id=\"input-search-market\" class=\"campo\" placeholder=\"Filtrar item anunciado...\" style=\"height: 24px; font-size: 10px;\">\n          </div>\n        </div>\n\n        <!-- Chips de Categoria -->\n        <div class=\"chips-row\" style=\"margin-bottom: 6px; flex-wrap: wrap;\">\n          <button type=\"button\" class=\"btn chip-btn on market-cat-btn\" data-cat=\"all\">Todas</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"diamante\">💎 Diamantes</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"stone\">Pedras</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"tm\">TMs</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"rare_loot\">Loots Raros</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"box\">Boxes</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"beast\">Beast Balls</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"casa\">Casas</button>\n          <button type=\"button\" class=\"btn chip-btn apagado market-cat-btn\" data-cat=\"bicicleta\">Bicicletas</button>\n        </div>\n\n        <!-- Grid de Itens Anunciados -->\n        <div id=\"container-community-items-list\" class=\"market-cards-grid\">\n          <div style=\"grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);\">\n            Aguardando dados do mercado da comunidade...\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <!-- ========================================================================= -->\n  <!-- TELA 3: ESTATÍSTICAS DE FARM AO VIVO                                       -->\n  <!-- ========================================================================= -->\n  <section id=\"view-stats\" class=\"stats-view-container\" style=\"display: none;\">\n    <!-- Sub-Header com Status da Sessão e Botão Reset -->\n    <div class=\"stats-header-bar\">\n      <div style=\"display: flex; align-items: center; gap: 10px;\">\n        <div class=\"stats-live-badge\">\n          <span class=\"live-dot\"></span> TELEMETRIA DA SESSÃO AO VIVO\n        </div>\n        <span id=\"stats-session-timer\" class=\"stats-timer-label\">00:00:00</span>\n      </div>\n      <div style=\"display: flex; align-items: center; gap: 8px;\">\n        <button type=\"button\" id=\"btn-reset-farm-stats\" class=\"btn btn-cancelar btn-mini\" style=\"height: 26px; padding: 0 10px; font-size: 9.5px; border-radius: 0px;\" title=\"Zerar todos os contadores da sessão atual\">\n          🔄 Zerar Sessão\n        </button>\n      </div>\n    </div>\n\n    <!-- Grid de Métricas Principais -->\n    <div class=\"stats-summary-grid\">\n      <!-- Card: Kills -->\n      <div class=\"quadro stats-metric-card\">\n        <div class=\"stats-card-top\">\n          <span class=\"stats-card-label\">Abates (Kills)</span>\n          <span class=\"stats-card-icon\">⚔️</span>\n        </div>\n        <div class=\"stats-card-main-val\" id=\"stat-kills-total\">0</div>\n        <div class=\"stats-card-rate\" id=\"stat-kills-rate\">0.0 / min</div>\n      </div>\n\n      <!-- Card: Capturas -->\n      <div class=\"quadro stats-metric-card\">\n        <div class=\"stats-card-top\">\n          <span class=\"stats-card-label\">Capturas</span>\n          <span class=\"stats-card-icon\">🎯</span>\n        </div>\n        <div class=\"stats-card-main-val\" id=\"stat-catches-total\">0</div>\n        <div class=\"stats-card-rate\" id=\"stat-catches-rate\">0 / h</div>\n      </div>\n\n      <!-- Card: Treinador XP -->\n      <div class=\"quadro stats-metric-card\">\n        <div class=\"stats-card-top\">\n          <span class=\"stats-card-label\">XP Treinador</span>\n          <span class=\"stats-card-icon\">📈</span>\n        </div>\n        <div class=\"stats-card-main-val\" id=\"stat-trainer-xp\" style=\"color: #9fe4ff;\">0</div>\n        <div class=\"stats-card-rate\" id=\"stat-trainer-xp-rate\">0 XP / h</div>\n      </div>\n\n      <!-- Card: Pokémon XP -->\n      <div class=\"quadro stats-metric-card\">\n        <div class=\"stats-card-top\">\n          <span class=\"stats-card-label\">XP Pokémon</span>\n          <span class=\"stats-card-icon\">🐾</span>\n        </div>\n        <div class=\"stats-card-main-val\" id=\"stat-poke-xp\" style=\"color: #c084fc;\">0</div>\n        <div class=\"stats-card-rate\" id=\"stat-poke-xp-rate\">0 XP / h</div>\n      </div>\n\n      <!-- Card: Coins (GP) -->\n      <div class=\"quadro stats-metric-card\">\n        <div class=\"stats-card-top\">\n          <span class=\"stats-card-label\">Coins (GP)</span>\n          <span class=\"stats-card-icon\">🪙</span>\n        </div>\n        <div class=\"stats-card-main-val\" id=\"stat-gold-total\" style=\"color: var(--coins);\">0 GP</div>\n        <div class=\"stats-card-rate\" id=\"stat-gold-rate\">0 GP / h</div>\n      </div>\n\n      <!-- Card: Shinies -->\n      <div class=\"quadro stats-metric-card\">\n        <div class=\"stats-card-top\">\n          <span class=\"stats-card-label\">Shinies</span>\n          <span class=\"stats-card-icon\">✨</span>\n        </div>\n        <div class=\"stats-card-main-val\" id=\"stat-shinies-total\" style=\"color: #ffd700;\">0</div>\n        <div class=\"stats-card-rate\" id=\"stat-shinies-sub\">0 Capturados</div>\n      </div>\n    </div>\n\n    <!-- Área Inferior Dividida: Dashboard de Rendimento por Hunt + Drops Acumulados -->\n    <div class=\"stats-lower-split\">\n      <!-- Painel Esquerdo: Dashboard de Rendimento por Hunt -->\n      <div class=\"quadro\" style=\"flex: 1.4; display: flex; flex-direction: column; min-height: 0; min-width: 0;\">\n        <div class=\"quadro-header\" style=\"flex-wrap: wrap; gap: 8px;\">\n          <div>\n            <h2 class=\"quadro-titulo\">🏆 Rendimento por Hunt (Médias & Ranking)</h2>\n            <span class=\"quadro-sub\">Eficiência comparativa de XP/h, GP/h e Taxa de Captura</span>\n          </div>\n          <div style=\"display: flex; align-items: center; gap: 6px;\">\n            <div class=\"brand-badge\" id=\"stat-hunts-count\" style=\"color: var(--ouro);\">0 hunts</div>\n            <button type=\"button\" id=\"btn-reset-hunts-stats\" class=\"btn btn-cancelar btn-mini\" style=\"height: 22px; padding: 0 8px; font-size: 8.5px; border-radius: 0px;\" title=\"Limpar histórico de hunts salvas\">\n              🗑️ Limpar\n            </button>\n          </div>\n        </div>\n\n        <!-- Banner de Hunt Ativa em Tempo Real -->\n        <div id=\"bar-active-hunt\" class=\"stat-active-hunt-banner\" style=\"display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; background: rgba(0, 0, 0, 0.4); border-bottom: 1px solid var(--mad-linha);\">\n          <div style=\"display: flex; align-items: center; gap: 8px; min-width: 0;\">\n            <span class=\"live-dot\" style=\"width: 6px; height: 6px;\"></span>\n            <span style=\"font-size: 10px; color: var(--sobre-mad-dim); text-transform: uppercase; font-weight: 700;\">Hunt Atual:</span>\n            <span id=\"active-hunt-name\" style=\"font-size: 11px; color: #fff; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\">Aguardando batalha...</span>\n            <span id=\"active-hunt-tier-badge\" class=\"badge-tier\" style=\"display: none; font-size: 8.5px; padding: 1px 5px; border-radius: 0px; background: var(--roxo); color: #fff; font-weight: 800;\">T1</span>\n          </div>\n          <div style=\"display: flex; align-items: center; gap: 10px; font-family: var(--fonte-mono, monospace); font-size: 10px; flex-shrink: 0;\">\n            <span style=\"color: var(--ouro);\" id=\"active-hunt-timer\">⏱️ 00:00</span>\n            <span style=\"color: #c084fc;\" id=\"active-hunt-live-xp\">🐾 0 XP/h</span>\n            <span style=\"color: var(--coins);\" id=\"active-hunt-live-gp\">🪙 0 GP/h</span>\n            <span style=\"color: var(--verde-luz);\" id=\"active-hunt-live-catches\">🎯 0 capturas</span>\n            <span style=\"color: #ffd700;\" id=\"active-hunt-live-shinies\">✨ 0 vistos (0 capt.)</span>\n          </div>\n        </div>\n\n        <!-- Filtros de Ordenação do Ranking -->\n        <div style=\"display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: var(--vao); border-bottom: 1px solid var(--mad-linha); flex-wrap: wrap;\">\n          <span style=\"font-size: 8.5px; color: var(--sobre-mad-dim); font-weight: 700; text-transform: uppercase; margin-right: 4px;\">Ordenar:</span>\n          <button type=\"button\" class=\"btn chip-btn on hunt-sort-btn\" data-sort=\"xp\" style=\"height: 20px; padding: 0 8px; font-size: 9px; border-radius: 0px;\">🐾 Top XP/h</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-sort-btn\" data-sort=\"gp\" style=\"height: 20px; padding: 0 8px; font-size: 9px; border-radius: 0px;\">🪙 Top GP/h</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-sort-btn\" data-sort=\"kills\" style=\"height: 20px; padding: 0 8px; font-size: 9px; border-radius: 0px;\">⚔️ Top Kills/h</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-sort-btn\" data-sort=\"catch\" style=\"height: 20px; padding: 0 8px; font-size: 9px; border-radius: 0px;\">🎯 Taxa Captura %</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-sort-btn\" data-sort=\"shinies\" style=\"height: 20px; padding: 0 8px; font-size: 9px; border-radius: 0px;\">✨ Mais Shinies</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-sort-btn\" data-sort=\"time\" style=\"height: 20px; padding: 0 8px; font-size: 9px; border-radius: 0px;\">⏱️ Mais Farmadas</button>\n        </div>\n\n        <!-- Lista de Cards Comparativos de Hunts -->\n        <div id=\"container-hunts-dashboard\" class=\"stats-hunts-scroll\" style=\"flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px;\">\n          <div style=\"text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim); font-size: 11px;\">\n            Nenhuma hunt registrada nesta sessão ainda.<br>\n            <span style=\"font-size: 9px; opacity: 0.8;\">Inicie batalhas em qualquer hunt do PokéIdle para ver as médias de XP/h, GP/h e capturas.</span>\n          </div>\n        </div>\n      </div>\n\n      <!-- Painel Direito: Drops Acumulados -->\n      <div class=\"quadro\" style=\"flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0;\">\n        <div class=\"quadro-header\">\n          <div>\n            <h2 class=\"quadro-titulo\">Drops & Loots da Sessão</h2>\n            <span class=\"quadro-sub\">Itens dropados durante suas batalhas e hunts</span>\n          </div>\n          <div class=\"brand-badge\" id=\"stat-drops-count\">0 tipos de itens</div>\n        </div>\n        <div class=\"stats-drops-grid\" id=\"container-farm-drops\">\n          <div style=\"grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);\">\n            Nenhum drop registrado nesta sessão ainda.<br>\n            <span style=\"font-size: 9px; opacity: 0.8;\">Bata em monstros no jogo para acumular loots.</span>\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <!-- ========================================================================= -->\n  <!-- TELA 4: HUNTS, ROTAS DE UP & BOSSES                                        -->\n  <!-- ========================================================================= -->\n  <section id=\"view-hunts\" class=\"hunts-view-container\" style=\"display: none;\">\n    <!-- Sub-Navegação: Hunts vs Bosses -->\n    <div class=\"hunts-subnav\">\n      <div style=\"display: flex; align-items: center; gap: 6px; flex-wrap: wrap;\">\n        <button type=\"button\" id=\"subtab-hunts-list\" class=\"btn chip-btn on\" style=\"height: 26px; padding: 0 12px; font-size: 10px; border-radius: 0px;\">\n          🗺️ Criaturas & Hunts\n        </button>\n        <button type=\"button\" id=\"subtab-bosses-list\" class=\"btn chip-btn apagado\" style=\"height: 26px; padding: 0 12px; font-size: 10px; border-radius: 0px;\">\n          ⚔️ Chefes & Bosses Diários\n        </button>\n      </div>\n      <div style=\"display: flex; align-items: center; gap: 8px;\">\n        <div class=\"search-box\" style=\"width: min(240px, 100%);\">\n          <input type=\"text\" id=\"input-search-hunts\" class=\"campo\" placeholder=\"Buscar Pokémon, Drop ou Mapa...\" style=\"height: 24px; font-size: 10px; border-radius: 0px;\">\n        </div>\n      </div>\n    </div>\n\n    <!-- Filtros de Nível e Fraquezas Elementais (Usados na Aba Hunts) -->\n    <div id=\"box-hunts-filters\" class=\"vao\" style=\"padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; border-radius: 0px;\">\n      <!-- Filtro por Faixa de Nível -->\n      <div style=\"display: flex; align-items: center; gap: 8px; flex-wrap: wrap;\">\n        <span style=\"font-size: 9px; color: var(--sobre-mad-dim); text-transform: uppercase; font-weight: 700; width: 65px;\">Nível:</span>\n        <div class=\"chips-row\" style=\"flex: 1; flex-wrap: wrap; gap: 4px;\">\n          <button type=\"button\" class=\"btn chip-btn on hunt-lvl-filter\" data-lvl=\"all\">Todos</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-lvl-filter\" data-lvl=\"1-20\">1 - 20</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-lvl-filter\" data-lvl=\"21-40\">21 - 40</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-lvl-filter\" data-lvl=\"41-60\">41 - 60</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-lvl-filter\" data-lvl=\"61-80\">61 - 80</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-lvl-filter\" data-lvl=\"81-100\">81 - 100</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-lvl-filter\" data-lvl=\"100+\">100+</button>\n        </div>\n      </div>\n\n      <!-- Filtro por Fraqueza Elemental -->\n      <div style=\"display: flex; align-items: center; gap: 8px; flex-wrap: wrap;\">\n        <span style=\"font-size: 9px; color: var(--sobre-mad-dim); text-transform: uppercase; font-weight: 700; width: 65px;\">Fraqueza:</span>\n        <div class=\"chips-row\" style=\"flex: 1; flex-wrap: wrap; gap: 4px;\">\n          <button type=\"button\" class=\"btn chip-btn on hunt-type-filter\" data-type=\"all\">Qualquer</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"FIRE\">Fogo</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"WATER\">Água</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"GRASS\">Planta</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"ELECTRIC\">Elétrico</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"ICE\">Gelo</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"FIGHTING\">Lutador</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"GROUND\">Terra</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"FLYING\">Voador</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"PSYCHIC\">Psíquico</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"BUG\">Inseto</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"ROCK\">Pedra</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"GHOST\">Fantasma</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"DRAGON\">Dragão</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"STEEL\">Aço</button>\n          <button type=\"button\" class=\"btn chip-btn apagado hunt-type-filter\" data-type=\"FAIRY\">Fada</button>\n        </div>\n      </div>\n    </div>\n\n    <!-- Painel 1: Grid de Hunts & Criaturas -->\n    <div id=\"panel-hunts-list\" class=\"market-content-panel\">\n      <div class=\"quadro\" style=\"flex: 1; min-height: 0;\">\n        <div class=\"quadro-header\">\n          <div>\n            <h2 class=\"quadro-titulo\">Enciclopédia de Hunts & Criaturas</h2>\n            <span class=\"quadro-sub\">Análise de rendimento de XP, GP, fraquezas 4x/2x e loots</span>\n          </div>\n          <div class=\"brand-badge\" id=\"lbl-hunts-counter\">0 criaturas catalogadas</div>\n        </div>\n\n        <div id=\"container-hunts-grid\" class=\"hunts-cards-grid\">\n          <div style=\"grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);\">\n            Carregando enciclopédia de hunts...\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- Painel 2: Grid de Bosses & Calculadora Probabilística de Tokens -->\n    <div id=\"panel-bosses-list\" class=\"market-content-panel\" style=\"display: none;\">\n      <div class=\"quadro\" style=\"flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;\">\n        <div class=\"quadro-header\">\n          <div>\n            <h2 class=\"quadro-titulo\">Chefes & Bosses Diários</h2>\n            <span class=\"quadro-sub\">Entradas diárias, níveis recomendados e tabelas de recompensas raras</span>\n          </div>\n          <div class=\"brand-badge\" id=\"lbl-bosses-counter\">0 chefes catalogados</div>\n        </div>\n\n        <!-- Widget: Calculadora Probabilística de Boss Tokens -->\n        <div class=\"vao\" style=\"padding: 10px; margin-bottom: 8px; border-radius: 0px; display: flex; flex-direction: column; gap: 8px; flex: none;\">\n          <div style=\"display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;\">\n            <div style=\"display: flex; align-items: center; gap: 6px;\">\n              <span style=\"font-size: 13px;\">🎲</span>\n              <span style=\"font-size: 11px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.5px;\">Calculadora Oficial de Drops & Boss Tokens</span>\n            </div>\n            <!-- Filtro de foco: Todos / AoE TM / TM Single -->\n            <div style=\"display: flex; align-items: center; gap: 4px;\">\n              <button type=\"button\" class=\"btn chip-btn on boss-filter-focus\" data-focus=\"all\" style=\"height: 22px; font-size: 8.5px; padding: 0 8px;\">Todos os Chefes</button>\n              <button type=\"button\" class=\"btn chip-btn apagado boss-filter-focus\" data-focus=\"aoe\" style=\"height: 22px; font-size: 8.5px; padding: 0 8px;\">⚡ Foco: AoE TM Piece</button>\n              <button type=\"button\" class=\"btn chip-btn apagado boss-filter-focus\" data-focus=\"tm\" style=\"height: 22px; font-size: 8.5px; padding: 0 8px;\">💿 Foco: TM Piece</button>\n            </div>\n          </div>\n\n          <div style=\"display: grid; grid-template-columns: 1.2fr 1fr 90px 90px auto; gap: 8px; align-items: flex-end;\">\n            <!-- Chefe Oficial -->\n            <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n              <label style=\"font-size: 9px; color: var(--sobre-mad-dim); font-weight: 700;\">Chefe Oficial do PokéIdle:</label>\n              <select id=\"boss-calc-select\" class=\"campo\" style=\"height: 26px; font-size: 10px; border-radius: 0px;\">\n                <!-- Preenchido dinamicamente com os 25 bosses canônicos -->\n              </select>\n            </div>\n\n            <!-- Drop Real do Chefe -->\n            <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n              <label style=\"font-size: 9px; color: var(--ouro); font-weight: 700;\">Drop Oficial do Chefe:</label>\n              <select id=\"boss-calc-reward\" class=\"campo\" style=\"height: 26px; font-size: 10px; border-radius: 0px;\">\n                <!-- Preenchido dinamicamente com os drops reais do chefe selecionado -->\n              </select>\n            </div>\n\n            <!-- Meta Quantidade -->\n            <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n              <label style=\"font-size: 9px; color: var(--sobre-mad-dim); font-weight: 700;\">Meta (Qtd):</label>\n              <input type=\"number\" id=\"boss-calc-target-qty\" class=\"campo\" min=\"1\" max=\"500\" value=\"10\" style=\"height: 26px; font-size: 10px; font-weight: 800; color: #fff; border-radius: 0px;\">\n            </div>\n\n            <!-- Chance Oficial do Drop (%) -->\n            <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n              <label style=\"font-size: 9px; color: var(--sobre-mad-dim); font-weight: 700;\">Chance / Run (%):</label>\n              <input type=\"number\" id=\"boss-calc-drop-chance\" class=\"campo\" min=\"0.01\" max=\"100\" step=\"0.1\" value=\"1.5\" style=\"height: 26px; font-size: 10px; border-radius: 0px;\">\n            </div>\n\n            <!-- Botão Simular -->\n            <button type=\"button\" id=\"btn-run-boss-calc\" class=\"btn btn-ouro\" style=\"height: 26px; padding: 0 14px; font-size: 10px; font-weight: 800; border-radius: 0px; white-space: nowrap;\">\n              🧮 Calcular\n            </button>\n          </div>\n\n          <!-- Informação do Chefe Ativo na Calculadora -->\n          <div id=\"boss-calc-info-banner\" style=\"display: flex; align-items: center; justify-content: space-between; font-size: 9px; color: var(--sobre-mad-dim); background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 0px;\">\n            <div id=\"boss-calc-details-txt\">Carregando informações do chefe...</div>\n            <div id=\"boss-calc-entry-cost\" style=\"color: var(--ouro); font-weight: 700;\">Entrada: 1× Bronze Boss Token</div>\n          </div>\n\n          <!-- Cards de Resultados Probabilísticos -->\n          <div id=\"box-boss-calc-results\" style=\"display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 2px;\">\n            <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n              <span style=\"font-size: 8px; color: var(--sobre-mad-dim); text-transform: uppercase;\">Média Esperada:</span>\n              <div id=\"res-boss-expected\" style=\"font-size: 12.5px; font-weight: 800; color: #fff; margin-top: 2px;\">~ 667 Tokens</div>\n              <span id=\"res-boss-expected-gp\" style=\"font-size: 7.5px; color: var(--ouro);\">~ 46.7M GP no mercado</span>\n            </div>\n\n            <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n              <span style=\"font-size: 8px; color: var(--verde-luz); text-transform: uppercase;\">Com Sorte (P25):</span>\n              <div id=\"res-boss-lucky\" style=\"font-size: 12.5px; font-weight: 800; color: var(--verde-luz); margin-top: 2px;\">~ 495 Tokens</div>\n              <span style=\"font-size: 7.5px; color: var(--vao-dim);\">25% dos mais sortudos</span>\n            </div>\n\n            <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n              <span style=\"font-size: 8px; color: #ffd166; text-transform: uppercase;\">Margem Segura (P90):</span>\n              <div id=\"res-boss-safe\" style=\"font-size: 12.5px; font-weight: 800; color: #ffd166; margin-top: 2px;\">~ 995 Tokens</div>\n              <span style=\"font-size: 7.5px; color: var(--vao-dim);\">Supera o azar estatístico</span>\n            </div>\n\n            <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n              <span style=\"font-size: 8px; color: #9fe4ff; text-transform: uppercase;\">Entradas Diárias:</span>\n              <div id=\"res-boss-days\" style=\"font-size: 12.5px; font-weight: 800; color: #9fe4ff; margin-top: 2px;\">~ 667 Dias</div>\n              <span style=\"font-size: 7.5px; color: var(--vao-dim);\">A 1 entrada grátis/dia</span>\n            </div>\n          </div>\n        </div>\n\n        <div id=\"container-bosses-grid\" class=\"hunts-cards-grid\">\n          <div style=\"grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);\">\n            Carregando chefes e bosses...\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <!-- =================================================== -->\n  <!-- ABA 5: ALTAR PRO — OFERENDA EM LOTE TURBO           -->\n  <!-- =================================================== -->\n  <section class=\"stats-view-container\" id=\"view-oferendas\" style=\"display: none;\">\n    <!-- Barra Superior -->\n    <div class=\"stats-header-bar\">\n      <div style=\"display: flex; align-items: center; gap: 8px;\">\n        <span style=\"font-size: 16px;\">🔮</span>\n        <div>\n          <h2 style=\"font-size: 12px; text-transform: uppercase; color: #fff; letter-spacing: 0.8px; margin: 0;\">\n            Altar Pro — Oferenda em Lote Turbo\n          </h2>\n          <span style=\"font-size: 8.5px; color: var(--sobre-mad-dim);\">\n            Sacrifique lotes de 5 Pokémons instantaneamente direto no WebSocket (100% de pedra garantida)\n          </span>\n        </div>\n      </div>\n      <div style=\"display: flex; align-items: center; gap: 6px;\">\n        <span class=\"selo-vip\" style=\"font-size: 8.5px; padding: 2px 7px;\">100% GARANTIDO (0% VAZIO)</span>\n        <button type=\"button\" id=\"btn-refresh-oferenda-depot\" class=\"btn btn-roxo btn-mini\" style=\"font-size: 8.5px; padding: 3px 8px; border-radius: 0px;\">\n          🔄 Atualizar Depot\n        </button>\n      </div>\n    </div>\n\n    <!-- Painel de Configuração e Filtros -->\n    <div class=\"quadro\" style=\"padding: 8px 12px; gap: 8px; flex: none;\">\n      <div style=\"display: grid; grid-template-columns: minmax(210px, 1.3fr) 1fr 0.9fr 0.8fr auto; gap: 8px; align-items: flex-end;\">\n        <!-- Corte por Nota (Manual + Presets Rápidos) -->\n        <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n          <div style=\"display: flex; align-items: center; justify-content: space-between;\">\n            <label style=\"font-size: 9px; color: var(--sobre-mad-dim); font-weight: 700;\">Nota Máxima de Corte:</label>\n            <span style=\"font-size: 7.5px; color: var(--ouro); font-weight: 700;\">Manual / Preset</span>\n          </div>\n          <div style=\"display: flex; gap: 4px; align-items: center;\">\n            <input type=\"number\" id=\"input-oferenda-nota-manual\" class=\"campo\" step=\"0.1\" min=\"0\" max=\"10\" value=\"5.0\" style=\"width: 52px; height: 26px; text-align: center; font-weight: 800; font-size: 11px; color: var(--ouro); padding: 0 2px; border-radius: 0px;\" placeholder=\"5.0\" title=\"Digite a nota máxima de corte desejada\">\n            <div style=\"display: flex; gap: 2px; flex: 1;\">\n              <button type=\"button\" class=\"btn chip-btn apagado btn-mini ofr-nota-filter\" data-nota=\"3.5\" style=\"flex: 1; font-size: 8px; padding: 3px 0;\">&lt; 3.5</button>\n              <button type=\"button\" class=\"btn chip-btn on btn-mini ofr-nota-filter\" data-nota=\"5.0\" style=\"flex: 1; font-size: 8px; padding: 3px 0;\">&lt; 5.0</button>\n              <button type=\"button\" class=\"btn chip-btn apagado btn-mini ofr-nota-filter\" data-nota=\"7.0\" style=\"flex: 1; font-size: 8px; padding: 3px 0;\">&lt; 7.0</button>\n              <button type=\"button\" class=\"btn chip-btn apagado btn-mini ofr-nota-filter\" data-nota=\"10.0\" style=\"flex: 1; font-size: 8px; padding: 3px 0;\">Todos</button>\n            </div>\n          </div>\n        </div>\n\n        <!-- Foco em Tipo Elementar -->\n        <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n          <label style=\"font-size: 9px; color: var(--ouro); font-weight: 700;\">Foco em Tipo Elementar:</label>\n          <select id=\"select-oferenda-tipo\" class=\"campo\" style=\"height: 26px; font-size: 10px; border-radius: 0px;\">\n            <option value=\"ALL\">Todos os Tipos (Qualquer Pedra)</option>\n            <option value=\"WATER\">Água (Water Stone)</option>\n            <option value=\"FIRE\">Fogo (Fire Stone)</option>\n            <option value=\"GRASS\">Planta (Leaf Stone)</option>\n            <option value=\"ELECTRIC\">Elétrico (Thunder Stone)</option>\n            <option value=\"NORMAL\">Normal (Heart/Sun)</option>\n            <option value=\"FLYING\">Voador (Feather Stone)</option>\n            <option value=\"BUG\">Inseto (Cocoon Stone)</option>\n            <option value=\"POISON\">Veneno (Venom Stone)</option>\n            <option value=\"GROUND\">Terra (Earth Stone)</option>\n            <option value=\"ROCK\">Pedra (Rock Stone)</option>\n            <option value=\"FIGHTING\">Lutador (Punch Stone)</option>\n            <option value=\"PSYCHIC\">Psíquico (Enigma Stone)</option>\n            <option value=\"GHOST\">Fantasma (Darkness Stone)</option>\n            <option value=\"DRAGON\">Dragão (Ancient Stone)</option>\n            <option value=\"DARK\">Sombrio (Darkness Stone)</option>\n            <option value=\"STEEL\">Aço (Metal Stone)</option>\n            <option value=\"ICE\">Gelo (Ice Stone)</option>\n          </select>\n        </div>\n\n        <!-- Limite de Giros -->\n        <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n          <label style=\"font-size: 9px; color: var(--sobre-mad-dim); font-weight: 700;\">Limite de Giros:</label>\n          <select id=\"select-oferenda-max-batches\" class=\"campo\" style=\"height: 26px; font-size: 10px; border-radius: 0px;\">\n            <option value=\"0\">Máximo do Depot</option>\n            <option value=\"1\">1 Giro (5 Pokés)</option>\n            <option value=\"5\">5 Giros (25 Pokés)</option>\n            <option value=\"10\">10 Giros (50 Pokés)</option>\n            <option value=\"20\">20 Giros (100 Pokés)</option>\n          </select>\n        </div>\n\n        <!-- Delay / Pacing por Giro -->\n        <div style=\"display: flex; flex-direction: column; gap: 3px;\">\n          <label style=\"font-size: 9px; color: var(--sobre-mad-dim); font-weight: 700;\">Delay por Giro:</label>\n          <select id=\"select-oferenda-pacing\" class=\"campo\" style=\"height: 26px; font-size: 10px; border-radius: 0px;\" title=\"Intervalo entre giros consecutivos de 5 Pokémons\">\n            <option value=\"500\">500ms</option>\n            <option value=\"800\" selected>800ms (Padrão)</option>\n            <option value=\"1200\">1200ms (Seguro)</option>\n            <option value=\"1500\">1500ms (Lento)</option>\n            <option value=\"2000\">2000ms (Suave)</option>\n          </select>\n        </div>\n\n        <!-- Botão Executar -->\n        <button type=\"button\" id=\"btn-run-oferenda-batch\" class=\"btn btn-roxo\" style=\"height: 28px; padding: 0 14px; font-size: 10px; font-weight: 800; border-radius: 0px; white-space: nowrap;\">\n          🔮 Executar Lote\n        </button>\n      </div>\n\n      <!-- Telemetria do Lote -->\n      <div style=\"display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 4px;\">\n        <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n          <span style=\"font-size: 8px; color: var(--sobre-mad-dim); text-transform: uppercase;\">Pokémons Elegíveis:</span>\n          <div id=\"lbl-ofr-candidatos\" style=\"font-size: 13px; font-weight: 800; color: #fff; margin-top: 2px;\">0</div>\n        </div>\n        <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n          <span style=\"font-size: 8px; color: var(--rx-luz); text-transform: uppercase;\">Pedras Garantidas (0% Vazio):</span>\n          <div id=\"lbl-ofr-pedras\" style=\"font-size: 13px; font-weight: 800; color: var(--rx-clr); margin-top: 2px;\">0 Pedras</div>\n        </div>\n        <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n          <span style=\"font-size: 8px; color: var(--verde-luz); text-transform: uppercase;\">🛡️ Protegidos (Shinies/P5/Trava):</span>\n          <div id=\"lbl-ofr-protegidos\" style=\"font-size: 13px; font-weight: 800; color: var(--verde-luz); margin-top: 2px;\">0</div>\n        </div>\n        <div class=\"vao\" style=\"padding: 6px 8px; text-align: center; border-radius: 0px;\">\n          <span style=\"font-size: 8px; color: var(--sobre-mad-dim); text-transform: uppercase;\">Sobra no Depot:</span>\n          <div id=\"lbl-ofr-sobra\" style=\"font-size: 13px; font-weight: 800; color: var(--ouro); margin-top: 2px;\">0</div>\n        </div>\n      </div>\n    </div>\n\n    <!-- Barra de Progresso Durante Envio -->\n    <div id=\"ofr-progress-bar-container\" style=\"display: none; padding: 8px 12px; background: var(--vao); border-radius: 0px; flex-direction: column; gap: 4px; flex: none;\">\n      <div style=\"display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 800; color: var(--rx-luz);\">\n        <span id=\"ofr-progress-status-txt\">Despachando giros para o servidor via WebSocket...</span>\n        <span id=\"ofr-progress-count-txt\">Lote 0 / 0</span>\n      </div>\n      <div style=\"width: 100%; height: 6px; background: rgba(0,0,0,0.5); border-radius: 0px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--mad-linha);\">\n        <div id=\"ofr-progress-fill\" style=\"width: 0%; height: 100%; background: linear-gradient(90deg, var(--rx), var(--rx-rosa)); transition: width 0.3s ease;\"></div>\n      </div>\n    </div>\n\n    <!-- Quadro de Resumo Final das Pedras Obtidas -->\n    <div id=\"ofr-result-summary-box\" class=\"vao\" style=\"display: none; padding: 10px 14px; border-radius: 0px; flex-direction: column; gap: 6px; flex: none; border: 1px solid var(--rx-esc);\">\n      <div style=\"display: flex; align-items: center; justify-content: space-between;\">\n        <span style=\"font-size: 11px; font-weight: 800; color: var(--verde-luz);\">\n          ✅ Oferenda em Lote Finalizada com Sucesso!\n        </span>\n        <span id=\"ofr-result-totals-txt\" style=\"font-size: 9.5px; color: var(--sobre-mad);\">0 Pokémons sacrificados em 0 giros</span>\n      </div>\n      <div id=\"ofr-result-stones-chips\" style=\"display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;\">\n        <!-- Chips das pedras recebidas -->\n      </div>\n    </div>\n\n    <!-- Grade com a Prévia dos Pokémons que Serão Ofertados -->\n    <div style=\"flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px;\">\n      <div style=\"display: flex; align-items: center; justify-content: space-between; padding: 4px 6px;\">\n        <span style=\"font-size: 9.5px; font-weight: 700; color: var(--sobre-mad-dim);\">\n          Prévia dos Pokémons que serão sacrificados (em ordem crescente de Nota):\n        </span>\n        <span style=\"font-size: 8.5px; color: var(--vao-dim);\">5 Pokémons = 1 Pedra Garantida</span>\n      </div>\n      <div id=\"container-oferenda-preview-grid\" class=\"hunts-cards-grid\" style=\"flex: 1; min-height: 0; overflow-y: auto;\">\n        <div style=\"grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);\">\n          Carregando Pokémons do Depot...\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <!-- MODAL DE VENDEDORES / OFERTAS DE UM ITEM ESPECÍFICO -->\n  <div id=\"modal-item-offers\" class=\"modal-overlay\">\n    <div class=\"modal-caixa\" style=\"max-width: 520px; max-height: 85vh; display: flex; flex-direction: column;\">\n      <div class=\"modal-header\">\n        <div style=\"display: flex; align-items: center; gap: 8px;\">\n          <img id=\"offers-modal-icon\" src=\"\" style=\"width: 24px; height: 24px; object-fit: contain;\">\n          <div>\n            <h3 id=\"offers-modal-title\" class=\"modal-title\" style=\"margin: 0;\">Ofertas do Item</h3>\n            <span id=\"offers-modal-sub\" style=\"font-size: 9px; color: var(--sobre-mad-dim);\">Vendedores na comunidade</span>\n          </div>\n        </div>\n        <button type=\"button\" id=\"btn-close-offers-modal\" class=\"btn apagado btn-mini\">✕</button>\n      </div>\n\n      <div style=\"display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: var(--vao); border-bottom: 2px solid var(--mad-linha);\">\n        <div style=\"display: flex; gap: 4px;\">\n          <button type=\"button\" id=\"btn-offers-gold\" class=\"btn chip-btn on\" style=\"height: 22px; font-size: 9px;\">Coins (GP)</button>\n          <button type=\"button\" id=\"btn-offers-gems\" class=\"btn chip-btn apagado\" style=\"height: 22px; font-size: 9px;\">Gemas</button>\n        </div>\n        <button type=\"button\" id=\"btn-quick-create-rule\" class=\"btn btn-roxo btn-mini\" style=\"height: 22px; font-size: 8.5px;\" title=\"Criar regra de sniper para este item\">\n          + Criar Regra Sniper\n        </button>\n      </div>\n\n      <div id=\"container-offers-sellers\" class=\"vao\" style=\"flex: 1; min-height: 180px; max-height: 380px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px;\">\n        <div style=\"text-align: center; padding: 20px; color: var(--vao-dim);\">Carregando ofertas deste item...</div>\n      </div>\n\n      <div class=\"modal-footer\">\n        <button type=\"button\" id=\"btn-close-offers-bottom\" class=\"btn apagado\">Fechar</button>\n      </div>\n    </div>\n  </div>\n\n  <!-- MODAL DE EDIÇÃO DE REGRA -->\n  <div id=\"modal-edit-rule\" class=\"modal-overlay\">\n    <div class=\"modal-caixa\">\n      <div class=\"modal-header\">\n        <h3 class=\"modal-title\">Editar Regra de Compra</h3>\n        <button type=\"button\" id=\"btn-close-modal\" class=\"btn apagado btn-mini\">X</button>\n      </div>\n\n      <div class=\"modal-body\">\n        <div class=\"form-group\">\n          <label class=\"form-label\" for=\"edit-rule-name\">Alvo:</label>\n          <input type=\"text\" id=\"edit-rule-name\" class=\"campo\" readonly style=\"opacity: 0.85;\">\n        </div>\n\n\n        <div style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 8px;\">\n          <div class=\"form-group\" id=\"group-edit-coins\">\n            <label class=\"form-label\" for=\"edit-rule-coins\">Teto em Coins:</label>\n            <input type=\"number\" id=\"edit-rule-coins\" class=\"campo\" min=\"0\">\n          </div>\n          <div class=\"form-group\" id=\"group-edit-gemas\">\n            <label class=\"form-label\" for=\"edit-rule-gemas\">Teto em Gemas:</label>\n            <input type=\"number\" id=\"edit-rule-gemas\" class=\"campo\" min=\"0\">\n          </div>\n        </div>\n\n        <div class=\"form-group\">\n          <div style=\"display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;\">\n            <label class=\"form-label\" for=\"edit-rule-qty\" id=\"lbl-edit-qty-title\" style=\"margin-bottom: 0;\">Quantidade Máxima (Máx 20 un):</label>\n            <button type=\"button\" id=\"btn-toggle-infinite-edit\" class=\"btn apagado btn-mini\" style=\"font-size: 8px; padding: 1px 6px; height: 18px; border-radius: 0px;\" title=\"Alternar para compra infinita\">\n              ∞ Infinito\n            </button>\n          </div>\n          <input type=\"number\" id=\"edit-rule-qty\" class=\"campo\" min=\"1\" max=\"20\" placeholder=\"1 a 20\">\n        </div>\n\n        <div class=\"vao\" style=\"display: flex; align-items: center; justify-content: space-between; padding: 6px 10px;\">\n          <span style=\"font-size: 10px; color: var(--sobre-mad-dim);\">Comprados: <b id=\"lbl-edit-bought\" style=\"color: #fff;\">0</b></span>\n          <button type=\"button\" id=\"btn-reset-bought\" class=\"btn apagado btn-mini\" title=\"Zerar contador para comprar novamente\">Zerar Contador</button>\n        </div>\n\n        <div class=\"vao global-row\">\n          <span class=\"form-label\" style=\"margin: 0;\">Regra Ativa:</span>\n          <input type=\"checkbox\" id=\"edit-rule-active\">\n        </div>\n      </div>\n\n      <div class=\"modal-footer\">\n        <button type=\"button\" id=\"btn-cancel-modal\" class=\"btn apagado\">Cancelar</button>\n        <button type=\"button\" id=\"btn-save-modal\" class=\"btn btn-roxo\">Salvar Alterações</button>\n      </div>\n    </div>\n  </div>\n\n  <!-- MODAL PIX (ME PAGUE UM CAFE) -->\n  <div id=\"modal-pix\" class=\"modal-overlay\">\n    <div class=\"modal-caixa\" style=\"max-width: 420px; border-radius: 0px;\">\n      <div class=\"modal-header\">\n        <span class=\"modal-title\">Me pague um café</span>\n        <button type=\"button\" id=\"btn-close-pix\" class=\"btn apagado\" style=\"padding: 2px 8px; font-size: 11px;\">✕</button>\n      </div>\n\n      <div class=\"modal-body\" style=\"align-items: center; text-align: center; gap: 10px;\">\n        <p style=\"font-size: 10px; color: var(--sobre-mad); margin: 0; line-height: 1.4;\">\n          Gostou do <b>PokéIdle Auto-Sniper</b>? Me pague um café via Pix para fortalecer o desenvolvimento e manter o assistente sempre atualizado!\n        </p>\n\n        <!-- QR CODE CONTAINER -->\n        <div id=\"pix-qrcode-container\" class=\"vao\" style=\"background: #ffffff; padding: 10px; border-radius: 0px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; min-height: 180px; min-width: 180px;\">\n          <!-- QR Code SVG inserido dinamicamente -->\n        </div>\n\n        <div style=\"width: 100%; display: flex; flex-direction: column; gap: 6px;\">\n          <!-- Chave Pix Copiar -->\n          <div class=\"vao\" style=\"display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 0px;\">\n            <div style=\"display: flex; flex-direction: column; align-items: flex-start; overflow: hidden; margin-right: 6px;\">\n              <span style=\"font-size: 8px; color: var(--vao-dim); text-transform: uppercase;\">Chave Pix:</span>\n              <b id=\"pix-key-display\" style=\"font-size: 10.5px; color: var(--ouro); white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 250px;\">46196ec9-a442-41d9-b350-d0d1123987a7</b>\n            </div>\n            <button type=\"button\" id=\"btn-copy-pix-key\" class=\"btn btn-roxo\" style=\"padding: 4px 8px; font-size: 9px; flex-shrink: 0; border-radius: 0px;\">\n              Copiar Chave\n            </button>\n          </div>\n\n          <!-- Botão Copia e Cola -->\n          <button type=\"button\" id=\"btn-copy-pix-payload\" class=\"btn btn-pix\" style=\"width: 100%; height: 30px; font-size: 10px; border-radius: 0px;\">\n            Copiar Pix Copia e Cola\n          </button>\n        </div>\n      </div>\n\n      <div class=\"modal-footer\" style=\"border-radius: 0px;\">\n        <button type=\"button\" id=\"btn-pix-fechar-bottom\" class=\"btn apagado\" style=\"border-radius: 0px;\">Fechar</button>\n      </div>\n    </div>\n  </div>\n\n  <!-- MODAL DE CÂMBIO & NEGOCIAÇÃO DE DIAMANTES -->\n  <div id=\"modal-diamantes\" class=\"modal-overlay\">\n    <div class=\"modal-caixa\" style=\"width: min(560px, 95vw); max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; border-radius: 0px; box-sizing: border-box;\">\n      <div class=\"modal-header\" style=\"border-radius: 0px;\">\n        <div style=\"display: flex; align-items: center; gap: 8px;\">\n          <img src=\"https://pokeidle.io/img/moeda-diamante.png\" style=\"width: 26px; height: 26px; object-fit: contain;\">\n          <div>\n            <h3 class=\"modal-title\" style=\"margin: 0; color: #9fe4ff; letter-spacing: 0.5px;\">COMPRA & VENDA DE DIAMANTES</h3>\n            <span style=\"font-size: 9.5px; color: var(--sobre-mad-dim);\">Compre, venda e anuncie Diamantes na comunidade PokéIdle</span>\n          </div>\n        </div>\n        <button type=\"button\" id=\"btn-close-diamantes-modal\" class=\"btn apagado btn-mini\" style=\"border-radius: 0px;\">✕</button>\n      </div>\n\n      <!-- Abas Internas do Modal de Diamantes -->\n      <div style=\"display: flex; gap: 6px; padding: 6px 10px; background: var(--vao); border-bottom: 2px solid var(--mad-linha); flex-wrap: wrap; align-items: center; justify-content: space-between;\">\n        <div style=\"display: flex; gap: 6px; align-items: center; flex-wrap: wrap;\">\n          <button type=\"button\" id=\"tab-diamante-comprar\" class=\"btn chip-btn on\" style=\"border-radius: 0px; font-size: 9px; padding: 3px 8px;\">\n            🛒 Comprar no Mercado\n          </button>\n          <button type=\"button\" id=\"tab-diamante-vender\" class=\"btn chip-btn apagado\" style=\"border-radius: 0px; font-size: 9px; padding: 3px 8px;\">\n            📢 Anunciar Venda\n          </button>\n        </div>\n        <button type=\"button\" id=\"tab-diamante-recarga\" class=\"btn chip-btn apagado\" style=\"border-radius: 0px; font-size: 9px; padding: 3px 8px;\">\n          ⚡ Recarga Oficial (PIX)\n        </button>\n      </div>\n\n      <!-- Painel 1: Comprar Diamantes da Comunidade -->\n      <div id=\"panel-diamante-comprar\" class=\"modal-body\" style=\"display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 380px;\">\n        <div style=\"display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; background: rgba(0,0,0,0.2); gap: 6px;\">\n          <div style=\"display: flex; align-items: center; gap: 4px;\">\n            <span style=\"font-size: 9.5px; color: var(--sobre-mad-dim);\">Filtrar:</span>\n            <button type=\"button\" id=\"btn-filter-diamonds-all\" class=\"btn chip-btn on btn-mini\" style=\"font-size: 8.5px; padding: 1px 6px; border-radius: 0px;\">Todas</button>\n            <button type=\"button\" id=\"btn-filter-diamonds-gold\" class=\"btn chip-btn apagado btn-mini\" style=\"font-size: 8.5px; padding: 1px 6px; border-radius: 0px;\">🪙 GP</button>\n            <button type=\"button\" id=\"btn-filter-diamonds-gems\" class=\"btn chip-btn apagado btn-mini\" style=\"font-size: 8.5px; padding: 1px 6px; border-radius: 0px;\">💎 Gemas</button>\n          </div>\n          <button type=\"button\" id=\"btn-refresh-diamantes-market\" class=\"btn btn-roxo btn-mini\" style=\"font-size: 8.5px; padding: 2px 6px; border-radius: 0px;\">\n            🔄 Atualizar Ofertas\n          </button>\n        </div>\n        <div id=\"container-diamantes-offers\" style=\"display: flex; flex-direction: column; gap: 6px;\">\n          <div style=\"text-align: center; padding: 30px 10px; color: var(--sobre-mad-dim); font-size: 10.5px;\">\n            Buscando ofertas de Diamantes no mercado...\n          </div>\n        </div>\n      </div>\n\n      <!-- Painel 2: Anunciar Diamantes à Venda -->\n      <div id=\"panel-diamante-vender\" class=\"modal-body\" style=\"display: none; flex-direction: column; gap: 10px;\">\n        <div style=\"padding: 8px; background: var(--vao); border-radius: 0px;\">\n          <span style=\"font-size: 10px; color: var(--sobre-mad);\">Coloque seus Diamantes à venda no mercado oficial da comunidade do PokéIdle.</span>\n        </div>\n\n        <div style=\"display: flex; flex-direction: column; gap: 4px;\">\n          <label style=\"font-size: 9.5px; color: var(--sobre-mad-dim);\">Quantidade de Diamantes:</label>\n          <input type=\"number\" id=\"input-sell-diamantes-qtd\" class=\"campo\" min=\"1\" max=\"99999\" value=\"10\" placeholder=\"Ex: 10\" style=\"height: 28px; border-radius: 0px;\">\n        </div>\n\n        <div style=\"display: flex; gap: 8px;\">\n          <div style=\"flex: 1; display: flex; flex-direction: column; gap: 4px;\">\n            <label style=\"font-size: 9.5px; color: var(--sobre-mad-dim);\">Preço Unitário:</label>\n            <input type=\"number\" id=\"input-sell-diamantes-preco\" class=\"campo\" min=\"1\" placeholder=\"Ex: 50000\" style=\"height: 28px; border-radius: 0px;\">\n          </div>\n          <div style=\"width: 140px; display: flex; flex-direction: column; gap: 4px;\">\n            <label style=\"font-size: 9.5px; color: var(--sobre-mad-dim);\">Receber Em:</label>\n            <select id=\"select-sell-diamantes-moeda\" class=\"campo\" style=\"height: 28px; border-radius: 0px;\">\n              <option value=\"gold\">🪙 Coins (GP)</option>\n              <option value=\"orb\">💎 Gemas</option>\n            </select>\n          </div>\n        </div>\n\n        <div id=\"box-sell-diamantes-resumo\" class=\"vao\" style=\"padding: 8px; font-size: 10px; color: var(--ouro); border-radius: 0px;\">\n          Total a receber: <b>0 GP</b>\n        </div>\n\n        <button type=\"button\" id=\"btn-submit-sell-diamantes\" class=\"btn btn-ouro\" style=\"height: 32px; font-size: 11px; border-radius: 0px;\">\n          📢 Publicar Anúncio de Diamantes\n        </button>\n      </div>\n\n      <!-- Painel 3: Recarga Oficial via PIX (Link/Direto) -->\n      <div id=\"panel-diamante-recarga\" class=\"modal-body\" style=\"display: none; flex-direction: column; gap: 10px;\">\n        <div style=\"padding: 8px; background: var(--vao); border-radius: 0px;\">\n          <span style=\"font-size: 10px; color: var(--sobre-mad);\">A compra oficial de Diamantes no PokéIdle é feita com PIX/cartão e creditada instantaneamente na sua conta.</span>\n        </div>\n        <div style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 8px;\">\n          <div class=\"vao\" style=\"padding: 10px; text-align: center; border-radius: 0px;\">\n            <div style=\"font-size: 14px; color: #9fe4ff; font-weight: 800;\">50 Diamantes</div>\n            <div style=\"font-size: 11px; color: var(--ouro); margin: 4px 0;\">R$ 10,00</div>\n            <a href=\"https://pokeidle.io/app#diamantes\" target=\"_blank\" class=\"btn btn-mini\" style=\"display: inline-block; padding: 4px 8px; border-radius: 0px; text-decoration: none; color: #fff;\">Comprar no Jogo</a>\n          </div>\n          <div class=\"vao\" style=\"padding: 10px; text-align: center; border-radius: 0px;\">\n            <div style=\"font-size: 14px; color: #9fe4ff; font-weight: 800;\">120 Diamantes</div>\n            <div style=\"font-size: 11px; color: var(--ouro); margin: 4px 0;\">R$ 20,00</div>\n            <a href=\"https://pokeidle.io/app#diamantes\" target=\"_blank\" class=\"btn btn-mini\" style=\"display: inline-block; padding: 4px 8px; border-radius: 0px; text-decoration: none; color: #fff;\">Comprar no Jogo</a>\n          </div>\n          <div class=\"vao\" style=\"padding: 10px; text-align: center; border-radius: 0px;\">\n            <div style=\"font-size: 14px; color: #9fe4ff; font-weight: 800;\">350 Diamantes</div>\n            <div style=\"font-size: 11px; color: var(--ouro); margin: 4px 0;\">R$ 50,00</div>\n            <a href=\"https://pokeidle.io/app#diamantes\" target=\"_blank\" class=\"btn btn-mini\" style=\"display: inline-block; padding: 4px 8px; border-radius: 0px; text-decoration: none; color: #fff;\">Comprar no Jogo</a>\n          </div>\n          <div class=\"vao\" style=\"padding: 10px; text-align: center; border-radius: 0px;\">\n            <div style=\"font-size: 14px; color: #9fe4ff; font-weight: 800;\">800 Diamantes</div>\n            <div style=\"font-size: 11px; color: var(--ouro); margin: 4px 0;\">R$ 100,00</div>\n            <a href=\"https://pokeidle.io/app#diamantes\" target=\"_blank\" class=\"btn btn-mini\" style=\"display: inline-block; padding: 4px 8px; border-radius: 0px; text-decoration: none; color: #fff;\">Comprar no Jogo</a>\n          </div>\n        </div>\n      </div>\n\n      <div class=\"modal-footer\" style=\"border-radius: 0px;\">\n        <button type=\"button\" id=\"btn-close-diamantes-modal-bottom\" class=\"btn apagado\" style=\"border-radius: 0px;\">Fechar</button>\n      </div>\n    </div>\n  </div>\n\n  <!-- FOOTER BAR -->\n  <footer class=\"footer-bar\">\n    <span id=\"footer-status\">Varrendo mercado da comunidade automaticamente...</span>\n    <span>Auto-Sniper v1.5.2.1</span>\n  </footer>\n\n  \n  \n  \n  \n</body>\n\n</html>\n";
function runCockpit(window, document, chrome) {
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));



// Catálogo Canônico Oficial do Mercado da Comunidade PokéIdle (74 Itens Negociáveis)
// Ordem de apresentação oficial:
// 1. Pedras (18 clássicas + 18 shiny stones)
// 2. TMs (AoE TM Disk, AoE TM Disk Piece, TM Disk Piece e 18 TMs Elementais)
// 3. Loots Raros (Shiny Stone Fragment, Key Fragment, Bronze Boss Token, Bicycle Fragment)
// 4. Beast Balls (Beast Ball)
// 5. Casas (Casas Comum, Incomum, Rara, Mítica, Lendária)
// 6. Boxes (Founder Box e Co-Founder Box)
// 7. Bicicletas (Bicicletas Comum, Incomum, Rara, Mítica, Lendária)
const POKEIDLE_ITEMS_DB = [{"id": 999999, "name": "Diamantes", "icon": "https://pokeidle.io/img/moeda-diamante.png", "category": "diamante", "categoryLabel": "Diamantes", "type": "CAMBIO", "npcPrice": 0}, {"id": 2, "name": "Ancient Stone", "icon": "/assets/stones/ancient_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "DRAGON", "npcPrice": 0}, {"id": 23, "name": "Cocoon Stone", "icon": "cocoon_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "BUG", "npcPrice": 0}, {"id": 28, "name": "Crystal Stone", "icon": "crystal_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ICE", "npcPrice": 0}, {"id": 31, "name": "Darkness Stone", "icon": "darkness_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "DARK", "npcPrice": 0}, {"id": 40, "name": "Earth Stone", "icon": "earth_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "GROUND", "npcPrice": 0}, {"id": 45, "name": "Enigma Stone", "icon": "enigma_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "PSYCHIC", "npcPrice": 0}, {"id": 49, "name": "Feather Stone", "icon": "/assets/stones/feather_stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FLYING", "npcPrice": 0}, {"id": 53, "name": "Fire Stone", "icon": "fire_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "FIRE", "npcPrice": 0}, {"id": 66, "name": "Heart Stone", "icon": "heart_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "NORMAL", "npcPrice": 0}, {"id": 71, "name": "Ice Stone", "icon": "ice_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ICE", "npcPrice": 0}, {"id": 76, "name": "Leaf Stone", "icon": "leaf_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "GRASS", "npcPrice": 0}, {"id": 87, "name": "Metal Stone", "icon": "/assets/stones/metal_stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "STEEL", "npcPrice": 0}, {"id": 106, "name": "Punch Stone", "icon": "punch_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "FIGHTING", "npcPrice": 0}, {"id": 109, "name": "Rock Stone", "icon": "rock_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ROCK", "npcPrice": 0}, {"id": 209, "name": "Sun Stone", "icon": "/assets/stones/sun_stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FIRE", "npcPrice": 0}, {"id": 133, "name": "Thunder Stone", "icon": "thunder_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "ELECTRIC", "npcPrice": 0}, {"id": 139, "name": "Venom Stone", "icon": "venom_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "POISON", "npcPrice": 0}, {"id": 142, "name": "Water Stone", "icon": "water_stone.gif", "category": "stone", "categoryLabel": "Pedras", "type": "WATER", "npcPrice": 0}, {"id": 70031, "name": "Bug Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "BUG", "npcPrice": 0}, {"id": 70035, "name": "Dark Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "DARK", "npcPrice": 0}, {"id": 70034, "name": "Dragon Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "DRAGON", "npcPrice": 0}, {"id": 70024, "name": "Electric Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "ELECTRIC", "npcPrice": 0}, {"id": 70037, "name": "Fairy Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FAIRY", "npcPrice": 0}, {"id": 70026, "name": "Fighting Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FIGHTING", "npcPrice": 0}, {"id": 70021, "name": "Fire Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FIRE", "npcPrice": 0}, {"id": 70029, "name": "Flying Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "FLYING", "npcPrice": 0}, {"id": 70033, "name": "Ghost Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "GHOST", "npcPrice": 0}, {"id": 70023, "name": "Grass Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "GRASS", "npcPrice": 0}, {"id": 70028, "name": "Ground Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "GROUND", "npcPrice": 0}, {"id": 70025, "name": "Ice Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "ICE", "npcPrice": 0}, {"id": 70020, "name": "Normal Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "NORMAL", "npcPrice": 0}, {"id": 70027, "name": "Poison Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "POISON", "npcPrice": 0}, {"id": 70030, "name": "Psychic Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "PSYCHIC", "npcPrice": 0}, {"id": 70032, "name": "Rock Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "ROCK", "npcPrice": 0}, {"id": 70036, "name": "Steel Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "STEEL", "npcPrice": 0}, {"id": 70022, "name": "Water Shiny Stone", "icon": "/img/itens/shiny-stone.png", "category": "stone", "categoryLabel": "Pedras", "type": "WATER", "npcPrice": 0}, {"id": 40575, "name": "AoE TM Disk", "icon": "/assets/items/tm_disk_aoe.png", "category": "tm", "categoryLabel": "TMs", "type": null, "npcPrice": 0}, {"id": 40530, "name": "AoE TM Disk Piece", "icon": "/assets/items/tm_piece_aoe.png", "category": "tm", "categoryLabel": "TMs", "type": null, "npcPrice": 0}, {"id": 59194, "name": "TM Disk Piece", "icon": "/assets/items/tm_disk_piece.png", "category": "tm", "categoryLabel": "TMs", "type": null, "npcPrice": 0}, {"id": 59200, "name": "Normal-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "NORMAL", "npcPrice": 0}, {"id": 59201, "name": "Fire-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FIRE", "npcPrice": 0}, {"id": 59202, "name": "Water-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "WATER", "npcPrice": 0}, {"id": 59203, "name": "Grass-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "GRASS", "npcPrice": 0}, {"id": 59204, "name": "Electric-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "ELECTRIC", "npcPrice": 0}, {"id": 59205, "name": "Ice-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "ICE", "npcPrice": 0}, {"id": 59206, "name": "Fighting-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FIGHTING", "npcPrice": 0}, {"id": 59207, "name": "Poison-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "POISON", "npcPrice": 0}, {"id": 59208, "name": "Ground-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "GROUND", "npcPrice": 0}, {"id": 59209, "name": "Flying-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FLYING", "npcPrice": 0}, {"id": 59210, "name": "Psychic-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "PSYCHIC", "npcPrice": 0}, {"id": 59211, "name": "Bug-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "BUG", "npcPrice": 0}, {"id": 59212, "name": "Rock-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "ROCK", "npcPrice": 0}, {"id": 59213, "name": "Ghost-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "GHOST", "npcPrice": 0}, {"id": 59214, "name": "Dragon-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "DRAGON", "npcPrice": 0}, {"id": 59215, "name": "Dark-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "DARK", "npcPrice": 0}, {"id": 59216, "name": "Steel-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "STEEL", "npcPrice": 0}, {"id": 59247, "name": "Fairy-Type TM Disk", "icon": "/assets/items/tm_disk_elemental.png", "category": "tm", "categoryLabel": "TMs", "type": "FAIRY", "npcPrice": 0}, {"id": 70012, "name": "Shiny Stone Fragment", "icon": "/img/itens/shiny-stone.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 0}, {"id": 70011, "name": "Key Fragment", "icon": "/img/itens/fragmento-chave.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 0}, {"id": 70000, "name": "Bronze Boss Token", "icon": "/assets/items/bronze_boss_token.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 250000}, {"id": 70013, "name": "Bicycle Fragment", "icon": "/img/itens/fragmento-bicicleta.png", "category": "rare_loot", "categoryLabel": "Loots Raros", "type": null, "npcPrice": 0}, {"id": 5, "name": "Beast Ball", "icon": "/img/ball-beast.png", "category": "beast", "categoryLabel": "Beast Balls", "type": null, "npcPrice": 0}, {"id": 70040, "name": "Common House", "icon": "/img/itens/casa-comum.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70041, "name": "Uncommon House", "icon": "/img/itens/casa-incomum.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70042, "name": "Rare House", "icon": "/img/itens/casa-rara.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70043, "name": "Mythic House", "icon": "/img/itens/casa-mitica.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70044, "name": "Legendary House", "icon": "/img/itens/casa-lendaria.png", "category": "casa", "categoryLabel": "Casas", "type": null, "npcPrice": 0}, {"id": 70060, "name": "Founder Box", "icon": "/img/itens/caixa-fundador.png", "category": "box", "categoryLabel": "Boxes", "type": null, "npcPrice": 0}, {"id": 70061, "name": "Co-Founder Box", "icon": "/img/itens/caixa-cofundador.png", "category": "box", "categoryLabel": "Boxes", "type": null, "npcPrice": 0}, {"id": 70080, "name": "Common Bicycle", "icon": "/img/itens/bicicleta-comum.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70081, "name": "Uncommon Bicycle", "icon": "/img/itens/bicicleta-incomum.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70082, "name": "Rare Bicycle", "icon": "/img/itens/bicicleta-rara.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70083, "name": "Mythic Bicycle", "icon": "/img/itens/bicicleta-mitica.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}, {"id": 70084, "name": "Legendary Bicycle", "icon": "/img/itens/bicicleta-lendaria.png", "category": "bicicleta", "categoryLabel": "Bicicletas", "type": null, "npcPrice": 0}];

const POKEIDLE_ITEMS_BY_ID = {};
POKEIDLE_ITEMS_DB.forEach(function(item) {
  POKEIDLE_ITEMS_BY_ID[item.id] = item;
});

// ── Itens novos, aprendidos do próprio jogo ──
//
// A lista acima é a curadoria; o jogo lança itens novos (Mega Shiny Stone, ...) que chegam no pacote
// `welcome` (`itensNossos`), na ficha de cada anúncio do Mercado e no catálogo `/assets/items.json`.
// O injected.js junta esses itens e os guarda no storage (`rotom_items_dynamic`); a página do jogo e o
// cockpit registram aqui, e o resto (busca, ícone, sniper) passa a enxergá-los sem atualizar a extensão.
var ROTOM_CATEGORIA_LABEL = {
  stone: 'Pedras', tm: 'TMs', rare_loot: 'Loots Raros', beast: 'Beast Balls', casa: 'Casas',
  box: 'Boxes', bicicleta: 'Bicicletas', diamante: 'Diamantes', skin: 'Skins', outros: 'Outros'
};

function categoriaRotomItem(nome, categoria, id) {
  var n = String(nome || '').toLowerCase();
  // As pedras Mega têm nome próprio (Gengarite, Shiny Gengarite) e moram em 71xxx/72xxx no jogo.
  if (Number(id) >= 71000 && Number(id) < 73000) return 'stone';
  if (n.indexOf('skin') !== -1) return 'skin';
  if (n.indexOf('beast ball') !== -1) return 'beast';
  if (n.indexOf('stone') !== -1 && n.indexOf('fragment') === -1) return 'stone';
  if (/\btm\b|tm disk/.test(n)) return 'tm';
  if (n.indexOf('fragment') !== -1 || n.indexOf('token') !== -1) return 'rare_loot';
  if (n.indexOf('box') !== -1) return 'box';
  if (n.indexOf('house') !== -1) return 'casa';
  if (n.indexOf('bicycle') !== -1) return 'bicicleta';
  var c = String(categoria || '').toLowerCase();
  return ROTOM_CATEGORIA_LABEL[c] ? c : 'outros';
}

/** Registra itens do jogo que a curadoria não conhece. Devolve quantos entraram. */
function registerRotomItems(lista) {
  if (!Array.isArray(lista)) return 0;
  var novos = 0;
  for (var i = 0; i < lista.length; i++) {
    var it = lista[i];
    var id = Number(it && it.id);
    var nome = it && (it.name || it.nome);
    if (!id || !nome || POKEIDLE_ITEMS_BY_ID[id]) continue;
    var cat = categoriaRotomItem(nome, it.category || it.categoria, id);
    var item = {
      id: id, name: String(nome), icon: it.icon || it.icone || '', category: cat,
      categoryLabel: ROTOM_CATEGORIA_LABEL[cat] || 'Outros', type: '',
      npcPrice: Number(it.npcPrice) || 0, dinamico: true
    };
    POKEIDLE_ITEMS_DB.push(item);
    POKEIDLE_ITEMS_BY_ID[id] = item;
    novos++;
  }
  return novos;
}

/**
 * Troca o nome dos itens pelo nome que o JOGO mostra ({id: nome}), calculado na página com os módulos
 * do próprio jogo (tradução, Shiny Stone por tipo, casas, skins...). O nome antigo vira apelido: regra
 * de sniper salva com o nome em inglês continua achando o item, e a busca acha pelos dois.
 */
function registerRotomNames(mapa) {
  if (!mapa || typeof mapa !== 'object') return 0;
  var n = 0;
  for (var id in mapa) {
    var item = POKEIDLE_ITEMS_BY_ID[Number(id)];
    var nome = mapa[id];
    if (!item || !nome || item.name === nome) continue;
    item.aliases = item.aliases || [];
    if (item.aliases.indexOf(item.name) === -1) item.aliases.push(item.name);
    item.name = String(nome);
    n++;
  }
  return n;
}

function nomesDoItem(it) {
  return [it.name].concat(it.aliases || []);
}

function getRotomItem(idOrName) {
  if (idOrName == null) return null;
  if (typeof idOrName === 'number' || (!isNaN(Number(idOrName)) && String(idOrName).trim() !== '')) {
    return POKEIDLE_ITEMS_BY_ID[Number(idOrName)] || null;
  }
  var q = String(idOrName || '').toLowerCase().trim();
  for (var i = 0; i < POKEIDLE_ITEMS_DB.length; i++) {
    var nomes = nomesDoItem(POKEIDLE_ITEMS_DB[i]);
    for (var j = 0; j < nomes.length; j++) {
      if (String(nomes[j]).toLowerCase() === q) return POKEIDLE_ITEMS_DB[i];
    }
  }
  return null;
}

function searchRotomItems(query, category) {
  var q = String(query || '').toLowerCase().trim();
  var cat = String(category || 'all').toLowerCase().trim();
  var results = [];
  for (var i = 0; i < POKEIDLE_ITEMS_DB.length; i++) {
    var it = POKEIDLE_ITEMS_DB[i];
    if (cat && cat !== 'all') {
      var itCat = (it.category || '').toLowerCase();
      if (itCat !== cat) {
        if ((cat === 'pedras' || cat === 'stone') && itCat === 'stone') { /* ok */ }
        else if ((cat === 'tms' || cat === 'tm') && itCat === 'tm') { /* ok */ }
        else if ((cat === 'rare_loot' || cat === 'loot_raro' || cat === 'loots raros' || cat === 'fragment' || cat === 'boss') && itCat === 'rare_loot') { /* ok */ }
        else if ((cat === 'beast' || cat === 'beast balls' || cat === 'beast ball') && itCat === 'beast') { /* ok */ }
        else if ((cat === 'casas' || cat === 'casa') && itCat === 'casa') { /* ok */ }
        else if ((cat === 'boxes' || cat === 'box') && itCat === 'box') { /* ok */ }
        else if ((cat === 'bicicletas' || cat === 'bicicleta') && itCat === 'bicicleta') { /* ok */ }
        else continue;
      }
    }
    if (!q || nomesDoItem(it).join('\n').toLowerCase().indexOf(q) !== -1 || String(it.id) === q) {
      results.push(it);
      if (results.length >= 100) break;
    }
  }
  return results;
}

function getItemIconUrl(itemOrIcon) {
  if (!itemOrIcon) return '';
  var icon = '';

  // 1. Se for objeto (regra salva ou item), busca sempre a referência canônica oficial no catálogo do jogo
  if (typeof itemOrIcon === 'object') {
    var it = null;
    if (itemOrIcon.targetId) it = getRotomItem(itemOrIcon.targetId);
    if (!it && itemOrIcon.id) it = getRotomItem(itemOrIcon.id);
    if (!it && itemOrIcon.targetName) it = getRotomItem(itemOrIcon.targetName);
    if (!it && itemOrIcon.name) it = getRotomItem(itemOrIcon.name);

    if (it && it.icon) {
      icon = it.icon;
    } else if (itemOrIcon.icon) {
      icon = itemOrIcon.icon;
    }
  } else if (typeof itemOrIcon === 'number') {
    var it = getRotomItem(itemOrIcon);
    if (it && it.icon) icon = it.icon;
  } else if (typeof itemOrIcon === 'string') {
    if (itemOrIcon.indexOf('icon16') !== -1 || itemOrIcon.indexOf('icon48') !== -1 || itemOrIcon.indexOf('icons/') === 0) {
      return '';
    }
    var it = getRotomItem(itemOrIcon);
    if (it && it.icon) {
      icon = it.icon;
    } else if (itemOrIcon.indexOf('/') !== -1 || itemOrIcon.indexOf('.png') !== -1 || itemOrIcon.indexOf('.gif') !== -1) {
      icon = itemOrIcon;
    }
  }

  // 2. Rejeitar caminhos locais legados da extensão
  if (!icon || icon.indexOf('icon16') !== -1 || icon.indexOf('icon48') !== -1 || icon.indexOf('icons/') === 0) {
    return '';
  }

  if (icon.indexOf('http://') === 0 || icon.indexOf('https://') === 0) return icon;
  if (icon.indexOf('/assets/site/') === 0) return 'https://pokeidle.io' + icon;
  if (icon.indexOf('/img/') === 0) return 'https://pokeidle.io' + icon;
  if (icon.indexOf('/assets/stones/') === 0) return 'https://pokeidle.io/assets/site' + icon;
  if (icon.indexOf('/assets/items/') === 0) return 'https://pokeidle.io/assets/site' + icon;
  if (icon.indexOf('/assets/cards/') === 0) return 'https://pokeidle.io' + icon;
  if (icon.indexOf('/assets/markitems/') === 0) {
    return 'https://pokeidle.io/assets/site/assets/markitems/' + icon.replace('/assets/markitems/', '');
  }

  var STONES_SPECIAL = ['ancient_stone.gif', 'feather_stone.png', 'metal_stone.png', 'rough_gemstone.png', 'sun_stone.png', 'moon_stone.png'];
  var base = icon.replace('/assets/stones/', '').replace('/assets/items/', '');
  if (base.charAt(0) === '/') base = base.substring(1);
  if (STONES_SPECIAL.indexOf(base) !== -1) {
    return 'https://pokeidle.io/assets/site/assets/stones/' + base;
  }
  return 'https://pokeidle.io/assets/site/assets/items/' + base;
}


// Dicionário Canônico National Dex (1025 Pokémons da Gen 1 a Gen 9)
const POKEMON_NAME_TO_DEX_ID = {"bulbasaur": 1, "ivysaur": 2, "venusaur": 3, "charmander": 4, "charmeleon": 5, "charizard": 6, "squirtle": 7, "wartortle": 8, "blastoise": 9, "caterpie": 10, "metapod": 11, "butterfree": 12, "weedle": 13, "kakuna": 14, "beedrill": 15, "pidgey": 16, "pidgeotto": 17, "pidgeot": 18, "rattata": 19, "raticate": 20, "spearow": 21, "fearow": 22, "ekans": 23, "arbok": 24, "pikachu": 25, "raichu": 26, "sandshrew": 27, "sandslash": 28, "nidoran f": 29, "nidoran-f": 29, "nidorina": 30, "nidoqueen": 31, "nidoran m": 32, "nidoran-m": 32, "nidorino": 33, "nidoking": 34, "clefairy": 35, "clefable": 36, "vulpix": 37, "ninetales": 38, "jigglypuff": 39, "wigglytuff": 40, "zubat": 41, "golbat": 42, "oddish": 43, "gloom": 44, "vileplume": 45, "paras": 46, "parasect": 47, "venonat": 48, "venomoth": 49, "diglett": 50, "dugtrio": 51, "meowth": 52, "persian": 53, "psyduck": 54, "golduck": 55, "mankey": 56, "primeape": 57, "growlithe": 58, "arcanine": 59, "poliwag": 60, "poliwhirl": 61, "poliwrath": 62, "abra": 63, "kadabra": 64, "alakazam": 65, "machop": 66, "machoke": 67, "machamp": 68, "bellsprout": 69, "weepinbell": 70, "victreebel": 71, "tentacool": 72, "tentacruel": 73, "geodude": 74, "graveler": 75, "golem": 76, "ponyta": 77, "rapidash": 78, "slowpoke": 79, "slowbro": 80, "magnemite": 81, "magneton": 82, "farfetchd": 83, "doduo": 84, "dodrio": 85, "seel": 86, "dewgong": 87, "grimer": 88, "muk": 89, "shellder": 90, "cloyster": 91, "gastly": 92, "haunter": 93, "gengar": 94, "onix": 95, "drowzee": 96, "hypno": 97, "krabby": 98, "kingler": 99, "voltorb": 100, "electrode": 101, "exeggcute": 102, "exeggutor": 103, "cubone": 104, "marowak": 105, "hitmonlee": 106, "hitmonchan": 107, "lickitung": 108, "koffing": 109, "weezing": 110, "rhyhorn": 111, "rhydon": 112, "chansey": 113, "tangela": 114, "kangaskhan": 115, "horsea": 116, "seadra": 117, "goldeen": 118, "seaking": 119, "staryu": 120, "starmie": 121, "mr mime": 122, "mr-mime": 122, "scyther": 123, "jynx": 124, "electabuzz": 125, "magmar": 126, "pinsir": 127, "tauros": 128, "magikarp": 129, "gyarados": 130, "lapras": 131, "ditto": 132, "eevee": 133, "vaporeon": 134, "jolteon": 135, "flareon": 136, "porygon": 137, "omanyte": 138, "omastar": 139, "kabuto": 140, "kabutops": 141, "aerodactyl": 142, "snorlax": 143, "articuno": 144, "zapdos": 145, "moltres": 146, "dratini": 147, "dragonair": 148, "dragonite": 149, "mewtwo": 150, "mew": 151, "chikorita": 152, "bayleef": 153, "meganium": 154, "cyndaquil": 155, "quilava": 156, "typhlosion": 157, "totodile": 158, "croconaw": 159, "feraligatr": 160, "sentret": 161, "furret": 162, "hoothoot": 163, "noctowl": 164, "ledyba": 165, "ledian": 166, "spinarak": 167, "ariados": 168, "crobat": 169, "chinchou": 170, "lanturn": 171, "pichu": 172, "cleffa": 173, "igglybuff": 174, "togepi": 175, "togetic": 176, "natu": 177, "xatu": 178, "mareep": 179, "flaaffy": 180, "ampharos": 181, "bellossom": 182, "marill": 183, "azumarill": 184, "sudowoodo": 185, "politoed": 186, "hoppip": 187, "skiploom": 188, "jumpluff": 189, "aipom": 190, "sunkern": 191, "sunflora": 192, "yanma": 193, "wooper": 194, "quagsire": 195, "espeon": 196, "umbreon": 197, "murkrow": 198, "slowking": 199, "misdreavus": 200, "unown": 201, "wobbuffet": 202, "girafarig": 203, "pineco": 204, "forretress": 205, "dunsparce": 206, "gligar": 207, "steelix": 208, "snubbull": 209, "granbull": 210, "qwilfish": 211, "scizor": 212, "shuckle": 213, "heracross": 214, "sneasel": 215, "teddiursa": 216, "ursaring": 217, "slugma": 218, "magcargo": 219, "swinub": 220, "piloswine": 221, "corsola": 222, "remoraid": 223, "octillery": 224, "delibird": 225, "mantine": 226, "skarmory": 227, "houndour": 228, "houndoom": 229, "kingdra": 230, "phanpy": 231, "donphan": 232, "porygon2": 233, "stantler": 234, "smeargle": 235, "tyrogue": 236, "hitmontop": 237, "smoochum": 238, "elekid": 239, "magby": 240, "miltank": 241, "blissey": 242, "raikou": 243, "entei": 244, "suicune": 245, "larvitar": 246, "pupitar": 247, "tyranitar": 248, "lugia": 249, "ho oh": 250, "ho-oh": 250, "celebi": 251, "treecko": 252, "grovyle": 253, "sceptile": 254, "torchic": 255, "combusken": 256, "blaziken": 257, "mudkip": 258, "marshtomp": 259, "swampert": 260, "poochyena": 261, "mightyena": 262, "zigzagoon": 263, "linoone": 264, "wurmple": 265, "silcoon": 266, "beautifly": 267, "cascoon": 268, "dustox": 269, "lotad": 270, "lombre": 271, "ludicolo": 272, "seedot": 273, "nuzleaf": 274, "shiftry": 275, "taillow": 276, "swellow": 277, "wingull": 278, "pelipper": 279, "ralts": 280, "kirlia": 281, "gardevoir": 282, "surskit": 283, "masquerain": 284, "shroomish": 285, "breloom": 286, "slakoth": 287, "vigoroth": 288, "slaking": 289, "nincada": 290, "ninjask": 291, "shedinja": 292, "whismur": 293, "loudred": 294, "exploud": 295, "makuhita": 296, "hariyama": 297, "azurill": 298, "nosepass": 299, "skitty": 300, "delcatty": 301, "sableye": 302, "mawile": 303, "aron": 304, "lairon": 305, "aggron": 306, "meditite": 307, "medicham": 308, "electrike": 309, "manectric": 310, "plusle": 311, "minun": 312, "volbeat": 313, "illumise": 314, "roselia": 315, "gulpin": 316, "swalot": 317, "carvanha": 318, "sharpedo": 319, "wailmer": 320, "wailord": 321, "numel": 322, "camerupt": 323, "torkoal": 324, "spoink": 325, "grumpig": 326, "spinda": 327, "trapinch": 328, "vibrava": 329, "flygon": 330, "cacnea": 331, "cacturne": 332, "swablu": 333, "altaria": 334, "zangoose": 335, "seviper": 336, "lunatone": 337, "solrock": 338, "barboach": 339, "whiscash": 340, "corphish": 341, "crawdaunt": 342, "baltoy": 343, "claydol": 344, "lileep": 345, "cradily": 346, "anorith": 347, "armaldo": 348, "feebas": 349, "milotic": 350, "castform": 351, "kecleon": 352, "shuppet": 353, "banette": 354, "duskull": 355, "dusclops": 356, "tropius": 357, "chimecho": 358, "absol": 359, "wynaut": 360, "snorunt": 361, "glalie": 362, "spheal": 363, "sealeo": 364, "walrein": 365, "clamperl": 366, "huntail": 367, "gorebyss": 368, "relicanth": 369, "luvdisc": 370, "bagon": 371, "shelgon": 372, "salamence": 373, "beldum": 374, "metang": 375, "metagross": 376, "regirock": 377, "regice": 378, "registeel": 379, "latias": 380, "latios": 381, "kyogre": 382, "groudon": 383, "rayquaza": 384, "jirachi": 385, "deoxys normal": 386, "deoxys-normal": 386, "turtwig": 387, "grotle": 388, "torterra": 389, "chimchar": 390, "monferno": 391, "infernape": 392, "piplup": 393, "prinplup": 394, "empoleon": 395, "starly": 396, "staravia": 397, "staraptor": 398, "bidoof": 399, "bibarel": 400, "kricketot": 401, "kricketune": 402, "shinx": 403, "luxio": 404, "luxray": 405, "budew": 406, "roserade": 407, "cranidos": 408, "rampardos": 409, "shieldon": 410, "bastiodon": 411, "burmy": 412, "wormadam plant": 413, "wormadam-plant": 413, "mothim": 414, "combee": 415, "vespiquen": 416, "pachirisu": 417, "buizel": 418, "floatzel": 419, "cherubi": 420, "cherrim": 421, "shellos": 422, "gastrodon": 423, "ambipom": 424, "drifloon": 425, "drifblim": 426, "buneary": 427, "lopunny": 428, "mismagius": 429, "honchkrow": 430, "glameow": 431, "purugly": 432, "chingling": 433, "stunky": 434, "skuntank": 435, "bronzor": 436, "bronzong": 437, "bonsly": 438, "mime jr": 439, "mime-jr": 439, "happiny": 440, "chatot": 441, "spiritomb": 442, "gible": 443, "gabite": 444, "garchomp": 445, "munchlax": 446, "riolu": 447, "lucario": 448, "hippopotas": 449, "hippowdon": 450, "skorupi": 451, "drapion": 452, "croagunk": 453, "toxicroak": 454, "carnivine": 455, "finneon": 456, "lumineon": 457, "mantyke": 458, "snover": 459, "abomasnow": 460, "weavile": 461, "magnezone": 462, "lickilicky": 463, "rhyperior": 464, "tangrowth": 465, "electivire": 466, "magmortar": 467, "togekiss": 468, "yanmega": 469, "leafeon": 470, "glaceon": 471, "gliscor": 472, "mamoswine": 473, "porygon z": 474, "porygon-z": 474, "gallade": 475, "probopass": 476, "dusknoir": 477, "froslass": 478, "rotom": 479, "uxie": 480, "mesprit": 481, "azelf": 482, "dialga": 483, "palkia": 484, "heatran": 485, "regigigas": 486, "giratina altered": 487, "giratina-altered": 487, "cresselia": 488, "phione": 489, "manaphy": 490, "darkrai": 491, "shaymin land": 492, "shaymin-land": 492, "arceus": 493, "victini": 494, "snivy": 495, "servine": 496, "serperior": 497, "tepig": 498, "pignite": 499, "emboar": 500, "oshawott": 501, "dewott": 502, "samurott": 503, "patrat": 504, "watchog": 505, "lillipup": 506, "herdier": 507, "stoutland": 508, "purrloin": 509, "liepard": 510, "pansage": 511, "simisage": 512, "pansear": 513, "simisear": 514, "panpour": 515, "simipour": 516, "munna": 517, "musharna": 518, "pidove": 519, "tranquill": 520, "unfezant": 521, "blitzle": 522, "zebstrika": 523, "roggenrola": 524, "boldore": 525, "gigalith": 526, "woobat": 527, "swoobat": 528, "drilbur": 529, "excadrill": 530, "audino": 531, "timburr": 532, "gurdurr": 533, "conkeldurr": 534, "tympole": 535, "palpitoad": 536, "seismitoad": 537, "throh": 538, "sawk": 539, "sewaddle": 540, "swadloon": 541, "leavanny": 542, "venipede": 543, "whirlipede": 544, "scolipede": 545, "cottonee": 546, "whimsicott": 547, "petilil": 548, "lilligant": 549, "basculin red striped": 550, "basculin-red-striped": 550, "sandile": 551, "krokorok": 552, "krookodile": 553, "darumaka": 554, "darmanitan standard": 555, "darmanitan-standard": 555, "maractus": 556, "dwebble": 557, "crustle": 558, "scraggy": 559, "scrafty": 560, "sigilyph": 561, "yamask": 562, "cofagrigus": 563, "tirtouga": 564, "carracosta": 565, "archen": 566, "archeops": 567, "trubbish": 568, "garbodor": 569, "zorua": 570, "zoroark": 571, "minccino": 572, "cinccino": 573, "gothita": 574, "gothorita": 575, "gothitelle": 576, "solosis": 577, "duosion": 578, "reuniclus": 579, "ducklett": 580, "swanna": 581, "vanillite": 582, "vanillish": 583, "vanilluxe": 584, "deerling": 585, "sawsbuck": 586, "emolga": 587, "karrablast": 588, "escavalier": 589, "foongus": 590, "amoonguss": 591, "frillish male": 592, "frillish-male": 592, "jellicent male": 593, "jellicent-male": 593, "alomomola": 594, "joltik": 595, "galvantula": 596, "ferroseed": 597, "ferrothorn": 598, "klink": 599, "klang": 600, "klinklang": 601, "tynamo": 602, "eelektrik": 603, "eelektross": 604, "elgyem": 605, "beheeyem": 606, "litwick": 607, "lampent": 608, "chandelure": 609, "axew": 610, "fraxure": 611, "haxorus": 612, "cubchoo": 613, "beartic": 614, "cryogonal": 615, "shelmet": 616, "accelgor": 617, "stunfisk": 618, "mienfoo": 619, "mienshao": 620, "druddigon": 621, "golett": 622, "golurk": 623, "pawniard": 624, "bisharp": 625, "bouffalant": 626, "rufflet": 627, "braviary": 628, "vullaby": 629, "mandibuzz": 630, "heatmor": 631, "durant": 632, "deino": 633, "zweilous": 634, "hydreigon": 635, "larvesta": 636, "volcarona": 637, "cobalion": 638, "terrakion": 639, "virizion": 640, "tornadus incarnate": 641, "tornadus-incarnate": 641, "thundurus incarnate": 642, "thundurus-incarnate": 642, "reshiram": 643, "zekrom": 644, "landorus incarnate": 645, "landorus-incarnate": 645, "kyurem": 646, "keldeo ordinary": 647, "keldeo-ordinary": 647, "meloetta aria": 648, "meloetta-aria": 648, "genesect": 649, "chespin": 650, "quilladin": 651, "chesnaught": 652, "fennekin": 653, "braixen": 654, "delphox": 655, "froakie": 656, "frogadier": 657, "greninja": 658, "bunnelby": 659, "diggersby": 660, "fletchling": 661, "fletchinder": 662, "talonflame": 663, "scatterbug": 664, "spewpa": 665, "vivillon": 666, "litleo": 667, "pyroar male": 668, "pyroar-male": 668, "flabebe": 669, "floette": 670, "florges": 671, "skiddo": 672, "gogoat": 673, "pancham": 674, "pangoro": 675, "furfrou": 676, "espurr": 677, "meowstic male": 678, "meowstic-male": 678, "honedge": 679, "doublade": 680, "aegislash shield": 681, "aegislash-shield": 681, "spritzee": 682, "aromatisse": 683, "swirlix": 684, "slurpuff": 685, "inkay": 686, "malamar": 687, "binacle": 688, "barbaracle": 689, "skrelp": 690, "dragalge": 691, "clauncher": 692, "clawitzer": 693, "helioptile": 694, "heliolisk": 695, "tyrunt": 696, "tyrantrum": 697, "amaura": 698, "aurorus": 699, "sylveon": 700, "hawlucha": 701, "dedenne": 702, "carbink": 703, "goomy": 704, "sliggoo": 705, "goodra": 706, "klefki": 707, "phantump": 708, "trevenant": 709, "pumpkaboo average": 710, "pumpkaboo-average": 710, "gourgeist average": 711, "gourgeist-average": 711, "bergmite": 712, "avalugg": 713, "noibat": 714, "noivern": 715, "xerneas": 716, "yveltal": 717, "zygarde 50": 718, "zygarde-50": 718, "diancie": 719, "hoopa": 720, "volcanion": 721, "rowlet": 722, "dartrix": 723, "decidueye": 724, "litten": 725, "torracat": 726, "incineroar": 727, "popplio": 728, "brionne": 729, "primarina": 730, "pikipek": 731, "trumbeak": 732, "toucannon": 733, "yungoos": 734, "gumshoos": 735, "grubbin": 736, "charjabug": 737, "vikavolt": 738, "crabrawler": 739, "crabominable": 740, "oricorio baile": 741, "oricorio-baile": 741, "cutiefly": 742, "ribombee": 743, "rockruff": 744, "lycanroc midday": 745, "lycanroc-midday": 745, "wishiwashi solo": 746, "wishiwashi-solo": 746, "mareanie": 747, "toxapex": 748, "mudbray": 749, "mudsdale": 750, "dewpider": 751, "araquanid": 752, "fomantis": 753, "lurantis": 754, "morelull": 755, "shiinotic": 756, "salandit": 757, "salazzle": 758, "stufful": 759, "bewear": 760, "bounsweet": 761, "steenee": 762, "tsareena": 763, "comfey": 764, "oranguru": 765, "passimian": 766, "wimpod": 767, "golisopod": 768, "sandygast": 769, "palossand": 770, "pyukumuku": 771, "type null": 772, "type-null": 772, "silvally": 773, "minior red meteor": 774, "minior-red-meteor": 774, "komala": 775, "turtonator": 776, "togedemaru": 777, "mimikyu disguised": 778, "mimikyu-disguised": 778, "bruxish": 779, "drampa": 780, "dhelmise": 781, "jangmo o": 782, "jangmo-o": 782, "hakamo o": 783, "hakamo-o": 783, "kommo o": 784, "kommo-o": 784, "tapu koko": 785, "tapu-koko": 785, "tapu lele": 786, "tapu-lele": 786, "tapu bulu": 787, "tapu-bulu": 787, "tapu fini": 788, "tapu-fini": 788, "cosmog": 789, "cosmoem": 790, "solgaleo": 791, "lunala": 792, "nihilego": 793, "buzzwole": 794, "pheromosa": 795, "xurkitree": 796, "celesteela": 797, "kartana": 798, "guzzlord": 799, "necrozma": 800, "magearna": 801, "marshadow": 802, "poipole": 803, "naganadel": 804, "stakataka": 805, "blacephalon": 806, "zeraora": 807, "meltan": 808, "melmetal": 809, "grookey": 810, "thwackey": 811, "rillaboom": 812, "scorbunny": 813, "raboot": 814, "cinderace": 815, "sobble": 816, "drizzile": 817, "inteleon": 818, "skwovet": 819, "greedent": 820, "rookidee": 821, "corvisquire": 822, "corviknight": 823, "blipbug": 824, "dottler": 825, "orbeetle": 826, "nickit": 827, "thievul": 828, "gossifleur": 829, "eldegoss": 830, "wooloo": 831, "dubwool": 832, "chewtle": 833, "drednaw": 834, "yamper": 835, "boltund": 836, "rolycoly": 837, "carkol": 838, "coalossal": 839, "applin": 840, "flapple": 841, "appletun": 842, "silicobra": 843, "sandaconda": 844, "cramorant": 845, "arrokuda": 846, "barraskewda": 847, "toxel": 848, "toxtricity amped": 849, "toxtricity-amped": 849, "sizzlipede": 850, "centiskorch": 851, "clobbopus": 852, "grapploct": 853, "sinistea": 854, "polteageist": 855, "hatenna": 856, "hattrem": 857, "hatterene": 858, "impidimp": 859, "morgrem": 860, "grimmsnarl": 861, "obstagoon": 862, "perrserker": 863, "cursola": 864, "sirfetchd": 865, "mr rime": 866, "mr-rime": 866, "runerigus": 867, "milcery": 868, "alcremie": 869, "falinks": 870, "pincurchin": 871, "snom": 872, "frosmoth": 873, "stonjourner": 874, "eiscue ice": 875, "eiscue-ice": 875, "indeedee male": 876, "indeedee-male": 876, "morpeko full belly": 877, "morpeko-full-belly": 877, "cufant": 878, "copperajah": 879, "dracozolt": 880, "arctozolt": 881, "dracovish": 882, "arctovish": 883, "duraludon": 884, "dreepy": 885, "drakloak": 886, "dragapult": 887, "zacian": 888, "zamazenta": 889, "eternatus": 890, "kubfu": 891, "urshifu single strike": 892, "urshifu-single-strike": 892, "zarude": 893, "regieleki": 894, "regidrago": 895, "glastrier": 896, "spectrier": 897, "calyrex": 898, "wyrdeer": 899, "kleavor": 900, "ursaluna": 901, "basculegion male": 902, "basculegion-male": 902, "sneasler": 903, "overqwil": 904, "enamorus incarnate": 905, "enamorus-incarnate": 905, "sprigatito": 906, "floragato": 907, "meowscarada": 908, "fuecoco": 909, "crocalor": 910, "skeledirge": 911, "quaxly": 912, "quaxwell": 913, "quaquaval": 914, "lechonk": 915, "oinkologne male": 916, "oinkologne-male": 916, "tarountula": 917, "spidops": 918, "nymble": 919, "lokix": 920, "pawmi": 921, "pawmo": 922, "pawmot": 923, "tandemaus": 924, "maushold family of four": 925, "maushold-family-of-four": 925, "fidough": 926, "dachsbun": 927, "smoliv": 928, "dolliv": 929, "arboliva": 930, "squawkabilly green plumage": 931, "squawkabilly-green-plumage": 931, "nacli": 932, "naclstack": 933, "garganacl": 934, "charcadet": 935, "armarouge": 936, "ceruledge": 937, "tadbulb": 938, "bellibolt": 939, "wattrel": 940, "kilowattrel": 941, "maschiff": 942, "mabosstiff": 943, "shroodle": 944, "grafaiai": 945, "bramblin": 946, "brambleghast": 947, "toedscool": 948, "toedscruel": 949, "klawf": 950, "capsakid": 951, "scovillain": 952, "rellor": 953, "rabsca": 954, "flittle": 955, "espathra": 956, "tinkatink": 957, "tinkatuff": 958, "tinkaton": 959, "wiglett": 960, "wugtrio": 961, "bombirdier": 962, "finizen": 963, "palafin zero": 964, "palafin-zero": 964, "varoom": 965, "revavroom": 966, "cyclizar": 967, "orthworm": 968, "glimmet": 969, "glimmora": 970, "greavard": 971, "houndstone": 972, "flamigo": 973, "cetoddle": 974, "cetitan": 975, "veluza": 976, "dondozo": 977, "tatsugiri curly": 978, "tatsugiri-curly": 978, "annihilape": 979, "clodsire": 980, "farigiraf": 981, "dudunsparce two segment": 982, "dudunsparce-two-segment": 982, "kingambit": 983, "great tusk": 984, "great-tusk": 984, "scream tail": 985, "scream-tail": 985, "brute bonnet": 986, "brute-bonnet": 986, "flutter mane": 987, "flutter-mane": 987, "slither wing": 988, "slither-wing": 988, "sandy shocks": 989, "sandy-shocks": 989, "iron treads": 990, "iron-treads": 990, "iron bundle": 991, "iron-bundle": 991, "iron hands": 992, "iron-hands": 992, "iron jugulis": 993, "iron-jugulis": 993, "iron moth": 994, "iron-moth": 994, "iron thorns": 995, "iron-thorns": 995, "frigibax": 996, "arctibax": 997, "baxcalibur": 998, "gimmighoul": 999, "gholdengo": 1000, "wo chien": 1001, "wo-chien": 1001, "chien pao": 1002, "chien-pao": 1002, "ting lu": 1003, "ting-lu": 1003, "chi yu": 1004, "chi-yu": 1004, "roaring moon": 1005, "roaring-moon": 1005, "iron valiant": 1006, "iron-valiant": 1006, "koraidon": 1007, "miraidon": 1008, "walking wake": 1009, "walking-wake": 1009, "iron leaves": 1010, "iron-leaves": 1010, "dipplin": 1011, "poltchageist": 1012, "sinistcha": 1013, "okidogi": 1014, "munkidori": 1015, "fezandipiti": 1016, "ogerpon": 1017, "archaludon": 1018, "hydrapple": 1019, "gouging fire": 1020, "gouging-fire": 1020, "raging bolt": 1021, "raging-bolt": 1021, "iron boulder": 1022, "iron-boulder": 1022, "iron crown": 1023, "iron-crown": 1023, "terapagos": 1024, "pecharunt": 1025};

function getRotomPokemonDexId(nameOrObj) {
  if (!nameOrObj) return 0;
  if (typeof nameOrObj === 'number') {
    if (nameOrObj > 0 && nameOrObj <= 1025) return nameOrObj;
    return 0;
  }
  if (typeof nameOrObj === 'object') {
    var numId = Number(nameOrObj.pokemonId || nameOrObj.speciesId || nameOrObj.pokeId || nameOrObj.dexId || nameOrObj.id || 0);
    if (numId > 0 && numId <= 1025) return numId;
    var name = String(nameOrObj.nome || nameOrObj.name || '').toLowerCase().trim();
    if (name && POKEMON_NAME_TO_DEX_ID[name]) return POKEMON_NAME_TO_DEX_ID[name];
    // Tenta sem caracteres especiais
    var clean = name.replace(/[^a-z0-9]/g, '');
    for (var k in POKEMON_NAME_TO_DEX_ID) {
      if (k.replace(/[^a-z0-9]/g, '') === clean) return POKEMON_NAME_TO_DEX_ID[k];
    }
    return 0;
  }
  var q = String(nameOrObj || '').toLowerCase().trim();
  if (POKEMON_NAME_TO_DEX_ID[q]) return POKEMON_NAME_TO_DEX_ID[q];
  var cleanQ = q.replace(/[^a-z0-9]/g, '');
  for (var k in POKEMON_NAME_TO_DEX_ID) {
    if (k.replace(/[^a-z0-9]/g, '') === cleanQ) return POKEMON_NAME_TO_DEX_ID[k];
  }
  return 0;
}

function getRotomPokemonSprite(nameOrObj, isShiny) {
  var dexId = getRotomPokemonDexId(nameOrObj);
  if (dexId > 0) {
    if (isShiny) {
      return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/' + dexId + '.png';
    }
    return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + dexId + '.png';
  }
  return 'https://pokeidle.io/assets/site/assets/ui/ball-poke.png';
}

function getRotomPokemonAttributesHtml(pk, options) {
  if (!pk) return '';
  options = options || {};
  var compacto = Boolean(options.compacto);

  // 1. Potência (P1 a P5)
  var pot = Number(pk.potencia) || 1;
  var potClass = 't' + Math.min(5, Math.max(1, pot));
  var potBg = pot === 5 ? 'linear-gradient(180deg, #ff8a3c, #e8322a)' : (pot === 4 ? '#8a3a92' : (pot === 3 ? '#5aa93e' : (pot === 2 ? '#4a86e8' : '#5a5668')));
  var potHtml = '<span class="pk-selo ' + potClass + '" style="background: ' + potBg + '; color: #fff; font-weight: 800; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="Potência P' + pot + '">P' + pot + '</span>';

  // 2. Qualidade (Q) - Número decimal (ex: 1.050, 1.250, 1.540, 1.789), NUNCA porcentagem
  var q = pk.quality !== undefined ? pk.quality : pk.qualidade;
  var qHtml = '';
  if (q !== undefined && q !== null && !isNaN(Number(q)) && Number(q) > 0) {
    var qNum = Number(q);
    if (qNum > 5) qNum = qNum / 100;
    var qStr = qNum.toFixed(3);
    var qVal = Number(qStr);
    var qBg = qVal >= 1.6 ? 'linear-gradient(180deg, #ff8a3c, #e8322a)' : (qVal >= 1.5 ? '#8a3a92' : (qVal >= 1.3 ? '#5aa93e' : (qVal >= 1.1 ? '#4a86e8' : '#5a5668')));
    qHtml = '<span class="pk-selo" style="background: ' + qBg + '; color: #fff; font-weight: 700; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="Qualidade: ' + qStr + '">Q ' + qStr + '</span>';
  }

  // 3. IV Total
  var iv = pk.ivTotal !== undefined ? pk.ivTotal : pk.iv;
  if (iv == null && pk.ivs && typeof pk.ivs === 'object') {
    iv = Object.values(pk.ivs).reduce(function(s, v) { return s + (Number(v) || 0); }, 0);
  }
  var ivHtml = '';
  if (iv !== undefined && iv !== null && !isNaN(Number(iv))) {
    var ivVal = Math.round(Number(iv));
    var ivBg = ivVal >= 163 ? 'linear-gradient(180deg, #ff8a3c, #e8322a)' : (ivVal >= 134 ? '#8a3a92' : (ivVal >= 96 ? '#5aa93e' : (ivVal >= 70 ? '#4a86e8' : '#5a5668')));
    ivHtml = '<span class="pk-selo" style="background: ' + ivBg + '; color: #fff; font-weight: 700; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="IV Total: ' + ivVal + ' / 192">IV ' + ivVal + '</span>';
  }

  // 4. Nota Oficial (N)
  var n = pk.nota;
  var nHtml = '';
  if (n !== undefined && n !== null && !isNaN(Number(n))) {
    var nNum = Number(n);
    var nStr = nNum.toFixed(2);
    var nBg = nNum >= 8.5 ? '#e2a93f' : (nNum >= 7.0 ? '#8a3a92' : (nNum >= 5.5 ? '#5aa93e' : (nNum >= 4.0 ? '#4a86e8' : '#5a5668')));
    var nColor = nNum >= 8.5 ? '#000' : '#fff';
    nHtml = '<span class="pk-selo" style="background: ' + nBg + '; color: ' + nColor + '; font-weight: 800; padding: 1px 5px; border-radius: 0px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);" title="Nota Oficial: ' + nStr + '">N ' + nStr + '</span>';
  }

  var gap = compacto ? '3px' : '4px';
  return '<div class="pk-selos" style="display: flex; flex-wrap: wrap; gap: ' + gap + '; align-items: center;">' +
    potHtml + qHtml + ivHtml + nHtml +
  '</div>';
}

if (typeof window !== 'undefined') {
  window.POKEMON_NAME_TO_DEX_ID = POKEMON_NAME_TO_DEX_ID;
  window.getRotomPokemonDexId = getRotomPokemonDexId;
  window.getRotomPokemonSprite = getRotomPokemonSprite;
  window.getRotomPokemonAttributesHtml = getRotomPokemonAttributesHtml;

  window.POKEIDLE_ITEMS_DB = POKEIDLE_ITEMS_DB;
  window.POKEIDLE_ITEMS_BY_ID = POKEIDLE_ITEMS_BY_ID;
  window.ROTOM_ITEMS_DB = POKEIDLE_ITEMS_DB;
  window.getAllRotomItems = function() { return POKEIDLE_ITEMS_DB; };
  window.registerRotomItems = registerRotomItems;
  window.categoriaRotomItem = categoriaRotomItem;
  window.registerRotomNames = registerRotomNames;
  window.getRotomItem = getRotomItem;
  window.searchRotomItems = searchRotomItems;
  window.getItemIconUrl = getItemIconUrl;
}

// hunts_db.js - Base Oficial Compacta de Hunts, Bosses e Fraquezas para Rotom Cockpit
(function(window) {
  'use strict';

  window.ROTOM_HUNTS_DB = [{"slug":"caterpie","nome":"Caterpie","lvl":1,"reg":"Kanto","pid":10,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":44,"gp":18,"drops":[{"n":"Bug Gosme","c":95.0},{"n":"Pot of Moss Bug","c":63.6},{"n":"Butterfly Wing","c":8.4}],"out":false},{"slug":"weedle","nome":"Weedle","lvl":1,"reg":"Kanto","pid":13,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":44,"gp":18,"drops":[{"n":"Bug Gosme","c":91.5},{"n":"Bottles of Poison","c":91.5},{"n":"Pot of Moss Bug","c":91.5},{"n":"Bee Sting","c":5.6}],"out":false},{"slug":"pidgey","nome":"Pidgey","lvl":1,"reg":"Kanto","pid":16,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":44,"gp":18,"drops":[{"n":"Straw","c":74.6},{"n":"Rubber Ball","c":74.6},{"n":"Feather","c":12.9},{"n":"Colored Feather","c":4.3}],"out":false},{"slug":"rattata","nome":"Rattata","lvl":1,"reg":"Kanto","pid":19,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":44,"gp":18,"drops":[{"n":"Rubber Ball","c":91.5},{"n":"Bitten Apple","c":91.5},{"n":"Rat Tail","c":9.0},{"n":"Sun Stone","c":0.3}],"out":false},{"slug":"oddish","nome":"Oddish","lvl":1,"reg":"Kanto","pid":43,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":44,"gp":18,"drops":[{"n":"Seed","c":95.0},{"n":"Bottles of Poison","c":95.0},{"n":"Bag of Pollen","c":12.6},{"n":"Strange Flower","c":4.2}],"out":false},{"slug":"paras","nome":"Paras","lvl":1,"reg":"Kanto","pid":46,"types":["BUG","GRASS"],"w4x":["FIRE","FLYING"],"w2x":["ICE","POISON","BUG","ROCK"],"xp":44,"gp":18,"drops":[{"n":"Bug Gosme","c":90.1},{"n":"Seed","c":90.1},{"n":"Bag of Pollen","c":6.0},{"n":"Mushroom","c":5.6}],"out":false},{"slug":"poliwag","nome":"Poliwag","lvl":1,"reg":"Kanto","pid":60,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":44,"gp":18,"drops":[{"n":"Water Gem","c":71.0},{"n":"Water Pendant","c":71.0},{"n":"Strange Thing","c":0.0}],"out":false},{"slug":"bellsprout","nome":"Bellsprout","lvl":1,"reg":"Kanto","pid":69,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":44,"gp":18,"drops":[{"n":"Seed","c":84.2},{"n":"Bottles of Poison","c":84.2},{"n":"Leaves","c":84.2},{"n":"Plant Tail","c":3.2}],"out":false},{"slug":"geodude","nome":"Geodude","lvl":1,"reg":"Kanto","pid":74,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":44,"gp":18,"drops":[{"n":"Small Stone","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Stone Orb","c":28.4},{"n":"Strange Rock","c":1.0},{"n":"Rock Stone","c":0.1}],"out":false},{"slug":"togepi","nome":"Togepi","lvl":1,"reg":"Johto","pid":175,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":44,"gp":18,"drops":[{"n":"Rubber Ball","c":47.0},{"n":"Heart Stone","c":0.1},{"n":"Eggshell","c":0.9},{"n":"Feather","c":11.8}],"out":false},{"slug":"hoppip","nome":"Hoppip","lvl":1,"reg":"Johto","pid":187,"types":["GRASS","FLYING"],"w4x":["ICE"],"w2x":["FIRE","POISON","FLYING","ROCK"],"xp":44,"gp":18,"drops":[{"n":"Straw","c":13.8},{"n":"Seed","c":13.8},{"n":"Bag of Pollen","c":13.8},{"n":"Yellow Flower","c":0.4}],"out":false},{"slug":"sunkern","nome":"Sunkern","lvl":1,"reg":"Johto","pid":191,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":44,"gp":18,"drops":[{"n":"Seed","c":95.0},{"n":"Leaves","c":45.3},{"n":"Helicopter Leaves","c":10.5}],"out":false},{"slug":"metapod","nome":"Metapod","lvl":10,"reg":"Kanto","pid":11,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Bug Gosme","c":95.0},{"n":"Pot of Moss Bug","c":64.3},{"n":"Butterfly Wing","c":7.6}],"out":false},{"slug":"kakuna","nome":"Kakuna","lvl":10,"reg":"Kanto","pid":14,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Bug Gosme","c":95.0},{"n":"Bottles of Poison","c":95.0},{"n":"Pot of Moss Bug","c":64.9},{"n":"Bee Sting","c":7.9}],"out":false},{"slug":"spearow","nome":"Spearow","lvl":10,"reg":"Kanto","pid":21,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Straw","c":95.0},{"n":"Rubber Ball","c":95.0},{"n":"Feather","c":63.5},{"n":"Red Wing","c":3.3}],"out":false},{"slug":"ekans","nome":"Ekans","lvl":10,"reg":"Kanto","pid":23,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":170,"gp":72,"drops":[{"n":"Bottles of Poison","c":92.3},{"n":"Tooth","c":92.3},{"n":"Snake Tail","c":3.7}],"out":false},{"slug":"nidoranfe","nome":"Nidoranfe","lvl":10,"reg":"Kanto","pid":29,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":170,"gp":72,"drops":[{"n":"Bottles of Poison","c":85.9},{"n":"Sandbag","c":85.9},{"n":"Female Ear","c":0.0}],"out":false},{"slug":"nidoranma","nome":"Nidoranma","lvl":10,"reg":"Kanto","pid":32,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":170,"gp":72,"drops":[{"n":"Bottles of Poison","c":83.4},{"n":"Sandbag","c":83.4},{"n":"Male Ear","c":0.0}],"out":false},{"slug":"zubat","nome":"Zubat","lvl":10,"reg":"Kanto","pid":41,"types":["POISON","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","PSYCHIC","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Straw","c":95.0},{"n":"Tooth","c":64.7},{"n":"Bat Wing","c":5.5}],"out":false},{"slug":"diglett","nome":"Diglett","lvl":10,"reg":"Kanto","pid":50,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":170,"gp":72,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":28.1},{"n":"Piece of Diglett","c":6.3},{"n":"Earth Stone","c":0.1}],"out":false},{"slug":"mankey","nome":"Mankey","lvl":10,"reg":"Kanto","pid":56,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":170,"gp":72,"drops":[{"n":"Band Aid","c":95.0},{"n":"Fur","c":28.5},{"n":"Iron Bracelet","c":6.8}],"out":false},{"slug":"abra","nome":"Abra","lvl":10,"reg":"Kanto","pid":63,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":170,"gp":72,"drops":[{"n":"Enchanted Gem","c":90.2},{"n":"Future Orb","c":90.2},{"n":"Psychic Spoon","c":0.0}],"out":false},{"slug":"tentacool","nome":"Tentacool","lvl":10,"reg":"Kanto","pid":72,"types":["WATER","POISON"],"w4x":[],"w2x":["ELECTRIC","GROUND","PSYCHIC"],"xp":170,"gp":72,"drops":[{"n":"Water Gem","c":95.0},{"n":"Bottles of Poison","c":95.0},{"n":"Ruby","c":7.6},{"n":"Giant Ruby","c":0.8}],"out":false},{"slug":"slowpoke","nome":"Slowpoke","lvl":10,"reg":"Kanto","pid":79,"types":["WATER","PSYCHIC"],"w4x":[],"w2x":["GRASS","ELECTRIC","BUG","GHOST","DARK"],"xp":170,"gp":72,"drops":[{"n":"Water Gem","c":95.0},{"n":"Enchanted Gem","c":95.0},{"n":"Water Pendant","c":15.8},{"n":"Slow Tail","c":4.1}],"out":false},{"slug":"magnemite","nome":"Magnemite","lvl":10,"reg":"Kanto","pid":81,"types":["ELECTRIC","STEEL"],"w4x":["GROUND"],"w2x":["FIRE","FIGHTING"],"xp":170,"gp":72,"drops":[{"n":"Screw","c":95.0},{"n":"Piece of Steel","c":95.0},{"n":"Electric Box","c":25.6},{"n":"Magnet","c":9.7}],"out":false},{"slug":"doduo","nome":"Doduo","lvl":10,"reg":"Kanto","pid":84,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Straw","c":95.0},{"n":"Rubber Ball","c":95.0},{"n":"Bird Beak","c":18.6},{"n":"Dodrio Feather","c":5.7}],"out":false},{"slug":"grimer","nome":"Grimer","lvl":10,"reg":"Kanto","pid":88,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":170,"gp":72,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Gosme","c":15.4}],"out":false},{"slug":"shellder","nome":"Shellder","lvl":10,"reg":"Kanto","pid":90,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":170,"gp":72,"drops":[{"n":"Water Gem","c":95.0},{"n":"Ice Orb","c":27.6},{"n":"Locksmith of Shell","c":10.8},{"n":"Water Pendant","c":7.5}],"out":false},{"slug":"krabby","nome":"Krabby","lvl":10,"reg":"Kanto","pid":98,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":170,"gp":72,"drops":[{"n":"Water Gem","c":89.0},{"n":"Water Pendant","c":89.0},{"n":"Crab Claw","c":2.3}],"out":false},{"slug":"exeggcute","nome":"Exeggcute","lvl":10,"reg":"Kanto","pid":102,"types":["GRASS","PSYCHIC"],"w4x":["BUG"],"w2x":["FIRE","ICE","POISON","FLYING","GHOST","DARK"],"xp":170,"gp":72,"drops":[{"n":"Seed","c":95.0},{"n":"Enchanted Gem","c":95.0},{"n":"Leaves","c":64.5},{"n":"Plant Foot","c":5.5}],"out":false},{"slug":"voltorb","nome":"Voltorb","lvl":10,"reg":"Kanto","pid":100,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":170,"gp":72,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Box","c":64.2}],"out":false},{"slug":"koffing","nome":"Koffing","lvl":10,"reg":"Kanto","pid":109,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":170,"gp":72,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Venom Flute","c":14.5}],"out":false},{"slug":"chinchou","nome":"Chinchou","lvl":10,"reg":"Johto","pid":170,"types":["WATER","ELECTRIC"],"w4x":[],"w2x":["GRASS","ELECTRIC","GROUND"],"xp":170,"gp":72,"drops":[{"n":"Screw","c":48.8},{"n":"Water Gem","c":48.8},{"n":"Electric Box","c":12.2},{"n":"Thunder Stone","c":0.1},{"n":"Point Of Light","c":3.8},{"n":"Water Pendant","c":15.4}],"out":false},{"slug":"pineco","nome":"Pineco","lvl":10,"reg":"Johto","pid":204,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Bug Gosme","c":1.3},{"n":"Cocoon Stone","c":0.0},{"n":"Piece Of Shell","c":10.5},{"n":"Pot of Moss Bug","c":29.9}],"out":false},{"slug":"slugma","nome":"Slugma","lvl":10,"reg":"Johto","pid":218,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Essence of Fire","c":8.6},{"n":"Pot of Lava","c":8.6},{"n":"Fire Stone","c":0.0},{"n":"Fire Ear","c":8.0}],"out":false},{"slug":"swinub","nome":"Swinub","lvl":10,"reg":"Johto","pid":220,"types":["ICE","GROUND"],"w4x":[],"w2x":["FIRE","WATER","GRASS","ICE","FIGHTING","STEEL"],"xp":170,"gp":72,"drops":[{"n":"Earth Ball","c":75.1},{"n":"Snowball","c":75.1},{"n":"Fur","c":23.5},{"n":"Ice Orb","c":7.5},{"n":"Ice Stone","c":0.1},{"n":"Tusk","c":0.0}],"out":false},{"slug":"horsea","nome":"Horsea","lvl":10,"reg":"Kanto","pid":116,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":170,"gp":72,"drops":[{"n":"Water Gem","c":95.0},{"n":"Seahorse Tail","c":3.4}],"out":false},{"slug":"sentret","nome":"Sentret","lvl":10,"reg":"Johto","pid":161,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":170,"gp":72,"drops":[{"n":"Rubber Ball","c":8.5},{"n":"Fur","c":3.2},{"n":"Squirrel Tail","c":2.1},{"n":"Sun Stone","c":0.3}],"out":false},{"slug":"goldeen","nome":"Goldeen","lvl":10,"reg":"Kanto","pid":118,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":170,"gp":72,"drops":[{"n":"Water Gem","c":95.0},{"n":"Horn","c":34.2},{"n":"Fish Fin","c":1.1}],"out":false},{"slug":"ledyba","nome":"Ledyba","lvl":10,"reg":"Johto","pid":165,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":170,"gp":72,"drops":[{"n":"Straw","c":4.8},{"n":"Bug Gosme","c":0.5},{"n":"Ladybug Wing","c":1.2},{"n":"Pot of Moss Bug","c":1.2}],"out":false},{"slug":"remoraid","nome":"Remoraid","lvl":10,"reg":"Johto","pid":223,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":170,"gp":72,"drops":[{"n":"Water Gem","c":12.7},{"n":"Water Stone","c":0.1},{"n":"Tentacle","c":2.8},{"n":"Water Pendant","c":3.2}],"out":false},{"slug":"spinarak","nome":"Spinarak","lvl":10,"reg":"Johto","pid":167,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":170,"gp":72,"drops":[{"n":"Bug Gosme","c":21.8},{"n":"Bottles of Poison","c":3.3},{"n":"Venom Stone","c":0.1},{"n":"Spider Leg","c":4.8},{"n":"Pot of Moss Bug","c":5.4}],"out":false},{"slug":"charmander","nome":"Charmander","lvl":20,"reg":"Kanto","pid":4,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Essence of Fire","c":69.7},{"n":"Pot of Lava","c":69.7},{"n":"Fire Tail","c":2.9}],"out":false},{"slug":"bulbasaur","nome":"Bulbasaur","lvl":20,"reg":"Kanto","pid":1,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":310,"gp":132,"drops":[{"n":"Bottles of Poison","c":62.5},{"n":"Seed","c":62.5},{"n":"Leaves","c":62.5},{"n":"Bag of Pollen","c":17.6},{"n":"Bulb","c":1.5}],"out":false},{"slug":"squirtle","nome":"Squirtle","lvl":20,"reg":"Kanto","pid":7,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":310,"gp":132,"drops":[{"n":"Water Gem","c":70.0},{"n":"Water Pendant","c":70.0},{"n":"Squirtle Hull","c":7.8}],"out":false},{"slug":"pidgeotto","nome":"Pidgeotto","lvl":20,"reg":"Kanto","pid":17,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Straw","c":95.0},{"n":"Feather","c":23.2},{"n":"Colored Feather","c":4.2},{"n":"Heart Stone","c":0.1},{"n":"Feather Stone","c":0.1}],"out":false},{"slug":"sandshrew","nome":"Sandshrew","lvl":20,"reg":"Kanto","pid":27,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":310,"gp":132,"drops":[{"n":"Earth Ball","c":68.0},{"n":"Sandbag","c":51.4},{"n":"Armadillo Claw","c":6.1}],"out":false},{"slug":"vulpix","nome":"Vulpix","lvl":20,"reg":"Kanto","pid":37,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Essence of Fire","c":70.5},{"n":"Comb","c":8.8},{"n":"Fur","c":7.9},{"n":"Fox Tail","c":0.9}],"out":false},{"slug":"venonat","nome":"Venonat","lvl":20,"reg":"Kanto","pid":48,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Bottles of Poison","c":65.1},{"n":"Bug Gosme","c":65.1},{"n":"Bag of Pollen","c":8.0},{"n":"Bug Antenna","c":5.3},{"n":"Bug Venom","c":2.0}],"out":false},{"slug":"meowth","nome":"Meowth","lvl":20,"reg":"Kanto","pid":52,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":310,"gp":132,"drops":[{"n":"Rubber Ball","c":72.0},{"n":"Nail","c":19.3},{"n":"Wool Ball","c":13.7},{"n":"Luck Medallion","c":0.7},{"n":"Sun Stone","c":0.3}],"out":false},{"slug":"psyduck","nome":"Psyduck","lvl":20,"reg":"Kanto","pid":54,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":310,"gp":132,"drops":[{"n":"Water Gem","c":68.7},{"n":"Water Pendant","c":68.7},{"n":"Psyduck Mug","c":7.8}],"out":false},{"slug":"machop","nome":"Machop","lvl":20,"reg":"Kanto","pid":66,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":310,"gp":132,"drops":[{"n":"Band Aid","c":69.6},{"n":"Belt of Champion","c":1.7}],"out":false},{"slug":"ponyta","nome":"Ponyta","lvl":20,"reg":"Kanto","pid":77,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Pot of Lava","c":32.0},{"n":"Fire Horse Foot","c":2.6},{"n":"Heart Stone","c":0.1}],"out":false},{"slug":"seel","nome":"Seel","lvl":20,"reg":"Kanto","pid":86,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":310,"gp":132,"drops":[{"n":"Water Gem","c":71.0},{"n":"Ice Orb","c":35.9},{"n":"Water Pendant","c":15.4},{"n":"Seal Tail","c":3.3}],"out":false},{"slug":"gastly","nome":"Gastly","lvl":20,"reg":"Kanto","pid":92,"types":["GHOST","POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC","DARK"],"xp":310,"gp":132,"drops":[{"n":"Bottles of Poison","c":58.2},{"n":"Ghost Essence","c":58.2},{"n":"Traces of Ghost","c":8.5}],"out":false},{"slug":"cubone","nome":"Cubone","lvl":20,"reg":"Kanto","pid":104,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":310,"gp":132,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":71.3},{"n":"Bone","c":9.7}],"out":false},{"slug":"staryu","nome":"Staryu","lvl":20,"reg":"Kanto","pid":120,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":310,"gp":132,"drops":[{"n":"Water Gem","c":95.0},{"n":"Gem Star","c":0.0},{"n":"Ruby","c":0.0}],"out":false},{"slug":"omanyte","nome":"Omanyte","lvl":20,"reg":"Kanto","pid":138,"types":["ROCK","WATER"],"w4x":["GRASS"],"w2x":["WATER","ELECTRIC","FIGHTING","GROUND"],"xp":310,"gp":132,"drops":[{"n":"Small Stone","c":78.8},{"n":"Water Gem","c":78.8},{"n":"Stone Orb","c":66.5},{"n":"Helix Fossil","c":1.7}],"out":false},{"slug":"kabuto","nome":"Kabuto","lvl":20,"reg":"Kanto","pid":140,"types":["ROCK","WATER"],"w4x":["GRASS"],"w2x":["WATER","ELECTRIC","FIGHTING","GROUND"],"xp":310,"gp":132,"drops":[{"n":"Small Stone","c":72.4},{"n":"Water Gem","c":72.4},{"n":"Stone Orb","c":69.2},{"n":"Dome Fossil","c":1.7}],"out":false},{"slug":"chikorita","nome":"Chikorita","lvl":20,"reg":"Johto","pid":152,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":310,"gp":132,"drops":[{"n":"Seed","c":95.0},{"n":"Leaves","c":71.5},{"n":"Bag of Pollen","c":16.5},{"n":"Leaf Stone","c":0.2},{"n":"Great Petal","c":0.0}],"out":false},{"slug":"cyndaquil","nome":"Cyndaquil","lvl":20,"reg":"Johto","pid":155,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Essence of Fire","c":14.5},{"n":"Fire Stone","c":0.1},{"n":"Hot Fur","c":10.3},{"n":"Pot of Lava","c":18.4},{"n":"Fur","c":18.4}],"out":false},{"slug":"totodile","nome":"Totodile","lvl":20,"reg":"Johto","pid":158,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":310,"gp":132,"drops":[{"n":"Water Gem","c":7.0},{"n":"Water Stone","c":0.1},{"n":"Nail","c":26.5},{"n":"Red Scale","c":6.6},{"n":"Water Pendant","c":26.5}],"out":false},{"slug":"cleffa","nome":"Cleffa","lvl":20,"reg":"Johto","pid":173,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":310,"gp":132,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Heart Stone","c":0.1},{"n":"Topknot","c":4.3},{"n":"Comb","c":4.3}],"out":false},{"slug":"pichu","nome":"Pichu","lvl":20,"reg":"Johto","pid":172,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":310,"gp":132,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Rat Tail","c":2.0},{"n":"Electric Box","c":40.5},{"n":"Thunder Stone","c":0.1}],"out":false},{"slug":"igglybuff","nome":"Igglybuff","lvl":20,"reg":"Johto","pid":174,"types":["NORMAL","FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":310,"gp":132,"drops":[{"n":"Rubber Ball","c":36.7},{"n":"Microphone","c":0.2},{"n":"Heart Stone","c":0.1},{"n":"Comb","c":13.5}],"out":false},{"slug":"mareep","nome":"Mareep","lvl":20,"reg":"Johto","pid":179,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":310,"gp":132,"drops":[{"n":"Screw","c":9.6},{"n":"Electric Box","c":2.4},{"n":"Thunder Stone","c":0.0},{"n":"Sheep Wool","c":15.0}],"out":false},{"slug":"marill","nome":"Marill","lvl":20,"reg":"Johto","pid":183,"types":["WATER","FAIRY"],"w4x":[],"w2x":["GRASS","ELECTRIC","POISON"],"xp":310,"gp":132,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Water Gem","c":30.6},{"n":"Heart Stone","c":0.2},{"n":"Blue Ball","c":8.2},{"n":"Water Pendant","c":32.7}],"out":false},{"slug":"houndour","nome":"Houndour","lvl":20,"reg":"Johto","pid":228,"types":["DARK","FIRE"],"w4x":[],"w2x":["WATER","FIGHTING","GROUND","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Dark Gem","c":95.0},{"n":"Fire Stone","c":0.1},{"n":"Strange Bone","c":4.0},{"n":"Pot of Lava","c":15.8}],"out":false},{"slug":"phanpy","nome":"Phanpy","lvl":20,"reg":"Johto","pid":231,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":310,"gp":132,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Earth Stone","c":0.1},{"n":"Elephant Foot","c":5.0},{"n":"Sandbag","c":19.8}],"out":false},{"slug":"hoothoot","nome":"Hoothoot","lvl":20,"reg":"Johto","pid":163,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":310,"gp":132,"drops":[{"n":"Straw","c":49.7},{"n":"Rubber Ball","c":49.7},{"n":"Feather","c":49.7},{"n":"Owl Feather","c":9.0}],"out":false},{"slug":"wooper","nome":"Wooper","lvl":20,"reg":"Johto","pid":194,"types":["WATER","GROUND"],"w4x":["GRASS"],"w2x":["WATER"],"xp":310,"gp":132,"drops":[{"n":"Water Gem","c":72.8},{"n":"Earth Ball","c":18.2},{"n":"Sandbag","c":18.2},{"n":"Water Pendant","c":18.2},{"n":"Wooper Horn","c":10.1}],"out":false},{"slug":"butterfree","nome":"Butterfree","lvl":30,"reg":"Kanto","pid":12,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":450,"gp":192,"drops":[{"n":"Bug Gosme","c":81.7},{"n":"Straw","c":81.7},{"n":"Pot of Moss Bug","c":44.1},{"n":"Bag of Pollen","c":16.5},{"n":"Butterfly Wing","c":7.9},{"n":"Cocoon Stone","c":0.2}],"out":false},{"slug":"beedrill","nome":"Beedrill","lvl":30,"reg":"Kanto","pid":15,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":450,"gp":192,"drops":[{"n":"Bug Gosme","c":95.0},{"n":"Bottles of Poison","c":95.0},{"n":"Pot of Moss Bug","c":46.3},{"n":"Bag of Pollen","c":18.5},{"n":"Bee Sting","c":8.8},{"n":"Venom Stone","c":0.1},{"n":"Cocoon Stone","c":0.1}],"out":false},{"slug":"raticate","nome":"Raticate","lvl":30,"reg":"Kanto","pid":20,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":450,"gp":192,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Bitten Apple","c":82.9},{"n":"Rat Tail","c":11.0},{"n":"Heart Stone","c":0.2}],"out":false},{"slug":"nidorina","nome":"Nidorina","lvl":30,"reg":"Kanto","pid":30,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":450,"gp":192,"drops":[{"n":"Bottles of Poison","c":85.8},{"n":"Sandbag","c":34.0},{"n":"Female Ear","c":4.6},{"n":"Venom Stone","c":0.2}],"out":false},{"slug":"nidorino","nome":"Nidorino","lvl":30,"reg":"Kanto","pid":33,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":450,"gp":192,"drops":[{"n":"Bottles of Poison","c":88.1},{"n":"Sandbag","c":31.4},{"n":"Male Ear","c":4.3},{"n":"Venom Stone","c":0.2}],"out":false},{"slug":"gloom","nome":"Gloom","lvl":30,"reg":"Kanto","pid":44,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":450,"gp":192,"drops":[{"n":"Seed","c":95.0},{"n":"Bottles of Poison","c":95.0},{"n":"Bag of Pollen","c":23.2},{"n":"Strange Flower","c":6.5},{"n":"Venom Stone","c":0.1},{"n":"Leaf Stone","c":0.1}],"out":false},{"slug":"primeape","nome":"Primeape","lvl":30,"reg":"Kanto","pid":57,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":450,"gp":192,"drops":[{"n":"Band Aid","c":60.1},{"n":"Fur","c":19.5},{"n":"Iron Bracelet","c":5.2},{"n":"Punch Stone","c":0.1}],"out":false},{"slug":"growlithe","nome":"Growlithe","lvl":30,"reg":"Kanto","pid":58,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":450,"gp":192,"drops":[{"n":"Essence of Fire","c":64.6},{"n":"Fur","c":46.7},{"n":"Pot of Lava","c":41.2},{"n":"Giant Piece of Fur","c":7.1}],"out":false},{"slug":"poliwhirl","nome":"Poliwhirl","lvl":30,"reg":"Kanto","pid":61,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":450,"gp":192,"drops":[{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":93.2},{"n":"Strange Thing","c":6.6},{"n":"Water Stone","c":0.2}],"out":false},{"slug":"weepinbell","nome":"Weepinbell","lvl":30,"reg":"Kanto","pid":70,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":450,"gp":192,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Seed","c":95.0},{"n":"Leaves","c":79.7},{"n":"Plant Tail","c":6.1},{"n":"Venom Stone","c":0.1},{"n":"Leaf Stone","c":0.1}],"out":false},{"slug":"drowzee","nome":"Drowzee","lvl":30,"reg":"Kanto","pid":96,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":450,"gp":192,"drops":[{"n":"Enchanted Gem","c":53.1},{"n":"Future Orb","c":44.5},{"n":"Linearly Guided Hypnosis","c":4.8}],"out":false},{"slug":"rhyhorn","nome":"Rhyhorn","lvl":30,"reg":"Kanto","pid":111,"types":["GROUND","ROCK"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":450,"gp":192,"drops":[{"n":"Earth Ball","c":61.0},{"n":"Small Stone","c":61.0},{"n":"Horn","c":34.6},{"n":"Horn Drill","c":1.2},{"n":"Stone Orb","c":46.2}],"out":false},{"slug":"dratini","nome":"Dratini","lvl":30,"reg":"Kanto","pid":147,"types":["DRAGON"],"w4x":[],"w2x":["ICE","FAIRY"],"xp":450,"gp":192,"drops":[{"n":"Dragon Scale","c":48.0},{"n":"Dragon Tooth","c":2.3},{"n":"Dragon Tail","c":2.3}],"out":false},{"slug":"natu","nome":"Natu","lvl":30,"reg":"Johto","pid":177,"types":["PSYCHIC","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK","GHOST","DARK"],"xp":450,"gp":192,"drops":[{"n":"Straw","c":37.3},{"n":"Enchanted Gem","c":37.3},{"n":"Feather","c":37.3},{"n":"Enigma Stone","c":0.2},{"n":"Strange Wing","c":7.8}],"out":false},{"slug":"sunflora","nome":"Sunflora","lvl":30,"reg":"Johto","pid":192,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":450,"gp":192,"drops":[{"n":"Seed","c":54.5},{"n":"Leaf Stone","c":0.1},{"n":"Helicopter Leaves","c":12.3},{"n":"Leaves","c":15.2}],"out":false},{"slug":"snubbull","nome":"Snubbull","lvl":30,"reg":"Johto","pid":209,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":450,"gp":192,"drops":[{"n":"Rubber Ball","c":25.4},{"n":"Heart Stone","c":0.1},{"n":"Dog Ear","c":7.2}],"out":false},{"slug":"teddiursa","nome":"Teddiursa","lvl":30,"reg":"Johto","pid":216,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":450,"gp":192,"drops":[{"n":"Rubber Ball","c":35.6},{"n":"Fur","c":35.6},{"n":"Bear Paw","c":0.8},{"n":"Sun Stone","c":0.4}],"out":false},{"slug":"tyrogue","nome":"Tyrogue","lvl":30,"reg":"Johto","pid":236,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":450,"gp":192,"drops":[{"n":"Band Aid","c":21.4},{"n":"Sandbag","c":21.4},{"n":"Punch Machine","c":5.3},{"n":"Punch Stone","c":0.1}],"out":false},{"slug":"smoochum","nome":"Smoochum","lvl":30,"reg":"Johto","pid":238,"types":["ICE","PSYCHIC"],"w4x":[],"w2x":["FIRE","BUG","ROCK","GHOST","DARK","STEEL"],"xp":450,"gp":192,"drops":[{"n":"Enchanted Gem","c":47.5},{"n":"Snowball","c":15.3},{"n":"Ice Stone","c":0.2},{"n":"Ice Bra","c":1.3},{"n":"Ice Orb","c":12.7}],"out":false},{"slug":"elekid","nome":"Elekid","lvl":30,"reg":"Johto","pid":239,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":450,"gp":192,"drops":[{"n":"Screw","c":9.8},{"n":"Electric Box","c":9.8},{"n":"Electric Tail","c":2.4},{"n":"Thunder Stone","c":0.1}],"out":false},{"slug":"magby","nome":"Magby","lvl":30,"reg":"Johto","pid":240,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":450,"gp":192,"drops":[{"n":"Essence of Fire","c":53.0},{"n":"Fire Stone","c":0.2},{"n":"Magma Foot","c":3.4},{"n":"Pot of Lava","c":13.7}],"out":false},{"slug":"larvitar","nome":"Larvitar","lvl":30,"reg":"Johto","pid":246,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":450,"gp":192,"drops":[{"n":"Small Stone","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Rock Stone","c":0.2},{"n":"Lizard Tail","c":2.2},{"n":"Stone Orb","c":8.9},{"n":"Sandbag","c":8.9}],"out":false},{"slug":"skiploom","nome":"Skiploom","lvl":30,"reg":"Johto","pid":188,"types":["GRASS","FLYING"],"w4x":["ICE"],"w2x":["FIRE","POISON","FLYING","ROCK"],"xp":450,"gp":192,"drops":[{"n":"Straw","c":9.8},{"n":"Seed","c":9.8},{"n":"Bag of Pollen","c":9.8},{"n":"Leaf Stone","c":0.2},{"n":"Yellow Flower","c":1.7}],"out":false},{"slug":"dunsparce","nome":"Dunsparce","lvl":30,"reg":"Johto","pid":206,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":450,"gp":192,"drops":[{"n":"Rubber Ball","c":10.1},{"n":"Small Wing","c":2.5},{"n":"Sun Stone","c":0.4}],"out":false},{"slug":"ivysaur","nome":"Ivysaur","lvl":40,"reg":"Kanto","pid":2,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":590,"gp":252,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Seed","c":95.0},{"n":"Leaves","c":57.1},{"n":"Bag of Pollen","c":21.4},{"n":"Bulb","c":3.6},{"n":"Venom Stone","c":0.1},{"n":"Leaf Stone","c":0.1}],"out":false},{"slug":"wartortle","nome":"Wartortle","lvl":40,"reg":"Kanto","pid":8,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":590,"gp":252,"drops":[{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":75.0},{"n":"Squirtle Hull","c":5.6},{"n":"Water Stone","c":0.2}],"out":false},{"slug":"charmeleon","nome":"Charmeleon","lvl":40,"reg":"Kanto","pid":5,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":590,"gp":252,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Pot of Lava","c":69.5},{"n":"Fire Tail","c":6.3},{"n":"Fire Stone","c":0.2}],"out":false},{"slug":"arbok","nome":"Arbok","lvl":40,"reg":"Kanto","pid":24,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":590,"gp":252,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Tooth","c":68.7},{"n":"Snake Tail","c":11.6},{"n":"Venom Stone","c":0.2}],"out":false},{"slug":"clefairy","nome":"Clefairy","lvl":40,"reg":"Kanto","pid":35,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":590,"gp":252,"drops":[{"n":"Rubber Ball","c":62.4},{"n":"Comb","c":13.7},{"n":"Topknot","c":2.9},{"n":"Heart Stone","c":0.2}],"out":false},{"slug":"jigglypuff","nome":"Jigglypuff","lvl":40,"reg":"Kanto","pid":39,"types":["NORMAL","FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":590,"gp":252,"drops":[{"n":"Rubber Ball","c":68.5},{"n":"Comb","c":16.1},{"n":"Heart Stone","c":0.2},{"n":"Microphone","c":0.6}],"out":false},{"slug":"golbat","nome":"Golbat","lvl":40,"reg":"Kanto","pid":42,"types":["POISON","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","PSYCHIC","ROCK"],"xp":590,"gp":252,"drops":[{"n":"Straw","c":95.0},{"n":"Bottles of Poison","c":95.0},{"n":"Tooth","c":89.7},{"n":"Bat Wing","c":15.1},{"n":"Venom Stone","c":0.2}],"out":false},{"slug":"dugtrio","nome":"Dugtrio","lvl":40,"reg":"Kanto","pid":51,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":590,"gp":252,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":40.0},{"n":"Piece of Diglett","c":11.1},{"n":"Earth Stone","c":0.2}],"out":false},{"slug":"machoke","nome":"Machoke","lvl":40,"reg":"Kanto","pid":67,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":590,"gp":252,"drops":[{"n":"Band Aid","c":95.0},{"n":"Belt of Champion","c":1.7},{"n":"Punch Stone","c":0.2}],"out":false},{"slug":"graveler","nome":"Graveler","lvl":40,"reg":"Kanto","pid":75,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":590,"gp":252,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":37.9},{"n":"Strange Rock","c":4.1},{"n":"Earth Stone","c":0.1},{"n":"Rock Stone","c":0.1}],"out":false},{"slug":"electrode","nome":"Electrode","lvl":40,"reg":"Kanto","pid":101,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":590,"gp":252,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Box","c":79.7},{"n":"Thunder Stone","c":0.2}],"out":false},{"slug":"bayleef","nome":"Bayleef","lvl":40,"reg":"Johto","pid":153,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":590,"gp":252,"drops":[{"n":"Seed","c":71.5},{"n":"Leaves","c":40.9},{"n":"Leaf Stone","c":0.3},{"n":"Bag of Pollen","c":13.3},{"n":"Great Petal","c":8.1}],"out":false},{"slug":"croconaw","nome":"Croconaw","lvl":40,"reg":"Johto","pid":159,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":590,"gp":252,"drops":[{"n":"Water Gem","c":70.3},{"n":"Water Stone","c":0.3},{"n":"Red Scale","c":12.8},{"n":"Water Pendant","c":18.7},{"n":"Nail","c":18.7}],"out":false},{"slug":"quilava","nome":"Quilava","lvl":40,"reg":"Johto","pid":156,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":590,"gp":252,"drops":[{"n":"Essence of Fire","c":25.2},{"n":"Fire Stone","c":0.1},{"n":"Hot Fur","c":16.4},{"n":"Pot of Lava","c":18.0},{"n":"Fur","c":18.0}],"out":false},{"slug":"flaaffy","nome":"Flaaffy","lvl":40,"reg":"Johto","pid":180,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":590,"gp":252,"drops":[{"n":"Screw","c":9.9},{"n":"Electric Box","c":3.7},{"n":"Thunder Stone","c":0.0},{"n":"Sheep Wool","c":14.4}],"out":false},{"slug":"gligar","nome":"Gligar","lvl":40,"reg":"Johto","pid":207,"types":["GROUND","FLYING"],"w4x":["ICE"],"w2x":["WATER"],"xp":590,"gp":252,"drops":[{"n":"Straw","c":20.9},{"n":"Earth Ball","c":6.5},{"n":"Earth Stone","c":0.1},{"n":"Gligar Claw","c":15.1},{"n":"Sandbag","c":15.1},{"n":"Tooth","c":15.1}],"out":false},{"slug":"furret","nome":"Furret","lvl":40,"reg":"Johto","pid":162,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":590,"gp":252,"drops":[{"n":"Rubber Ball","c":8.7},{"n":"Fur","c":4.9},{"n":"Heart Stone","c":0.3},{"n":"Squirrel Tail","c":2.1}],"out":false},{"slug":"ledian","nome":"Ledian","lvl":40,"reg":"Johto","pid":166,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":590,"gp":252,"drops":[{"n":"Straw","c":4.4},{"n":"Bug Gosme","c":0.8},{"n":"Cocoon Stone","c":0.2},{"n":"Ladybug Wing","c":1.1},{"n":"Pot of Moss Bug","c":1.1}],"out":false},{"slug":"ariados","nome":"Ariados","lvl":40,"reg":"Johto","pid":168,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":590,"gp":252,"drops":[{"n":"Bug Gosme","c":31.6},{"n":"Bottles of Poison","c":7.9},{"n":"Venom Stone","c":0.1},{"n":"Cocoon Stone","c":0.1},{"n":"Pot of Moss Bug","c":7.9},{"n":"Spider Leg","c":7.7}],"out":false},{"slug":"aipom","nome":"Aipom","lvl":40,"reg":"Johto","pid":190,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":590,"gp":252,"drops":[{"n":"Rubber Ball","c":15.5},{"n":"Bitten Apple","c":3.9},{"n":"Monkey Paw","c":3.7},{"n":"Sun Stone","c":0.4}],"out":false},{"slug":"shuckle","nome":"Shuckle","lvl":40,"reg":"Johto","pid":213,"types":["BUG","ROCK"],"w4x":[],"w2x":["WATER","ROCK","STEEL"],"xp":590,"gp":252,"drops":[{"n":"Small Stone","c":95.0},{"n":"Bug Gosme","c":95.0},{"n":"Rock Stone","c":0.2},{"n":"Small Shell","c":22.0},{"n":"Pot of Moss Bug","c":22.0}],"out":false},{"slug":"delibird","nome":"Delibird","lvl":40,"reg":"Johto","pid":225,"types":["ICE","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","STEEL"],"xp":590,"gp":252,"drops":[{"n":"Straw","c":82.3},{"n":"Snowball","c":25.7},{"n":"Ice Stone","c":0.3},{"n":"Gift Bag","c":19.7},{"n":"Ice Orb","c":20.6}],"out":false},{"slug":"fearow","nome":"Fearow","lvl":50,"reg":"Kanto","pid":22,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":730,"gp":312,"drops":[{"n":"Rubber Ball","c":72.7},{"n":"Straw","c":72.7},{"n":"Bird Beak","c":33.6},{"n":"Feather","c":33.4},{"n":"Red Wing","c":9.6},{"n":"Feather Stone","c":0.3}],"out":false},{"slug":"parasect","nome":"Parasect","lvl":50,"reg":"Kanto","pid":47,"types":["BUG","GRASS"],"w4x":["FIRE","FLYING"],"w2x":["ICE","POISON","BUG","ROCK"],"xp":730,"gp":312,"drops":[{"n":"Seed","c":93.1},{"n":"Bug Gosme","c":93.1},{"n":"Bag of Pollen","c":25.1},{"n":"Mushroom","c":7.2},{"n":"Leaf Stone","c":0.1},{"n":"Cocoon Stone","c":0.1}],"out":false},{"slug":"persian","nome":"Persian","lvl":50,"reg":"Kanto","pid":53,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":730,"gp":312,"drops":[{"n":"Rubber Ball","c":58.9},{"n":"Wool Ball","c":33.9},{"n":"Nail","c":26.5},{"n":"Heart Stone","c":0.3}],"out":false},{"slug":"kadabra","nome":"Kadabra","lvl":50,"reg":"Kanto","pid":64,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":730,"gp":312,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Psychic Spoon","c":10.9},{"n":"Enigma Stone","c":0.3}],"out":false},{"slug":"farfetch_d","nome":"Farfetch'D","lvl":50,"reg":"Kanto","pid":83,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":730,"gp":312,"drops":[{"n":"Rubber Ball","c":63.9},{"n":"Straw","c":63.9},{"n":"Feather","c":63.5},{"n":"Farfetchd Stick","c":7.4},{"n":"Feather Stone","c":0.3}],"out":false},{"slug":"haunter","nome":"Haunter","lvl":50,"reg":"Kanto","pid":93,"types":["GHOST","POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC","DARK"],"xp":730,"gp":312,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Ghost Essence","c":95.0},{"n":"Traces of Ghost","c":15.7},{"n":"Darkness Stone","c":0.2},{"n":"Venom Stone","c":0.2}],"out":false},{"slug":"marowak","nome":"Marowak","lvl":50,"reg":"Kanto","pid":105,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":730,"gp":312,"drops":[{"n":"Earth Ball","c":85.5},{"n":"Sandbag","c":40.7},{"n":"Bone","c":8.1},{"n":"Earth Stone","c":0.2}],"out":false},{"slug":"tangela","nome":"Tangela","lvl":50,"reg":"Kanto","pid":114,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":730,"gp":312,"drops":[{"n":"Seed","c":95.0},{"n":"Leaf Stone","c":0.4},{"n":"Blue Vines","c":9.0}],"out":false},{"slug":"bellossom","nome":"Bellossom","lvl":50,"reg":"Johto","pid":182,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":730,"gp":312,"drops":[{"n":"Seed","c":77.9},{"n":"Strange Flower","c":27.6},{"n":"Leaves","c":77.9},{"n":"Leaf Stone","c":0.1}],"out":false},{"slug":"seaking","nome":"Seaking","lvl":50,"reg":"Kanto","pid":119,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":730,"gp":312,"drops":[{"n":"Water Gem","c":71.2},{"n":"Horn","c":23.7},{"n":"Fish Fin","c":2.4},{"n":"Water Stone","c":0.3},{"n":"Air Tank","c":0.6},{"n":"Diving Mask","c":0.6},{"n":"Fins","c":0.6}],"out":false},{"slug":"seadra","nome":"Seadra","lvl":50,"reg":"Kanto","pid":117,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":730,"gp":312,"drops":[{"n":"Water Gem","c":74.9},{"n":"Seahorse Tail","c":2.5},{"n":"Water Stone","c":0.3},{"n":"Air Tank","c":0.6},{"n":"Diving Mask","c":0.6},{"n":"Fins","c":0.6}],"out":false},{"slug":"jumpluff","nome":"Jumpluff","lvl":50,"reg":"Johto","pid":189,"types":["GRASS","FLYING"],"w4x":["ICE"],"w2x":["FIRE","POISON","FLYING","ROCK"],"xp":730,"gp":312,"drops":[{"n":"Straw","c":10.6},{"n":"Seed","c":10.6},{"n":"Bag of Pollen","c":10.6},{"n":"Leaf Stone","c":0.3},{"n":"Yellow Flower","c":1.9}],"out":false},{"slug":"yanma","nome":"Yanma","lvl":50,"reg":"Johto","pid":193,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":730,"gp":312,"drops":[{"n":"Straw","c":6.2},{"n":"Bug Gosme","c":6.2},{"n":"Cocoon Stone","c":0.3},{"n":"Insect Tail","c":1.6},{"n":"Pot of Moss Bug","c":1.6}],"out":false},{"slug":"qwilfish","nome":"Qwilfish","lvl":50,"reg":"Johto","pid":211,"types":["WATER","POISON"],"w4x":[],"w2x":["ELECTRIC","GROUND","PSYCHIC"],"xp":730,"gp":312,"drops":[{"n":"Water Gem","c":91.6},{"n":"Bottles of Poison","c":20.6},{"n":"Venom Stone","c":0.2},{"n":"Air Tank","c":1.0},{"n":"Diving Mask","c":1.0},{"n":"Fins","c":1.0},{"n":"Small Tail","c":5.0},{"n":"Water Pendant","c":19.9},{"n":"Water Stone","c":0.2}],"out":false},{"slug":"corsola","nome":"Corsola","lvl":50,"reg":"Johto","pid":222,"types":["WATER","ROCK"],"w4x":["GRASS"],"w2x":["WATER","ELECTRIC","FIGHTING","GROUND"],"xp":730,"gp":312,"drops":[{"n":"Small Stone","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Water Stone","c":0.2},{"n":"Air Tank","c":0.0},{"n":"Diving Mask","c":0.0},{"n":"Fins","c":0.0},{"n":"Piece Of Coral","c":0.0},{"n":"Rock Stone","c":0.1},{"n":"Water Pendant","c":0.0}],"out":false},{"slug":"sneasel","nome":"Sneasel","lvl":50,"reg":"Johto","pid":215,"types":["DARK","ICE"],"w4x":["FIGHTING"],"w2x":["FIRE","BUG","ROCK","STEEL","FAIRY"],"xp":730,"gp":312,"drops":[{"n":"Dark Gem","c":87.8},{"n":"Snowball","c":16.5},{"n":"Darkness Stone","c":0.1},{"n":"cat ear","c":21.9},{"n":"Ice Orb","c":21.9},{"n":"Ice Stone","c":0.2},{"n":"Wool Ball","c":18.9}],"out":false},{"slug":"stantler","nome":"Stantler","lvl":50,"reg":"Johto","pid":234,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":730,"gp":312,"drops":[{"n":"Rubber Ball","c":52.7},{"n":"Heart Stone","c":0.3},{"n":"Reindeer Horn","c":10.7},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"pikachu","nome":"Pikachu","lvl":60,"reg":"Kanto","pid":25,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":870,"gp":372,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Box","c":63.5},{"n":"Electric Rat Tail","c":19.7},{"n":"Thunder Stone","c":0.5}],"out":false},{"slug":"sandslash","nome":"Sandslash","lvl":60,"reg":"Kanto","pid":28,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":870,"gp":372,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":82.9},{"n":"Armadillo Claw","c":14.6},{"n":"Earth Stone","c":0.4}],"out":false},{"slug":"venomoth","nome":"Venomoth","lvl":60,"reg":"Kanto","pid":49,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":870,"gp":372,"drops":[{"n":"Bottles of Poison","c":84.0},{"n":"Bug Gosme","c":84.0},{"n":"Bag of Pollen","c":20.6},{"n":"Bug Venom","c":5.9},{"n":"Cocoon Stone","c":0.2},{"n":"Venom Stone","c":0.2}],"out":false},{"slug":"victreebel","nome":"Victreebel","lvl":60,"reg":"Kanto","pid":71,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":870,"gp":372,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Seed","c":95.0},{"n":"Leaves","c":89.1},{"n":"Plant Tail","c":21.1},{"n":"Venom Stone","c":0.2},{"n":"Leaf Stone","c":0.2}],"out":false},{"slug":"slowbro","nome":"Slowbro","lvl":60,"reg":"Kanto","pid":80,"types":["WATER","PSYCHIC"],"w4x":[],"w2x":["GRASS","ELECTRIC","BUG","GHOST","DARK"],"xp":870,"gp":372,"drops":[{"n":"Enchanted Gem","c":74.4},{"n":"Water Gem","c":74.4},{"n":"Water Pendant","c":43.2},{"n":"Slow Tail","c":13.5},{"n":"Water Stone","c":0.4}],"out":false},{"slug":"dodrio","nome":"Dodrio","lvl":60,"reg":"Kanto","pid":85,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":870,"gp":372,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Straw","c":95.0},{"n":"Bird Beak","c":68.3},{"n":"Dodrio Feather","c":21.6},{"n":"Heart Stone","c":0.2},{"n":"Feather Stone","c":0.2}],"out":false},{"slug":"dewgong","nome":"Dewgong","lvl":60,"reg":"Kanto","pid":87,"types":["WATER","ICE"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":870,"gp":372,"drops":[{"n":"Water Gem","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Orb","c":39.1},{"n":"Water Pendant","c":27.7},{"n":"Seal Tail","c":6.1},{"n":"Ski Poles","c":0.7},{"n":"Water Stone","c":0.2},{"n":"Ice Stone","c":0.2},{"n":"Goggles","c":0.7},{"n":"Snow Skis","c":0.7}],"out":false},{"slug":"cloyster","nome":"Cloyster","lvl":60,"reg":"Kanto","pid":91,"types":["WATER","ICE"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":870,"gp":372,"drops":[{"n":"Water Gem","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Orb","c":39.0},{"n":"Water Pendant","c":27.0},{"n":"Strange Spike","c":6.5},{"n":"Water Stone","c":0.2},{"n":"Ice Stone","c":0.2},{"n":"Goggles","c":0.8},{"n":"Ski Poles","c":0.8},{"n":"Snow Skis","c":0.8}],"out":false},{"slug":"onix","nome":"Onix","lvl":60,"reg":"Kanto","pid":95,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":870,"gp":372,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":46.3},{"n":"Onix Tail","c":8.0},{"n":"Earth Stone","c":0.1},{"n":"Rock Stone","c":0.1},{"n":"Crystal Stone","c":0.0}],"out":false},{"slug":"kingler","nome":"Kingler","lvl":60,"reg":"Kanto","pid":99,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":870,"gp":372,"drops":[{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Crab Claw","c":28.8},{"n":"Water Stone","c":0.4}],"out":false},{"slug":"hypno","nome":"Hypno","lvl":60,"reg":"Kanto","pid":97,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":870,"gp":372,"drops":[{"n":"Enchanted Gem","c":60.7},{"n":"Future Orb","c":36.5},{"n":"Linearly Guided Hypnosis","c":5.9},{"n":"Enigma Stone","c":0.3}],"out":false},{"slug":"lickitung","nome":"Lickitung","lvl":60,"reg":"Kanto","pid":108,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":870,"gp":372,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Tongue","c":12.2},{"n":"Heart Stone","c":0.5}],"out":false},{"slug":"weezing","nome":"Weezing","lvl":60,"reg":"Kanto","pid":110,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":870,"gp":372,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Venom Flute","c":39.1},{"n":"Venom Stone","c":0.3}],"out":false},{"slug":"hitmonchan","nome":"Hitmonchan","lvl":60,"reg":"Kanto","pid":107,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":870,"gp":372,"drops":[{"n":"Band Aid","c":95.0},{"n":"Martial Arts Scroll","c":12.8},{"n":"Punch Machine","c":11.0},{"n":"Punch Stone","c":0.5}],"out":false},{"slug":"hitmonlee","nome":"Hitmonlee","lvl":60,"reg":"Kanto","pid":106,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":870,"gp":372,"drops":[{"n":"Band Aid","c":95.0},{"n":"Martial Arts Scroll","c":10.4},{"n":"Kick Machine","c":8.9},{"n":"Punch Stone","c":0.4}],"out":false},{"slug":"tauros","nome":"Tauros","lvl":60,"reg":"Kanto","pid":128,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":870,"gp":372,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Horn","c":63.4},{"n":"Bull Tail","c":4.0},{"n":"Heart Stone","c":0.4},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"noctowl","nome":"Noctowl","lvl":60,"reg":"Johto","pid":164,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":870,"gp":372,"drops":[{"n":"Straw","c":95.0},{"n":"Rubber Ball","c":95.0},{"n":"Feather","c":94.4},{"n":"Feather Stone","c":0.3},{"n":"Owl Feather","c":20.2},{"n":"Heart Stone","c":0.4}],"out":false},{"slug":"azumarill","nome":"Azumarill","lvl":60,"reg":"Johto","pid":184,"types":["WATER","FAIRY"],"w4x":[],"w2x":["GRASS","ELECTRIC","POISON"],"xp":870,"gp":372,"drops":[{"n":"Rubber Ball","c":37.6},{"n":"Water Gem","c":8.5},{"n":"Water Pendant","c":3.8},{"n":"Water Stone","c":0.1},{"n":"Blue Ball","c":16.8}],"out":false},{"slug":"quagsire","nome":"Quagsire","lvl":60,"reg":"Johto","pid":195,"types":["WATER","GROUND"],"w4x":["GRASS"],"w2x":["WATER"],"xp":870,"gp":372,"drops":[{"n":"Water Gem","c":65.7},{"n":"Earth Ball","c":24.6},{"n":"Earth Stone","c":0.2},{"n":"Water Stone","c":0.2},{"n":"Sandbag","c":21.6},{"n":"Water Pendant","c":21.6},{"n":"Wooper Horn","c":18.7}],"out":false},{"slug":"hitmontop","nome":"Hitmontop","lvl":60,"reg":"Johto","pid":237,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":870,"gp":372,"drops":[{"n":"Band Aid","c":37.6},{"n":"Martial Arts Scroll","c":11.8},{"n":"Punch Stone","c":0.3},{"n":"Spin Machine","c":6.4}],"out":false},{"slug":"pupitar","nome":"Pupitar","lvl":60,"reg":"Johto","pid":247,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":870,"gp":372,"drops":[{"n":"Ancient Stone","c":0.0},{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":36.3},{"n":"Rock Stone","c":0.1},{"n":"Lizard Tail","c":4.5},{"n":"Sandbag","c":18.1}],"out":false},{"slug":"chansey","nome":"Chansey","lvl":60,"reg":"Kanto","pid":113,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":870,"gp":372,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Chansey Egg","c":8.4},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"vileplume","nome":"Vileplume","lvl":70,"reg":"Kanto","pid":45,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":1010,"gp":432,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Seed","c":95.0},{"n":"Bag of Pollen","c":42.8},{"n":"Strange Flower","c":12.3},{"n":"Venom Stone","c":0.2},{"n":"Leaf Stone","c":0.2}],"out":false},{"slug":"rapidash","nome":"Rapidash","lvl":70,"reg":"Kanto","pid":78,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":1010,"gp":432,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Pot of Lava","c":95.0},{"n":"Fire Horse Foot","c":50.5},{"n":"Fire Stone","c":0.4},{"n":"Heart Stone","c":0.4}],"out":false},{"slug":"politoed","nome":"Politoed","lvl":70,"reg":"Johto","pid":186,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":1010,"gp":432,"drops":[{"n":"Water Gem","c":4.1},{"n":"Water Stone","c":0.2},{"n":"Strange Thing","c":17.2},{"n":"Water Pendant","c":19.4}],"out":false},{"slug":"octillery","nome":"Octillery","lvl":70,"reg":"Johto","pid":224,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":1010,"gp":432,"drops":[{"n":"Water Gem","c":13.4},{"n":"Water Stone","c":0.3},{"n":"Air Tank","c":2.6},{"n":"Diving Mask","c":2.6},{"n":"Fins","c":2.6},{"n":"Tentacle","c":12.9},{"n":"Water Pendant","c":26.8}],"out":false},{"slug":"venusaur","nome":"Venusaur","lvl":80,"reg":"Kanto","pid":3,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":1150,"gp":492,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Seed","c":95.0},{"n":"Leaves","c":95.0},{"n":"Bag of Pollen","c":88.5},{"n":"Bulb","c":14.9},{"n":"Venom Stone","c":0.4},{"n":"Leaf Stone","c":0.4}],"out":false},{"slug":"blastoise","nome":"Blastoise","lvl":80,"reg":"Kanto","pid":9,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":1150,"gp":492,"drops":[{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Squirtle Hull","c":64.9},{"n":"Water Stone","c":1.0}],"out":false},{"slug":"charizard","nome":"Charizard","lvl":80,"reg":"Kanto","pid":6,"types":["FIRE","FLYING"],"w4x":["ROCK"],"w2x":["WATER","ELECTRIC"],"xp":1150,"gp":492,"drops":[{"n":"Straw","c":95.0},{"n":"Essence of Fire","c":95.0},{"n":"Pot of Lava","c":63.5},{"n":"Fire Tail","c":16.6},{"n":"Fire Stone","c":0.3},{"n":"Feather Stone","c":0.3},{"n":"Dragon Tooth","c":1.9}],"out":false},{"slug":"pidgeot","nome":"Pidgeot","lvl":80,"reg":"Kanto","pid":18,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":1150,"gp":492,"drops":[{"n":"Ancient Stone","c":0.0},{"n":"Straw","c":95.0},{"n":"Rubber Ball","c":95.0},{"n":"Bird Beak","c":70.1},{"n":"Feather","c":69.7},{"n":"Colored Feather","c":13.3},{"n":"Heart Stone","c":0.1},{"n":"Feather Stone","c":0.1}],"out":false},{"slug":"raichu","nome":"Raichu","lvl":80,"reg":"Kanto","pid":26,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":1150,"gp":492,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Box","c":95.0},{"n":"Electric Rat Tail","c":25.2},{"n":"Thunder Stone","c":0.7}],"out":false},{"slug":"nidoqueen","nome":"Nidoqueen","lvl":80,"reg":"Kanto","pid":31,"types":["POISON","GROUND"],"w4x":[],"w2x":["WATER","ICE","GROUND","PSYCHIC"],"xp":1150,"gp":492,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Female Ear","c":40.1},{"n":"Earth Stone","c":0.4},{"n":"Venom Stone","c":0.4}],"out":false},{"slug":"nidoking","nome":"Nidoking","lvl":80,"reg":"Kanto","pid":34,"types":["POISON","GROUND"],"w4x":[],"w2x":["WATER","ICE","GROUND","PSYCHIC"],"xp":1150,"gp":492,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Male Ear","c":39.1},{"n":"Earth Stone","c":0.4},{"n":"Venom Stone","c":0.4}],"out":false},{"slug":"clefable","nome":"Clefable","lvl":80,"reg":"Kanto","pid":36,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":81.4},{"n":"Comb","c":45.5},{"n":"Topknot","c":9.8},{"n":"Heart Stone","c":0.6}],"out":false},{"slug":"wigglytuff","nome":"Wigglytuff","lvl":80,"reg":"Kanto","pid":40,"types":["NORMAL","FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Comb","c":49.7},{"n":"Microphone","c":9.9},{"n":"Heart Stone","c":0.5}],"out":false},{"slug":"golduck","nome":"Golduck","lvl":80,"reg":"Kanto","pid":55,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":1150,"gp":492,"drops":[{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":94.4},{"n":"Karate Duck","c":24.9},{"n":"Air Tank","c":1.5},{"n":"Water Stone","c":0.5},{"n":"Diving Mask","c":1.5},{"n":"Fins","c":1.5}],"out":false},{"slug":"poliwrath","nome":"Poliwrath","lvl":80,"reg":"Kanto","pid":62,"types":["WATER","FIGHTING"],"w4x":[],"w2x":["GRASS","ELECTRIC","FLYING","PSYCHIC","FAIRY"],"xp":1150,"gp":492,"drops":[{"n":"Band Aid","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Strange Thing","c":41.1},{"n":"Punch Stone","c":0.4},{"n":"Water Stone","c":0.4}],"out":false},{"slug":"machamp","nome":"Machamp","lvl":80,"reg":"Kanto","pid":68,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":1150,"gp":492,"drops":[{"n":"Band Aid","c":95.0},{"n":"Belt of Champion","c":7.1},{"n":"Punch Stone","c":0.8}],"out":false},{"slug":"tentacruel","nome":"Tentacruel","lvl":80,"reg":"Kanto","pid":73,"types":["WATER","POISON"],"w4x":[],"w2x":["ELECTRIC","GROUND","PSYCHIC"],"xp":1150,"gp":492,"drops":[{"n":"Bottles of Poison","c":87.7},{"n":"Water Gem","c":87.7},{"n":"Ruby","c":27.9},{"n":"Giant Ruby","c":5.0},{"n":"Diving Mask","c":0.6},{"n":"Air Tank","c":0.6},{"n":"Venom Stone","c":0.3},{"n":"Water Stone","c":0.3},{"n":"Fins","c":0.6},{"n":"Tentacruel Tentacle","c":0.6}],"out":false},{"slug":"golem","nome":"Golem","lvl":80,"reg":"Kanto","pid":76,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":1150,"gp":492,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":95.0},{"n":"Strange Rock","c":29.2},{"n":"Earth Stone","c":0.4},{"n":"Rock Stone","c":0.4}],"out":false},{"slug":"magneton","nome":"Magneton","lvl":80,"reg":"Kanto","pid":82,"types":["ELECTRIC","STEEL"],"w4x":["GROUND"],"w2x":["FIRE","FIGHTING"],"xp":1150,"gp":492,"drops":[{"n":"Piece of Steel","c":95.0},{"n":"Screw","c":95.0},{"n":"Electric Box","c":95.0},{"n":"Magnet","c":57.3},{"n":"Thunder Stone","c":0.7}],"out":false},{"slug":"muk","nome":"Muk","lvl":80,"reg":"Kanto","pid":89,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":1150,"gp":492,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Sticky Hand","c":56.1},{"n":"Venom Stone","c":0.6}],"out":false},{"slug":"starmie","nome":"Starmie","lvl":80,"reg":"Kanto","pid":121,"types":["WATER","PSYCHIC"],"w4x":[],"w2x":["GRASS","ELECTRIC","BUG","GHOST","DARK"],"xp":1150,"gp":492,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Gem Star","c":34.1},{"n":"Water Stone","c":0.1},{"n":"Enigma Stone","c":0.1},{"n":"Ruby","c":8.5},{"n":"Diving Mask","c":1.7},{"n":"Air Tank","c":1.7},{"n":"Fins","c":1.7}],"out":false},{"slug":"kangaskhan","nome":"Kangaskhan","lvl":80,"reg":"Kanto","pid":115,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Horn","c":95.0},{"n":"Kanga Ear","c":12.1},{"n":"Heart Stone","c":0.8}],"out":false},{"slug":"mr_mime","nome":"Mr. Mime","lvl":80,"reg":"Kanto","pid":122,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Enchanted Gem","c":95.0},{"n":"Mimic Clothes","c":9.6},{"n":"Enigma Stone","c":0.8}],"out":false},{"slug":"omastar","nome":"Omastar","lvl":80,"reg":"Kanto","pid":139,"types":["ROCK","WATER"],"w4x":["GRASS"],"w2x":["WATER","ELECTRIC","FIGHTING","GROUND"],"xp":1150,"gp":492,"drops":[{"n":"Small Stone","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Helix Fossil","c":0.0},{"n":"Water Stone","c":0.0},{"n":"Crystal Stone","c":0.0},{"n":"Stone Orb","c":0.0}],"out":false},{"slug":"dragonair","nome":"Dragonair","lvl":80,"reg":"Kanto","pid":148,"types":["DRAGON"],"w4x":[],"w2x":["ICE","FAIRY"],"xp":1150,"gp":492,"drops":[{"n":"Dragon Scale","c":95.0},{"n":"Dragon Tooth","c":4.6},{"n":"Dragon Tail","c":4.6},{"n":"Crystal Stone","c":0.1},{"n":"Goggles","c":1.1},{"n":"Ski Poles","c":1.1},{"n":"Snow Skis","c":1.1}],"out":false},{"slug":"kabutops","nome":"Kabutops","lvl":80,"reg":"Kanto","pid":141,"types":["ROCK","WATER"],"w4x":["GRASS"],"w2x":["WATER","ELECTRIC","FIGHTING","GROUND"],"xp":1150,"gp":492,"drops":[{"n":"Small Stone","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Stone Orb","c":95.0},{"n":"Dome Fossil","c":14.6},{"n":"Water Stone","c":0.2},{"n":"Crystal Stone","c":0.1}],"out":false},{"slug":"feraligatr","nome":"Feraligatr","lvl":80,"reg":"Johto","pid":160,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":1150,"gp":492,"drops":[{"n":"Water Gem","c":4.3},{"n":"Water Stone","c":0.3},{"n":"Red Scale","c":28.6},{"n":"Water Pendant","c":28.7},{"n":"Nail","c":28.7}],"out":false},{"slug":"meganium","nome":"Meganium","lvl":80,"reg":"Johto","pid":154,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":1150,"gp":492,"drops":[{"n":"Seed","c":95.0},{"n":"Leaves","c":81.8},{"n":"Leaf Stone","c":0.5},{"n":"Great Petal","c":26.3},{"n":"Bag of Pollen","c":31.1}],"out":false},{"slug":"typhlosion","nome":"Typhlosion","lvl":80,"reg":"Johto","pid":157,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":1150,"gp":492,"drops":[{"n":"Essence of Fire","c":55.5},{"n":"Fire Stone","c":0.3},{"n":"Hot Fur","c":21.1},{"n":"Pot of Lava","c":22.3},{"n":"Fur","c":22.3}],"out":false},{"slug":"crobat","nome":"Crobat","lvl":80,"reg":"Johto","pid":169,"types":["POISON","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","PSYCHIC","ROCK"],"xp":1150,"gp":492,"drops":[{"n":"Ancient Stone","c":0.0},{"n":"Straw","c":18.3},{"n":"Bottles of Poison","c":10.3},{"n":"Venom Stone","c":0.1},{"n":"Giant Bat Wing","c":20.1},{"n":"Tooth","c":22.4}],"out":false},{"slug":"lanturn","nome":"Lanturn","lvl":80,"reg":"Johto","pid":171,"types":["WATER","ELECTRIC"],"w4x":[],"w2x":["GRASS","ELECTRIC","GROUND"],"xp":1150,"gp":492,"drops":[{"n":"Screw","c":64.6},{"n":"Electric Box","c":28.3},{"n":"Water Gem","c":4.0},{"n":"Thunder Stone","c":0.2},{"n":"Point Of Light","c":9.7},{"n":"Water Stone","c":0.4},{"n":"Water Pendant","c":27.0},{"n":"Diving Mask","c":1.9},{"n":"Air Tank","c":1.9},{"n":"Fins","c":1.9}],"out":false},{"slug":"ampharos","nome":"Ampharos","lvl":80,"reg":"Johto","pid":181,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":1150,"gp":492,"drops":[{"n":"Screw","c":20.2},{"n":"Thunder Stone","c":0.1},{"n":"Sheep Wool","c":21.2},{"n":"Electric Box","c":21.8}],"out":false},{"slug":"xatu","nome":"Xatu","lvl":80,"reg":"Johto","pid":178,"types":["PSYCHIC","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK","GHOST","DARK"],"xp":1150,"gp":492,"drops":[{"n":"Feather Stone","c":0.1},{"n":"Straw","c":69.1},{"n":"Enchanted Gem","c":69.1},{"n":"Feather","c":69.1},{"n":"Enigma Stone","c":0.3},{"n":"Strange Wing","c":21.3}],"out":false},{"slug":"girafarig","nome":"Girafarig","lvl":80,"reg":"Johto","pid":203,"types":["NORMAL","PSYCHIC"],"w4x":[],"w2x":["BUG","DARK"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":62.3},{"n":"Enchanted Gem","c":62.3},{"n":"Enigma Stone","c":0.2},{"n":"Future Orb","c":32.3},{"n":"Heart Stone","c":0.4},{"n":"Strange Antenna","c":32.3}],"out":false},{"slug":"forretress","nome":"Forretress","lvl":80,"reg":"Johto","pid":205,"types":["BUG","STEEL"],"w4x":["FIRE"],"w2x":[],"xp":1150,"gp":492,"drops":[{"n":"Bug Gosme","c":21.7},{"n":"Piece of Steel","c":8.1},{"n":"Cocoon Stone","c":0.1},{"n":"Piece Of Shell","c":24.6},{"n":"Pot of Moss Bug","c":24.8}],"out":false},{"slug":"granbull","nome":"Granbull","lvl":80,"reg":"Johto","pid":210,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":93.2},{"n":"Heart Stone","c":0.5},{"n":"Dog Ear","c":21.6}],"out":false},{"slug":"piloswine","nome":"Piloswine","lvl":80,"reg":"Johto","pid":221,"types":["ICE","GROUND"],"w4x":[],"w2x":["FIRE","WATER","GRASS","ICE","FIGHTING","STEEL"],"xp":1150,"gp":492,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Stone","c":0.4},{"n":"Earth Stone","c":0.4},{"n":"Fur","c":19.4},{"n":"Goggles","c":4.9},{"n":"Ice Orb","c":19.4},{"n":"Ski Poles","c":1.0},{"n":"Snow Skis","c":4.9},{"n":"Tusk","c":4.9}],"out":false},{"slug":"houndoom","nome":"Houndoom","lvl":80,"reg":"Johto","pid":229,"types":["DARK","FIRE"],"w4x":[],"w2x":["WATER","FIGHTING","GROUND","ROCK"],"xp":1150,"gp":492,"drops":[{"n":"Essence of Fire","c":57.5},{"n":"Dark Gem","c":57.5},{"n":"Darkness Stone","c":0.2},{"n":"Fire Stone","c":0.2},{"n":"Pot of Lava","c":26.2},{"n":"Strange Bone","c":22.9}],"out":false},{"slug":"donphan","nome":"Donphan","lvl":80,"reg":"Johto","pid":232,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":1150,"gp":492,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Earth Stone","c":0.7},{"n":"Elephant Foot","c":27.0},{"n":"Sandbag","c":32.2}],"out":false},{"slug":"miltank","nome":"Miltank","lvl":80,"reg":"Johto","pid":241,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":70.2},{"n":"Heart Stone","c":0.3},{"n":"Cow Tail","c":23.8},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"togetic","nome":"Togetic","lvl":80,"reg":"Johto","pid":176,"types":["FAIRY","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","POISON","ROCK","STEEL"],"xp":1150,"gp":492,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Straw","c":95.0},{"n":"Feather","c":95.0},{"n":"Heart Stone","c":0.3},{"n":"Cerise Shard","c":1.4},{"n":"Eggshell","c":0.3},{"n":"Lovely Topknot","c":0.3},{"n":"Psycraft Essence","c":5.6},{"n":"Shiny Stone","c":0.0}],"out":false},{"slug":"ninetales","nome":"Ninetales","lvl":100,"reg":"Kanto","pid":38,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Essence of Fire","c":91.9},{"n":"Fur","c":14.1},{"n":"Comb","c":13.0},{"n":"Fox Tail","c":7.8},{"n":"Fire Stone","c":0.5}],"out":false},{"slug":"arcanine","nome":"Arcanine","lvl":100,"reg":"Kanto","pid":59,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Fur","c":95.0},{"n":"Pot of Lava","c":95.0},{"n":"Giant Piece of Fur","c":42.1},{"n":"Crystal Stone","c":0.1},{"n":"Fire Stone","c":0.3}],"out":false},{"slug":"alakazam","nome":"Alakazam","lvl":100,"reg":"Kanto","pid":65,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":1430,"gp":612,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Psychic Spoon","c":40.8},{"n":"Enigma Stone","c":0.9}],"out":false},{"slug":"gengar","nome":"Gengar","lvl":100,"reg":"Kanto","pid":94,"types":["GHOST","POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC","DARK"],"xp":1430,"gp":612,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Ghost Essence","c":95.0},{"n":"Traces of Ghost","c":58.9},{"n":"Darkness Stone","c":0.5},{"n":"Venom Stone","c":0.5}],"out":false},{"slug":"exeggutor","nome":"Exeggutor","lvl":100,"reg":"Kanto","pid":103,"types":["GRASS","PSYCHIC"],"w4x":["BUG"],"w2x":["FIRE","ICE","POISON","FLYING","GHOST","DARK"],"xp":1430,"gp":612,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Seed","c":95.0},{"n":"Leaves","c":95.0},{"n":"Plant Foot","c":61.3},{"n":"Leaf Stone","c":0.8}],"out":false},{"slug":"rhydon","nome":"Rhydon","lvl":100,"reg":"Kanto","pid":112,"types":["GROUND","ROCK"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":1430,"gp":612,"drops":[{"n":"Ancient Stone","c":0.0},{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Horn","c":83.3},{"n":"Horn Drill","c":8.3},{"n":"Stone Orb","c":95.0},{"n":"Rock Stone","c":0.2},{"n":"Earth Stone","c":0.2}],"out":false},{"slug":"magmar","nome":"Magmar","lvl":100,"reg":"Kanto","pid":126,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Pot Of Lava","c":95.0},{"n":"Magma Foot","c":27.5},{"n":"Fire Stone","c":1.3}],"out":false},{"slug":"scyther","nome":"Scyther","lvl":100,"reg":"Kanto","pid":123,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":1430,"gp":612,"drops":[{"n":"Straw","c":95.0},{"n":"Bug Gosme","c":95.0},{"n":"Pot of Moss Bug","c":95.0},{"n":"Scythe","c":23.7},{"n":"Cocoon Stone","c":0.6},{"n":"Feather Stone","c":0.6}],"out":false},{"slug":"jynx","nome":"Jynx","lvl":100,"reg":"Kanto","pid":124,"types":["ICE","PSYCHIC"],"w4x":[],"w2x":["FIRE","BUG","ROCK","GHOST","DARK","STEEL"],"xp":1430,"gp":612,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Orb","c":76.2},{"n":"Future Orb","c":87.9},{"n":"Goggles","c":1.5},{"n":"Ski Poles","c":1.5},{"n":"Snow Skis","c":1.5},{"n":"Ice Stone","c":0.1},{"n":"Enigma Stone","c":0.1},{"n":"Ancient Stone","c":0.1},{"n":"Ice Bra","c":0.0}],"out":false},{"slug":"electabuzz","nome":"Electabuzz","lvl":100,"reg":"Kanto","pid":125,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":1430,"gp":612,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Box","c":95.0},{"n":"Electric Tail","c":10.5},{"n":"Thunder Stone","c":0.9}],"out":false},{"slug":"pinsir","nome":"Pinsir","lvl":100,"reg":"Kanto","pid":127,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Bug Gosme","c":95.0},{"n":"Pot of Moss Bug","c":95.0},{"n":"Pinsir Horn","c":32.3},{"n":"Cocoon Stone","c":1.5}],"out":false},{"slug":"gyarados","nome":"Gyarados","lvl":100,"reg":"Kanto","pid":130,"types":["WATER","FLYING"],"w4x":["ELECTRIC"],"w2x":["ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Straw","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Gyarados Tail","c":2.4},{"n":"Water Stone","c":0.2},{"n":"Crystal Stone","c":0.1},{"n":"Air Tank","c":2.4},{"n":"Diving Mask","c":2.4},{"n":"Fins","c":2.4}],"out":false},{"slug":"lapras","nome":"Lapras","lvl":100,"reg":"Kanto","pid":131,"types":["WATER","ICE"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Snowball","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Ice Orb","c":95.0},{"n":"Water Pendant","c":79.9},{"n":"Giant Fin","c":1.6},{"n":"Ice Stone","c":0.5},{"n":"Water Stone","c":0.5},{"n":"Goggles","c":1.6},{"n":"Ski Poles","c":1.6},{"n":"Snow Skis","c":1.6}],"out":false},{"slug":"dragonite","nome":"Dragonite","lvl":100,"reg":"Kanto","pid":149,"types":["DRAGON","FLYING"],"w4x":["ICE"],"w2x":["ROCK","FAIRY"],"xp":1430,"gp":612,"drops":[{"n":"Straw","c":95.0},{"n":"Dragon Scale","c":95.0},{"n":"Dragon Tooth","c":7.0},{"n":"Dragon Tail","c":7.0},{"n":"Crystal Stone","c":0.1},{"n":"Goggles","c":0.9},{"n":"Ski Poles","c":0.9},{"n":"Snow Skis","c":0.9}],"out":false},{"slug":"aerodactyl","nome":"Aerodactyl","lvl":100,"reg":"Kanto","pid":142,"types":["ROCK","FLYING"],"w4x":[],"w2x":["WATER","ELECTRIC","ICE","ROCK","STEEL"],"xp":1430,"gp":612,"drops":[{"n":"Straw","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":95.0},{"n":"Old Amber","c":0.1},{"n":"Rock Stone","c":0.2},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"snorlax","nome":"Snorlax","lvl":100,"reg":"Kanto","pid":143,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1430,"gp":612,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Bitten Apple","c":94.6},{"n":"Heart Stone","c":1.0},{"n":"Pizza","c":1.0},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"wobbuffet","nome":"Wobbuffet","lvl":100,"reg":"Johto","pid":202,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":1430,"gp":612,"drops":[{"n":"Enchanted Gem","c":60.5},{"n":"Future Orb","c":7.6},{"n":"Enigma Stone","c":0.2},{"n":"Strange Tail","c":24.8}],"out":false},{"slug":"misdreavus","nome":"Misdreavus","lvl":100,"reg":"Johto","pid":200,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":1430,"gp":612,"drops":[{"n":"Ghost Essence","c":95.0},{"n":"Darkness Stone","c":0.6},{"n":"Future Orb","c":42.9},{"n":"Miss Trace","c":29.5}],"out":false},{"slug":"steelix","nome":"Steelix","lvl":100,"reg":"Johto","pid":208,"types":["STEEL","GROUND"],"w4x":[],"w2x":["FIRE","WATER","FIGHTING","GROUND"],"xp":1430,"gp":612,"drops":[{"n":"Metal Stone","c":0.1},{"n":"Earth Ball","c":93.9},{"n":"Piece of Steel","c":41.1},{"n":"Earth Stone","c":0.2},{"n":"Sandbag","c":39.4},{"n":"Steelix Tail","c":7.5}],"out":false},{"slug":"scizor","nome":"Scizor","lvl":100,"reg":"Johto","pid":212,"types":["BUG","STEEL"],"w4x":["FIRE"],"w2x":[],"xp":1430,"gp":612,"drops":[{"n":"Metal Stone","c":0.1},{"n":"Bug Gosme","c":79.2},{"n":"Piece of Steel","c":29.7},{"n":"Cocoon Stone","c":0.2},{"n":"Scizor Claw","c":1.2},{"n":"Pot of Moss Bug","c":23.9},{"n":"Corrupted Scizor Claw","c":1.2},{"n":"Harlequin Shard","c":6.0},{"n":"Naturia Essence","c":23.9}],"out":false},{"slug":"heracross","nome":"Heracross","lvl":100,"reg":"Johto","pid":214,"types":["BUG","FIGHTING"],"w4x":["FLYING"],"w2x":["FIRE","PSYCHIC","FAIRY"],"xp":1430,"gp":612,"drops":[{"n":"Band Aid","c":95.0},{"n":"Bug Gosme","c":95.0},{"n":"Punch Stone","c":0.6},{"n":"Insect Claw","c":28.3},{"n":"Cocoon Stone","c":0.4},{"n":"Pot of Moss Bug","c":37.4}],"out":false},{"slug":"ursaring","nome":"Ursaring","lvl":100,"reg":"Johto","pid":217,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1430,"gp":612,"drops":[{"n":"Ancient Stone","c":0.1},{"n":"Rubber Ball","c":47.7},{"n":"Fur","c":47.7},{"n":"Heart Stone","c":0.2},{"n":"Bear Arm","c":0.6},{"n":"Bear Paw","c":2.8}],"out":false},{"slug":"magcargo","nome":"Magcargo","lvl":100,"reg":"Johto","pid":219,"types":["FIRE","ROCK"],"w4x":["WATER","GROUND"],"w2x":["FIGHTING","ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Essence of Fire","c":73.0},{"n":"Pot of Lava","c":73.0},{"n":"Small Stone","c":13.7},{"n":"Fire Stone","c":0.2},{"n":"Fire Ear","c":11.7},{"n":"Rock Stone","c":0.4}],"out":false},{"slug":"mantine","nome":"Mantine","lvl":100,"reg":"Johto","pid":226,"types":["WATER","FLYING"],"w4x":["ELECTRIC"],"w2x":["ROCK"],"xp":1430,"gp":612,"drops":[{"n":"Ancient Stone","c":0.0},{"n":"Straw","c":95.0},{"n":"Fins","c":5.0},{"n":"Water Gem","c":14.4},{"n":"Water Stone","c":0.1},{"n":"Air Tank","c":8.4},{"n":"Diving Mask","c":8.4},{"n":"Streak Tail","c":42.1},{"n":"Water Pendant","c":69.3}],"out":false},{"slug":"skarmory","nome":"Skarmory","lvl":100,"reg":"Johto","pid":227,"types":["STEEL","FLYING"],"w4x":[],"w2x":["FIRE","ELECTRIC"],"xp":1430,"gp":612,"drops":[{"n":"Metal Stone","c":0.1},{"n":"Feather Stone","c":0.1},{"n":"Straw","c":95.0},{"n":"Piece of Steel","c":95.0},{"n":"Steel Wing","c":50.1}],"out":false},{"slug":"kingdra","nome":"Kingdra","lvl":100,"reg":"Johto","pid":230,"types":["WATER","DRAGON"],"w4x":[],"w2x":["FAIRY"],"xp":1430,"gp":612,"drops":[{"n":"Water Gem","c":95.0},{"n":"Seahorse Tail","c":42.7},{"n":"Dragon Scale","c":95.0},{"n":"Water Stone","c":0.2},{"n":"Air Tank","c":2.1},{"n":"Crystal Stone","c":0.1},{"n":"Diving Mask","c":2.1},{"n":"Fins","c":2.1},{"n":"Water Pendant","c":43.0}],"out":false},{"slug":"tyranitar","nome":"Tyranitar","lvl":100,"reg":"Johto","pid":248,"types":["ROCK","DARK"],"w4x":["FIGHTING"],"w2x":["WATER","GRASS","GROUND","BUG","STEEL","FAIRY"],"xp":1430,"gp":612,"drops":[{"n":"Ancient Stone","c":0.0},{"n":"Small Stone","c":46.0},{"n":"Dark Gem","c":46.0},{"n":"Stone Orb","c":46.0},{"n":"Darkness Stone","c":0.1},{"n":"Rock Stone","c":0.1},{"n":"Lizard Tail","c":9.0},{"n":"Sandbag","c":24.1}],"out":false},{"slug":"brave_blastoise","nome":"Brave Blastoise","lvl":150,"reg":"Outland","pid":2001,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":5325,"gp":1824,"drops":[{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Squirtle Hull","c":75.3},{"n":"Water Stone","c":2.0}],"out":true},{"slug":"tribal_feraligatr","nome":"Tribal Feraligatr","lvl":150,"reg":"Outland","pid":2002,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":5325,"gp":1824,"drops":[{"n":"Water Gem","c":10.1},{"n":"Water Stone","c":0.8},{"n":"Red Scale","c":26.0},{"n":"Water Pendant","c":26.6},{"n":"Nail","c":26.6}],"out":true},{"slug":"ancient_meganium","nome":"Ancient Meganium","lvl":150,"reg":"Outland","pid":2003,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":5325,"gp":1824,"drops":[{"n":"Seed","c":95.0},{"n":"Leaves","c":95.0},{"n":"Leaf Stone","c":1.3},{"n":"Great Petal","c":44.9},{"n":"Bag of Pollen","c":45.0}],"out":true},{"slug":"war_heracross","nome":"War Heracross","lvl":150,"reg":"Outland","pid":2005,"types":["BUG","FIGHTING"],"w4x":["FLYING"],"w2x":["FIRE","PSYCHIC","FAIRY"],"xp":5325,"gp":1824,"drops":[{"n":"Band Aid","c":95.0},{"n":"Bug Gosme","c":95.0},{"n":"Punch Stone","c":1.2},{"n":"Insect Claw","c":29.3},{"n":"Cocoon Stone","c":0.4},{"n":"Pot of Moss Bug","c":33.5}],"out":true},{"slug":"brave_venusaur","nome":"Brave Venusaur","lvl":150,"reg":"Outland","pid":2004,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":5325,"gp":1824,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Seed","c":95.0},{"n":"Leaves","c":95.0},{"n":"Bag of Pollen","c":95.0},{"n":"Bulb","c":87.5},{"n":"Venom Stone","c":1.1},{"n":"Leaf Stone","c":1.1}],"out":true},{"slug":"furious_scyther","nome":"Furious Scyther","lvl":150,"reg":"Outland","pid":2006,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":5325,"gp":1824,"drops":[{"n":"Straw","c":95.0},{"n":"Bug Gosme","c":95.0},{"n":"Pot of Moss Bug","c":95.0},{"n":"Scythe","c":46.1},{"n":"Cocoon Stone","c":1.0},{"n":"Feather Stone","c":1.0}],"out":true},{"slug":"enigmatic_girafarig","nome":"Enigmatic Girafarig","lvl":150,"reg":"Outland","pid":2007,"types":["NORMAL","PSYCHIC"],"w4x":[],"w2x":["BUG","DARK"],"xp":5325,"gp":1824,"drops":[{"n":"Rubber Ball","c":84.5},{"n":"Enchanted Gem","c":84.5},{"n":"Enigma Stone","c":0.7},{"n":"Future Orb","c":22.5},{"n":"Heart Stone","c":0.4},{"n":"Strange Antenna","c":21.8}],"out":true},{"slug":"charged_raichu","nome":"Charged Raichu","lvl":150,"reg":"Outland","pid":2008,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":5325,"gp":1824,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Box","c":95.0},{"n":"Electric Rat Tail","c":72.0},{"n":"Thunder Stone","c":2.1}],"out":true},{"slug":"furious_ampharos","nome":"Furious Ampharos","lvl":150,"reg":"Outland","pid":2009,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":5325,"gp":1824,"drops":[{"n":"Screw","c":79.4},{"n":"Thunder Stone","c":0.3},{"n":"Sheep Wool","c":28.9},{"n":"Electric Box","c":29.7}],"out":true},{"slug":"magnetic_electabuzz","nome":"Magnetic Electabuzz","lvl":150,"reg":"Outland","pid":2010,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":5325,"gp":1824,"drops":[{"n":"Screw","c":95.0},{"n":"Electric Box","c":95.0},{"n":"Electric Tail","c":41.8},{"n":"Thunder Stone","c":2.2}],"out":true},{"slug":"ancient_dragonair","nome":"Ancient Dragonair","lvl":150,"reg":"Outland","pid":2011,"types":["DRAGON"],"w4x":[],"w2x":["ICE","FAIRY"],"xp":5325,"gp":1824,"drops":[{"n":"Dragon Scale","c":95.0},{"n":"Dragon Tooth","c":15.1},{"n":"Dragon Tail","c":15.1},{"n":"Crystal Stone","c":0.2},{"n":"Goggles","c":3.8},{"n":"Ski Poles","c":3.8},{"n":"Snow Skis","c":3.8}],"out":true},{"slug":"evil_cloyster","nome":"Evil Cloyster","lvl":150,"reg":"Outland","pid":2012,"types":["WATER","ICE"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Water Gem","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Orb","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Strange Spike","c":60.5},{"n":"Water Stone","c":1.2},{"n":"Ice Stone","c":1.2},{"n":"Goggles","c":7.0},{"n":"Ski Poles","c":7.0},{"n":"Snow Skis","c":7.0}],"out":true},{"slug":"freezing_dewgong","nome":"Freezing Dewgong","lvl":150,"reg":"Outland","pid":2013,"types":["WATER","ICE"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Water Gem","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Orb","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Seal Tail","c":57.9},{"n":"Ski Poles","c":6.7},{"n":"Water Stone","c":1.2},{"n":"Ice Stone","c":1.2},{"n":"Goggles","c":6.7},{"n":"Snow Skis","c":6.7}],"out":true},{"slug":"psy_jynx","nome":"Psy Jynx","lvl":150,"reg":"Outland","pid":2014,"types":["ICE","PSYCHIC"],"w4x":[],"w2x":["FIRE","BUG","ROCK","GHOST","DARK","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Orb","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Goggles","c":9.4},{"n":"Ski Poles","c":7.8},{"n":"Snow Skis","c":9.4},{"n":"Ice Stone","c":0.3},{"n":"Enigma Stone","c":0.3},{"n":"Ancient Stone","c":0.2},{"n":"Ice Bra","c":0.0}],"out":true},{"slug":"heavy_piloswine","nome":"Heavy Piloswine","lvl":150,"reg":"Outland","pid":2015,"types":["ICE","GROUND"],"w4x":[],"w2x":["FIRE","WATER","GRASS","ICE","FIGHTING","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Snowball","c":95.0},{"n":"Ice Stone","c":0.9},{"n":"Earth Stone","c":0.4},{"n":"Fur","c":42.2},{"n":"Goggles","c":19.4},{"n":"Ice Orb","c":42.2},{"n":"Ski Poles","c":3.9},{"n":"Snow Skis","c":19.4},{"n":"Tusk","c":19.4}],"out":true},{"slug":"roll_donphan","nome":"Roll Donphan","lvl":150,"reg":"Outland","pid":2017,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":5325,"gp":1824,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Earth Stone","c":2.1},{"n":"Elephant Foot","c":35.8},{"n":"Sandbag","c":35.9}],"out":true},{"slug":"milch_miltank","nome":"Milch-Miltank","lvl":150,"reg":"Outland","pid":2016,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":5325,"gp":1824,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Heart Stone","c":1.2},{"n":"Cow Tail","c":26.6}],"out":true},{"slug":"furious_sandslash","nome":"Furious Sandslash","lvl":150,"reg":"Outland","pid":2018,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":5325,"gp":1824,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Armadillo Claw","c":80.5},{"n":"Earth Stone","c":1.8}],"out":true},{"slug":"hard_golem","nome":"Hard Golem","lvl":150,"reg":"Outland","pid":2019,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":95.0},{"n":"Strange Rock","c":90.8},{"n":"Earth Stone","c":1.1},{"n":"Rock Stone","c":1.1}],"out":true},{"slug":"brute_rhydon","nome":"Brute Rhydon","lvl":150,"reg":"Outland","pid":2020,"types":["GROUND","ROCK"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Ancient Stone","c":0.1},{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Horn","c":95.0},{"n":"Horn Drill","c":44.7},{"n":"Stone Orb","c":95.0},{"n":"Rock Stone","c":0.6},{"n":"Earth Stone","c":0.6}],"out":true},{"slug":"brave_charizard","nome":"Brave Charizard","lvl":150,"reg":"Outland","pid":2021,"types":["FIRE","FLYING"],"w4x":["ROCK"],"w2x":["WATER","ELECTRIC"],"xp":5325,"gp":1824,"drops":[{"n":"Straw","c":95.0},{"n":"Essence of Fire","c":95.0},{"n":"Pot of Lava","c":95.0},{"n":"Fire Tail","c":89.1},{"n":"Fire Stone","c":1.2},{"n":"Feather Stone","c":1.2},{"n":"Dragon Tooth","c":19.9}],"out":true},{"slug":"brave_nidoking","nome":"Brave Nidoking","lvl":150,"reg":"Outland","pid":2023,"types":["POISON","GROUND"],"w4x":[],"w2x":["WATER","ICE","GROUND","PSYCHIC"],"xp":5325,"gp":1824,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Male Ear","c":81.1},{"n":"Earth Stone","c":0.9},{"n":"Venom Stone","c":0.9}],"out":true},{"slug":"brave_nidoqueen","nome":"Brave Nidoqueen","lvl":150,"reg":"Outland","pid":2024,"types":["POISON","GROUND"],"w4x":[],"w2x":["WATER","ICE","GROUND","PSYCHIC"],"xp":5325,"gp":1824,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Female Ear","c":76.3},{"n":"Earth Stone","c":0.9},{"n":"Venom Stone","c":0.9}],"out":true},{"slug":"dark_crobat","nome":"Dark Crobat","lvl":150,"reg":"Outland","pid":2025,"types":["POISON","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","PSYCHIC","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Ancient Stone","c":0.1},{"n":"Straw","c":63.6},{"n":"Bottles of Poison","c":35.8},{"n":"Venom Stone","c":0.3},{"n":"Giant Bat Wing","c":26.7},{"n":"Tooth","c":28.6}],"out":true},{"slug":"trickmaster_gengar","nome":"Trickmaster Gengar","lvl":150,"reg":"Outland","pid":2026,"types":["GHOST","POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC","DARK"],"xp":5325,"gp":1824,"drops":[{"n":"Bottles of Poison","c":95.0},{"n":"Ghost Essence","c":95.0},{"n":"Traces of Ghost","c":81.3},{"n":"Darkness Stone","c":1.0},{"n":"Venom Stone","c":1.0}],"out":true},{"slug":"banshee_misdreavus","nome":"Banshee Misdreavus","lvl":150,"reg":"Outland","pid":2027,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":5325,"gp":1824,"drops":[{"n":"Ghost Essence","c":95.0},{"n":"Darkness Stone","c":1.3},{"n":"Future Orb","c":40.4},{"n":"Miss Trace","c":34.5}],"out":true},{"slug":"enraged_typhlosion","nome":"Enraged Typhlosion","lvl":150,"reg":"Outland","pid":2022,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Essence of Fire","c":92.0},{"n":"Fire Stone","c":0.9},{"n":"Hot Fur","c":24.5},{"n":"Pot of Lava","c":24.5},{"n":"Fur","c":24.5}],"out":true},{"slug":"taekwondo_hitmonchan","nome":"Taekwondo Hitmonchan","lvl":150,"reg":"Outland","pid":2028,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":5325,"gp":1824,"drops":[{"n":"Band Aid","c":95.0},{"n":"Martial Arts Scroll","c":80.5},{"n":"Punch Machine","c":69.3},{"n":"Punch Stone","c":2.2}],"out":true},{"slug":"taekwondo_hitmonlee","nome":"Taekwondo Hitmonlee","lvl":150,"reg":"Outland","pid":2029,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":5325,"gp":1824,"drops":[{"n":"Band Aid","c":95.0},{"n":"Martial Arts Scroll","c":79.7},{"n":"Kick Machine","c":68.5},{"n":"Punch Stone","c":2.2}],"out":true},{"slug":"brave_arcanine","nome":"Brave Arcanine","lvl":150,"reg":"Outland","pid":2031,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Fur","c":95.0},{"n":"Pot of Lava","c":95.0},{"n":"Giant Piece of Fur","c":78.9},{"n":"Crystal Stone","c":0.2},{"n":"Fire Stone","c":0.5}],"out":true},{"slug":"taekwondo_hitmontop","nome":"Taekwondo Hitmontop","lvl":150,"reg":"Outland","pid":2030,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":5325,"gp":1824,"drops":[{"n":"Band Aid","c":95.0},{"n":"Martial Arts Scroll","c":71.8},{"n":"Punch Stone","c":1.2},{"n":"Spin Machine","c":42.4}],"out":true},{"slug":"furious_magmar","nome":"Furious Magmar","lvl":150,"reg":"Outland","pid":2032,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Essence of Fire","c":95.0},{"n":"Pot Of Lava","c":95.0},{"n":"Magma Foot","c":33.3},{"n":"Fire Stone","c":1.8}],"out":true},{"slug":"brave_steelix","nome":"Brave Steelix","lvl":150,"reg":"Outland","pid":2034,"types":["STEEL","GROUND"],"w4x":[],"w2x":["FIRE","WATER","FIGHTING","GROUND"],"xp":5325,"gp":1824,"drops":[{"n":"Metal Stone","c":0.1},{"n":"Earth Ball","c":95.0},{"n":"Piece of Steel","c":79.1},{"n":"Earth Stone","c":0.4},{"n":"Sandbag","c":32.8},{"n":"Steelix Tail","c":14.7}],"out":true},{"slug":"brave_alakazam","nome":"Brave Alakazam","lvl":150,"reg":"Outland","pid":2037,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":5325,"gp":1824,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Psychic Spoon","c":92.3},{"n":"Enigma Stone","c":2.3}],"out":true},{"slug":"furious_gyarados","nome":"Furious Gyarados","lvl":150,"reg":"Outland","pid":2039,"types":["WATER","FLYING"],"w4x":["ELECTRIC"],"w2x":["ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Straw","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Gyarados Tail","c":7.3},{"n":"Water Stone","c":0.5},{"n":"Crystal Stone","c":0.2},{"n":"Air Tank","c":7.3},{"n":"Diving Mask","c":7.3},{"n":"Fins","c":7.3}],"out":true},{"slug":"furious_wigglytuff","nome":"Furious Wigglytuff","lvl":150,"reg":"Outland","pid":2035,"types":["NORMAL","FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Comb","c":63.5},{"n":"Microphone","c":68.9},{"n":"Heart Stone","c":1.7}],"out":true},{"slug":"ancient_xatu","nome":"Ancient Xatu","lvl":150,"reg":"Outland","pid":2036,"types":["PSYCHIC","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK","GHOST","DARK"],"xp":5325,"gp":1824,"drops":[{"n":"Feather Stone","c":0.2},{"n":"Straw","c":95.0},{"n":"Enchanted Gem","c":95.0},{"n":"Feather","c":95.0},{"n":"Enigma Stone","c":1.0},{"n":"Strange Wing","c":25.7}],"out":true},{"slug":"brave_mantine","nome":"Brave Mantine","lvl":150,"reg":"Outland","pid":2040,"types":["WATER","FLYING"],"w4x":["ELECTRIC"],"w2x":["ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Ancient Stone","c":0.1},{"n":"Straw","c":95.0},{"n":"Fins","c":4.5},{"n":"Water Gem","c":12.9},{"n":"Water Stone","c":0.3},{"n":"Air Tank","c":8.7},{"n":"Diving Mask","c":8.7},{"n":"Streak Tail","c":28.0},{"n":"Water Pendant","c":28.0}],"out":true},{"slug":"ancient_pinsir","nome":"Ancient Pinsir","lvl":150,"reg":"Outland","pid":2041,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Bug Gosme","c":95.0},{"n":"Pot of Moss Bug","c":95.0},{"n":"Pinsir Horn","c":35.8},{"n":"Cocoon Stone","c":1.6}],"out":true},{"slug":"ancient_granbull","nome":"Ancient Granbull","lvl":150,"reg":"Outland","pid":2043,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Heart Stone","c":2.2},{"n":"Dog Ear","c":70.2}],"out":true},{"slug":"brave_clefable","nome":"Brave Clefable","lvl":150,"reg":"Outland","pid":2042,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Comb","c":63.4},{"n":"Topknot","c":92.9},{"n":"Heart Stone","c":2.1}],"out":true},{"slug":"brave_noctowl","nome":"Brave Noctowl","lvl":150,"reg":"Outland","pid":2045,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Straw","c":95.0},{"n":"Rubber Ball","c":95.0},{"n":"Feather","c":95.0},{"n":"Feather Stone","c":1.7},{"n":"Owl Feather","c":37.6},{"n":"Heart Stone","c":0.4}],"out":true},{"slug":"furious_pidgeot","nome":"Furious Pidgeot","lvl":150,"reg":"Outland","pid":2046,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":5325,"gp":1824,"drops":[{"n":"Ancient Stone","c":0.1},{"n":"Straw","c":95.0},{"n":"Rubber Ball","c":95.0},{"n":"Bird Beak","c":95.0},{"n":"Feather","c":95.0},{"n":"Colored Feather","c":65.4},{"n":"Heart Stone","c":0.5},{"n":"Feather Stone","c":0.5}],"out":true},{"slug":"ancient_pupitar","nome":"Ancient Pupitar","lvl":150,"reg":"Outland","pid":2033,"types":["ROCK","GROUND"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":5325,"gp":1824,"drops":[{"n":"Ancient Stone","c":0.2},{"n":"Earth Ball","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":95.0},{"n":"Rock Stone","c":0.5},{"n":"Lizard Tail","c":47.6},{"n":"Sandbag","c":81.9}],"out":true},{"slug":"ancient_hypno","nome":"Ancient Hypno","lvl":150,"reg":"Outland","pid":2038,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":5325,"gp":1824,"drops":[{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Linearly Guided Hypnosis","c":81.0},{"n":"Enigma Stone","c":2.1}],"out":true},{"slug":"ancient_marowak","nome":"Ancient Marowak","lvl":150,"reg":"Outland","pid":2047,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":5325,"gp":1824,"drops":[{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Bone","c":72.7},{"n":"Earth Stone","c":1.9}],"out":true},{"slug":"furious_skarmory","nome":"Furious Skarmory","lvl":150,"reg":"Outland","pid":2044,"types":["STEEL","FLYING"],"w4x":[],"w2x":["FIRE","ELECTRIC"],"xp":5325,"gp":1824,"drops":[{"n":"Metal Stone","c":0.2},{"n":"Feather Stone","c":0.2},{"n":"Straw","c":95.0},{"n":"Piece of Steel","c":95.0},{"n":"Steel Wing","c":55.3}],"out":true},{"slug":"brave_aerodactyl","nome":"Brave Aerodactyl","lvl":150,"reg":"Outland","pid":2049,"types":["ROCK","FLYING"],"w4x":[],"w2x":["WATER","ELECTRIC","ICE","ROCK","STEEL"],"xp":5325,"gp":1824,"drops":[],"out":true},{"slug":"brave_tyranitar","nome":"Brave Tyranitar","lvl":150,"reg":"Outland","pid":2048,"types":["ROCK","DARK"],"w4x":["FIGHTING"],"w2x":["WATER","GRASS","GROUND","BUG","STEEL","FAIRY"],"xp":5325,"gp":1824,"drops":[],"out":true},{"slug":"treecko_hoenn","nome":"Treecko","lvl":500,"reg":"Outland","pid":13252,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":7030,"gp":3012,"drops":[{"n":"Seed","c":95.0},{"n":"Leaves","c":95.0},{"n":"greens","c":14.4},{"n":"Leaf Stone","c":0.4}],"out":false},{"slug":"torchic_hoenn","nome":"Torchic","lvl":500,"reg":"Outland","pid":13255,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"fire feather","c":11.4},{"n":"Essence of Fire","c":95.0},{"n":"Pot of Lava","c":95.0},{"n":"Fire Stone","c":0.4}],"out":false},{"slug":"mudkip_hoenn","nome":"Mudkip","lvl":500,"reg":"Outland","pid":13258,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":7030,"gp":3012,"drops":[{"n":"black fins","c":15.8},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Water Stone","c":0.4}],"out":false},{"slug":"zigzagoon_hoenn","nome":"Zigzagoon","lvl":500,"reg":"Outland","pid":13263,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":7030,"gp":3012,"drops":[{"n":"Straw","c":69.1},{"n":"Dodrio Feather","c":5.2},{"n":"Enchanted Gem","c":38.6},{"n":"Wool Ball","c":27.3},{"n":"Feather","c":43.5},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"wurmple_hoenn","nome":"Wurmple","lvl":500,"reg":"Outland","pid":13265,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"Screw","c":3.3},{"n":"Bee Sting","c":4.2},{"n":"Band Aid","c":74.2},{"n":"Small Stone","c":80.0},{"n":"Metal Stone","c":0.1}],"out":false},{"slug":"cascoon_hoenn","nome":"Cascoon","lvl":500,"reg":"Outland","pid":13268,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"Butterfly Wing","c":18.3},{"n":"Locksmith of Shell","c":12.0},{"n":"Punch Stone","c":0.6},{"n":"Mushroom","c":4.0},{"n":"Pot of Moss Bug","c":56.1}],"out":false},{"slug":"lotad_hoenn","nome":"Lotad","lvl":500,"reg":"Outland","pid":13270,"types":["WATER","GRASS"],"w4x":[],"w2x":["GRASS","POISON","FLYING","BUG"],"xp":7030,"gp":3012,"drops":[{"n":"water plant","c":18.9},{"n":"Seed","c":71.5},{"n":"Water Gem","c":95.0},{"n":"Leaves","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Water Stone","c":0.4},{"n":"Leaf Stone","c":0.4}],"out":false},{"slug":"seedot_hoenn","nome":"Seedot","lvl":500,"reg":"Outland","pid":13273,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":7030,"gp":3012,"drops":[{"n":"big seed","c":8.3},{"n":"Seed","c":95.0},{"n":"Leaves","c":95.0},{"n":"Leaf Stone","c":0.4}],"out":false},{"slug":"taillow_hoenn","nome":"Taillow","lvl":500,"reg":"Outland","pid":13276,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"crimson feather","c":29.3},{"n":"Straw","c":80.2},{"n":"Rubber Ball","c":95.0},{"n":"Feather","c":95.0},{"n":"Bird Beak","c":95.0},{"n":"Heart Stone","c":0.4},{"n":"Feather Stone","c":0.4}],"out":false},{"slug":"wingull_hoenn","nome":"Wingull","lvl":500,"reg":"Outland","pid":13278,"types":["WATER","FLYING"],"w4x":["ELECTRIC"],"w2x":["ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"pelican wing","c":89.3},{"n":"Straw","c":94.9},{"n":"Water Gem","c":95.0},{"n":"Crystal Stone","c":0.1}],"out":false},{"slug":"ralts_hoenn","nome":"Ralts","lvl":500,"reg":"Outland","pid":13280,"types":["PSYCHIC","FAIRY"],"w4x":[],"w2x":["POISON","GHOST","STEEL"],"xp":7030,"gp":3012,"drops":[{"n":"Cure Flower","c":19.9},{"n":"Comb","c":19.9},{"n":"Enchanted Gem","c":84.1},{"n":"Future Orb","c":95.0},{"n":"Enigma Stone","c":0.4},{"n":"Heart Stone","c":0.4}],"out":false},{"slug":"surskit_hoenn","nome":"Surskit","lvl":500,"reg":"Outland","pid":13283,"types":["BUG","WATER"],"w4x":[],"w2x":["ELECTRIC","FLYING","ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"Bug Antenna","c":41.0},{"n":"Pinsir Horn","c":4.3},{"n":"Venom Stone","c":0.3}],"out":false},{"slug":"shroomish_hoenn","nome":"Shroomish","lvl":500,"reg":"Outland","pid":13285,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":7030,"gp":3012,"drops":[{"n":"Bulb","c":2.9},{"n":"Strange Flower","c":6.1},{"n":"Plant Foot","c":18.1}],"out":false},{"slug":"slakoth_hoenn","nome":"Slakoth","lvl":500,"reg":"Outland","pid":13287,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":7030,"gp":3012,"drops":[{"n":"fur ball","c":39.1},{"n":"Rubber Ball","c":86.0},{"n":"Fur","c":95.0},{"n":"Heart Stone","c":1.0}],"out":false},{"slug":"shedinja_hoenn","nome":"Shedinja","lvl":500,"reg":"Outland","pid":13292,"types":["BUG","GHOST"],"w4x":[],"w2x":["FIRE","FLYING","ROCK","DARK"],"xp":7030,"gp":3012,"drops":[{"n":"Goggles","c":10.0},{"n":"Bottles of Poison","c":57.0},{"n":"Small Stone","c":80.0},{"n":"Bug Antenna","c":41.0}],"out":false},{"slug":"whismur_hoenn","nome":"Whismur","lvl":500,"reg":"Outland","pid":13293,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":7030,"gp":3012,"drops":[{"n":"cute ball","c":30.1},{"n":"Rubber Ball","c":95.0},{"n":"Nail","c":95.0},{"n":"Heart Stone","c":0.4}],"out":false},{"slug":"azurill_hoenn","nome":"Azurill","lvl":500,"reg":"Outland","pid":13298,"types":["NORMAL","FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":7030,"gp":3012,"drops":[{"n":"Tooth","c":15.9},{"n":"Wool Ball","c":27.3},{"n":"Crystal Cube","c":9.0},{"n":"Future Orb","c":17.5}],"out":false},{"slug":"nosepass_hoenn","nome":"Nosepass","lvl":500,"reg":"Outland","pid":13299,"types":["ROCK"],"w4x":[],"w2x":["WATER","GRASS","FIGHTING","GROUND","STEEL"],"xp":7030,"gp":3012,"drops":[{"n":"Straw","c":60.0},{"n":"Dome Fossil","c":2.1},{"n":"Earth Stone","c":0.4},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"aron_hoenn","nome":"Aron","lvl":500,"reg":"Outland","pid":13304,"types":["STEEL","ROCK"],"w4x":["FIGHTING","GROUND"],"w2x":["WATER","STEEL"],"xp":7030,"gp":3012,"drops":[{"n":"Metal Hull","c":16.2},{"n":"Piece of Steel","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":95.0},{"n":"Metal Stone","c":0.1}],"out":false},{"slug":"meditite_hoenn","nome":"Meditite","lvl":500,"reg":"Outland","pid":13307,"types":["FIGHTING","PSYCHIC"],"w4x":[],"w2x":["FLYING","PSYCHIC","GHOST","FAIRY"],"xp":7030,"gp":3012,"drops":[{"n":"mediling","c":1.6},{"n":"band-aid","c":95.0},{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":32.1},{"n":"Punch Stone","c":0.4}],"out":false},{"slug":"electrike_hoenn","nome":"Electrike","lvl":500,"reg":"Outland","pid":13309,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":7030,"gp":3012,"drops":[{"n":"shock topknot","c":20.7},{"n":"Screw","c":95.0},{"n":"Electric Box","c":95.0},{"n":"Thunder Stone","c":0.4}],"out":false},{"slug":"gulpin_hoenn","nome":"Gulpin","lvl":500,"reg":"Outland","pid":13316,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":7030,"gp":3012,"drops":[{"n":"Earth Ball","c":73.9},{"n":"Bat Wing","c":9.0},{"n":"Ancient Stone","c":0.0},{"n":"Tooth","c":60.9},{"n":"Male Ear","c":3.1}],"out":false},{"slug":"carvanha_hoenn","nome":"Carvanha","lvl":500,"reg":"Outland","pid":13318,"types":["WATER","DARK"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","BUG","FAIRY"],"xp":7030,"gp":3012,"drops":[{"n":"Dragon Scale","c":17.7},{"n":"Snow Skis","c":0.5},{"n":"Gyarados Tail","c":0.7},{"n":"Horn","c":17.5},{"n":"Punch Stone","c":0.5}],"out":false},{"slug":"wailmer_hoenn","nome":"Wailmer","lvl":500,"reg":"Outland","pid":13320,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":7030,"gp":3012,"drops":[{"n":"Water Gem","c":57.4},{"n":"Earth Ball","c":21.4},{"n":"Dragon Tail","c":8.5}],"out":false},{"slug":"numel_hoenn","nome":"Numel","lvl":500,"reg":"Outland","pid":13322,"types":["FIRE","GROUND"],"w4x":["WATER"],"w2x":["GROUND"],"xp":7030,"gp":3012,"drops":[{"n":"nu ball","c":20.1},{"n":"Essence of Fire","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Pot of Lava","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Fire Stone","c":0.4}],"out":false},{"slug":"spoink_hoenn","nome":"Spoink","lvl":500,"reg":"Outland","pid":13325,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":7030,"gp":3012,"drops":[{"n":"springs","c":16.8},{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Enigma Stone","c":0.4}],"out":false},{"slug":"spinda_hoenn","nome":"Spinda","lvl":500,"reg":"Outland","pid":13327,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":7030,"gp":3012,"drops":[{"n":"Enigma Stone","c":0.3},{"n":"Feather","c":43.5},{"n":"Rubber Ball","c":70.8}],"out":false},{"slug":"trapinch_hoenn","nome":"Trapinch","lvl":500,"reg":"Outland","pid":13328,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":7030,"gp":3012,"drops":[{"n":"strange ball","c":10.5},{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Earth Stone","c":0.7}],"out":false},{"slug":"cacnea_hoenn","nome":"Cacnea","lvl":500,"reg":"Outland","pid":13331,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":7030,"gp":3012,"drops":[{"n":"Straw","c":80.0},{"n":"Feather","c":11.0},{"n":"Bottles of Poison","c":73.8}],"out":false},{"slug":"swablu_hoenn","nome":"Swablu","lvl":500,"reg":"Outland","pid":13333,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"cloud","c":45.4},{"n":"Rubber Ball","c":73.3},{"n":"Straw","c":95.0},{"n":"Feather","c":95.0},{"n":"Heart Stone","c":1.0},{"n":"Feather Stone","c":1.0}],"out":false},{"slug":"barboach_hoenn","nome":"Barboach","lvl":500,"reg":"Outland","pid":13339,"types":["WATER","GROUND"],"w4x":["GRASS"],"w2x":["WATER"],"xp":7030,"gp":3012,"drops":[{"n":"Screw","c":38.2},{"n":"Crystal Stone","c":0.3},{"n":"Small Stone","c":80.0},{"n":"Blue Fish Fin","c":10.1}],"out":false},{"slug":"corphish_hoenn","nome":"Corphish","lvl":500,"reg":"Outland","pid":13341,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":7030,"gp":3012,"drops":[{"n":"lobster claw","c":23.9},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Water Stone","c":0.4}],"out":false},{"slug":"baltoy_hoenn","nome":"Baltoy","lvl":500,"reg":"Outland","pid":13343,"types":["GROUND","PSYCHIC"],"w4x":[],"w2x":["WATER","GRASS","ICE","BUG","GHOST","DARK"],"xp":7030,"gp":3012,"drops":[{"n":"pawn","c":19.6},{"n":"Earth Ball","c":74.5},{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Earth Stone","c":0.4},{"n":"Enigma Stone","c":0.4}],"out":false},{"slug":"lileep_hoenn","nome":"Lileep","lvl":500,"reg":"Outland","pid":13345,"types":["ROCK","GRASS"],"w4x":[],"w2x":["GRASS","ICE","FIGHTING","BUG","STEEL"],"xp":7030,"gp":3012,"drops":[{"n":"Water Stone","c":0.4},{"n":"Tooth","c":16.5},{"n":"Crystal Tail","c":0.3},{"n":"Straw","c":60.0}],"out":false},{"slug":"anorith_hoenn","nome":"Anorith","lvl":500,"reg":"Outland","pid":13347,"types":["ROCK","BUG"],"w4x":[],"w2x":["WATER","ROCK","STEEL"],"xp":7030,"gp":3012,"drops":[{"n":"Dome Fossil","c":2.1},{"n":"Small Stone","c":66.2},{"n":"Crystal Cube","c":0.1},{"n":"Helix Fossil","c":1.6}],"out":false},{"slug":"feebas_hoenn","nome":"Feebas","lvl":500,"reg":"Hoenn","pid":349,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":7030,"gp":3012,"drops":[{"n":"Water Gem","c":75.0},{"n":"Water Pendant","c":4.0}],"out":false},{"slug":"shuppet_hoenn","nome":"Shuppet","lvl":500,"reg":"Outland","pid":13353,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":7030,"gp":3012,"drops":[{"n":"Bottles of Poison","c":75.0},{"n":"Venom Stone","c":0.7},{"n":"Enchanted Gem","c":10.2},{"n":"Darkness Stone","c":0.7},{"n":"Traces of Ghost","c":12.6}],"out":false},{"slug":"duskull_hoenn","nome":"Duskull","lvl":500,"reg":"Outland","pid":13355,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":7030,"gp":3012,"drops":[{"n":"Ghost Essence","c":88.9},{"n":"ghost skull","c":46.3},{"n":"Darkness Stone","c":1.0}],"out":false},{"slug":"wynaut_hoenn","nome":"Wynaut","lvl":500,"reg":"Outland","pid":13360,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":7030,"gp":3012,"drops":[{"n":"Future Orb","c":39.9},{"n":"Seed","c":80.0},{"n":"Enigma Stone","c":0.5},{"n":"Feather Stone","c":0.1},{"n":"Straw","c":63.6}],"out":false},{"slug":"snorunt_hoenn","nome":"Snorunt","lvl":500,"reg":"Outland","pid":13361,"types":["ICE"],"w4x":[],"w2x":["FIRE","FIGHTING","ROCK","STEEL"],"xp":7030,"gp":3012,"drops":[{"n":"ice blocks","c":20.8},{"n":"Snowball","c":89.8},{"n":"Ice Orb","c":95.0},{"n":"Ice Stone","c":0.4}],"out":false},{"slug":"spheal_hoenn","nome":"Spheal","lvl":500,"reg":"Outland","pid":13363,"types":["ICE","WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":7030,"gp":3012,"drops":[{"n":"Snowball","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Ice Orb","c":76.4},{"n":"Nail","c":95.0},{"n":"seal mustache","c":10.7},{"n":"Water Stone","c":0.4},{"n":"Ice Stone","c":0.4}],"out":false},{"slug":"clamperl_hoenn","nome":"Clamperl","lvl":500,"reg":"Outland","pid":13366,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":7030,"gp":3012,"drops":[{"n":"Water Gem","c":57.4},{"n":"Small Stone","c":80.0},{"n":"Earth Ball","c":21.4}],"out":false},{"slug":"luvdisc_hoenn","nome":"Luvdisc","lvl":500,"reg":"Outland","pid":13370,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":7030,"gp":3012,"drops":[{"n":"Earth Stone","c":0.2},{"n":"Bottles of Poison","c":55.6},{"n":"Magikarp Fin","c":11.2}],"out":false},{"slug":"bagon_hoenn","nome":"Bagon","lvl":500,"reg":"Outland","pid":13371,"types":["DRAGON"],"w4x":[],"w2x":["ICE","FAIRY"],"xp":7030,"gp":3012,"drops":[{"n":"Mini Wings","c":51.6},{"n":"Dragon Scale","c":89.8},{"n":"Crystal Stone","c":0.1}],"out":false},{"slug":"beldum_hoenn","nome":"Beldum","lvl":500,"reg":"Outland","pid":13374,"types":["STEEL","PSYCHIC"],"w4x":[],"w2x":["FIRE","GROUND","GHOST","DARK"],"xp":7030,"gp":3012,"drops":[{"n":"Tech Ball","c":25.9},{"n":"Piece of Steel","c":86.7},{"n":"Metal Stone","c":0.0},{"n":"Enigma Stone","c":0.4}],"out":false},{"slug":"poochyena_hoenn","nome":"Poochyena","lvl":500,"reg":"Outland","pid":13261,"types":["DARK"],"w4x":[],"w2x":["FIGHTING","BUG","FAIRY"],"xp":7030,"gp":3012,"drops":[{"n":"hyena tail","c":43.7},{"n":"Dark Gem","c":95.0},{"n":"Darkness Stone","c":1.2}],"out":false},{"slug":"nincada_hoenn","nome":"Nincada","lvl":500,"reg":"Outland","pid":13290,"types":["BUG","GROUND"],"w4x":[],"w2x":["FIRE","WATER","ICE","FLYING"],"xp":7030,"gp":3012,"drops":[{"n":"Scythe","c":3.4},{"n":"Small Stone","c":80.0},{"n":"Rock Stone","c":0.3},{"n":"Bug Antenna","c":41.0}],"out":false},{"slug":"makuhita_hoenn","nome":"Makuhita","lvl":550,"reg":"Outland","pid":13296,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":7730,"gp":3312,"drops":[{"n":"samurai hair","c":1.9},{"n":"band-aid","c":90.5},{"n":"Punch Stone","c":1.0}],"out":false},{"slug":"plusle_hoenn","nome":"Plusle","lvl":550,"reg":"Outland","pid":13311,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":7730,"gp":3312,"drops":[{"n":"Electric Tail","c":4.6},{"n":"Screw","c":57.4},{"n":"Thunder Stone","c":0.5},{"n":"Electric Box","c":38.1},{"n":"Crystal Stone","c":0.5}],"out":false},{"slug":"minun_hoenn","nome":"Minun","lvl":550,"reg":"Outland","pid":13312,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":7730,"gp":3312,"drops":[{"n":"Electric Rat Tail","c":5.1},{"n":"Thunder Stone","c":0.5},{"n":"Feather","c":30.0},{"n":"Wool Ball","c":13.5},{"n":"Magnet","c":19.1}],"out":false},{"slug":"volbeat_hoenn","nome":"Volbeat","lvl":550,"reg":"Outland","pid":13313,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":7730,"gp":3312,"drops":[{"n":"Small Stone","c":80.0},{"n":"Feather","c":55.3},{"n":"Butterfly Wing","c":18.3},{"n":"Punch Stone","c":0.6},{"n":"Cocoon Stone","c":0.5}],"out":false},{"slug":"illumise_hoenn","nome":"Illumise","lvl":550,"reg":"Outland","pid":13314,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":7730,"gp":3312,"drops":[{"n":"Small Stone","c":80.0},{"n":"Metal Stone","c":0.1},{"n":"Bug Antenna","c":41.0},{"n":"Bug Gosme","c":59.5},{"n":"Piece of Steel","c":12.5}],"out":false},{"slug":"lunatone_hoenn","nome":"Lunatone","lvl":550,"reg":"Outland","pid":13337,"types":["ROCK","PSYCHIC"],"w4x":[],"w2x":["WATER","GRASS","GROUND","BUG","GHOST","DARK","STEEL"],"xp":7730,"gp":3312,"drops":[{"n":"Crystal Cube","c":0.1},{"n":"Old Amber","c":0.1},{"n":"Dark Gem","c":38.1},{"n":"Small Stone","c":66.2}],"out":false},{"slug":"solrock_hoenn","nome":"Solrock","lvl":550,"reg":"Outland","pid":13338,"types":["ROCK","PSYCHIC"],"w4x":[],"w2x":["WATER","GRASS","GROUND","BUG","GHOST","DARK","STEEL"],"xp":7730,"gp":3312,"drops":[{"n":"Dark Gem","c":38.1},{"n":"Crystal Tail","c":0.3},{"n":"Helix Fossil","c":1.6},{"n":"Tooth","c":16.5}],"out":false},{"slug":"castform_fire_hoenn","nome":"Castform Fire","lvl":550,"reg":"Outland","pid":13351,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":7730,"gp":3312,"drops":[{"n":"Sticky Hand","c":12.0},{"n":"Horn","c":35.9},{"n":"Iron Bracelet","c":0.7},{"n":"Luck Medallion","c":6.3},{"n":"Heart Stone","c":0.5}],"out":false},{"slug":"kecleon_hoenn","nome":"Kecleon","lvl":550,"reg":"Outland","pid":13352,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":7730,"gp":3312,"drops":[{"n":"Magnetic Cube","c":12.0},{"n":"Horn","c":35.9},{"n":"Nail","c":25.6},{"n":"Comb","c":26.3},{"n":"Rat Tail","c":43.8},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"gorebyss_hoenn","nome":"Gorebyss","lvl":550,"reg":"Outland","pid":13368,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":7730,"gp":3312,"drops":[{"n":"Feather","c":39.0},{"n":"Horn","c":17.5},{"n":"Venom Stone","c":0.3}],"out":false},{"slug":"relicanth_hoenn","nome":"Relicanth","lvl":550,"reg":"Outland","pid":13369,"types":["WATER","ROCK"],"w4x":["GRASS"],"w2x":["WATER","ELECTRIC","FIGHTING","GROUND"],"xp":7730,"gp":3312,"drops":[{"n":"Snowball","c":67.2},{"n":"Tongue","c":13.3},{"n":"Band Aid","c":75.0}],"out":false},{"slug":"slaking_hoenn","nome":"Slaking","lvl":600,"reg":"Hoenn","pid":289,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":8430,"gp":3612,"drops":[{"n":"Rubber Ball","c":80.0},{"n":"Power Banana","c":0.0},{"n":"fur ball","c":7.0},{"n":"Gardestrike Backpack","c":1.0},{"n":"Leather","c":1.0},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"sableye_hoenn","nome":"Sableye","lvl":600,"reg":"Outland","pid":13302,"types":["DARK","GHOST"],"w4x":[],"w2x":["DARK","FAIRY"],"xp":8430,"gp":3612,"drops":[{"n":"Big Crystal","c":41.4},{"n":"Ruby","c":89.0},{"n":"Ghost Essence","c":95.0},{"n":"Darkness Stone","c":1.0}],"out":false},{"slug":"mawile_hoenn","nome":"Mawile","lvl":600,"reg":"Outland","pid":13303,"types":["STEEL","FAIRY"],"w4x":[],"w2x":["FIRE","GROUND","STEEL"],"xp":8430,"gp":3612,"drops":[{"n":"Metal Jaw","c":95.0},{"n":"Piece of Steel","c":95.0},{"n":"Metal Stone","c":0.3}],"out":false},{"slug":"torkoal_hoenn","nome":"Torkoal","lvl":600,"reg":"Outland","pid":13324,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":8430,"gp":3612,"drops":[{"n":"Essence of Fire","c":93.1},{"n":"Pot of Lava","c":93.1},{"n":"Black Hull","c":93.1},{"n":"Fire Stone","c":1.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"zangoose_hoenn","nome":"Zangoose","lvl":600,"reg":"Outland","pid":13335,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":8430,"gp":3612,"drops":[{"n":"tribe mark","c":95.0},{"n":"Wool Ball","c":94.8},{"n":"Rubber Ball","c":95.0},{"n":"cat ear","c":95.0},{"n":"Heart Stone","c":1.0},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"seviper_hoenn","nome":"Seviper","lvl":600,"reg":"Outland","pid":13336,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":8430,"gp":3612,"drops":[{"n":"Poisonous Tail","c":95.0},{"n":"Bottles of Poison","c":95.0},{"n":"Tooth","c":95.0},{"n":"Venom Stone","c":1.0}],"out":false},{"slug":"tropius_hoenn","nome":"Tropius","lvl":600,"reg":"Outland","pid":13357,"types":["GRASS","FLYING"],"w4x":["ICE"],"w2x":["FIRE","POISON","FLYING","ROCK"],"xp":8430,"gp":3612,"drops":[{"n":"palm leaves","c":95.0},{"n":"Straw","c":77.4},{"n":"Seed","c":95.0},{"n":"Feather","c":95.0},{"n":"Bird Beak","c":95.0},{"n":"Feather Stone","c":1.0},{"n":"Leaf Stone","c":1.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"absol_hoenn","nome":"Absol","lvl":600,"reg":"Outland","pid":13359,"types":["DARK"],"w4x":[],"w2x":["FIGHTING","BUG","FAIRY"],"xp":8430,"gp":3612,"drops":[{"n":"dark moon","c":25.8},{"n":"Dark Gem","c":93.0},{"n":"Darkness Stone","c":2.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"grovyle_hoenn","nome":"Grovyle","lvl":650,"reg":"Outland","pid":13253,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":9130,"gp":3912,"drops":[{"n":"Seed","c":95.0},{"n":"Leaves","c":95.0},{"n":"greens","c":32.7},{"n":"Leaf Stone","c":1.0}],"out":false},{"slug":"combusken_hoenn","nome":"Combusken","lvl":650,"reg":"Outland","pid":13256,"types":["FIRE","FIGHTING"],"w4x":[],"w2x":["WATER","GROUND","FLYING","PSYCHIC"],"xp":9130,"gp":3912,"drops":[{"n":"fire feather","c":2.0},{"n":"band-aid","c":80.0},{"n":"Essence of Fire","c":80.0},{"n":"Pot of Lava","c":32.0},{"n":"Fire Stone","c":1.0},{"n":"Punch Stone","c":0.4}],"out":false},{"slug":"marshtomp_hoenn","nome":"Marshtomp","lvl":650,"reg":"Outland","pid":13259,"types":["WATER","GROUND"],"w4x":["GRASS"],"w2x":["WATER"],"xp":9130,"gp":3912,"drops":[{"n":"black fins","c":33.0},{"n":"Earth Ball","c":93.0},{"n":"Water Gem","c":93.0},{"n":"Water Pendant","c":93.0},{"n":"Sandbag","c":93.0},{"n":"Water Stone","c":0.4},{"n":"Earth Stone","c":0.4}],"out":false},{"slug":"linoone_hoenn","nome":"Linoone","lvl":650,"reg":"Outland","pid":13264,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":9130,"gp":3912,"drops":[{"n":"Feather Stone","c":0.4},{"n":"Snake Tail","c":80.0},{"n":"Nail","c":25.6},{"n":"Future Orb","c":17.5},{"n":"Bitten Apple","c":54.2}],"out":false},{"slug":"silcoon_hoenn","nome":"Silcoon","lvl":650,"reg":"Outland","pid":13266,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":9130,"gp":3912,"drops":[{"n":"Pinsir Horn","c":4.3},{"n":"Tooth","c":23.0},{"n":"Punch Stone","c":0.6},{"n":"Metal Stone","c":0.1},{"n":"Rock Stone","c":0.3}],"out":false},{"slug":"lombre_hoenn","nome":"Lombre","lvl":650,"reg":"Outland","pid":13271,"types":["WATER","GRASS"],"w4x":[],"w2x":["GRASS","POISON","FLYING","BUG"],"xp":9130,"gp":3912,"drops":[{"n":"water plant","c":55.5},{"n":"Seed","c":73.7},{"n":"Water Gem","c":95.0},{"n":"Leaves","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Leaf Stone","c":1.0},{"n":"Water Stone","c":1.0}],"out":false},{"slug":"nuzleaf_hoenn","nome":"Nuzleaf","lvl":650,"reg":"Outland","pid":13274,"types":["GRASS","DARK"],"w4x":["BUG"],"w2x":["FIRE","ICE","FIGHTING","POISON","FLYING","FAIRY"],"xp":9130,"gp":3912,"drops":[{"n":"big seed","c":35.3},{"n":"Seed","c":92.7},{"n":"Dark Gem","c":92.7},{"n":"Leaves","c":92.7},{"n":"Leaf Stone","c":0.4},{"n":"Darkness Stone","c":0.4}],"out":false},{"slug":"kirlia_hoenn","nome":"Kirlia","lvl":650,"reg":"Outland","pid":13281,"types":["PSYCHIC","FAIRY"],"w4x":[],"w2x":["POISON","GHOST","STEEL"],"xp":9130,"gp":3912,"drops":[{"n":"Cure Flower","c":49.4},{"n":"Comb","c":43.3},{"n":"Enchanted Gem","c":93.6},{"n":"Future Orb","c":93.6},{"n":"Heart Stone","c":1.0},{"n":"Enigma Stone","c":0.4}],"out":false},{"slug":"loudred_hoenn","nome":"Loudred","lvl":650,"reg":"Outland","pid":13294,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":9130,"gp":3912,"drops":[{"n":"cute ball","c":81.0},{"n":"Rubber Ball","c":95.0},{"n":"eruption ears","c":42.5},{"n":"Nail","c":95.0},{"n":"Heart Stone","c":0.4}],"out":false},{"slug":"lairon_hoenn","nome":"Lairon","lvl":650,"reg":"Outland","pid":13305,"types":["STEEL","ROCK"],"w4x":["FIGHTING","GROUND"],"w2x":["WATER","STEEL"],"xp":9130,"gp":3912,"drops":[{"n":"Metal Hull","c":50.2},{"n":"Piece of Steel","c":93.4},{"n":"Small Stone","c":93.4},{"n":"Stone Orb","c":93.4},{"n":"Metal Stone","c":0.3},{"n":"Rock Stone","c":0.4}],"out":false},{"slug":"roselia_hoenn","nome":"Roselia","lvl":650,"reg":"Outland","pid":13315,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":9130,"gp":3912,"drops":[{"n":"Leaf Stone","c":0.5},{"n":"Straw","c":80.0},{"n":"Bag of Pollen","c":30.9},{"n":"Feather","c":11.0},{"n":"Enchanted Gem","c":74.8}],"out":false},{"slug":"vibrava_hoenn","nome":"Vibrava","lvl":650,"reg":"Outland","pid":13329,"types":["GROUND","DRAGON"],"w4x":["ICE"],"w2x":["FAIRY"],"xp":9130,"gp":3912,"drops":[{"n":"Sand Tail","c":35.4},{"n":"Dragon Scale","c":95.0},{"n":"Earth Ball","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Earth Stone","c":1.0}],"out":false},{"slug":"dusclops_hoenn","nome":"Dusclops","lvl":650,"reg":"Outland","pid":13356,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":9130,"gp":3912,"drops":[{"n":"Ghost Essence","c":93.5},{"n":"ghost skull","c":95.0},{"n":"creepy eye","c":44.0},{"n":"Darkness Stone","c":1.0}],"out":false},{"slug":"sealeo_hoenn","nome":"Sealeo","lvl":650,"reg":"Outland","pid":13364,"types":["ICE","WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":9130,"gp":3912,"drops":[{"n":"seal mustache","c":52.3},{"n":"Snowball","c":94.1},{"n":"Water Gem","c":95.0},{"n":"Ice Orb","c":31.4},{"n":"Nail","c":95.0},{"n":"Ice Stone","c":1.0},{"n":"Water Stone","c":0.4}],"out":false},{"slug":"metang_hoenn","nome":"Metang","lvl":650,"reg":"Outland","pid":13375,"types":["STEEL","PSYCHIC"],"w4x":[],"w2x":["FIRE","GROUND","GHOST","DARK"],"xp":9130,"gp":3912,"drops":[{"n":"Tech Ball","c":41.5},{"n":"Piece of Steel","c":93.7},{"n":"Metal Stone","c":0.3},{"n":"Enigma Stone","c":0.4}],"out":false},{"slug":"mightyena_hoenn","nome":"Mightyena","lvl":700,"reg":"Outland","pid":13262,"types":["DARK"],"w4x":[],"w2x":["FIGHTING","BUG","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"hyena tail","c":95.0},{"n":"Dark Gem","c":95.0},{"n":"Darkness Stone","c":2.0}],"out":false},{"slug":"dustox_hoenn","nome":"Dustox","lvl":700,"reg":"Outland","pid":13269,"types":["BUG","POISON"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":9830,"gp":4212,"drops":[{"n":"Piece of Steel","c":12.5},{"n":"Bug Venom","c":2.1},{"n":"Bug Antenna","c":41.0},{"n":"Mushroom","c":4.0},{"n":"Band Aid","c":74.2}],"out":false},{"slug":"swellow_hoenn","nome":"Swellow","lvl":700,"reg":"Outland","pid":13277,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":9830,"gp":4212,"drops":[{"n":"crimson feather","c":95.0},{"n":"Straw","c":81.1},{"n":"Rubber Ball","c":95.0},{"n":"Feather","c":95.0},{"n":"Bird Beak","c":95.0},{"n":"Feather Stone","c":1.0},{"n":"Heart Stone","c":1.0}],"out":false},{"slug":"pelipper_hoenn","nome":"Pelipper","lvl":700,"reg":"Outland","pid":13279,"types":["WATER","FLYING"],"w4x":["ELECTRIC"],"w2x":["ROCK"],"xp":9830,"gp":4212,"drops":[{"n":"pelican wing","c":79.3},{"n":"Straw","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Water Stone","c":1.0}],"out":false},{"slug":"masquerain_hoenn","nome":"Masquerain","lvl":700,"reg":"Outland","pid":13284,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":9830,"gp":4212,"drops":[{"n":"Pot of Moss Bug","c":56.1},{"n":"Cocoon Stone","c":0.5},{"n":"Goggles","c":10.0}],"out":false},{"slug":"vigoroth_hoenn","nome":"Vigoroth","lvl":700,"reg":"Outland","pid":13288,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":9830,"gp":4212,"drops":[{"n":"fur ball","c":72.2},{"n":"Rubber Ball","c":90.3},{"n":"Fur","c":95.0},{"n":"Heart Stone","c":1.0},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"breloom_hoenn","nome":"Breloom","lvl":700,"reg":"Outland","pid":13286,"types":["GRASS","FIGHTING"],"w4x":["FLYING"],"w2x":["FIRE","ICE","POISON","PSYCHIC","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"Enchanted Gem","c":74.8},{"n":"Plant Foot","c":18.1},{"n":"Bag of Pollen","c":30.9}],"out":false},{"slug":"ninjask_hoenn","nome":"Ninjask","lvl":700,"reg":"Outland","pid":13291,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":9830,"gp":4212,"drops":[{"n":"Feather Stone","c":0.9},{"n":"Pinsir Horn","c":4.3},{"n":"Metal Stone","c":0.1},{"n":"Bag of Pollen","c":12.4}],"out":false},{"slug":"hariyama_hoenn","nome":"Hariyama","lvl":700,"reg":"Outland","pid":13297,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"Band Aid","c":67.3},{"n":"Rubber Ball","c":74.2},{"n":"Punch Machine","c":7.6},{"n":"Punch Stone","c":0.5}],"out":false},{"slug":"delcatty_hoenn","nome":"Delcatty","lvl":700,"reg":"Outland","pid":13301,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":9830,"gp":4212,"drops":[{"n":"Iron Bracelet","c":0.7},{"n":"Colored Feather","c":4.4},{"n":"Feather","c":43.5},{"n":"Enchanted Gem","c":38.6}],"out":false},{"slug":"medicham_hoenn","nome":"Medicham","lvl":700,"reg":"Outland","pid":13308,"types":["FIGHTING","PSYCHIC"],"w4x":[],"w2x":["FLYING","PSYCHIC","GHOST","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"mediling","c":6.4},{"n":"band-aid","c":90.5},{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":45.5},{"n":"Punch Stone","c":1.0},{"n":"Enigma Stone","c":1.0}],"out":false},{"slug":"manectric_hoenn","nome":"Manectric","lvl":700,"reg":"Outland","pid":13310,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":9830,"gp":4212,"drops":[{"n":"shock topknot","c":93.8},{"n":"Screw","c":91.9},{"n":"Electric Box","c":95.0},{"n":"Thunder Stone","c":1.0}],"out":false},{"slug":"swalot_hoenn","nome":"Swalot","lvl":700,"reg":"Outland","pid":13317,"types":["POISON"],"w4x":[],"w2x":["GROUND","PSYCHIC"],"xp":9830,"gp":4212,"drops":[{"n":"Earth Stone","c":0.7},{"n":"Bottles of Poison","c":68.0},{"n":"Snake Tail","c":5.3},{"n":"Gosme","c":16.2},{"n":"Sticky Hand","c":15.9}],"out":false},{"slug":"sharpedo_hoenn","nome":"Sharpedo","lvl":700,"reg":"Outland","pid":13319,"types":["WATER","DARK"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","BUG","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"Goggles","c":0.5},{"n":"Water Stone","c":0.5},{"n":"Locksmith of Shell","c":13.8}],"out":false},{"slug":"wailord_hoenn","nome":"Wailord","lvl":700,"reg":"Outland","pid":13321,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":9830,"gp":4212,"drops":[{"n":"Fish Fin","c":3.0},{"n":"Earth Stone","c":0.2},{"n":"Strange Thing","c":5.9}],"out":false},{"slug":"camerupt_hoenn","nome":"Camerupt","lvl":700,"reg":"Outland","pid":13323,"types":["FIRE","GROUND"],"w4x":["WATER"],"w2x":["GROUND"],"xp":9830,"gp":4212,"drops":[{"n":"nu ball","c":84.4},{"n":"Essence of Fire","c":80.6},{"n":"Earth Ball","c":95.0},{"n":"Pot of Lava","c":95.0},{"n":"Sandbag","c":95.0},{"n":"mini volcano","c":18.7},{"n":"Fire Stone","c":1.0},{"n":"Earth Stone","c":1.0}],"out":false},{"slug":"grumpig_hoenn","nome":"Grumpig","lvl":700,"reg":"Outland","pid":13326,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":9830,"gp":4212,"drops":[{"n":"springs","c":95.0},{"n":"Enchanted Gem","c":92.0},{"n":"Future Orb","c":95.0},{"n":"Enigma Stone","c":1.0}],"out":false},{"slug":"cacturne_hoenn","nome":"Cacturne","lvl":700,"reg":"Outland","pid":13332,"types":["GRASS","DARK"],"w4x":["BUG"],"w2x":["FIRE","ICE","FIGHTING","POISON","FLYING","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"Cactus Head","c":80.6},{"n":"Seed","c":95.0},{"n":"Dark Gem","c":95.0},{"n":"Small Crown","c":95.0},{"n":"Leaf Stone","c":1.0},{"n":"Darkness Stone","c":1.0}],"out":false},{"slug":"altaria_hoenn","nome":"Altaria","lvl":700,"reg":"Outland","pid":13334,"types":["DRAGON","FLYING"],"w4x":["ICE"],"w2x":["ROCK","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"cloud","c":95.0},{"n":"Dragon Scale","c":85.1},{"n":"Straw","c":95.0},{"n":"Feather","c":95.0},{"n":"Feather Stone","c":1.0},{"n":"Crystal Stone","c":0.1}],"out":false},{"slug":"whiscash_hoenn","nome":"Whiscash","lvl":700,"reg":"Outland","pid":13340,"types":["WATER","GROUND"],"w4x":["GRASS"],"w2x":["WATER"],"xp":9830,"gp":4212,"drops":[{"n":"Air Tank","c":0.6},{"n":"Ruby","c":14.6},{"n":"Blue Fish Fin","c":10.1},{"n":"Dragon Tail","c":8.5}],"out":false},{"slug":"crawdaunt_hoenn","nome":"Crawdaunt","lvl":700,"reg":"Outland","pid":13342,"types":["WATER","DARK"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","BUG","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"lobster claw","c":94.3},{"n":"Dark Gem","c":82.8},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Darkness Stone","c":1.0},{"n":"Water Stone","c":1.0}],"out":false},{"slug":"claydol_hoenn","nome":"Claydol","lvl":700,"reg":"Outland","pid":13344,"types":["GROUND","PSYCHIC"],"w4x":[],"w2x":["WATER","GRASS","ICE","BUG","GHOST","DARK"],"xp":9830,"gp":4212,"drops":[{"n":"pawn","c":95.0},{"n":"Earth Ball","c":83.1},{"n":"Enchanted Gem","c":95.0},{"n":"Future Orb","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Enigma Stone","c":1.0},{"n":"Earth Stone","c":1.0}],"out":false},{"slug":"cradily_hoenn","nome":"Cradily","lvl":700,"reg":"Outland","pid":13346,"types":["ROCK","GRASS"],"w4x":[],"w2x":["GRASS","ICE","FIGHTING","BUG","STEEL"],"xp":9830,"gp":4212,"drops":[{"n":"Earth Ball","c":64.5},{"n":"Rock Stone","c":0.3},{"n":"Helix Fossil","c":1.6},{"n":"Feather","c":22.5}],"out":false},{"slug":"armaldo_hoenn","nome":"Armaldo","lvl":700,"reg":"Outland","pid":13348,"types":["ROCK","BUG"],"w4x":[],"w2x":["WATER","ROCK","STEEL"],"xp":9830,"gp":4212,"drops":[{"n":"Water Stone","c":0.4},{"n":"Rock Stone","c":0.3},{"n":"Crystal Stone","c":0.1},{"n":"Straw","c":60.0}],"out":false},{"slug":"milotic_hoenn","nome":"Milotic","lvl":700,"reg":"Hoenn","pid":350,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":9830,"gp":4212,"drops":[{"n":"Water Gem","c":80.0},{"n":"Water Stone","c":1.0},{"n":"Prism Scale","c":0.0},{"n":"Beautiful Scales","c":0.0},{"n":"Seavell Backpack","c":1.0}],"out":false},{"slug":"banette_hoenn","nome":"Banette","lvl":700,"reg":"Outland","pid":13354,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":9830,"gp":4212,"drops":[{"n":"Ghost Essence","c":92.9},{"n":"doll star","c":95.0},{"n":"Darkness Stone","c":1.0}],"out":false},{"slug":"chimecho_hoenn","nome":"Chimecho","lvl":700,"reg":"Outland","pid":13358,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":9830,"gp":4212,"drops":[{"n":"Feather Stone","c":0.1},{"n":"Enigma Stone","c":0.5},{"n":"Fox Tail","c":8.5},{"n":"Strange Thing","c":12.0},{"n":"Linearly Guided Hypnosis","c":7.1}],"out":false},{"slug":"glalie_hoenn","nome":"Glalie","lvl":700,"reg":"Outland","pid":13362,"types":["ICE"],"w4x":[],"w2x":["FIRE","FIGHTING","ROCK","STEEL"],"xp":9830,"gp":4212,"drops":[{"n":"ice blocks","c":70.1},{"n":"Snowball","c":90.9},{"n":"Ice Orb","c":95.0},{"n":"Ice Stone","c":1.0}],"out":false},{"slug":"huntail_hoenn","nome":"Huntail","lvl":700,"reg":"Outland","pid":13367,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":9830,"gp":4212,"drops":[{"n":"Band Aid","c":75.0},{"n":"Psychic Spoon","c":12.0},{"n":"Future Orb","c":75.0}],"out":false},{"slug":"shelgon_hoenn","nome":"Shelgon","lvl":700,"reg":"Outland","pid":13372,"types":["DRAGON"],"w4x":[],"w2x":["ICE","FAIRY"],"xp":9830,"gp":4212,"drops":[{"n":"Mini Wings","c":29.7},{"n":"Dragon Scale","c":95.0},{"n":"Crystal Stone","c":0.2}],"out":false},{"slug":"blaziken_hoenn","nome":"Blaziken","lvl":850,"reg":"Outland","pid":13257,"types":["FIRE","FIGHTING"],"w4x":[],"w2x":["WATER","GROUND","FLYING","PSYCHIC"],"xp":11930,"gp":5112,"drops":[{"n":"fire feather","c":6.1},{"n":"band-aid","c":90.3},{"n":"Essence of Fire","c":95.0},{"n":"Pot of Lava","c":64.8},{"n":"Fire Stone","c":1.0},{"n":"Punch Stone","c":1.0}],"out":false},{"slug":"swampert_hoenn","nome":"Swampert","lvl":850,"reg":"Outland","pid":13260,"types":["WATER","GROUND"],"w4x":["GRASS"],"w2x":["WATER"],"xp":11930,"gp":5112,"drops":[{"n":"black fins","c":90.4},{"n":"Earth Ball","c":95.0},{"n":"Water Gem","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Sandbag","c":95.0},{"n":"Water Stone","c":1.0},{"n":"Earth Stone","c":1.0}],"out":false},{"slug":"beautifly_hoenn","nome":"Beautifly","lvl":850,"reg":"Outland","pid":13267,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":11930,"gp":5112,"drops":[{"n":"Cocoon Stone","c":0.5},{"n":"Bug Antenna","c":41.0},{"n":"Venom Stone","c":0.3},{"n":"Scythe","c":3.4},{"n":"Straw","c":77.2}],"out":false},{"slug":"ludicolo_hoenn","nome":"Ludicolo","lvl":850,"reg":"Outland","pid":13272,"types":["WATER","GRASS"],"w4x":[],"w2x":["GRASS","POISON","FLYING","BUG"],"xp":11930,"gp":5112,"drops":[{"n":"water plant","c":95.0},{"n":"Seed","c":87.5},{"n":"Water Gem","c":95.0},{"n":"Leaves","c":95.0},{"n":"Water Pendant","c":95.0},{"n":"Leaf Stone","c":1.0},{"n":"Water Stone","c":1.0}],"out":false},{"slug":"shiftry_hoenn","nome":"Shiftry","lvl":850,"reg":"Outland","pid":13275,"types":["GRASS","DARK"],"w4x":["BUG"],"w2x":["FIRE","ICE","FIGHTING","POISON","FLYING","FAIRY"],"xp":11930,"gp":5112,"drops":[{"n":"Sharp Leaves","c":95.0},{"n":"Seed","c":95.0},{"n":"Dark Gem","c":95.0},{"n":"Leaves","c":95.0},{"n":"Leaf Stone","c":1.0},{"n":"Darkness Stone","c":1.0}],"out":false},{"slug":"gardevoir_hoenn","nome":"Gardevoir","lvl":850,"reg":"Outland","pid":13282,"types":["PSYCHIC","FAIRY"],"w4x":[],"w2x":["POISON","GHOST","STEEL"],"xp":11930,"gp":5112,"drops":[{"n":"Cure Flower","c":77.5},{"n":"Comb","c":45.6},{"n":"Enchanted Gem","c":93.0},{"n":"Future Orb","c":93.0},{"n":"Enigma Stone","c":1.0},{"n":"Heart Stone","c":1.0},{"n":"Crystal Stone","c":0.1}],"out":false},{"slug":"exploud_hoenn","nome":"Exploud","lvl":850,"reg":"Outland","pid":13295,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":11930,"gp":5112,"drops":[{"n":"cute ball","c":95.0},{"n":"Rubber Ball","c":95.0},{"n":"eruption ears","c":95.0},{"n":"Nail","c":95.0},{"n":"Heart Stone","c":1.0}],"out":false},{"slug":"aggron_hoenn","nome":"Aggron","lvl":850,"reg":"Outland","pid":13306,"types":["STEEL","ROCK"],"w4x":["FIGHTING","GROUND"],"w2x":["WATER","STEEL"],"xp":11930,"gp":5112,"drops":[{"n":"Metal Hull","c":70.1},{"n":"Piece of Steel","c":95.0},{"n":"Small Stone","c":95.0},{"n":"Stone Orb","c":95.0},{"n":"Metal Stone","c":0.4},{"n":"Rock Stone","c":0.4}],"out":false},{"slug":"flygon_hoenn","nome":"Flygon","lvl":850,"reg":"Outland","pid":13330,"types":["GROUND","DRAGON"],"w4x":["ICE"],"w2x":["FAIRY"],"xp":11930,"gp":5112,"drops":[{"n":"Sand Tail","c":88.2},{"n":"Dragon Scale","c":92.9},{"n":"Earth Ball","c":92.9},{"n":"Sandbag","c":92.9},{"n":"Earth Stone","c":1.0},{"n":"Crystal Stone","c":0.1}],"out":false},{"slug":"walrein_hoenn","nome":"Walrein","lvl":850,"reg":"Outland","pid":13365,"types":["ICE","WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING","ROCK"],"xp":11930,"gp":5112,"drops":[{"n":"seal mustache","c":95.0},{"n":"Snowball","c":93.9},{"n":"Water Gem","c":95.0},{"n":"Ice Orb","c":91.1},{"n":"Nail","c":95.0},{"n":"Ice Stone","c":1.0},{"n":"Crystal Stone","c":0.1}],"out":false},{"slug":"salamence_hoenn","nome":"Salamence","lvl":850,"reg":"Hoenn","pid":373,"types":["DRAGON","FLYING"],"w4x":["ICE"],"w2x":["ROCK","FAIRY"],"xp":11930,"gp":5112,"drops":[{"n":"Dragon Scale","c":80.0},{"n":"Mini Wings","c":4.2},{"n":"Crystal Stone","c":1.0},{"n":"Dragon Tooth","c":0.0},{"n":"Bloody Wing","c":1.0},{"n":"Wingeon Backpack","c":1.0}],"out":false},{"slug":"sceptile_hoenn","nome":"Sceptile","lvl":850,"reg":"Outland","pid":13254,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":11930,"gp":5112,"drops":[{"n":"Seed","c":92.3},{"n":"Leaves","c":95.0},{"n":"greens","c":95.0},{"n":"Leaf Stone","c":1.0}],"out":false},{"slug":"metagross_hoenn","nome":"Metagross","lvl":850,"reg":"Hoenn","pid":376,"types":["STEEL","PSYCHIC"],"w4x":[],"w2x":["FIRE","GROUND","GHOST","DARK"],"xp":11930,"gp":5112,"drops":[{"n":"Piece of Steel","c":80.0},{"n":"Tech Ball","c":4.2},{"n":"Metal Stone","c":1.0},{"n":"Metal Coat","c":0.0},{"n":"Ironhard Backpack","c":1.0},{"n":"Psycraft Backpack","c":1.0}],"out":false},{"slug":"ditto_sinnoh","nome":"Ditto","lvl":1000,"reg":"Kanto","pid":132,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":80.0},{"n":"Fur","c":60.0}],"out":false},{"slug":"eevee_sinnoh","nome":"Eevee","lvl":1000,"reg":"Kanto","pid":133,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":80.0},{"n":"Fur","c":60.0},{"n":"Leather","c":1.0},{"n":"Eevee Valentine's Card","c":1.0}],"out":false},{"slug":"jolteon_sinnoh","nome":"Jolteon","lvl":1000,"reg":"Kanto","pid":135,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":14030,"gp":6012,"drops":[{"n":"Screw","c":80.0},{"n":"Electric Box","c":60.0},{"n":"Thunder Stone","c":0.3},{"n":"Jolteon Valentine's Card","c":1.0}],"out":false},{"slug":"flareon_sinnoh","nome":"Flareon","lvl":1000,"reg":"Kanto","pid":136,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":14030,"gp":6012,"drops":[{"n":"Essence of Fire","c":80.0},{"n":"Pot Of Lava","c":60.0},{"n":"Fire Stone","c":0.3},{"n":"Eevee Bag","c":1.0},{"n":"Espeon Bag","c":1.0},{"n":"Flareon Bag","c":1.0},{"n":"Flareon Cream","c":1.0},{"n":"Glaceon Bag","c":1.0},{"n":"Jolteon Bag","c":1.0},{"n":"Leafeon Bag","c":1.0},{"n":"Noble Cloak","c":1.0},{"n":"Sylveon Bag","c":1.0},{"n":"Umbreon Bag","c":1.0},{"n":"Vaporeon Bag","c":1.0},{"n":"Flareon Valentine's Card","c":1.0}],"out":false},{"slug":"porygon_sinnoh","nome":"Porygon","lvl":1000,"reg":"Kanto","pid":137,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":80.0},{"n":"Gardestrike Essence","c":0.1},{"n":"Kermes Shard","c":0.0},{"n":"Virtual Tail","c":0.1}],"out":false},{"slug":"sudowoodo_sinnoh","nome":"Sudowoodo","lvl":1000,"reg":"Johto","pid":185,"types":["ROCK"],"w4x":[],"w2x":["WATER","GRASS","FIGHTING","GROUND","STEEL"],"xp":14030,"gp":6012,"drops":[{"n":"Small Stone","c":80.0},{"n":"Stone Orb","c":10.0},{"n":"Rock Stone","c":0.3},{"n":"Branch of Stone","c":16.6}],"out":false},{"slug":"espeon_sinnoh","nome":"Espeon","lvl":1000,"reg":"Johto","pid":196,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":14030,"gp":6012,"drops":[{"n":"Enchanted Gem","c":80.0},{"n":"Future Orb","c":12.0},{"n":"Enigma Stone","c":0.3},{"n":"Psychic Ear","c":18.6}],"out":false},{"slug":"umbreon_sinnoh","nome":"Umbreon","lvl":1000,"reg":"Johto","pid":197,"types":["DARK"],"w4x":[],"w2x":["FIGHTING","BUG","FAIRY"],"xp":14030,"gp":6012,"drops":[{"n":"Dark Gem","c":80.0},{"n":"Darkness Stone","c":0.3},{"n":"Dark Ear","c":18.6}],"out":false},{"slug":"murkrow_sinnoh","nome":"Murkrow","lvl":1000,"reg":"Johto","pid":198,"types":["DARK","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK","FAIRY"],"xp":14030,"gp":6012,"drops":[{"n":"Straw","c":64.2},{"n":"Dark Gem","c":64.2},{"n":"Feather","c":64.2},{"n":"Darkness Stone","c":0.3},{"n":"Dark Beak","c":0.0},{"n":"Feather Stone","c":0.4}],"out":false},{"slug":"slowking_sinnoh","nome":"Slowking","lvl":1000,"reg":"Johto","pid":199,"types":["WATER","PSYCHIC"],"w4x":[],"w2x":["GRASS","ELECTRIC","BUG","GHOST","DARK"],"xp":14030,"gp":6012,"drops":[{"n":"Ancient Stone","c":0.1},{"n":"Water Gem","c":80.0},{"n":"Enchanted Gem","c":80.0},{"n":"Slow Tail","c":31.5},{"n":"Water Stone","c":0.3},{"n":"Future Orb","c":18.5},{"n":"Water Pendant","c":20.0}],"out":false},{"slug":"smeargle_sinnoh","nome":"Smeargle","lvl":1000,"reg":"Johto","pid":235,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":80.0},{"n":"Brush","c":19.9}],"out":false},{"slug":"aegislash_sinnoh","nome":"Aegislash","lvl":1000,"reg":"Kalos","pid":681,"types":["STEEL","GHOST"],"w4x":[],"w2x":["FIRE","GROUND","DARK"],"xp":14030,"gp":6012,"drops":[{"n":"Piece of Steel","c":75.0},{"n":"Ghost Essence","c":30.0},{"n":"Metal Stone","c":1.5}],"out":false},{"slug":"shieldon_sinnoh","nome":"Shieldon","lvl":1000,"reg":"Sinnoh","pid":410,"types":["ROCK","STEEL"],"w4x":["FIGHTING","GROUND"],"w2x":["WATER","STEEL"],"xp":14030,"gp":6012,"drops":[{"n":"Piece of Steel","c":75.0},{"n":"Small Stone","c":30.0},{"n":"Metal Stone","c":1.0},{"n":"Armor Fossil","c":0.0},{"n":"Stone Orb","c":0.0},{"n":"Rock Stone","c":0.3}],"out":false},{"slug":"riolu_sinnoh","nome":"Riolu","lvl":1000,"reg":"Sinnoh","pid":447,"types":["FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","FAIRY"],"xp":14030,"gp":6012,"drops":[{"n":"Band Aid","c":80.0},{"n":"samurai hair","c":1.3},{"n":"Punch Stone","c":0.6}],"out":false},{"slug":"turtwig_sinnoh","nome":"Turtwig","lvl":1000,"reg":"Sinnoh","pid":387,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":14030,"gp":6012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5},{"n":"Plant Tail","c":9.6},{"n":"Plant Foot","c":18.1}],"out":false},{"slug":"chimchar_sinnoh","nome":"Chimchar","lvl":1000,"reg":"Sinnoh","pid":390,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":14030,"gp":6012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Straw","c":78.3},{"n":"Fire Horse Foot","c":8.5},{"n":"Small Stone","c":8.5}],"out":false},{"slug":"piplup_sinnoh","nome":"Piplup","lvl":1000,"reg":"Sinnoh","pid":393,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":14030,"gp":6012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6},{"n":"Giant Fin","c":8.1},{"n":"Ski Poles","c":0.5}],"out":false},{"slug":"starly_sinnoh","nome":"Starly","lvl":1000,"reg":"Sinnoh","pid":396,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Straw","c":69.1},{"n":"Feather Stone","c":0.4},{"n":"Strange Thing","c":9.0},{"n":"Tongue","c":15.9}],"out":false},{"slug":"bidoof_sinnoh","nome":"Bidoof","lvl":1000,"reg":"Sinnoh","pid":399,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Colored Feather","c":4.4},{"n":"Chansey Egg","c":0.8},{"n":"Snake Tail","c":80.0},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"kricketot_sinnoh","nome":"Kricketot","lvl":1000,"reg":"Sinnoh","pid":401,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":14030,"gp":6012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Bug Antenna","c":41.0},{"n":"Straw","c":77.2},{"n":"Mushroom","c":4.0}],"out":false},{"slug":"shinx_sinnoh","nome":"Shinx","lvl":1000,"reg":"Sinnoh","pid":403,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":14030,"gp":6012,"drops":[{"n":"Screw","c":57.4},{"n":"Thunder Stone","c":0.5},{"n":"Magnet","c":19.1}],"out":false},{"slug":"budew_sinnoh","nome":"Budew","lvl":1000,"reg":"Sinnoh","pid":406,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":14030,"gp":6012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"cranidos_sinnoh","nome":"Cranidos","lvl":1000,"reg":"Sinnoh","pid":408,"types":["ROCK"],"w4x":[],"w2x":["WATER","GRASS","FIGHTING","GROUND","STEEL"],"xp":14030,"gp":6012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Stone Orb","c":30.2},{"n":"Rock Stone","c":0.3}],"out":false},{"slug":"burmy_plant_cloak_sinnoh","nome":"Burmy (Plant Cloak)","lvl":1000,"reg":"Sinnoh","pid":412,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Cocoon Stone","c":0.5},{"n":"Sun Stone","c":0.4}],"out":false},{"slug":"combee_sinnoh","nome":"Combee","lvl":1000,"reg":"Sinnoh","pid":415,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":14030,"gp":6012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Butterfly Wing","c":18.3}],"out":false},{"slug":"buizel_sinnoh","nome":"Buizel","lvl":1000,"reg":"Sinnoh","pid":418,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":14030,"gp":6012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6},{"n":"Giant Fin","c":8.1}],"out":false},{"slug":"cherubi_sinnoh","nome":"Cherubi","lvl":1000,"reg":"Sinnoh","pid":420,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":14030,"gp":6012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5},{"n":"Bottles of Poison","c":73.8}],"out":false},{"slug":"shellos_sinnoh","nome":"Shellos","lvl":1000,"reg":"Sinnoh","pid":422,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":14030,"gp":6012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Fish Fin","c":3.0},{"n":"Rubber Ball","c":54.2}],"out":false},{"slug":"drifloon_sinnoh","nome":"Drifloon","lvl":1000,"reg":"Sinnoh","pid":425,"types":["GHOST","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK","DARK"],"xp":14030,"gp":6012,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Darkness Stone","c":0.7},{"n":"Enchanted Gem","c":10.2}],"out":false},{"slug":"buneary_sinnoh","nome":"Buneary","lvl":1000,"reg":"Sinnoh","pid":427,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Bitten Apple","c":54.2},{"n":"Snake Tail","c":80.0},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"glameow_sinnoh","nome":"Glameow","lvl":1000,"reg":"Sinnoh","pid":431,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Luck Medallion","c":6.3},{"n":"Sticky Hand","c":12.0},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"chingling_sinnoh","nome":"Chingling","lvl":1000,"reg":"Sinnoh","pid":433,"types":["PSYCHIC"],"w4x":[],"w2x":["BUG","GHOST","DARK"],"xp":14030,"gp":6012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Linearly Guided Hypnosis","c":7.1},{"n":"Fox Tail","c":8.5}],"out":false},{"slug":"stunky_sinnoh","nome":"Stunky","lvl":1000,"reg":"Sinnoh","pid":434,"types":["POISON","DARK"],"w4x":[],"w2x":["GROUND"],"xp":14030,"gp":6012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Dark Gem","c":71.8},{"n":"Darkness Stone","c":0.3},{"n":"Ghost Essence","c":14.3},{"n":"Venom Stone","c":0.6}],"out":false},{"slug":"bronzor_sinnoh","nome":"Bronzor","lvl":1000,"reg":"Sinnoh","pid":436,"types":["STEEL","PSYCHIC"],"w4x":[],"w2x":["FIRE","GROUND","GHOST","DARK"],"xp":14030,"gp":6012,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5}],"out":false},{"slug":"mime_jr_sinnoh","nome":"Mime Jr.","lvl":1000,"reg":"Sinnoh","pid":439,"types":["PSYCHIC","FAIRY"],"w4x":[],"w2x":["POISON","GHOST","STEEL"],"xp":14030,"gp":6012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Rubber Ball","c":72.3},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Linearly Guided Hypnosis","c":7.1}],"out":false},{"slug":"gible_sinnoh","nome":"Gible","lvl":1000,"reg":"Sinnoh","pid":443,"types":["DRAGON","GROUND"],"w4x":["ICE"],"w2x":["FAIRY"],"xp":14030,"gp":6012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Goggles","c":0.4},{"n":"Bone","c":7.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"munchlax_sinnoh","nome":"Munchlax","lvl":1000,"reg":"Sinnoh","pid":446,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":14030,"gp":6012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Fur","c":57.4},{"n":"Bird Beak","c":22.5},{"n":"Giant Piece of Fur","c":12.1}],"out":false},{"slug":"hippopotas_sinnoh","nome":"Hippopotas","lvl":1000,"reg":"Sinnoh","pid":449,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":14030,"gp":6012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Earth Stone","c":0.5},{"n":"Sandbag","c":41.6}],"out":false},{"slug":"skorupi_sinnoh","nome":"Skorupi","lvl":1000,"reg":"Sinnoh","pid":451,"types":["POISON","BUG"],"w4x":[],"w2x":["FIRE","FLYING","PSYCHIC","ROCK"],"xp":14030,"gp":6012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Bug Gosme","c":59.5},{"n":"Venom Stone","c":0.6}],"out":false},{"slug":"croagunk_sinnoh","nome":"Croagunk","lvl":1000,"reg":"Sinnoh","pid":453,"types":["POISON","FIGHTING"],"w4x":["PSYCHIC"],"w2x":["GROUND","FLYING"],"xp":14030,"gp":6012,"drops":[{"n":"Band Aid","c":67.3},{"n":"Bottles of Poison","c":68.0},{"n":"Venom Stone","c":0.6}],"out":false},{"slug":"finneon_sinnoh","nome":"Finneon","lvl":1000,"reg":"Sinnoh","pid":456,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":14030,"gp":6012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Ski Poles","c":0.5}],"out":false},{"slug":"mantyke_sinnoh","nome":"Mantyke","lvl":1000,"reg":"Sinnoh","pid":458,"types":["WATER","FLYING"],"w4x":["ELECTRIC"],"w2x":["ROCK"],"xp":14030,"gp":6012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Diving Mask","c":0.6}],"out":false},{"slug":"snover_sinnoh","nome":"Snover","lvl":1000,"reg":"Sinnoh","pid":459,"types":["GRASS","ICE"],"w4x":["FIRE"],"w2x":["ICE","FIGHTING","POISON","FLYING","BUG","ROCK","STEEL"],"xp":14030,"gp":6012,"drops":[{"n":"Seed","c":72.4},{"n":"Snowball","c":44.6},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"vaporeon_sinnoh","nome":"Vaporeon","lvl":1125,"reg":"Kanto","pid":134,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":15780,"gp":6762,"drops":[{"n":"Water Gem","c":60.0},{"n":"Water Pendant","c":20.0},{"n":"Water Stone","c":0.3},{"n":"Vaporeon Cream","c":1.0},{"n":"Vaporeon Valentine's Card","c":1.0}],"out":false},{"slug":"porygon2_sinnoh","nome":"Porygon2","lvl":1125,"reg":"Johto","pid":233,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":15780,"gp":6762,"drops":[{"n":"Rubber Ball","c":80.0},{"n":"Enigma Stone","c":0.3},{"n":"Gardestrike Essence","c":0.7},{"n":"Kermes Shard","c":0.1},{"n":"Virtual Tail","c":0.7}],"out":false},{"slug":"blissey_sinnoh","nome":"Blissey","lvl":1125,"reg":"Johto","pid":242,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":15780,"gp":6762,"drops":[{"n":"Rubber Ball","c":95.0},{"n":"Chansey Egg","c":26.5},{"n":"Heart Stone","c":0.3}],"out":false},{"slug":"mothim_sinnoh","nome":"Mothim","lvl":1250,"reg":"Sinnoh","pid":414,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":17530,"gp":7512,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Butterfly Wing","c":18.3},{"n":"Straw","c":77.2}],"out":false},{"slug":"ambipom_sinnoh","nome":"Ambipom","lvl":1250,"reg":"Sinnoh","pid":424,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":17530,"gp":7512,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Straw","c":69.1},{"n":"Microphone","c":2.7},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"mismagius_sinnoh","nome":"Mismagius","lvl":1250,"reg":"Sinnoh","pid":429,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":17530,"gp":7512,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Bottles of Poison","c":75.0},{"n":"Enchanted Gem","c":10.2}],"out":false},{"slug":"chatot_sinnoh","nome":"Chatot","lvl":1250,"reg":"Sinnoh","pid":441,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":17530,"gp":7512,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Feather","c":43.5},{"n":"Strange Thing","c":9.0},{"n":"Future Orb","c":17.5}],"out":false},{"slug":"spiritomb_sinnoh","nome":"Spiritomb","lvl":1250,"reg":"Sinnoh","pid":442,"types":["GHOST","DARK"],"w4x":[],"w2x":["DARK","FAIRY"],"xp":17530,"gp":7512,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Darkness Stone","c":0.3},{"n":"Snowball","c":15.0}],"out":false},{"slug":"carnivine_sinnoh","nome":"Carnivine","lvl":1250,"reg":"Sinnoh","pid":455,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":17530,"gp":7512,"drops":[{"n":"Seed","c":72.4},{"n":"Bag of Pollen","c":30.9},{"n":"Strange Flower","c":6.1}],"out":false},{"slug":"froslass_sinnoh","nome":"Froslass","lvl":1250,"reg":"Sinnoh","pid":478,"types":["ICE","GHOST"],"w4x":[],"w2x":["FIRE","ROCK","DARK","STEEL"],"xp":17530,"gp":7512,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Snowball","c":44.6},{"n":"Feather","c":55.0},{"n":"Goggles","c":0.2},{"n":"Snow Skis","c":0.2}],"out":false},{"slug":"rotom_sinnoh","nome":"Rotom","lvl":1250,"reg":"Sinnoh","pid":479,"types":["ELECTRIC","GHOST"],"w4x":[],"w2x":["GROUND","DARK"],"xp":17530,"gp":7512,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Screw","c":57.4},{"n":"Darkness Stone","c":0.7},{"n":"Electric Rat Tail","c":5.1},{"n":"Piece of Steel","c":75.0}],"out":false},{"slug":"pachirisu_sinnoh","nome":"Pachirisu","lvl":1500,"reg":"Sinnoh","pid":417,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":21030,"gp":9012,"drops":[{"n":"Screw","c":75.0},{"n":"Electric Box","c":30.0},{"n":"Thunder Stone","c":1.0}],"out":false},{"slug":"gliscor_sinnoh","nome":"Gliscor","lvl":1500,"reg":"Sinnoh","pid":472,"types":["GROUND","FLYING"],"w4x":["ICE"],"w2x":["WATER"],"xp":21030,"gp":9012,"drops":[{"n":"Earth Ball","c":55.0},{"n":"Sandbag","c":30.0},{"n":"Gligar Claw","c":1.7},{"n":"Tooth","c":1.7}],"out":false},{"slug":"honchkrow_sinnoh","nome":"Honchkrow","lvl":1500,"reg":"Sinnoh","pid":430,"types":["DARK","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK","FAIRY"],"xp":21030,"gp":9012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Darkness Stone","c":0.3},{"n":"Tooth","c":25.4},{"n":"Fox Tail","c":7.0}],"out":false},{"slug":"weavile_sinnoh","nome":"Weavile","lvl":1500,"reg":"Sinnoh","pid":461,"types":["DARK","ICE"],"w4x":["FIGHTING"],"w2x":["FIRE","BUG","ROCK","STEEL","FAIRY"],"xp":21030,"gp":9012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Snowball","c":44.6},{"n":"Ghost Essence","c":14.3}],"out":false},{"slug":"magnezone_sinnoh","nome":"Magnezone","lvl":1500,"reg":"Sinnoh","pid":462,"types":["ELECTRIC","STEEL"],"w4x":["GROUND"],"w2x":["FIRE","FIGHTING"],"xp":21030,"gp":9012,"drops":[{"n":"Piece of Steel","c":27.3},{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1}],"out":false},{"slug":"lickilicky_sinnoh","nome":"Lickilicky","lvl":1500,"reg":"Sinnoh","pid":463,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":21030,"gp":9012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Colored Feather","c":4.4},{"n":"Bitten Apple","c":54.2}],"out":false},{"slug":"togekiss_sinnoh","nome":"Togekiss","lvl":1500,"reg":"Sinnoh","pid":468,"types":["FAIRY","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","POISON","ROCK","STEEL"],"xp":21030,"gp":9012,"drops":[{"n":"Heart Stone","c":0.4},{"n":"Rubber Ball","c":72.3},{"n":"Enchanted Gem","c":18.3},{"n":"Straw","c":80.0}],"out":false},{"slug":"yanmega_sinnoh","nome":"Yanmega","lvl":1500,"reg":"Sinnoh","pid":469,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":21030,"gp":9012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Bug Antenna","c":41.0},{"n":"Bug Venom","c":2.1},{"n":"Horn","c":18.6}],"out":false},{"slug":"glaceon_sinnoh","nome":"Glaceon","lvl":1500,"reg":"Sinnoh","pid":471,"types":["ICE"],"w4x":[],"w2x":["FIRE","FIGHTING","ROCK","STEEL"],"xp":21030,"gp":9012,"drops":[{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Feather","c":55.0},{"n":"Psychic Spoon","c":14.5}],"out":false},{"slug":"mamoswine_sinnoh","nome":"Mamoswine","lvl":1500,"reg":"Sinnoh","pid":473,"types":["ICE","GROUND"],"w4x":[],"w2x":["FIRE","WATER","GRASS","ICE","FIGHTING","STEEL"],"xp":21030,"gp":9012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Sandbag","c":41.6}],"out":false},{"slug":"gallade_sinnoh","nome":"Gallade","lvl":1500,"reg":"Sinnoh","pid":475,"types":["PSYCHIC","FIGHTING"],"w4x":[],"w2x":["FLYING","PSYCHIC","GHOST","FAIRY"],"xp":21030,"gp":9012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Punch Stone","c":0.5},{"n":"Iron Bracelet","c":5.1}],"out":false},{"slug":"porygon_z_sinnoh","nome":"Porygon-Z","lvl":1500,"reg":"Sinnoh","pid":474,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":21030,"gp":9012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Chansey Egg","c":0.8},{"n":"Comb","c":26.3},{"n":"Psychic Spoon","c":12.0}],"out":false},{"slug":"leafeon_sinnoh","nome":"Leafeon","lvl":1500,"reg":"Sinnoh","pid":470,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":21030,"gp":9012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5},{"n":"Straw","c":80.0}],"out":false},{"slug":"grotle_sinnoh","nome":"Grotle","lvl":1750,"reg":"Sinnoh","pid":388,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":24530,"gp":10512,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5},{"n":"Bag of Pollen","c":30.9},{"n":"Enchanted Gem","c":74.8}],"out":false},{"slug":"monferno_sinnoh","nome":"Monferno","lvl":1750,"reg":"Sinnoh","pid":391,"types":["FIRE","FIGHTING"],"w4x":[],"w2x":["WATER","GROUND","FLYING","PSYCHIC"],"xp":24530,"gp":10512,"drops":[{"n":"Band Aid","c":67.3},{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Belt of Champion","c":2.3},{"n":"Martial Arts Scroll","c":9.8}],"out":false},{"slug":"prinplup_sinnoh","nome":"Prinplup","lvl":1750,"reg":"Sinnoh","pid":394,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":24530,"gp":10512,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Diving Mask","c":0.6},{"n":"Goggles","c":0.5},{"n":"Ski Poles","c":0.5}],"out":false},{"slug":"staravia_sinnoh","nome":"Staravia","lvl":1750,"reg":"Sinnoh","pid":397,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":24530,"gp":10512,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Feather Stone","c":0.4},{"n":"Giant Piece of Fur","c":12.1},{"n":"Chicken Feet","c":0.8}],"out":false},{"slug":"luxio_sinnoh","nome":"Luxio","lvl":1750,"reg":"Sinnoh","pid":404,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":24530,"gp":10512,"drops":[{"n":"Screw","c":57.4},{"n":"Thunder Stone","c":0.5},{"n":"Electric Tail","c":4.6}],"out":false},{"slug":"gabite_sinnoh","nome":"Gabite","lvl":1750,"reg":"Sinnoh","pid":444,"types":["DRAGON","GROUND"],"w4x":["ICE"],"w2x":["FAIRY"],"xp":24530,"gp":10512,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Sandbag","c":41.6},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"lucario_sinnoh","nome":"Lucario","lvl":2000,"reg":"Sinnoh","pid":448,"types":["FIGHTING","STEEL"],"w4x":[],"w2x":["FIRE","FIGHTING","GROUND"],"xp":28030,"gp":12012,"drops":[{"n":"Piece of Steel","c":80.0},{"n":"Metal Stone","c":1.0},{"n":"Rock Stone","c":1.0},{"n":"Talon","c":0.7}],"out":false},{"slug":"bibarel_sinnoh","nome":"Bibarel","lvl":2000,"reg":"Sinnoh","pid":400,"types":["NORMAL","WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC","FIGHTING"],"xp":28030,"gp":12012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Water Gem","c":56.4},{"n":"Feather","c":43.5},{"n":"Snowball","c":67.2},{"n":"Comb","c":26.3}],"out":false},{"slug":"kricketune_sinnoh","nome":"Kricketune","lvl":2000,"reg":"Sinnoh","pid":402,"types":["BUG"],"w4x":[],"w2x":["FIRE","FLYING","ROCK"],"xp":28030,"gp":12012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Pot of Moss Bug","c":56.1},{"n":"Bug Venom","c":2.1}],"out":false},{"slug":"rampardos_sinnoh","nome":"Rampardos","lvl":2000,"reg":"Sinnoh","pid":409,"types":["ROCK"],"w4x":[],"w2x":["WATER","GRASS","FIGHTING","GROUND","STEEL"],"xp":28030,"gp":12012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Stone Orb","c":30.2},{"n":"Giant Ruby","c":11.9}],"out":false},{"slug":"wormadam_plant_cloak_sinnoh","nome":"Wormadam (Plant Cloak)","lvl":2000,"reg":"Sinnoh","pid":413,"types":["BUG","GRASS"],"w4x":["FIRE","FLYING"],"w2x":["ICE","POISON","BUG","ROCK"],"xp":28030,"gp":12012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Microphone","c":2.7},{"n":"Bull Tail","c":2.2}],"out":false},{"slug":"floatzel_sinnoh","nome":"Floatzel","lvl":2000,"reg":"Sinnoh","pid":419,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":28030,"gp":12012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Fins","c":0.7},{"n":"Psyduck Mug","c":8.5}],"out":false},{"slug":"cherrim_sinnoh","nome":"Cherrim","lvl":2000,"reg":"Sinnoh","pid":421,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":28030,"gp":12012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5},{"n":"Plant Tail","c":9.6},{"n":"Enchanted Gem","c":74.8}],"out":false},{"slug":"gastrodon_sinnoh","nome":"Gastrodon","lvl":2000,"reg":"Sinnoh","pid":423,"types":["WATER","GROUND"],"w4x":["GRASS"],"w2x":["WATER"],"xp":28030,"gp":12012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Water Gem","c":56.4},{"n":"Sandbag","c":41.6},{"n":"Water Pendant","c":37.6}],"out":false},{"slug":"drifblim_sinnoh","nome":"Drifblim","lvl":2000,"reg":"Sinnoh","pid":426,"types":["GHOST","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK","DARK"],"xp":28030,"gp":12012,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Bottles of Poison","c":75.0},{"n":"Darkness Stone","c":0.7}],"out":false},{"slug":"purugly_sinnoh","nome":"Purugly","lvl":2000,"reg":"Sinnoh","pid":432,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":28030,"gp":12012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Colored Feather","c":4.4},{"n":"Giant Piece of Fur","c":12.1},{"n":"Comb","c":26.3},{"n":"Chicken Feet","c":0.8}],"out":false},{"slug":"skuntank_sinnoh","nome":"Skuntank","lvl":2000,"reg":"Sinnoh","pid":435,"types":["POISON","DARK"],"w4x":[],"w2x":["GROUND"],"xp":28030,"gp":12012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Dark Gem","c":71.8},{"n":"Darkness Stone","c":0.3},{"n":"Earth Ball","c":73.9},{"n":"Snake Tail","c":5.3}],"out":false},{"slug":"bronzong_sinnoh","nome":"Bronzong","lvl":2000,"reg":"Sinnoh","pid":437,"types":["STEEL","PSYCHIC"],"w4x":[],"w2x":["FIRE","GROUND","GHOST","DARK"],"xp":28030,"gp":12012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Iron Bracelet","c":7.8},{"n":"Piece of Steel","c":27.3},{"n":"Future Orb","c":40.6},{"n":"Onix Tail","c":9.2}],"out":false},{"slug":"drapion_sinnoh","nome":"Drapion","lvl":2000,"reg":"Sinnoh","pid":452,"types":["POISON","DARK"],"w4x":[],"w2x":["GROUND"],"xp":28030,"gp":12012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Dark Gem","c":71.8},{"n":"Venom Stone","c":0.6}],"out":false},{"slug":"hippowdon_sinnoh","nome":"Hippowdon","lvl":2000,"reg":"Sinnoh","pid":450,"types":["GROUND"],"w4x":[],"w2x":["WATER","GRASS","ICE"],"xp":28030,"gp":12012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Earth Stone","c":0.5},{"n":"Stone Orb","c":27.1}],"out":false},{"slug":"toxicroak_sinnoh","nome":"Toxicroak","lvl":2000,"reg":"Sinnoh","pid":454,"types":["POISON","FIGHTING"],"w4x":["PSYCHIC"],"w2x":["GROUND","FLYING"],"xp":28030,"gp":12012,"drops":[{"n":"Band Aid","c":67.3},{"n":"Bottles of Poison","c":68.0},{"n":"Fur","c":19.9}],"out":false},{"slug":"lumineon_sinnoh","nome":"Lumineon","lvl":2000,"reg":"Sinnoh","pid":457,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":28030,"gp":12012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Air Tank","c":0.6},{"n":"Diving Mask","c":0.6}],"out":false},{"slug":"abomasnow_sinnoh","nome":"Abomasnow","lvl":2000,"reg":"Sinnoh","pid":460,"types":["GRASS","ICE"],"w4x":["FIRE"],"w2x":["ICE","FIGHTING","POISON","FLYING","BUG","ROCK","STEEL"],"xp":28030,"gp":12012,"drops":[{"n":"Seed","c":72.4},{"n":"Snowball","c":44.6},{"n":"Bag of Pollen","c":30.9}],"out":false},{"slug":"probopass_sinnoh","nome":"Probopass","lvl":2000,"reg":"Sinnoh","pid":476,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":28030,"gp":12012,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Small Stone","c":66.2},{"n":"Old Amber","c":0.1}],"out":false},{"slug":"bastiodon_sinnoh","nome":"Bastiodon","lvl":3000,"reg":"Sinnoh","pid":411,"types":["ROCK","STEEL"],"w4x":["FIGHTING","GROUND"],"w2x":["WATER","STEEL"],"xp":42030,"gp":18012,"drops":[{"n":"Piece of Steel","c":76.6},{"n":"Small Stone","c":28.7},{"n":"Metal Stone","c":1.5},{"n":"Armor Fossil","c":0.0},{"n":"Bone Shield","c":0.0},{"n":"Stone Orb","c":0.0}],"out":false},{"slug":"vespiquen_sinnoh","nome":"Vespiquen","lvl":3000,"reg":"Sinnoh","pid":416,"types":["BUG","FLYING"],"w4x":["ROCK"],"w2x":["FIRE","ELECTRIC","ICE","FLYING"],"xp":42030,"gp":18012,"drops":[{"n":"Bucket of Honey","c":18.5},{"n":"Cocoon Stone","c":0.4},{"n":"Pot of Moss Bug","c":20.0}],"out":false},{"slug":"lopunny_sinnoh","nome":"Lopunny","lvl":3000,"reg":"Sinnoh","pid":428,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":42030,"gp":18012,"drops":[{"n":"Rubber Ball","c":68.0},{"n":"Heart Stone","c":0.0},{"n":"Rabbit Ear","c":0.0},{"n":"Rabbit Eyebrows","c":0.0},{"n":"Rabbit Fur","c":0.0}],"out":false},{"slug":"rhyperior_sinnoh","nome":"Rhyperior","lvl":3000,"reg":"Sinnoh","pid":464,"types":["GROUND","ROCK"],"w4x":["WATER","GRASS"],"w2x":["ICE","FIGHTING","GROUND","STEEL"],"xp":42030,"gp":18012,"drops":[{"n":"Earth Ball","c":55.3},{"n":"Ancient Stone","c":0.1},{"n":"Protector","c":0.0},{"n":"Solid Rock Paw","c":0.0}],"out":false},{"slug":"tangrowth_sinnoh","nome":"Tangrowth","lvl":3000,"reg":"Sinnoh","pid":465,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":42030,"gp":18012,"drops":[{"n":"Seed","c":74.9},{"n":"Blue Vines","c":1.9},{"n":"Leaf Stone","c":1.1},{"n":"Gaia Tentacles","c":0.0},{"n":"Massive Vines","c":0.0}],"out":false},{"slug":"electivire_sinnoh","nome":"Electivire","lvl":3000,"reg":"Sinnoh","pid":466,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":42030,"gp":18012,"drops":[{"n":"Screw","c":75.0},{"n":"Electric Tail","c":1.6},{"n":"Thunder Stone","c":1.0},{"n":"Electirizer","c":0.0},{"n":"Max Volt Paw","c":0.0}],"out":false},{"slug":"magmortar_sinnoh","nome":"Magmortar","lvl":3000,"reg":"Sinnoh","pid":467,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":42030,"gp":18012,"drops":[{"n":"Essence of Fire","c":75.0},{"n":"Fire Stone","c":1.0},{"n":"Magmarizer","c":0.0},{"n":"Blaze Topknot","c":0.0}],"out":false},{"slug":"dusknoir_sinnoh","nome":"Dusknoir","lvl":3000,"reg":"Sinnoh","pid":477,"types":["GHOST"],"w4x":[],"w2x":["DARK"],"xp":42030,"gp":18012,"drops":[{"n":"Ghost Essence","c":80.0},{"n":"Reaper Cloth","c":0.0},{"n":"Scary Smile","c":0.0}],"out":false},{"slug":"torterra_sinnoh","nome":"Torterra","lvl":3500,"reg":"Sinnoh","pid":389,"types":["GRASS","GROUND"],"w4x":["ICE"],"w2x":["FIRE","GRASS","FLYING","BUG"],"xp":49030,"gp":21012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Seed","c":72.4},{"n":"Armadillo Claw","c":7.2},{"n":"Piece of Diglett","c":4.6},{"n":"Feather","c":11.0}],"out":false},{"slug":"infernape_sinnoh","nome":"Infernape","lvl":3500,"reg":"Sinnoh","pid":392,"types":["FIRE","FIGHTING"],"w4x":[],"w2x":["WATER","GROUND","FLYING","PSYCHIC"],"xp":49030,"gp":21012,"drops":[{"n":"Band Aid","c":67.3},{"n":"Essence of Fire","c":59.3},{"n":"Punch Stone","c":0.5},{"n":"Belt of Champion","c":2.3},{"n":"Martial Arts Scroll","c":9.8}],"out":false},{"slug":"empoleon_sinnoh","nome":"Empoleon","lvl":3500,"reg":"Sinnoh","pid":395,"types":["WATER","STEEL"],"w4x":[],"w2x":["ELECTRIC","FIGHTING","GROUND"],"xp":49030,"gp":21012,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Feather","c":70.1},{"n":"Seahorse Tail","c":3.1}],"out":false},{"slug":"staraptor_sinnoh","nome":"Staraptor","lvl":3500,"reg":"Sinnoh","pid":398,"types":["NORMAL","FLYING"],"w4x":[],"w2x":["ELECTRIC","ICE","ROCK"],"xp":49030,"gp":21012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Rat Tail","c":43.8},{"n":"Tongue","c":15.9},{"n":"Chansey Egg","c":0.8}],"out":false},{"slug":"luxray_sinnoh","nome":"Luxray","lvl":3500,"reg":"Sinnoh","pid":405,"types":["ELECTRIC"],"w4x":[],"w2x":["GROUND"],"xp":49030,"gp":21012,"drops":[{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1},{"n":"Thunder Stone","c":0.5}],"out":false},{"slug":"roserade_sinnoh","nome":"Roserade","lvl":3500,"reg":"Sinnoh","pid":407,"types":["GRASS","POISON"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","PSYCHIC"],"xp":49030,"gp":21012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"garchomp_sinnoh","nome":"Garchomp","lvl":3500,"reg":"Sinnoh","pid":445,"types":["DRAGON","GROUND"],"w4x":["ICE"],"w2x":["FAIRY"],"xp":49030,"gp":21012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Sandbag","c":41.6},{"n":"Horn","c":26.6}],"out":false},{"slug":"throh_unova","nome":"Throh","lvl":5000,"reg":"Unova","pid":538,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Nail","c":60.0},{"n":"Stone Orb","c":20.0}],"out":false},{"slug":"sawk_unova","nome":"Sawk","lvl":5000,"reg":"Unova","pid":539,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Nail","c":60.0},{"n":"Stone Orb","c":20.0}],"out":false},{"slug":"tirtouga_unova","nome":"Tirtouga","lvl":5000,"reg":"Unova","pid":564,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Water Gem","c":60.0},{"n":"Small Stone","c":30.0},{"n":"Ancient Stone","c":0.1},{"n":"Water Stone","c":0.3}],"out":false},{"slug":"archen_unova","nome":"Archen","lvl":5000,"reg":"Unova","pid":566,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Small Stone","c":60.0},{"n":"Mini Wings","c":4.2},{"n":"Ancient Stone","c":0.1},{"n":"Rock Stone","c":0.3}],"out":false},{"slug":"larvesta_unova","nome":"Larvesta","lvl":5000,"reg":"Unova","pid":636,"types":["BUG","FIRE"],"w4x":["ROCK"],"w2x":["FIRE","WATER","FLYING"],"xp":70030,"gp":30012,"drops":[{"n":"Essence of Fire","c":60.0},{"n":"Bag of Pollen","c":30.0},{"n":"Cocoon Stone","c":0.3}],"out":false},{"slug":"snivy_unova","nome":"Snivy","lvl":5000,"reg":"Unova","pid":495,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":70030,"gp":30012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"tepig_unova","nome":"Tepig","lvl":5000,"reg":"Unova","pid":498,"types":["FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK"],"xp":70030,"gp":30012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Straw","c":78.3}],"out":false},{"slug":"oshawott_unova","nome":"Oshawott","lvl":5000,"reg":"Unova","pid":501,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":70030,"gp":30012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Diving Mask","c":0.6}],"out":false},{"slug":"patrat_unova","nome":"Patrat","lvl":5000,"reg":"Unova","pid":504,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Fur","c":57.4},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"lillipup_unova","nome":"Lillipup","lvl":5000,"reg":"Unova","pid":506,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Snake Tail","c":80.0}],"out":false},{"slug":"pansage_unova","nome":"Pansage","lvl":5000,"reg":"Unova","pid":511,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5},{"n":"Bottles of Poison","c":73.8},{"n":"Enchanted Gem","c":74.8}],"out":false},{"slug":"pansear_unova","nome":"Pansear","lvl":5000,"reg":"Unova","pid":513,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Fire Tail","c":13.9},{"n":"Future Orb","c":0.7}],"out":false},{"slug":"panpour_unova","nome":"Panpour","lvl":5000,"reg":"Unova","pid":515,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6},{"n":"Tooth","c":32.6}],"out":false},{"slug":"munna_unova","nome":"Munna","lvl":5000,"reg":"Unova","pid":517,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Strange Thing","c":12.0}],"out":false},{"slug":"pidove_unova","nome":"Pidove","lvl":5000,"reg":"Unova","pid":519,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Strange Thing","c":9.0},{"n":"Future Orb","c":17.5}],"out":false},{"slug":"blitzle_unova","nome":"Blitzle","lvl":5000,"reg":"Unova","pid":522,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1},{"n":"Thunder Stone","c":0.5},{"n":"Electric Tail","c":4.6}],"out":false},{"slug":"roggenrola_unova","nome":"Roggenrola","lvl":5000,"reg":"Unova","pid":524,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Stone Orb","c":30.2},{"n":"Rock Stone","c":0.3},{"n":"Strange Rock","c":8.2},{"n":"Dome Fossil","c":2.1}],"out":false},{"slug":"woobat_unova","nome":"Woobat","lvl":5000,"reg":"Unova","pid":527,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Psychic Spoon","c":9.3},{"n":"Feather","c":63.6}],"out":false},{"slug":"timburr_unova","nome":"Timburr","lvl":5000,"reg":"Unova","pid":532,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Band Aid","c":67.3},{"n":"Punch Stone","c":0.5},{"n":"Fur","c":19.9},{"n":"Iron Bracelet","c":5.1},{"n":"Punch Machine","c":7.6}],"out":false},{"slug":"tympole_unova","nome":"Tympole","lvl":5000,"reg":"Unova","pid":535,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Fish Fin","c":3.0},{"n":"Tooth","c":32.6},{"n":"Magikarp Fin","c":11.2}],"out":false},{"slug":"sewaddle_unova","nome":"Sewaddle","lvl":5000,"reg":"Unova","pid":540,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Seed","c":72.4},{"n":"Cocoon Stone","c":0.5}],"out":false},{"slug":"venipede_unova","nome":"Venipede","lvl":5000,"reg":"Unova","pid":543,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5}],"out":false},{"slug":"cottonee_unova","nome":"Cottonee","lvl":5000,"reg":"Unova","pid":546,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Rubber Ball","c":72.3},{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"petilil_unova","nome":"Petilil","lvl":5000,"reg":"Unova","pid":548,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"sandile_unova","nome":"Sandile","lvl":5000,"reg":"Unova","pid":551,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Earth Ball","c":65.6},{"n":"Earth Stone","c":0.5}],"out":false},{"slug":"darumaka_unova","nome":"Darumaka","lvl":5000,"reg":"Unova","pid":554,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Magma Foot","c":5.6}],"out":false},{"slug":"dwebble_unova","nome":"Dwebble","lvl":5000,"reg":"Unova","pid":557,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Small Stone","c":66.2},{"n":"Cocoon Stone","c":0.5},{"n":"Butterfly Wing","c":18.3}],"out":false},{"slug":"yamask_unova","nome":"Yamask","lvl":5000,"reg":"Unova","pid":562,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Darkness Stone","c":0.7},{"n":"Enchanted Gem","c":10.2}],"out":false},{"slug":"trubbish_unova","nome":"Trubbish","lvl":5000,"reg":"Unova","pid":568,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Venom Stone","c":0.6},{"n":"Tooth","c":60.9},{"n":"Bat Wing","c":9.0}],"out":false},{"slug":"zorua_unova","nome":"Zorua","lvl":5000,"reg":"Unova","pid":570,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Darkness Stone","c":0.3},{"n":"Ghost Essence","c":14.3},{"n":"Crystal Tail","c":10.8},{"n":"Tooth","c":25.4}],"out":false},{"slug":"minccino_unova","nome":"Minccino","lvl":5000,"reg":"Unova","pid":572,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Straw","c":69.1},{"n":"Nail","c":25.6},{"n":"Dodo Cube","c":0.1},{"n":"Sun Stone","c":0.5}],"out":false},{"slug":"gothita_unova","nome":"Gothita","lvl":5000,"reg":"Unova","pid":574,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Linearly Guided Hypnosis","c":7.1},{"n":"Mimic Clothes","c":1.7}],"out":false},{"slug":"solosis_unova","nome":"Solosis","lvl":5000,"reg":"Unova","pid":577,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Psychic Spoon","c":9.3},{"n":"Mimic Clothes","c":1.7}],"out":false},{"slug":"ducklett_unova","nome":"Ducklett","lvl":5000,"reg":"Unova","pid":580,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6},{"n":"Seahorse Tail","c":3.1},{"n":"Slow Tail","c":16.1}],"out":false},{"slug":"vanillite_unova","nome":"Vanillite","lvl":5000,"reg":"Unova","pid":582,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Enchanted Gem","c":55.7},{"n":"Feather","c":55.0},{"n":"Ski Poles","c":0.2}],"out":false},{"slug":"deerling_unova","nome":"Deerling","lvl":5000,"reg":"Unova","pid":585,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Seed","c":72.4},{"n":"Sun Stone","c":0.4}],"out":false},{"slug":"karrablast_unova","nome":"Karrablast","lvl":5000,"reg":"Unova","pid":588,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Bug Antenna","c":41.0}],"out":false},{"slug":"foongus_unova","nome":"Foongus","lvl":5000,"reg":"Unova","pid":590,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"frillish_unova","nome":"Frillish","lvl":5000,"reg":"Unova","pid":592,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5}],"out":false},{"slug":"joltik_unova","nome":"Joltik","lvl":5000,"reg":"Unova","pid":595,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Screw","c":57.4},{"n":"Cocoon Stone","c":0.5}],"out":false},{"slug":"klink_unova","nome":"Klink","lvl":5000,"reg":"Unova","pid":599,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3}],"out":false},{"slug":"tynamo_unova","nome":"Tynamo","lvl":5000,"reg":"Unova","pid":602,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1},{"n":"Thunder Stone","c":0.5},{"n":"Magnet","c":19.1}],"out":false},{"slug":"elgyem_unova","nome":"Elgyem","lvl":5000,"reg":"Unova","pid":605,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Linearly Guided Hypnosis","c":7.1}],"out":false},{"slug":"litwick_unova","nome":"Litwick","lvl":5000,"reg":"Unova","pid":607,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Darkness Stone","c":0.7},{"n":"Pot of Lava","c":39.3}],"out":false},{"slug":"axew_unova","nome":"Axew","lvl":5000,"reg":"Unova","pid":610,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"cubchoo_unova","nome":"Cubchoo","lvl":5000,"reg":"Unova","pid":613,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Ski Poles","c":0.2},{"n":"Snow Skis","c":0.2}],"out":false},{"slug":"shelmet_unova","nome":"Shelmet","lvl":5000,"reg":"Unova","pid":616,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Bottles of Poison","c":57.0},{"n":"Bee Sting","c":4.2},{"n":"Pinsir Horn","c":4.3}],"out":false},{"slug":"mienfoo_unova","nome":"Mienfoo","lvl":5000,"reg":"Unova","pid":619,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Band Aid","c":67.3},{"n":"Punch Stone","c":0.5},{"n":"Martial Arts Scroll","c":9.8},{"n":"Kick Machine","c":3.0},{"n":"Punch Machine","c":7.6}],"out":false},{"slug":"golett_unova","nome":"Golett","lvl":5000,"reg":"Unova","pid":622,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Earth Stone","c":0.5},{"n":"Sandbag","c":41.6}],"out":false},{"slug":"pawniard_unova","nome":"Pawniard","lvl":5000,"reg":"Unova","pid":624,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Iron Bracelet","c":7.8},{"n":"Darkness Stone","c":0.3},{"n":"Onix Tail","c":9.2},{"n":"Fox Tail","c":7.0}],"out":false},{"slug":"rufflet_unova","nome":"Rufflet","lvl":5000,"reg":"Unova","pid":627,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Straw","c":69.1},{"n":"Feather Stone","c":0.4},{"n":"Bull Tail","c":2.2}],"out":false},{"slug":"vullaby_unova","nome":"Vullaby","lvl":5000,"reg":"Unova","pid":629,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Darkness Stone","c":0.3},{"n":"Ghost Essence","c":14.3},{"n":"Tooth","c":25.4},{"n":"Snowball","c":15.0}],"out":false},{"slug":"deino_unova","nome":"Deino","lvl":5000,"reg":"Unova","pid":633,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":70030,"gp":30012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Dragon Scale","c":57.7},{"n":"Darkness Stone","c":0.3}],"out":false},{"slug":"audino_unova","nome":"Audino","lvl":5400,"reg":"Unova","pid":531,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Feather","c":43.5},{"n":"Colored Feather","c":4.4},{"n":"Microphone","c":2.7},{"n":"Dodo Cube","c":0.1},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"maractus_unova","nome":"Maractus","lvl":5400,"reg":"Unova","pid":556,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5},{"n":"Bottles of Poison","c":73.8},{"n":"Strange Flower","c":6.1}],"out":false},{"slug":"sigilyph_unova","nome":"Sigilyph","lvl":5400,"reg":"Unova","pid":561,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Psychic Spoon","c":9.3},{"n":"Bag of Pollen","c":40.0}],"out":false},{"slug":"emolga_unova","nome":"Emolga","lvl":5400,"reg":"Unova","pid":587,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1},{"n":"Thunder Stone","c":0.5}],"out":false},{"slug":"stunfisk_unova","nome":"Stunfisk","lvl":5400,"reg":"Unova","pid":618,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1},{"n":"Thunder Stone","c":0.5},{"n":"Sandbag","c":41.6}],"out":false},{"slug":"druddigon_unova","nome":"Druddigon","lvl":5400,"reg":"Unova","pid":621,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Ski Poles","c":0.4},{"n":"Snow Skis","c":0.4}],"out":false},{"slug":"bouffalant_unova","nome":"Bouffalant","lvl":5400,"reg":"Unova","pid":626,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Feather","c":43.5},{"n":"Giant Piece of Fur","c":12.1},{"n":"Horn","c":35.9},{"n":"Future Orb","c":17.5}],"out":false},{"slug":"heatmor_unova","nome":"Heatmor","lvl":5400,"reg":"Unova","pid":631,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":75630,"gp":32412,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Pot of Lava","c":39.3}],"out":false},{"slug":"cryogonal_unova","nome":"Cryogonal","lvl":5900,"reg":"Unova","pid":615,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":82630,"gp":35412,"drops":[{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Giant Piece of Fur","c":25.3},{"n":"Goggles","c":0.2}],"out":false},{"slug":"victini_unova","nome":"Victini","lvl":6400,"reg":"Unova","pid":494,"types":["PSYCHIC","FIRE"],"w4x":[],"w2x":["WATER","GROUND","ROCK","GHOST","DARK"],"xp":89630,"gp":38412,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5}],"out":false},{"slug":"servine_unova","nome":"Servine","lvl":6400,"reg":"Unova","pid":496,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":89630,"gp":38412,"drops":[{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5},{"n":"Enchanted Gem","c":74.8}],"out":false},{"slug":"pignite_unova","nome":"Pignite","lvl":6400,"reg":"Unova","pid":499,"types":["FIRE","FIGHTING"],"w4x":[],"w2x":["WATER","GROUND","FLYING","PSYCHIC"],"xp":89630,"gp":38412,"drops":[{"n":"Band Aid","c":67.3},{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5}],"out":false},{"slug":"dewott_unova","nome":"Dewott","lvl":6400,"reg":"Unova","pid":502,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Fins","c":0.7}],"out":false},{"slug":"tranquill_unova","nome":"Tranquill","lvl":6400,"reg":"Unova","pid":520,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Rat Tail","c":43.8},{"n":"Bull Tail","c":2.2}],"out":false},{"slug":"boldore_unova","nome":"Boldore","lvl":6400,"reg":"Unova","pid":525,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Small Stone","c":66.2},{"n":"Stone Orb","c":30.2},{"n":"Rock Stone","c":0.3},{"n":"Strange Rock","c":8.2},{"n":"Helix Fossil","c":1.6}],"out":false},{"slug":"gurdurr_unova","nome":"Gurdurr","lvl":6400,"reg":"Unova","pid":533,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Band Aid","c":67.3},{"n":"Punch Stone","c":0.5},{"n":"Rubber Ball","c":74.2},{"n":"Martial Arts Scroll","c":9.8},{"n":"Punch Machine","c":7.6}],"out":false},{"slug":"palpitoad_unova","nome":"Palpitoad","lvl":6400,"reg":"Unova","pid":536,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Small Stone","c":35.5},{"n":"Fins","c":0.7}],"out":false},{"slug":"swadloon_unova","nome":"Swadloon","lvl":6400,"reg":"Unova","pid":541,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Seed","c":72.4},{"n":"Cocoon Stone","c":0.5}],"out":false},{"slug":"whirlipede_unova","nome":"Whirlipede","lvl":6400,"reg":"Unova","pid":544,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5}],"out":false},{"slug":"krokorok_unova","nome":"Krokorok","lvl":6400,"reg":"Unova","pid":552,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Earth Ball","c":65.6},{"n":"Earth Stone","c":0.5}],"out":false},{"slug":"gothorita_unova","nome":"Gothorita","lvl":6400,"reg":"Unova","pid":575,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Feather","c":63.6},{"n":"Fox Tail","c":8.5}],"out":false},{"slug":"duosion_unova","nome":"Duosion","lvl":6400,"reg":"Unova","pid":578,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Psychic Spoon","c":9.3},{"n":"Fox Tail","c":8.5}],"out":false},{"slug":"eelektrik_unova","nome":"Eelektrik","lvl":6400,"reg":"Unova","pid":603,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1},{"n":"Thunder Stone","c":0.5},{"n":"Magnetic Cube","c":0.3}],"out":false},{"slug":"lampent_unova","nome":"Lampent","lvl":6400,"reg":"Unova","pid":608,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Darkness Stone","c":0.7},{"n":"Fire Stone","c":0.5}],"out":false},{"slug":"fraxure_unova","nome":"Fraxure","lvl":6400,"reg":"Unova","pid":611,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"bisharp_unova","nome":"Bisharp","lvl":6400,"reg":"Unova","pid":625,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Iron Bracelet","c":7.8},{"n":"Piece of Steel","c":27.3},{"n":"Darkness Stone","c":0.3},{"n":"Tooth","c":25.4}],"out":false},{"slug":"zweilous_unova","nome":"Zweilous","lvl":6400,"reg":"Unova","pid":634,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":89630,"gp":38412,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Dragon Scale","c":57.7},{"n":"Darkness Stone","c":0.3}],"out":false},{"slug":"genesect_unova","nome":"Genesect","lvl":6400,"reg":"Unova","pid":649,"types":["BUG","STEEL"],"w4x":["FIRE"],"w2x":[],"xp":89630,"gp":38412,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3},{"n":"Pot of Moss Bug","c":56.1}],"out":false},{"slug":"carracosta_unova","nome":"Carracosta","lvl":6950,"reg":"Unova","pid":565,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Water Gem","c":75.0},{"n":"Small Stone","c":30.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"volcarona_unova","nome":"Volcarona","lvl":6950,"reg":"Unova","pid":637,"types":["BUG","FIRE"],"w4x":["ROCK"],"w2x":["FIRE","WATER","FLYING"],"xp":97330,"gp":41712,"drops":[{"n":"Essence of Fire","c":75.0},{"n":"Bag of Pollen","c":30.0},{"n":"Fire Stone","c":1.0}],"out":false},{"slug":"watchog_unova","nome":"Watchog","lvl":6950,"reg":"Unova","pid":505,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Bitten Apple","c":54.2},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"liepard_unova","nome":"Liepard","lvl":6950,"reg":"Unova","pid":510,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Essence of Fire","c":59.4},{"n":"Fire Tail","c":11.0},{"n":"Snowball","c":15.0}],"out":false},{"slug":"simisage_unova","nome":"Simisage","lvl":6950,"reg":"Unova","pid":512,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5},{"n":"Bag of Pollen","c":30.9},{"n":"Bulb","c":2.9}],"out":false},{"slug":"simisear_unova","nome":"Simisear","lvl":6950,"reg":"Unova","pid":514,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Fire Tail","c":13.9},{"n":"Straw","c":78.3}],"out":false},{"slug":"simipour_unova","nome":"Simipour","lvl":6950,"reg":"Unova","pid":516,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6},{"n":"Seahorse Tail","c":3.1}],"out":false},{"slug":"musharna_unova","nome":"Musharna","lvl":6950,"reg":"Unova","pid":518,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Psychic Spoon","c":9.3},{"n":"Fox Tail","c":8.5}],"out":false},{"slug":"zebstrika_unova","nome":"Zebstrika","lvl":6950,"reg":"Unova","pid":523,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1},{"n":"Thunder Stone","c":0.5},{"n":"Straw","c":80.0}],"out":false},{"slug":"swoobat_unova","nome":"Swoobat","lvl":6950,"reg":"Unova","pid":528,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Psychic Spoon","c":9.3},{"n":"Mimic Clothes","c":1.7}],"out":false},{"slug":"excadrill_unova","nome":"Excadrill","lvl":6950,"reg":"Unova","pid":530,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3},{"n":"Onix Tail","c":9.2}],"out":false},{"slug":"whimsicott_unova","nome":"Whimsicott","lvl":6950,"reg":"Unova","pid":547,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Rubber Ball","c":72.3},{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"lilligant_unova","nome":"Lilligant","lvl":6950,"reg":"Unova","pid":549,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Plant Foot","c":18.1}],"out":false},{"slug":"crustle_unova","nome":"Crustle","lvl":6950,"reg":"Unova","pid":558,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Small Stone","c":66.2},{"n":"Pot of Moss Bug","c":56.1},{"n":"Tooth","c":16.5}],"out":false},{"slug":"scrafty_unova","nome":"Scrafty","lvl":6950,"reg":"Unova","pid":560,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Band Aid","c":67.3},{"n":"Dark Gem","c":71.8},{"n":"Punch Machine","c":7.6},{"n":"Straw","c":80.0}],"out":false},{"slug":"cofagrigus_unova","nome":"Cofagrigus","lvl":6950,"reg":"Unova","pid":563,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Bottles of Poison","c":75.0},{"n":"Darkness Stone","c":0.7}],"out":false},{"slug":"garbodor_unova","nome":"Garbodor","lvl":6950,"reg":"Unova","pid":569,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Venom Stone","c":0.6},{"n":"Sandbag","c":41.0},{"n":"Tooth","c":60.9}],"out":false},{"slug":"zoroark_unova","nome":"Zoroark","lvl":6950,"reg":"Unova","pid":571,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Darkness Stone","c":0.3},{"n":"Tooth","c":25.4},{"n":"Horn","c":16.5},{"n":"Straw","c":80.0}],"out":false},{"slug":"cinccino_unova","nome":"Cinccino","lvl":6950,"reg":"Unova","pid":573,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Feather","c":43.5},{"n":"Microphone","c":2.7},{"n":"Comb","c":26.3},{"n":"Tooth","c":15.9}],"out":false},{"slug":"swanna_unova","nome":"Swanna","lvl":6950,"reg":"Unova","pid":581,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Pendant","c":37.6},{"n":"Fins","c":0.7},{"n":"Magnet","c":2.9},{"n":"Psyduck Mug","c":8.5}],"out":false},{"slug":"sawsbuck_unova","nome":"Sawsbuck","lvl":6950,"reg":"Unova","pid":586,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2}],"out":false},{"slug":"escavalier_unova","nome":"Escavalier","lvl":6950,"reg":"Unova","pid":589,"types":["BUG","STEEL"],"w4x":["FIRE"],"w2x":[],"xp":97330,"gp":41712,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Piece of Steel","c":27.3},{"n":"Bug Antenna","c":41.0}],"out":false},{"slug":"amoonguss_unova","nome":"Amoonguss","lvl":6950,"reg":"Unova","pid":591,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2}],"out":false},{"slug":"jellicent_unova","nome":"Jellicent","lvl":6950,"reg":"Unova","pid":593,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Water Gem","c":56.4}],"out":false},{"slug":"galvantula_unova","nome":"Galvantula","lvl":6950,"reg":"Unova","pid":596,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Screw","c":57.4},{"n":"Electric Box","c":38.1}],"out":false},{"slug":"ferrothorn_unova","nome":"Ferrothorn","lvl":6950,"reg":"Unova","pid":598,"types":["GRASS","STEEL"],"w4x":["FIRE"],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Seed","c":72.4},{"n":"Strange Flower","c":6.1}],"out":false},{"slug":"beartic_unova","nome":"Beartic","lvl":6950,"reg":"Unova","pid":614,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Snowball","c":44.6},{"n":"Feather","c":55.0},{"n":"Horn","c":12.7},{"n":"Psychic Spoon","c":14.5}],"out":false},{"slug":"accelgor_unova","nome":"Accelgor","lvl":6950,"reg":"Unova","pid":617,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Bug Antenna","c":41.0},{"n":"Butterfly Wing","c":18.3},{"n":"Bee Sting","c":4.2},{"n":"Scythe","c":3.4}],"out":false},{"slug":"mienshao_unova","nome":"Mienshao","lvl":6950,"reg":"Unova","pid":620,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Band Aid","c":67.3},{"n":"Punch Stone","c":0.5},{"n":"Rubber Ball","c":74.2},{"n":"Martial Arts Scroll","c":9.8},{"n":"Sandbag","c":36.5}],"out":false},{"slug":"golurk_unova","nome":"Golurk","lvl":6950,"reg":"Unova","pid":623,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Ghost Essence","c":73.7},{"n":"Earth Stone","c":0.5},{"n":"Piece of Diglett","c":4.6},{"n":"Strange Rock","c":19.6}],"out":false},{"slug":"braviary_unova","nome":"Braviary","lvl":6950,"reg":"Unova","pid":628,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Tongue","c":15.9},{"n":"Giant Piece of Fur","c":12.1},{"n":"Wool Ball","c":27.3}],"out":false},{"slug":"mandibuzz_unova","nome":"Mandibuzz","lvl":6950,"reg":"Unova","pid":630,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":97330,"gp":41712,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Darkness Stone","c":0.3},{"n":"Ghost Essence","c":14.3},{"n":"Crystal Tail","c":10.8},{"n":"Fire Tail","c":11.0}],"out":false},{"slug":"archeops_unova","nome":"Archeops","lvl":8000,"reg":"Unova","pid":567,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":112030,"gp":48012,"drops":[{"n":"Small Stone","c":75.0},{"n":"Mini Wings","c":6.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"serperior_unova","nome":"Serperior","lvl":8600,"reg":"Unova","pid":497,"types":["GRASS"],"w4x":[],"w2x":["FIRE","ICE","POISON","FLYING","BUG"],"xp":120430,"gp":51612,"drops":[{"n":"Seed","c":72.4},{"n":"Bag of Pollen","c":30.9},{"n":"Plant Tail","c":9.6}],"out":false},{"slug":"emboar_unova","nome":"Emboar","lvl":8600,"reg":"Unova","pid":500,"types":["FIRE","FIGHTING"],"w4x":[],"w2x":["WATER","GROUND","FLYING","PSYCHIC"],"xp":120430,"gp":51612,"drops":[{"n":"Band Aid","c":67.3},{"n":"Essence of Fire","c":59.3},{"n":"Punch Stone","c":0.5}],"out":false},{"slug":"samurott_unova","nome":"Samurott","lvl":8600,"reg":"Unova","pid":503,"types":["WATER"],"w4x":[],"w2x":["GRASS","ELECTRIC"],"xp":120430,"gp":51612,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Pendant","c":37.6},{"n":"Fish Fin","c":3.0}],"out":false},{"slug":"stoutland_unova","nome":"Stoutland","lvl":8600,"reg":"Unova","pid":508,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Luck Medallion","c":6.3},{"n":"Sun Stone","c":0.6}],"out":true},{"slug":"unfezant_unova","nome":"Unfezant","lvl":8600,"reg":"Unova","pid":521,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Bitten Apple","c":54.2},{"n":"Giant Piece of Fur","c":12.1}],"out":false},{"slug":"gigalith_unova","nome":"Gigalith","lvl":8600,"reg":"Unova","pid":526,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Small Stone","c":66.2},{"n":"Stone Orb","c":30.2},{"n":"Rock Stone","c":0.3},{"n":"Strange Rock","c":8.2},{"n":"Giant Ruby","c":11.9}],"out":false},{"slug":"conkeldurr_unova","nome":"Conkeldurr","lvl":8600,"reg":"Unova","pid":534,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Band Aid","c":67.3},{"n":"Rubber Ball","c":74.2},{"n":"Belt of Champion","c":2.3},{"n":"Fur","c":19.9},{"n":"Kick Machine","c":3.0}],"out":false},{"slug":"seismitoad_unova","nome":"Seismitoad","lvl":8600,"reg":"Unova","pid":537,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Water Gem","c":56.4},{"n":"Sandbag","c":41.6},{"n":"Water Stone","c":0.5},{"n":"Feather","c":39.0}],"out":false},{"slug":"leavanny_unova","nome":"Leavanny","lvl":8600,"reg":"Unova","pid":542,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5}],"out":false},{"slug":"scolipede_unova","nome":"Scolipede","lvl":8600,"reg":"Unova","pid":545,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Bug Gosme","c":59.5},{"n":"Butterfly Wing","c":18.3}],"out":false},{"slug":"krookodile_unova","nome":"Krookodile","lvl":8600,"reg":"Unova","pid":553,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Earth Ball","c":65.6},{"n":"Darkness Stone","c":0.3}],"out":false},{"slug":"gothitelle_unova","nome":"Gothitelle","lvl":8600,"reg":"Unova","pid":576,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Psychic Spoon","c":9.3},{"n":"Linearly Guided Hypnosis","c":7.1},{"n":"Seed","c":80.0}],"out":false},{"slug":"reuniclus_unova","nome":"Reuniclus","lvl":8600,"reg":"Unova","pid":579,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5},{"n":"Psychic Spoon","c":9.3},{"n":"Straw","c":63.6}],"out":false},{"slug":"vanilluxe_unova","nome":"Vanilluxe","lvl":8600,"reg":"Unova","pid":584,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Ice Orb","c":30.2},{"n":"Female Ear","c":0.6},{"n":"Giant Piece of Fur","c":25.3}],"out":false},{"slug":"klinklang_unova","nome":"Klinklang","lvl":8600,"reg":"Unova","pid":601,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3},{"n":"Feather","c":70.1}],"out":false},{"slug":"eelektross_unova","nome":"Eelektross","lvl":8600,"reg":"Unova","pid":604,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Screw","c":57.4},{"n":"Thunder Stone","c":0.5},{"n":"Electric Tail","c":4.6},{"n":"Electric Rat Tail","c":5.1}],"out":false},{"slug":"chandelure_unova","nome":"Chandelure","lvl":8600,"reg":"Unova","pid":609,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Darkness Stone","c":0.7}],"out":false},{"slug":"haxorus_unova","nome":"Haxorus","lvl":8600,"reg":"Unova","pid":612,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":120430,"gp":51612,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Straw","c":75.0}],"out":false},{"slug":"hydreigon_unova","nome":"Hydreigon","lvl":8600,"reg":"Unova","pid":635,"types":["DARK","DRAGON"],"w4x":["FAIRY"],"w2x":["ICE","FIGHTING","BUG"],"xp":120430,"gp":51612,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Dragon Scale","c":57.7},{"n":"Snow Skis","c":0.4}],"out":false},{"slug":"flabebe_kalos","nome":"Flabebe","lvl":10000,"reg":"Kalos","pid":669,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Cure Flower","c":30.0},{"n":"Seed","c":60.0},{"n":"Heart Stone","c":0.4}],"out":false},{"slug":"pancham_kalos","nome":"Pancham","lvl":10000,"reg":"Kalos","pid":674,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Rubber Ball","c":60.0},{"n":"Nail","c":20.0},{"n":"Punch Stone","c":0.6}],"out":false},{"slug":"skrelp_kalos","nome":"Skrelp","lvl":10000,"reg":"Kalos","pid":690,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Dragon Scale","c":20.0},{"n":"Bottles of Poison","c":60.0},{"n":"Venom Stone","c":0.5}],"out":false},{"slug":"bunnelby_kalos","nome":"Bunnelby","lvl":10000,"reg":"Kalos","pid":659,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Microphone","c":2.7},{"n":"Bull Tail","c":2.2},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"fletchling_kalos","nome":"Fletchling","lvl":10000,"reg":"Kalos","pid":661,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Feather Stone","c":0.4},{"n":"Strange Thing","c":9.0},{"n":"Horn","c":35.9}],"out":false},{"slug":"scatterbug_kalos","nome":"Scatterbug","lvl":10000,"reg":"Kalos","pid":664,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Bug Antenna","c":41.0},{"n":"Bottles of Poison","c":57.0},{"n":"Butterfly Wing","c":18.3}],"out":false},{"slug":"litleo_kalos","nome":"Litleo","lvl":10000,"reg":"Kalos","pid":667,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Rubber Ball","c":70.8},{"n":"Fire Stone","c":0.5},{"n":"Magma Foot","c":5.6},{"n":"Wool Ball","c":27.3}],"out":false},{"slug":"espurr_kalos","nome":"Espurr","lvl":10000,"reg":"Kalos","pid":677,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Future Orb","c":40.6},{"n":"Enigma Stone","c":0.5}],"out":false},{"slug":"honedge_kalos","nome":"Honedge","lvl":10000,"reg":"Kalos","pid":679,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3}],"out":false},{"slug":"swirlix_kalos","nome":"Swirlix","lvl":10000,"reg":"Kalos","pid":684,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Heart Stone","c":0.4},{"n":"Rubber Ball","c":72.3},{"n":"Enchanted Gem","c":18.3}],"out":false},{"slug":"inkay_kalos","nome":"Inkay","lvl":10000,"reg":"Kalos","pid":686,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Enchanted Gem","c":71.1},{"n":"Darkness Stone","c":0.3}],"out":false},{"slug":"binacle_kalos","nome":"Binacle","lvl":10000,"reg":"Kalos","pid":688,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Water Gem","c":56.4},{"n":"Rock Stone","c":0.3}],"out":false},{"slug":"clauncher_kalos","nome":"Clauncher","lvl":10000,"reg":"Kalos","pid":692,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6},{"n":"Goggles","c":0.5}],"out":false},{"slug":"helioptile_kalos","nome":"Helioptile","lvl":10000,"reg":"Kalos","pid":694,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Screw","c":57.4},{"n":"Thunder Stone","c":0.5},{"n":"Wool Ball","c":13.5}],"out":false},{"slug":"tyrunt_kalos","nome":"Tyrunt","lvl":10000,"reg":"Kalos","pid":696,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Small Stone","c":66.2},{"n":"Rock Stone","c":0.3},{"n":"Water Gem","c":65.2}],"out":false},{"slug":"amaura_kalos","nome":"Amaura","lvl":10000,"reg":"Kalos","pid":698,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Snowball","c":44.6},{"n":"Stone Orb","c":30.2},{"n":"Rock Stone","c":0.3}],"out":false},{"slug":"goomy_kalos","nome":"Goomy","lvl":10000,"reg":"Kalos","pid":704,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Goggles","c":0.4},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"phantump_kalos","nome":"Phantump","lvl":10000,"reg":"Kalos","pid":708,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Traces of Ghost","c":12.6},{"n":"Leaves","c":45.2},{"n":"Darkness Stone","c":0.7},{"n":"Enchanted Gem","c":10.2}],"out":false},{"slug":"bergmite_kalos","nome":"Bergmite","lvl":10000,"reg":"Kalos","pid":712,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Ice Orb","c":30.2},{"n":"Enchanted Gem","c":55.7},{"n":"Goggles","c":0.2}],"out":false},{"slug":"noibat_kalos","nome":"Noibat","lvl":10000,"reg":"Kalos","pid":714,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":140030,"gp":60012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Goggles","c":0.4},{"n":"Feather Stone","c":0.4},{"n":"Straw","c":75.0}],"out":false},{"slug":"dedenne_kalos","nome":"Dedenne","lvl":11250,"reg":"Kalos","pid":702,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":157530,"gp":67512,"drops":[{"n":"Heart Stone","c":0.4},{"n":"Rubber Ball","c":72.3},{"n":"Screw","c":57.4},{"n":"Wool Ball","c":13.5}],"out":false},{"slug":"klefki_kalos","nome":"Klefki","lvl":11250,"reg":"Kalos","pid":707,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":157530,"gp":67512,"drops":[{"n":"Heart Stone","c":0.4},{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3},{"n":"Earth Ball","c":47.7}],"out":false},{"slug":"sylveon_kalos","nome":"Sylveon","lvl":12750,"reg":"Kalos","pid":700,"types":["FAIRY"],"w4x":[],"w2x":["POISON","STEEL"],"xp":178530,"gp":76512,"drops":[{"n":"Heart Stone","c":0.4},{"n":"Rubber Ball","c":72.3},{"n":"Enchanted Gem","c":18.3},{"n":"Tooth","c":37.4}],"out":false},{"slug":"hawlucha_kalos","nome":"Hawlucha","lvl":12750,"reg":"Kalos","pid":701,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":178530,"gp":76512,"drops":[{"n":"Band Aid","c":67.3},{"n":"Belt of Champion","c":2.3},{"n":"Martial Arts Scroll","c":9.8},{"n":"Iron Bracelet","c":5.1}],"out":false},{"slug":"carbink_kalos","nome":"Carbink","lvl":12750,"reg":"Kalos","pid":703,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":178530,"gp":76512,"drops":[{"n":"Rubber Ball","c":72.3},{"n":"Small Stone","c":66.2},{"n":"Feather","c":80.0},{"n":"Onix Tail","c":2.8}],"out":false},{"slug":"fletchinder_kalos","nome":"Fletchinder","lvl":14350,"reg":"Kalos","pid":662,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":200930,"gp":86112,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Fire Tail","c":13.9},{"n":"Fox Tail","c":3.3},{"n":"Fur","c":26.6}],"out":false},{"slug":"spewpa_kalos","nome":"Spewpa","lvl":14350,"reg":"Kalos","pid":665,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":200930,"gp":86112,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Pot of Moss Bug","c":56.1},{"n":"Butterfly Wing","c":18.3},{"n":"Mushroom","c":4.0}],"out":false},{"slug":"floette_kalos","nome":"Floette","lvl":14350,"reg":"Kalos","pid":670,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":200930,"gp":86112,"drops":[{"n":"Heart Stone","c":0.1},{"n":"Mystic Flower","c":1.9},{"n":"Heart Stone","c":0.4}],"out":false},{"slug":"doublade_kalos","nome":"Doublade","lvl":14350,"reg":"Kalos","pid":680,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":200930,"gp":86112,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Metal Stone","c":0.1},{"n":"Piece of Steel","c":27.3}],"out":false},{"slug":"sliggoo_kalos","nome":"Sliggoo","lvl":14350,"reg":"Kalos","pid":705,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":200930,"gp":86112,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Goggles","c":0.4},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"diggersby_kalos","nome":"Diggersby","lvl":16000,"reg":"Kalos","pid":660,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Rubber Ball","c":70.8},{"n":"Earth Stone","c":0.5},{"n":"Sandbag","c":41.6}],"out":false},{"slug":"pyroar_kalos","nome":"Pyroar","lvl":16000,"reg":"Kalos","pid":668,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Rubber Ball","c":70.8},{"n":"Pot of Lava","c":39.3},{"n":"Tongue","c":15.9},{"n":"Farfetchd Stick","c":8.7}],"out":false},{"slug":"aromatisse_kalos","nome":"Aromatisse","lvl":16000,"reg":"Kalos","pid":683,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Rubber Ball","c":72.3},{"n":"Enchanted Gem","c":18.3},{"n":"Comb","c":29.2}],"out":false},{"slug":"slurpuff_kalos","nome":"Slurpuff","lvl":16000,"reg":"Kalos","pid":685,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Heart Stone","c":0.4},{"n":"Rubber Ball","c":72.3},{"n":"Comb","c":29.2}],"out":false},{"slug":"malamar_kalos","nome":"Malamar","lvl":16000,"reg":"Kalos","pid":687,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Enchanted Gem","c":71.1},{"n":"Darkness Stone","c":0.3}],"out":false},{"slug":"barbaracle_kalos","nome":"Barbaracle","lvl":16000,"reg":"Kalos","pid":689,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Water Gem","c":56.4},{"n":"Slow Tail","c":16.1}],"out":false},{"slug":"clawitzer_kalos","nome":"Clawitzer","lvl":16000,"reg":"Kalos","pid":693,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Fish Fin","c":3.0},{"n":"Fins","c":0.7}],"out":false},{"slug":"heliolisk_kalos","nome":"Heliolisk","lvl":16000,"reg":"Kalos","pid":695,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Screw","c":57.4},{"n":"Thunder Stone","c":0.5},{"n":"Nail","c":25.6}],"out":false},{"slug":"aurorus_kalos","nome":"Aurorus","lvl":16000,"reg":"Kalos","pid":699,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Snowball","c":44.6},{"n":"Ice Orb","c":30.2},{"n":"Ski Poles","c":0.2}],"out":false},{"slug":"trevenant_kalos","nome":"Trevenant","lvl":16000,"reg":"Kalos","pid":709,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Seed","c":72.4},{"n":"Traces of Ghost","c":12.6},{"n":"Bottles of Poison","c":75.0},{"n":"Straw","c":80.0}],"out":false},{"slug":"avalugg_kalos","nome":"Avalugg","lvl":16000,"reg":"Kalos","pid":713,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Snowball","c":44.6},{"n":"Ice Stone","c":0.3},{"n":"Straw","c":80.0},{"n":"Fur","c":10.8},{"n":"Ski Poles","c":0.2}],"out":false},{"slug":"noivern_kalos","nome":"Noivern","lvl":16000,"reg":"Kalos","pid":715,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Goggles","c":0.4},{"n":"Straw","c":75.0}],"out":false},{"slug":"noivern_alola","nome":"Noivern","lvl":16000,"reg":"Kalos","pid":715,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":224030,"gp":96012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Goggles","c":0.4},{"n":"Straw","c":75.0}],"out":false},{"slug":"pangoro_kalos","nome":"Pangoro","lvl":20000,"reg":"Kalos","pid":675,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":280030,"gp":120012,"drops":[{"n":"Rubber Ball","c":70.0},{"n":"Nail","c":30.0},{"n":"Dark Gem","c":10.0}],"out":false},{"slug":"dragalge_kalos","nome":"Dragalge","lvl":20000,"reg":"Kalos","pid":691,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":280030,"gp":120012,"drops":[{"n":"Dragon Scale","c":40.0},{"n":"Bottles of Poison","c":70.0}],"out":false},{"slug":"florges_kalos","nome":"Florges","lvl":21200,"reg":"Kalos","pid":671,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":296830,"gp":127212,"drops":[{"n":"Crystal Stone","c":0.0},{"n":"Heart Stone","c":0.1},{"n":"Mystic Flower","c":2.7},{"n":"Mystic Petal","c":2.7}],"out":false},{"slug":"chesnaught_kalos","nome":"Chesnaught","lvl":21200,"reg":"Kalos","pid":652,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":296830,"gp":127212,"drops":[{"n":"Band Aid","c":67.3},{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Bag of Pollen","c":30.9}],"out":false},{"slug":"delphox_kalos","nome":"Delphox","lvl":21200,"reg":"Kalos","pid":655,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":296830,"gp":127212,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Future Orb","c":40.6},{"n":"Fire Stone","c":0.5},{"n":"Psychic Spoon","c":9.3}],"out":false},{"slug":"talonflame_kalos","nome":"Talonflame","lvl":21200,"reg":"Kalos","pid":663,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":296830,"gp":127212,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Pot of Lava","c":39.3},{"n":"Fire Tail","c":13.9},{"n":"Giant Piece of Fur","c":6.9},{"n":"Small Stone","c":8.5}],"out":false},{"slug":"vivillon_kalos","nome":"Vivillon","lvl":21200,"reg":"Kalos","pid":666,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":296830,"gp":127212,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Pot of Moss Bug","c":56.1},{"n":"Bug Antenna","c":41.0},{"n":"Straw","c":77.2}],"out":false},{"slug":"goodra_kalos","nome":"Goodra","lvl":21200,"reg":"Kalos","pid":706,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":296830,"gp":127212,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Ski Poles","c":0.4}],"out":false},{"slug":"litten_alola","nome":"Litten","lvl":25000,"reg":"Alola","pid":725,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Magma Foot","c":5.6}],"out":false},{"slug":"popplio_alola","nome":"Popplio","lvl":25000,"reg":"Alola","pid":728,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Fish Fin","c":3.0}],"out":false},{"slug":"pikipek_alola","nome":"Pikipek","lvl":25000,"reg":"Alola","pid":731,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Feather Stone","c":0.4},{"n":"Iron Bracelet","c":0.7}],"out":false},{"slug":"yungoos_alola","nome":"Yungoos","lvl":25000,"reg":"Alola","pid":734,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Bull Tail","c":2.2},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"grubbin_alola","nome":"Grubbin","lvl":25000,"reg":"Alola","pid":736,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Cocoon Stone","c":0.5},{"n":"Butterfly Wing","c":18.3}],"out":false},{"slug":"cutiefly_alola","nome":"Cutiefly","lvl":25000,"reg":"Alola","pid":742,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Rubber Ball","c":72.3},{"n":"Cocoon Stone","c":0.5},{"n":"Strange Thing","c":6.9}],"out":false},{"slug":"rockruff_alola","nome":"Rockruff","lvl":25000,"reg":"Alola","pid":744,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Small Stone","c":66.2},{"n":"Rock Stone","c":0.3},{"n":"Strange Rock","c":8.2},{"n":"Tooth","c":16.5}],"out":false},{"slug":"mudbray_alola","nome":"Mudbray","lvl":25000,"reg":"Alola","pid":749,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Earth Stone","c":0.5},{"n":"Sandbag","c":41.6},{"n":"Bone","c":7.0}],"out":false},{"slug":"dewpider_alola","nome":"Dewpider","lvl":25000,"reg":"Alola","pid":751,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6}],"out":false},{"slug":"morelull_alola","nome":"Morelull","lvl":25000,"reg":"Alola","pid":755,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Heart Stone","c":0.4},{"n":"Rubber Ball","c":72.3},{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5},{"n":"Colored Feather","c":12.0}],"out":false},{"slug":"salandit_alola","nome":"Salandit","lvl":25000,"reg":"Alola","pid":757,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Venom Stone","c":0.6},{"n":"Fire Horse Foot","c":8.5}],"out":false},{"slug":"stufful_alola","nome":"Stufful","lvl":25000,"reg":"Alola","pid":759,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Band Aid","c":67.3},{"n":"Rubber Ball","c":70.8},{"n":"Sun Stone","c":0.4},{"n":"Martial Arts Scroll","c":9.8},{"n":"Bull Tail","c":2.2}],"out":false},{"slug":"bounsweet_alola","nome":"Bounsweet","lvl":25000,"reg":"Alola","pid":761,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5},{"n":"Bottles of Poison","c":73.8},{"n":"Plant Tail","c":9.6}],"out":false},{"slug":"wimpod_alola","nome":"Wimpod","lvl":25000,"reg":"Alola","pid":767,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Water Gem","c":56.4},{"n":"Water Pendant","c":37.6},{"n":"Cocoon Stone","c":0.5},{"n":"Mushroom","c":4.0}],"out":false},{"slug":"jangmo_o_alola","nome":"Jangmo-o","lvl":25000,"reg":"Alola","pid":782,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"mareanie_alola","nome":"Mareanie","lvl":25000,"reg":"Alola","pid":747,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":350030,"gp":150012,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Venom Stone","c":0.6}],"out":false},{"slug":"passimian_alola","nome":"Passimian","lvl":27050,"reg":"Alola","pid":766,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":378730,"gp":162312,"drops":[{"n":"Band Aid","c":67.3},{"n":"Punch Stone","c":0.5},{"n":"Rubber Ball","c":74.2},{"n":"Belt of Champion","c":2.3},{"n":"Martial Arts Scroll","c":9.8}],"out":false},{"slug":"togedemaru_alola","nome":"Togedemaru","lvl":27050,"reg":"Alola","pid":777,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":378730,"gp":162312,"drops":[{"n":"Iron Bracelet","c":7.8},{"n":"Piece of Steel","c":27.3},{"n":"Screw","c":57.4}],"out":false},{"slug":"bruxish_alola","nome":"Bruxish","lvl":27050,"reg":"Alola","pid":779,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":378730,"gp":162312,"drops":[{"n":"Enchanted Gem","c":71.1},{"n":"Water Gem","c":56.4},{"n":"Seal Tail","c":3.5}],"out":false},{"slug":"drampa_alola","nome":"Drampa","lvl":27050,"reg":"Alola","pid":780,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":378730,"gp":162312,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Rubber Ball","c":70.8},{"n":"Enchanted Gem","c":38.6}],"out":false},{"slug":"dhelmise_alola","nome":"Dhelmise","lvl":29450,"reg":"Alola","pid":781,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":412330,"gp":176712,"drops":[{"n":"Ghost Essence","c":73.7},{"n":"Seed","c":72.4},{"n":"Traces of Ghost","c":12.6}],"out":false},{"slug":"dartrix_alola","nome":"Dartrix","lvl":32000,"reg":"Alola","pid":723,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":448030,"gp":192012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaf Stone","c":0.5},{"n":"Strange Flower","c":6.1}],"out":false},{"slug":"torracat_alola","nome":"Torracat","lvl":32000,"reg":"Alola","pid":726,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":448030,"gp":192012,"drops":[{"n":"Essence of Fire","c":59.3},{"n":"Fire Stone","c":0.5},{"n":"Fire Tail","c":13.9}],"out":false},{"slug":"brionne_alola","nome":"Brionne","lvl":32000,"reg":"Alola","pid":729,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":448030,"gp":192012,"drops":[{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5},{"n":"Water Pendant","c":37.6}],"out":false},{"slug":"trumbeak_alola","nome":"Trumbeak","lvl":32000,"reg":"Alola","pid":732,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":448030,"gp":192012,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Feather Stone","c":0.4},{"n":"Tooth","c":15.9}],"out":false},{"slug":"charjabug_alola","nome":"Charjabug","lvl":32000,"reg":"Alola","pid":737,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":448030,"gp":192012,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Screw","c":57.4},{"n":"Cocoon Stone","c":0.5}],"out":false},{"slug":"steenee_alola","nome":"Steenee","lvl":32000,"reg":"Alola","pid":762,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":448030,"gp":192012,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Leaf Stone","c":0.5},{"n":"Plant Tail","c":9.6},{"n":"Enchanted Gem","c":74.8}],"out":false},{"slug":"hakamo_o_alola","nome":"Hakamo-o","lvl":32000,"reg":"Alola","pid":783,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":448030,"gp":192012,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Ancient Stone","c":0.1}],"out":false},{"slug":"gumshoos_alola","nome":"Gumshoos","lvl":34650,"reg":"Alola","pid":735,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Giant Piece of Fur","c":12.1},{"n":"Magnetic Cube","c":12.0},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"ribombee_alola","nome":"Ribombee","lvl":34650,"reg":"Alola","pid":743,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Rubber Ball","c":72.3},{"n":"Enchanted Gem","c":18.3},{"n":"Goggles","c":10.0}],"out":false},{"slug":"mudsdale_alola","nome":"Mudsdale","lvl":34650,"reg":"Alola","pid":750,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Earth Ball","c":65.6},{"n":"Earth Stone","c":0.5},{"n":"Sandbag","c":41.6},{"n":"Strange Rock","c":19.6}],"out":false},{"slug":"araquanid_alola","nome":"Araquanid","lvl":34650,"reg":"Alola","pid":752,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Water Gem","c":56.4},{"n":"Water Pendant","c":37.6},{"n":"Seed","c":72.4}],"out":false},{"slug":"shiinotic_alola","nome":"Shiinotic","lvl":34650,"reg":"Alola","pid":756,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Rubber Ball","c":72.3},{"n":"Seed","c":72.4},{"n":"Bag of Pollen","c":30.9},{"n":"Enchanted Gem","c":18.3},{"n":"Tooth","c":37.4}],"out":false},{"slug":"bewear_alola","nome":"Bewear","lvl":34650,"reg":"Alola","pid":760,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Band Aid","c":67.3},{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Belt of Champion","c":2.3},{"n":"Strange Thing","c":9.0},{"n":"Sun Stone","c":0.6}],"out":false},{"slug":"golisopod_alola","nome":"Golisopod","lvl":34650,"reg":"Alola","pid":768,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Water Gem","c":56.4},{"n":"Tooth","c":32.6}],"out":false},{"slug":"salazzle_alola","nome":"Salazzle","lvl":34650,"reg":"Alola","pid":758,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Essence of Fire","c":59.3},{"n":"Tooth","c":60.9},{"n":"Fox Tail","c":3.3},{"n":"Venom Flute","c":8.4}],"out":false},{"slug":"toxapex_alola","nome":"Toxapex","lvl":34650,"reg":"Alola","pid":748,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":485130,"gp":207912,"drops":[{"n":"Bottles of Poison","c":68.0},{"n":"Water Gem","c":56.4},{"n":"Male Ear","c":3.1},{"n":"Earth Ball","c":73.9}],"out":false},{"slug":"incineroar_alola","nome":"Incineroar","lvl":43100,"reg":"Alola","pid":727,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":603430,"gp":258612,"drops":[{"n":"Dark Gem","c":71.8},{"n":"Essence of Fire","c":59.3},{"n":"Fire Tail","c":13.9}],"out":false},{"slug":"primarina_alola","nome":"Primarina","lvl":43100,"reg":"Alola","pid":730,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":603430,"gp":258612,"drops":[{"n":"Rubber Ball","c":72.3},{"n":"Water Gem","c":56.4},{"n":"Water Stone","c":0.5}],"out":false},{"slug":"toucannon_alola","nome":"Toucannon","lvl":43100,"reg":"Alola","pid":733,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":603430,"gp":258612,"drops":[{"n":"Rubber Ball","c":70.8},{"n":"Fur","c":57.4},{"n":"Future Orb","c":17.5}],"out":false},{"slug":"vikavolt_alola","nome":"Vikavolt","lvl":43100,"reg":"Alola","pid":738,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":603430,"gp":258612,"drops":[{"n":"Bug Gosme","c":59.5},{"n":"Screw","c":57.4},{"n":"Electric Tail","c":4.6},{"n":"Butterfly Wing","c":18.3}],"out":false},{"slug":"tsareena_alola","nome":"Tsareena","lvl":43100,"reg":"Alola","pid":763,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":603430,"gp":258612,"drops":[{"n":"Seed","c":72.4},{"n":"Leaves","c":45.2},{"n":"Bag of Pollen","c":30.9},{"n":"Straw","c":80.0},{"n":"Plant Foot","c":18.1}],"out":false},{"slug":"kommo_o_alola","nome":"Kommo-o","lvl":43100,"reg":"Alola","pid":784,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":603430,"gp":258612,"drops":[{"n":"Dragon Scale","c":57.7},{"n":"Dragon Tail","c":3.0},{"n":"Dragon Tooth","c":3.0},{"n":"Punch Stone","c":0.5}],"out":false},{"slug":"scorbunny_alola","nome":"Scorbunny","lvl":50000,"reg":"Galar","pid":813,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":700030,"gp":300012,"drops":[],"out":false},{"slug":"milcery_alola","nome":"Milcery","lvl":50000,"reg":"Galar","pid":868,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":700030,"gp":300012,"drops":[],"out":false},{"slug":"dreepy_alola","nome":"Dreepy","lvl":50000,"reg":"Galar","pid":885,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":700030,"gp":300012,"drops":[],"out":false},{"slug":"ursaluna_alola","nome":"Ursaluna","lvl":58900,"reg":"Galar","pid":901,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":824630,"gp":353412,"drops":[],"out":false},{"slug":"raboot_alola","nome":"Raboot","lvl":64000,"reg":"Galar","pid":814,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":896030,"gp":384012,"drops":[],"out":false},{"slug":"alcremie_alola","nome":"Alcremie","lvl":69300,"reg":"Galar","pid":869,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":970230,"gp":415812,"drops":[],"out":false},{"slug":"cinderace_alola","nome":"Cinderace","lvl":86150,"reg":"Galar","pid":815,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1206130,"gp":516912,"drops":[],"out":false},{"slug":"charcadet_alola","nome":"Charcadet","lvl":100000,"reg":"Paldea","pid":935,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1400030,"gp":600012,"drops":[],"out":false},{"slug":"tinkatink_alola","nome":"Tinkatink","lvl":100000,"reg":"Paldea","pid":957,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1400030,"gp":600012,"drops":[],"out":false},{"slug":"annihilape_alola","nome":"Annihilape","lvl":114800,"reg":"Paldea","pid":979,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1607230,"gp":688812,"drops":[],"out":false},{"slug":"sandy_shocks_alola","nome":"Sandy Shocks","lvl":114800,"reg":"Paldea","pid":989,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1607230,"gp":688812,"drops":[],"out":false},{"slug":"tinkatuff_alola","nome":"Tinkatuff","lvl":123350,"reg":"Paldea","pid":958,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1726930,"gp":740112,"drops":[],"out":false},{"slug":"armarouge_alola","nome":"Armarouge","lvl":132200,"reg":"Paldea","pid":936,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":1850830,"gp":793212,"drops":[],"out":false},{"slug":"tinkaton_alola","nome":"Tinkaton","lvl":160300,"reg":"Paldea","pid":959,"types":["NORMAL"],"w4x":[],"w2x":["FIGHTING"],"xp":2244230,"gp":961812,"drops":[],"out":false}];
  window.ROTOM_BOSSES_DB = [
    {"k":"regirock","n":"Regirock","pid":377,"lvl":300,"teamLevel":300,"t1":"ROCK","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":0.5}]},
    {"k":"regice","n":"Regice","pid":378,"lvl":300,"teamLevel":300,"t1":"ICE","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":0.5}]},
    {"k":"registeel","n":"Registeel","pid":379,"lvl":650,"teamLevel":650,"t1":"STEEL","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":1.0}]},
    {"k":"kyogre","n":"Kyogre","pid":382,"lvl":650,"teamLevel":650,"t1":"WATER","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":1.0}]},
    {"k":"groudon","n":"Groudon","pid":383,"lvl":3100,"teamLevel":3100,"t1":"GROUND","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":1.5}]},
    {"k":"rayquaza","n":"Rayquaza","pid":384,"lvl":3100,"teamLevel":3100,"t1":"DRAGON","t2":"FLYING","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":1.5}]},
    {"k":"uxie","n":"Uxie","pid":480,"lvl":9750,"teamLevel":9750,"t1":"PSYCHIC","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":2.0}]},
    {"k":"mesprit","n":"Mesprit","pid":481,"lvl":9750,"teamLevel":9750,"t1":"PSYCHIC","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":2.0}]},
    {"k":"azelf","n":"Azelf","pid":482,"lvl":22700,"teamLevel":22700,"t1":"PSYCHIC","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":2.5}]},
    {"k":"dialga","n":"Dialga","pid":483,"lvl":22700,"teamLevel":22700,"t1":"STEEL","t2":"DRAGON","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":2.5}]},
    {"k":"palkia","n":"Palkia","pid":484,"lvl":44050,"teamLevel":44050,"t1":"WATER","t2":"DRAGON","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":3.0}]},
    {"k":"heatran","n":"Heatran","pid":485,"lvl":44050,"teamLevel":44050,"t1":"FIRE","t2":"STEEL","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":3.0}]},
    {"k":"regigigas","n":"Regigigas","pid":486,"lvl":75900,"teamLevel":75900,"t1":"NORMAL","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":3.5}]},
    {"k":"dex487","n":"Giratina (Altered Forme)","pid":487,"lvl":75900,"teamLevel":75900,"t1":"GHOST","t2":"DRAGON","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":3.5}]},
    {"k":"cresselia","n":"Cresselia","pid":488,"lvl":120350,"teamLevel":120350,"t1":"PSYCHIC","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":4.0}]},
    {"k":"cobalion","n":"Cobalion","pid":638,"lvl":120350,"teamLevel":120350,"t1":"STEEL","t2":"FIGHTING","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":4.0}]},
    {"k":"terrakion","n":"Terrakion","pid":639,"lvl":179500,"teamLevel":179500,"t1":"ROCK","t2":"FIGHTING","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":4.5}]},
    {"k":"virizion","n":"Virizion","pid":640,"lvl":179500,"teamLevel":179500,"t1":"GRASS","t2":"FIGHTING","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":4.5}]},
    {"k":"reshiram","n":"Reshiram","pid":643,"lvl":255450,"teamLevel":255450,"t1":"DRAGON","t2":"FIRE","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":5.0}]},
    {"k":"zekrom","n":"Zekrom","pid":644,"lvl":255450,"teamLevel":255450,"t1":"DRAGON","t2":"ELECTRIC","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":5.0}]},
    {"k":"kyurem","n":"Kyurem","pid":646,"lvl":350300,"teamLevel":350300,"t1":"DRAGON","t2":"ICE","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":5.5}]},
    {"k":"kartana","n":"Kartana","pid":798,"lvl":350300,"teamLevel":350300,"t1":"GRASS","t2":"STEEL","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":5.5}]},
    {"k":"guzzlord","n":"Guzzlord","pid":799,"lvl":466150,"teamLevel":466150,"t1":"DARK","t2":"DRAGON","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":6.0}]},
    {"k":"poipole","n":"Poipole","pid":803,"lvl":466150,"teamLevel":466150,"t1":"POISON","t2":null,"ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"AoE TM Disk Piece","itemId":40530,"c":6.0}]},
    {"k":"naganadel","n":"Naganadel","pid":804,"lvl":605100,"teamLevel":605100,"t1":"POISON","t2":"DRAGON","ent":"1× Bronze Boss Token","entItemId":70000,"drops":[{"n":"TM Disk Piece","itemId":59194,"c":6.5}]}
  ];

  console.log('[RotomHuntsDB] Carregadas ' + window.ROTOM_HUNTS_DB.length + ' hunts e ' + window.ROTOM_BOSSES_DB.length + ' bosses.');
})(typeof window !== 'undefined' ? window : this);

// PokéIdle Auto-Sniper — Cockpit Controller v1.4.0
// Interface Standalone baseada 100% no Design System Oficial do PokéIdle

queueMicrotask(() => {
  console.log('[PokéIdle Cockpit]: Inicializando Cockpit oficial...');

  // Tratador global seguro e em conformidade estrita com CSP (Manifest V3) para fallback de imagens
  document.addEventListener('error', (e) => {
    if (e.target && e.target.tagName === 'IMG') {
      const img = e.target;
      if (img.dataset.hasFallback) {
        img.style.display = 'none';
        return;
      }
      img.dataset.hasFallback = 'true';
      if (img.classList.contains('log-item-icon')) {
        img.style.display = 'none';
      } else if (img.classList.contains('hunt-poke-sprite')) {
        img.src = 'https://pokeidle.io/assets/site/assets/ui/ball-poke.png';
      } else if (img.classList.contains('stat-drop-icon')) {
        img.src = 'icons/ouro.png';
      } else {
        img.src = 'https://pokeidle.io/assets/site/assets/ui/ball-poke.png';
      }
    }
  }, true);

  // Top Bar & Telemetria
  const valCoins = document.getElementById('val-coins');
  const valGemas = document.getElementById('val-gemas');
  const valDiamantes = document.getElementById('val-diamantes');
  const btnOpenDiamantesModal = document.getElementById('btn-open-diamantes-modal');
  const valSlots = document.getElementById('val-slots');
  const toggleMasterSniper = document.getElementById('toggle-master-sniper');
  const footerStatus = document.getElementById('footer-status');

  // Modal de Diamantes
  const modalDiamantes = document.getElementById('modal-diamantes');
  const btnCloseDiamantesModal = document.getElementById('btn-close-diamantes-modal');
  const btnCloseDiamantesModalBottom = document.getElementById('btn-close-diamantes-modal-bottom');
  const tabDiamanteComprar = document.getElementById('tab-diamante-comprar');
  const tabDiamanteVender = document.getElementById('tab-diamante-vender');
  const tabDiamanteRecarga = document.getElementById('tab-diamante-recarga');
  const panelDiamanteComprar = document.getElementById('panel-diamante-comprar');
  const panelDiamanteVender = document.getElementById('panel-diamante-vender');
  const panelDiamanteRecarga = document.getElementById('panel-diamante-recarga');
  const containerDiamantesOffers = document.getElementById('container-diamantes-offers');
  const btnRefreshDiamantesMarket = document.getElementById('btn-refresh-diamantes-market');
  const btnFilterDiamondsAll = document.getElementById('btn-filter-diamonds-all');
  const btnFilterDiamondsGold = document.getElementById('btn-filter-diamonds-gold');
  const btnFilterDiamondsGems = document.getElementById('btn-filter-diamonds-gems');
  const inputSellDiamantesQtd = document.getElementById('input-sell-diamantes-qtd');
  const inputSellDiamantesPreco = document.getElementById('input-sell-diamantes-preco');
  const selectSellDiamantesMoeda = document.getElementById('select-sell-diamantes-moeda');
  const boxSellDiamantesResumo = document.getElementById('box-sell-diamantes-resumo');
  const btnSubmitSellDiamantes = document.getElementById('btn-submit-sell-diamantes');

  // Filtros de Categoria & Formulário de Nova Regra
  const chipButtons = document.querySelectorAll('.chip-btn');
  const inputSearchItem = document.getElementById('input-search-item');
  const dropdownSuggestions = document.getElementById('dropdown-suggestions');
  const boxSelectedPreview = document.getElementById('box-selected-preview');
  const imgSelectedItem = document.getElementById('img-selected-item');
  const lblSelectedName = document.getElementById('lbl-selected-name');
  const lblSelectedCat = document.getElementById('lbl-selected-cat');
  const btnClearSelection = document.getElementById('btn-clear-selection');

  const inputRuleCoins = document.getElementById('input-rule-coins');
  const inputRuleGemas = document.getElementById('input-rule-gemas');
  const inputRuleQty = document.getElementById('input-rule-qty');
  const btnAddRule = document.getElementById('btn-add-rule');

  // Radar Global de Pokémon
  const chkGlobalShiny = document.getElementById('chk-global-shiny');
  const cfgShinyCoins = document.getElementById('cfg-shiny-coins');
  const cfgShinyGemas = document.getElementById('cfg-shiny-gemas');

  const chkGlobalP5 = document.getElementById('chk-global-p5');
  const cfgP5Coins = document.getElementById('cfg-p5-coins');
  const cfgP5Gemas = document.getElementById('cfg-p5-gemas');

  const chkGlobalNote = document.getElementById('chk-global-note');
  const cfgNoteVal = document.getElementById('cfg-note-val');
  const cfgNoteCoins = document.getElementById('cfg-note-coins');
  const cfgNoteGemas = document.getElementById('cfg-note-gemas');

  const lblRadarSlotBadge = document.getElementById('lbl-radar-slot-badge');
  const lblRadarSlotStatus = document.getElementById('lbl-radar-slot-status');
  const badgeVipStatus = document.getElementById('badge-vip-status');

  // Quantidade Infinita
  const btnToggleInfiniteNew = document.getElementById('btn-toggle-infinite-new');
  const btnToggleInfiniteEdit = document.getElementById('btn-toggle-infinite-edit');
  const lblInputQtyTitle = document.getElementById('lbl-input-qty-title');
  const lblEditQtyTitle = document.getElementById('lbl-edit-qty-title');

  // Lista de Regras & Contadores
  const containerRulesList = document.getElementById('container-rules-list');
  const lblRulesCount = document.getElementById('lbl-rules-count');

  // Terminal de Logs
  const containerLogsList = document.getElementById('container-logs-list');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  // Modal de Edição
  const modalEditRule = document.getElementById('modal-edit-rule');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnSaveModal = document.getElementById('btn-save-modal');
  const editRuleName = document.getElementById('edit-rule-name');
  const editRuleCoins = document.getElementById('edit-rule-coins');
  const editRuleGemas = document.getElementById('edit-rule-gemas');
  const editRuleQty = document.getElementById('edit-rule-qty');
  const editRuleActive = document.getElementById('edit-rule-active');
  const lblEditBought = document.getElementById('lbl-edit-bought');
  const btnResetBought = document.getElementById('btn-reset-bought');

  // Constantes de Slots
  const MAX_BASIC_SLOTS = 5;
  const MAX_VIP_SLOTS = 15;
  const MAX_BASIC_QTY = 20;

  // Estado VIP e Infinito
  let isPlayerVip = false;
  let newRuleIsInfinite = false;
  let editRuleIsInfinite = false;

  function getMaxSlots() {
    return isPlayerVip ? MAX_VIP_SLOTS : MAX_BASIC_SLOTS;
  }

  // Estado Local
  let isSniperEnabled = true;
  let sniperRules = [];
  let sniperLogs = [];
  let selectedItemObj = null;
  let currentFilterCat = 'all';
  let editingRuleId = null;

  // Estado do Mercado da Comunidade
  let myListings = [];
  let communityCatalog = {};
  let currentItemOffersData = null;
  let currentMarketFilterCat = 'all';
  let currentOffersMoeda = 'gold';
  let selectedMarketItem = null;

  let globalConfig = {
    snipeAnyShiny: false,
    maxPriceShinyGold: 50000,
    maxPriceShinyGems: 0,
    maxPriceShinyDiamonds: 0,
    snipeAnyP5: false,
    maxPriceP5Gold: 100000,
    maxPriceP5Gems: 0,
    maxPriceP5Diamonds: 0,
    snipeByNote: false,
    minNote: 7.0,
    maxPriceNoteGold: 50000,
    maxPriceNoteGems: 0,
    maxPriceNoteDiamonds: 0,
    maxActiveSlots: 5,
    autoMaxAffordable: true
  };

  // Helpers de Slots da Versão Basic (Cada Auto-Snipe no Radar = 1 Slot)
  function getRadarSlotsCount() {
    let count = 0;
    const shinyOn = chkGlobalShiny ? chkGlobalShiny.checked : Boolean(globalConfig && globalConfig.snipeAnyShiny);
    const p5On = chkGlobalP5 ? chkGlobalP5.checked : Boolean(globalConfig && globalConfig.snipeAnyP5);
    const noteOn = chkGlobalNote ? chkGlobalNote.checked : Boolean(globalConfig && globalConfig.snipeByNote);

    if (shinyOn) count++;
    if (p5On) count++;
    if (noteOn) count++;
    return count;
  }

  function isRadarActive() {
    return getRadarSlotsCount() > 0;
  }

  function getActiveRulesCount() {
    return sniperRules.filter(r => r.active).length;
  }

  function getUsedSlotsCount() {
    return getActiveRulesCount() + getRadarSlotsCount();
  }

  function updateSlotsDisplay() {
    const maxSlots = getMaxSlots();
    const activeRules = getActiveRulesCount();
    const radarSlots = getRadarSlotsCount();
    const totalUsed = activeRules + radarSlots;

    if (badgeVipStatus) {
      badgeVipStatus.style.display = isPlayerVip ? 'inline-block' : 'none';
    }

    if (valSlots) {
      valSlots.textContent = `${totalUsed} / ${maxSlots} SLOTS ATIVOS${isPlayerVip ? ' (VIP)' : ''}`;
      if (totalUsed >= maxSlots) {
        valSlots.style.color = '#ffd166';
      } else {
        valSlots.style.color = 'var(--rx-luz)';
      }
    }

    if (lblRulesCount) {
      lblRulesCount.textContent = `${totalUsed} de ${maxSlots} slots utilizados`;
      if (totalUsed >= maxSlots) {
        lblRulesCount.style.color = 'var(--ouro)';
        lblRulesCount.style.fontWeight = '700';
      } else {
        lblRulesCount.style.color = 'var(--sobre-mad-dim)';
        lblRulesCount.style.fontWeight = '400';
      }
    }

    if (lblRadarSlotBadge) {
      lblRadarSlotBadge.textContent = `${radarSlots} / 3 Slots Usados`;
      lblRadarSlotBadge.style.color = radarSlots > 0 ? 'var(--ouro)' : 'var(--sobre-mad-dim)';
    }

    if (lblRadarSlotStatus) {
      if (radarSlots > 0) {
        lblRadarSlotStatus.textContent = `Ativo (${radarSlots} slot${radarSlots > 1 ? 's' : ''} em uso)`;
        lblRadarSlotStatus.style.color = 'var(--ouro)';
      } else {
        lblRadarSlotStatus.textContent = 'Inativo (0 slots)';
        lblRadarSlotStatus.style.color = 'var(--sobre-mad-dim)';
      }
    }

    // Atualiza botões infinitos conforme status VIP
    if (btnToggleInfiniteNew) {
      if (newRuleIsInfinite) {
        btnToggleInfiniteNew.classList.remove('apagado');
        btnToggleInfiniteNew.classList.add('btn-roxo', 'on');
        btnToggleInfiniteNew.textContent = '✓ ∞ Ativo';
      } else {
        btnToggleInfiniteNew.classList.remove('btn-roxo', 'on');
        btnToggleInfiniteNew.classList.add('apagado');
        btnToggleInfiniteNew.textContent = isPlayerVip ? '∞ Infinito' : '🔒 ∞';
      }
    }

    if (btnToggleInfiniteEdit) {
      if (editRuleIsInfinite) {
        btnToggleInfiniteEdit.classList.remove('apagado');
        btnToggleInfiniteEdit.classList.add('btn-roxo', 'on');
        btnToggleInfiniteEdit.textContent = '✓ ∞ Ativo';
      } else {
        btnToggleInfiniteEdit.classList.remove('btn-roxo', 'on');
        btnToggleInfiniteEdit.classList.add('apagado');
        btnToggleInfiniteEdit.textContent = isPlayerVip ? '∞ Infinito' : '🔒 ∞';
      }
    }

    if (lblInputQtyTitle) {
      lblInputQtyTitle.textContent = isPlayerVip
        ? (newRuleIsInfinite ? 'Quantidade: Infinita (Sem limite)' : 'Quantidade Máxima:')
        : 'Quantidade Máxima (Máx 20 un):';
    }

    if (lblEditQtyTitle) {
      lblEditQtyTitle.textContent = isPlayerVip
        ? (editRuleIsInfinite ? 'Quantidade: Infinita (Sem limite)' : 'Quantidade Máxima:')
        : 'Quantidade Máxima (Máx 20 un):';
    }
  }

  function setInfiniteNew(infinite) {
    if (infinite && !isPlayerVip) {
      alert('Benefício VIP PokéIdle!\n\nA compra de quantidade infinita é exclusiva para treinadores com VIP ativo no PokéIdle.\n\nNa versão Básica, o limite é de até 20 unidades por regra.');
      return;
    }
    newRuleIsInfinite = Boolean(infinite);
    if (inputRuleQty) {
      if (newRuleIsInfinite) {
        inputRuleQty.value = '99999';
        inputRuleQty.disabled = true;
        inputRuleQty.style.opacity = '0.5';
      } else {
        inputRuleQty.disabled = false;
        inputRuleQty.style.opacity = '1';
        if (inputRuleQty.value === '99999' || (!isPlayerVip && Number(inputRuleQty.value) > 20)) {
          inputRuleQty.value = '20';
        }
      }
    }
    updateSlotsDisplay();
  }

  function setInfiniteEdit(infinite) {
    if (infinite && !isPlayerVip) {
      alert('Benefício VIP PokéIdle!\n\nA compra de quantidade infinita é exclusiva para treinadores com VIP ativo no PokéIdle.\n\nNa versão Básica, o limite é de até 20 unidades por regra.');
      return;
    }
    editRuleIsInfinite = Boolean(infinite);
    if (editRuleQty) {
      if (editRuleIsInfinite) {
        editRuleQty.value = '99999';
        editRuleQty.disabled = true;
        editRuleQty.style.opacity = '0.5';
      } else {
        editRuleQty.disabled = false;
        editRuleQty.style.opacity = '1';
        if (editRuleQty.value === '99999' || (!isPlayerVip && Number(editRuleQty.value) > 20)) {
          editRuleQty.value = '20';
        }
      }
    }
    updateSlotsDisplay();
  }

  if (btnToggleInfiniteNew) {
    btnToggleInfiniteNew.addEventListener('click', () => {
      setInfiniteNew(!newRuleIsInfinite);
    });
  }

  if (btnToggleInfiniteEdit) {
    btnToggleInfiniteEdit.addEventListener('click', () => {
      setInfiniteEdit(!editRuleIsInfinite);
    });
  }

  // =========================================================================
  // 1. SALDO E CABEÇALHO
  // =========================================================================
  function updateBalanceDisplay(gold, gems, diamonds) {
    if (valCoins) {
      if (typeof gold === 'number' && gold >= 0) {
        valCoins.textContent = `${gold.toLocaleString()} GP`;
      } else {
        valCoins.textContent = '-- GP';
      }
    }
    if (valGemas) {
      if (typeof gems === 'number' && gems >= 0) {
        valGemas.textContent = `${gems.toLocaleString()} Gemas`;
      } else {
        valGemas.textContent = '-- Gemas';
      }
    }
    if (valDiamantes) {
      if (typeof diamonds === 'number' && diamonds >= 0) {
        valDiamantes.textContent = `${diamonds.toLocaleString()} Diamantes`;
      } else {
        valDiamantes.textContent = '-- Diamantes';
      }
    }
  }

  function updateFooter(msg) {
    if (footerStatus && msg) {
      footerStatus.textContent = msg;
    }
  }

  // =========================================================================
  // 2. FILTROS RÁPIDOS DE CATEGORIA & AUTOCOMPLETE
  // =========================================================================
  chipButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      chipButtons.forEach(b => {
        b.classList.remove('on');
        b.classList.add('apagado');
      });
      btn.classList.add('on');
      btn.classList.remove('apagado');
      currentFilterCat = btn.getAttribute('data-cat') || 'all';
      renderSuggestions(inputSearchItem ? inputSearchItem.value.trim() : '');
    });
  });

  function renderSuggestions(query) {
    if (!dropdownSuggestions) return;
    const q = (query || '').toLowerCase().trim();

    let items = [];
    if (typeof window.searchRotomItems === 'function') {
      items = window.searchRotomItems(q, currentFilterCat);
    }

    if (items.length === 0) {
      dropdownSuggestions.style.display = 'none';
      dropdownSuggestions.innerHTML = '';
      return;
    }

    dropdownSuggestions.innerHTML = '';
    items.slice(0, 80).forEach(it => {
      const row = document.createElement('div');
      row.className = 'sug-item';

      const iconUrl = typeof window.getItemIconUrl === 'function'
        ? window.getItemIconUrl(it)
        : (it.icon || '');

      row.innerHTML = `
        <img src="${iconUrl}" class="sug-img">
        <span class="sug-text">${it.name}</span>
        <span class="sug-cat">${it.categoryLabel || it.category || 'item'}</span>
      `;

      const sugImg = row.querySelector('.sug-img');
      if (sugImg) {
        sugImg.addEventListener('error', () => { sugImg.style.display = 'none'; });
      }

      row.addEventListener('click', () => {
        selectItem(it);
        dropdownSuggestions.style.display = 'none';
      });

      dropdownSuggestions.appendChild(row);
    });

    dropdownSuggestions.style.display = 'flex';
  }

  function selectItem(it) {
    selectedItemObj = it;
    if (inputSearchItem) inputSearchItem.value = it.name;
    if (boxSelectedPreview) boxSelectedPreview.style.display = 'flex';
    if (lblSelectedName) lblSelectedName.textContent = it.name;
    if (lblSelectedCat) lblSelectedCat.textContent = (it.categoryLabel || it.category || 'item').toUpperCase();

    if (imgSelectedItem) {
      imgSelectedItem.style.display = 'block';
      imgSelectedItem.src = typeof window.getItemIconUrl === 'function'
        ? window.getItemIconUrl(it)
        : (it.icon || '');
    }
  }

  if (btnClearSelection) {
    btnClearSelection.addEventListener('click', () => {
      selectedItemObj = null;
      if (inputSearchItem) inputSearchItem.value = '';
      if (boxSelectedPreview) boxSelectedPreview.style.display = 'none';
      if (dropdownSuggestions) dropdownSuggestions.style.display = 'none';
    });
  }

  if (inputSearchItem) {
    inputSearchItem.addEventListener('input', (e) => {
      renderSuggestions(e.target.value);
    });

    inputSearchItem.addEventListener('focus', (e) => {
      renderSuggestions(e.target.value);
    });

    document.addEventListener('click', (e) => {
      if (dropdownSuggestions && !dropdownSuggestions.contains(e.target) && e.target !== inputSearchItem) {
        dropdownSuggestions.style.display = 'none';
      }
    });
  }

  // =========================================================================
  // 3. CADASTRO DE NOVA REGRA
  // =========================================================================
  if (btnAddRule) {
    btnAddRule.addEventListener('click', () => {
      const rawName = inputSearchItem ? inputSearchItem.value.trim() : '';
      if (!selectedItemObj && !rawName) {
        alert('Por favor, selecione ou digite um item para cadastrar.');
        return;
      }

      const coins = inputRuleCoins ? (Number(inputRuleCoins.value) || 0) : 0;
      const gemas = inputRuleGemas ? (Number(inputRuleGemas.value) || 0) : 0;
      const rawQty = inputRuleQty ? inputRuleQty.value.trim() : '1';
      const maxSlots = getMaxSlots();
      let qty = newRuleIsInfinite ? 99999 : (Number(rawQty) || 1);

      if (!isPlayerVip && !newRuleIsInfinite && (qty <= 0 || qty > MAX_BASIC_QTY)) {
        alert(`Na versão Basic, a quantidade máxima permitida é de 1 a ${MAX_BASIC_QTY} unidades por regra.`);
        qty = Math.min(Math.max(qty, 1), MAX_BASIC_QTY);
        if (inputRuleQty) inputRuleQty.value = String(qty);
        return;
      }

      if (coins <= 0 && gemas <= 0) {
        alert('Defina ao menos um teto de preço (Coins ou Gemas).');
        return;
      }

      const totalUsed = getUsedSlotsCount();
      let ruleActive = true;
      if (totalUsed >= maxSlots) {
        ruleActive = false;
        alert(`Regra cadastrada como PAUSADA!\n\nVocê já está usando o limite de ${maxSlots} slots ativos. Desative uma regra ou o Radar de Pokémon para ativá-la.`);
      }

      let targetId = selectedItemObj ? selectedItemObj.id : 0;
      let targetName = selectedItemObj ? selectedItemObj.name : rawName;
      const targetType = (selectedItemObj && selectedItemObj.category === 'pokemon') ? 'pokemon' : 'item';

      const matchedDbItem = selectedItemObj || (typeof window.getRotomItem === 'function' ? (window.getRotomItem(targetId) || window.getRotomItem(targetName)) : null);
      if (!targetId && matchedDbItem) {
        targetId = matchedDbItem.id;
        targetName = matchedDbItem.name;
      }
      const targetIcon = (matchedDbItem && matchedDbItem.icon) ? matchedDbItem.icon : '';

      const newRule = {
        id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        targetType: targetType,
        targetId: targetId,
        targetName: targetName,
        icon: targetIcon,
        maxPriceGold: coins,
        maxPriceGems: gemas,
        maxPriceDiamonds: gemas, // Compatibilidade com pacotes legados
        infinite: Boolean(newRuleIsInfinite),
        maxQty: qty,
        totalBought: 0,
        active: ruleActive,
        createdAt: Date.now()
      };

      sniperRules.push(newRule);
      saveAndSyncRules();

      // Limpar campos
      setInfiniteNew(false);
      selectedItemObj = null;
      if (inputSearchItem) inputSearchItem.value = '';
      if (boxSelectedPreview) boxSelectedPreview.style.display = 'none';
      if (inputRuleCoins) inputRuleCoins.value = '';
      if (inputRuleGemas) inputRuleGemas.value = '';
      if (inputRuleQty) inputRuleQty.value = '1';
    });
  }

  // =========================================================================
  // 4. RENDERIZAÇÃO DA LISTA DE REGRAS
  // =========================================================================
  function renderRules() {
    if (!containerRulesList) return;
    updateSlotsDisplay();

    if (sniperRules.length === 0) {
      containerRulesList.innerHTML = `
        <div style="text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);">
          Nenhuma regra cadastrada. Cadastre até 5 regras no painel à esquerda.
        </div>
      `;
      return;
    }

    containerRulesList.innerHTML = '';
    sniperRules.forEach(rule => {
      const card = document.createElement('div');
      card.className = 'vao rule-card';

      const iconUrl = typeof window.getItemIconUrl === 'function'
        ? window.getItemIconUrl(rule)
        : '';

      const coinsText = rule.maxPriceGold > 0 ? `${rule.maxPriceGold.toLocaleString('pt-BR')} GP` : '';
      const gemasText = (rule.maxPriceGems > 0 || rule.maxPriceDiamonds > 0)
        ? `${(rule.maxPriceGems || rule.maxPriceDiamonds).toLocaleString('pt-BR')} Gemas`
        : '';
      const prices = [coinsText, gemasText].filter(Boolean).join(' | ') || 'Sem teto';

      const bought = rule.totalBought || 0;
      const isInf = Boolean(rule.infinite || rule.maxQty >= 99999);
      let pct = 0;
      let qtyText = '';

      if (isInf) {
        pct = 100;
        qtyText = `${bought} / ∞`;
      } else {
        const maxQ = (rule.maxQty !== undefined && rule.maxQty > 0) ? (isPlayerVip ? rule.maxQty : Math.min(rule.maxQty, MAX_BASIC_QTY)) : MAX_BASIC_QTY;
        pct = Math.min(100, Math.round((bought / maxQ) * 100));
        qtyText = `${bought} / ${maxQ}`;
      }

      card.innerHTML = `
        <div class="rule-card-top">
          <div class="rule-target-info">
            <img src="${iconUrl}" class="rule-icon">
            <div class="rule-name-box">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="rule-name">${rule.targetName}</span>
              </div>
              <span class="rule-meta">${prices}</span>
            </div>
          </div>
          <div class="rule-actions-group">
            <label style="display: flex; align-items: center; cursor: pointer;" title="Ativar ou pausar regra">
              <input type="checkbox" class="chk-rule-toggle chk-mini" ${rule.active ? 'checked' : ''}>
            </label>
          </div>
        </div>

        <div class="rule-card-bottom">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <div class="rule-progress-bar">
              <div class="rule-progress-fill" style="width: ${pct}%; ${isInf ? 'background: linear-gradient(180deg, #9fe4ff, #2f8fc4);' : ''}"></div>
            </div>
            <span style="font-size: 9.5px; color: ${isInf ? 'var(--vip-luz, #9fe4ff)' : 'var(--sobre-mad-dim)'}; font-variant-numeric: tabular-nums; flex: none;">
              ${qtyText}
            </span>
          </div>

          <div style="display: flex; gap: 4px;">
            <button type="button" class="btn apagado btn-mini btn-edit-rule">Editar</button>
            <button type="button" class="btn apagado btn-mini btn-del-rule">Excluir</button>
          </div>
        </div>
      `;

      const rImg = card.querySelector('.rule-icon');
      if (rImg) {
        rImg.addEventListener('error', () => { rImg.style.display = 'none'; });
      }

      // Toggle ativo com verificação estrita de slots
      const chkToggle = card.querySelector('.chk-rule-toggle');
      if (chkToggle) {
        chkToggle.addEventListener('change', (e) => {
          const maxSlots = getMaxSlots();
          if (e.target.checked) {
            if (getUsedSlotsCount() >= maxSlots) {
              e.target.checked = false;
              rule.active = false;
              alert(`Limite de ${maxSlots} slots ativos atingido!\n\nDesative outra regra ou o Radar de Pokémon para liberar um slot.`);
              return;
            }
            rule.active = true;
          } else {
            rule.active = false;
          }
          saveAndSyncRules();
          updateSlotsDisplay();
        });
      }

      // Editar
      const btnEdit = card.querySelector('.btn-edit-rule');
      if (btnEdit) {
        btnEdit.addEventListener('click', () => {
          openEditModal(rule);
        });
      }

      // Excluir
      const btnDel = card.querySelector('.btn-del-rule');
      if (btnDel) {
        btnDel.addEventListener('click', () => {
          if (confirm(`Excluir regra de compra de ${rule.targetName}?`)) {
            sniperRules = sniperRules.filter(r => r.id !== rule.id);
            saveAndSyncRules();
          }
        });
      }

      containerRulesList.appendChild(card);
    });
  }

  // =========================================================================
  // 5. MODAL DE EDIÇÃO DE REGRA
  // =========================================================================
  function openEditModal(rule) {
    if (!modalEditRule) return;
    editingRuleId = rule.id;

    if (editRuleName) editRuleName.value = rule.targetName || '';
    if (editRuleCoins) editRuleCoins.value = rule.maxPriceGold || '';
    if (editRuleGemas) editRuleGemas.value = rule.maxPriceGems || rule.maxPriceDiamonds || '';
    
    const isInf = Boolean(rule.infinite || rule.maxQty >= 99999);
    setInfiniteEdit(isInf);
    if (!isInf && editRuleQty) {
      editRuleQty.value = (rule.maxQty !== undefined && rule.maxQty > 0) ? (isPlayerVip ? rule.maxQty : Math.min(rule.maxQty, MAX_BASIC_QTY)) : 1;
    }

    if (lblEditBought) lblEditBought.textContent = `${rule.totalBought || 0} unidades`;
    if (editRuleActive) editRuleActive.checked = Boolean(rule.active);

    modalEditRule.classList.add('open');
  }

  function closeEditModal() {
    if (!modalEditRule) return;
    editingRuleId = null;
    modalEditRule.classList.remove('open');
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeEditModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeEditModal);

  if (btnResetBought) {
    btnResetBought.addEventListener('click', () => {
      if (!editingRuleId) return;
      const rule = sniperRules.find(r => r.id === editingRuleId);
      if (rule) {
        rule.totalBought = 0;
        if (lblEditBought) lblEditBought.textContent = '0 unidades';
        saveAndSyncRules();
      }
    });
  }

  if (btnSaveModal) {
    btnSaveModal.addEventListener('click', () => {
      if (!editingRuleId) return;
      const rule = sniperRules.find(r => r.id === editingRuleId);
      if (!rule) return;

      const coins = editRuleCoins ? (Number(editRuleCoins.value) || 0) : 0;
      const gemas = editRuleGemas ? (Number(editRuleGemas.value) || 0) : 0;
      const rawQty = editRuleQty ? editRuleQty.value.trim() : '1';
      let qty = editRuleIsInfinite ? 99999 : (Number(rawQty) || 1);

      if (!isPlayerVip && !editRuleIsInfinite && (qty <= 0 || qty > MAX_BASIC_QTY)) {
        alert(`Na versão Basic, a quantidade máxima permitida é de 1 a ${MAX_BASIC_QTY} unidades.`);
        qty = Math.min(Math.max(qty, 1), MAX_BASIC_QTY);
        if (editRuleQty) editRuleQty.value = String(qty);
        return;
      }

      if (coins <= 0 && gemas <= 0) {
        alert('Defina ao menos um teto de preço (Coins ou Gemas).');
        return;
      }

      const wantActive = editRuleActive ? editRuleActive.checked : rule.active;
      const maxSlots = getMaxSlots();
      if (wantActive && !rule.active) {
        if (getUsedSlotsCount() >= maxSlots) {
          alert(`Limite de ${maxSlots} slots ativos atingido!\n\nDesative outra regra ou o Radar de Pokémon para ativar esta.`);
          if (editRuleActive) editRuleActive.checked = false;
          return;
        }
      }

      rule.maxPriceGold = coins;
      rule.maxPriceGems = gemas;
      rule.maxPriceDiamonds = gemas;
      rule.infinite = Boolean(editRuleIsInfinite);
      rule.maxQty = qty;
      rule.active = wantActive;

      saveAndSyncRules();
      renderRules();
      closeEditModal();
    });
  }

  // =========================================================================
  // 6. TERMINAL DE LOGS DO MERCADO
  // =========================================================================
  function renderLogs() {
    if (!containerLogsList) return;

    if (sniperLogs.length === 0) {
      containerLogsList.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--vao-dim); font-size: 10px;">
          Aguardando anúncios do mercado...
        </div>
      `;
      return;
    }

    containerLogsList.innerHTML = '';
    sniperLogs.slice(0, 50).forEach(l => {
      const row = document.createElement('div');
      row.className = 'log-row';

      const st = (l.status || '').toLowerCase();
      let statusClass = 'sucesso';
      if (st.includes('disparado') || st.includes('comprando')) statusClass = 'disparado';
      else if (st.includes('agendado') || st.includes('limite') || st.includes('slot')) statusClass = 'aviso';
      else if (st.includes('erro') || st.includes('falhou') || st.includes('rejeitado') || st.includes('recusado')) statusClass = 'erro';

      const d = new Date(l.timestamp || Date.now());
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

      // 1. Resolução humanizada do nome do Item (corrige qualquer Item #ID legado se existir)
      let targetName = l.targetName || 'Item';
      if (targetName.startsWith('Item #')) {
        const matchId = targetName.match(/\d+/);
        if (matchId && typeof getRotomItem === 'function') {
          const found = getRotomItem(Number(matchId[0]));
          if (found && found.name) {
            targetName = found.name;
          }
        }
      }

      // 2. Extração do vendedor (campo seller direto ou parsing de log legado)
      let seller = String(l.seller || '').trim();
      if (!seller && l.details) {
        const sellerMatch = l.details.match(/de @([a-zA-Z0-9_-]+)/i) || l.details.match(/vendedor:?\s*@?([a-zA-Z0-9_-]+)/i);
        if (sellerMatch) seller = sellerMatch[1];
      }

      // 3. Formatação monetária limpa e humanizada
      const qtyNum = Number(l.qty || 1);
      const curr = String(l.currency || 'gold').toLowerCase();
      const isGemas = (curr === 'orb' || curr === 'orbs' || curr === 'gemas' || curr === 'gema');
      const currLabel = isGemas ? 'Gemas' : 'Coins';
      const unitPrice = Number(l.price || 0).toLocaleString('pt-BR');
      const totalPrice = (qtyNum * Number(l.price || 0)).toLocaleString('pt-BR');

      let priceSummary = '';
      if (l.price) {
        priceSummary = qtyNum > 1
          ? `${qtyNum}x a ${unitPrice} ${currLabel} (Total: ${totalPrice})`
          : `${unitPrice} ${currLabel}`;
      }

      // 4. Limpeza e humanização dos detalhes (remove jargões robóticos legados)
      let cleanDetails = String(l.details || '').trim();
      cleanDetails = cleanDetails.replace(/^Ordem enviada ao servidor via\s*/i, '');
      cleanDetails = cleanDetails.replace(/^Regra Item:\s*/i, 'Regra: ');
      cleanDetails = cleanDetails.replace(/^Regra Pokemon:\s*/i, 'Regra: ');

      // Ícone do item se existir no catálogo oficial
      let iconHtml = '';
      if (typeof getRotomItem === 'function') {
        const itemObj = getRotomItem(targetName);
        if (itemObj && typeof getItemIconUrl === 'function') {
          const iconUrl = getItemIconUrl(itemObj);
          if (iconUrl) {
            iconHtml = `<img src="${iconUrl}" class="log-item-icon" alt="">`;
          }
        }
      }

      row.innerHTML = `
        <div class="log-row-top">
          <div class="log-target-group">
            <span class="log-time">[${timeStr}]</span>
            ${iconHtml}
            <span class="log-target" title="${targetName}">${targetName}</span>
            ${seller ? `<span class="log-seller" title="Vendedor: ${seller}">de <b>@${seller}</b></span>` : ''}
          </div>
          <span class="log-status-tag ${statusClass}">${l.status || 'OK'}</span>
        </div>
        <div class="log-detail">
          ${priceSummary ? `<span class="log-price">${priceSummary}</span>` : ''}
          ${priceSummary && cleanDetails ? ' · ' : ''}
          <span class="log-desc">${cleanDetails}</span>
        </div>
      `;

      containerLogsList.appendChild(row);
    });
  }

  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      sniperLogs = [];
      renderLogs();
      sendToActiveTab({ action: 'CLEAR_SNIPER_LOGS' });
    });
  }

  // =========================================================================
  // 7. SINCRONIZAÇÃO COM CHROME STORAGE E ABA ATIVA
  // =========================================================================
  function saveAndSyncRules() {
    renderRules();
    sendToActiveTab({ action: 'UPDATE_SNIPER_RULES', rules: sniperRules });
  }

  function saveAndSyncConfig() {
    sendToActiveTab({ action: 'UPDATE_SNIPER_CONFIG', config: globalConfig });
  }

  function sendToActiveTab(message) {
    // 1. Salva imediatamente no chrome.storage.local (ativa reativamente o onChanged em todas as abas/janelas)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      if (message.action === 'UPDATE_SNIPER_RULES') {
        chrome.storage.local.set({ rotom_sniper_rules: message.rules });
      } else if (message.action === 'UPDATE_SNIPER_CONFIG') {
        chrome.storage.local.set({ rotom_sniper_config: message.config });
      } else if (message.action === 'SET_SNIPER_ENABLED') {
        chrome.storage.local.set({ rotom_sniper_enabled: message.enabled });
      } else if (message.action === 'CLEAR_SNIPER_LOGS') {
        chrome.storage.local.set({ rotom_sniper_logs: [] });
      } else if (message.action === 'FETCH_OFERENDA_CANDIDATES') {
        chrome.storage.local.set({ rotom_action_fetch_oferendas: { ts: Date.now(), maxNota: message.maxNota, elemento: message.elemento } });
      } else if (message.action === 'EXECUTE_OFERENDA_BATCH') {
        chrome.storage.local.set({ rotom_action_execute_oferendas: { ts: Date.now(), pokemonIds: message.pokemonIds, pacingMs: message.pacingMs } });
      }
    }

    // 2. Dispara mensagem diretamente para TODAS as abas abertas do PokéIdle (independente de janela)
    if (!['SET_SNIPER_ENABLED','UPDATE_SNIPER_RULES','UPDATE_SNIPER_CONFIG','CLEAR_SNIPER_LOGS','FETCH_OFERENDA_CANDIDATES','EXECUTE_OFERENDA_BATCH'].includes(message.action) && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        if (Array.isArray(tabs)) {
          tabs.forEach(t => {
            const isPokeidle = t && t.url && (t.url.includes('pokeidle.io') || t.url.includes('pokeidle'));
            if (isPokeidle && t.id) {
              chrome.tabs.sendMessage(t.id, message, () => {
                if (chrome.runtime && chrome.runtime.lastError) {}
              });
            }
          });
        }
      });
    }
  }

  // Master Toggle
  if (toggleMasterSniper) {
    toggleMasterSniper.addEventListener('change', (e) => {
      isSniperEnabled = e.target.checked;
      updateFooter(isSniperEnabled ? 'Varrendo mercado da comunidade automaticamente...' : 'Auto-Sniper pausado pelo usuário.');
      sendToActiveTab({ action: 'SET_SNIPER_ENABLED', enabled: isSniperEnabled });
    });
  }

  // Configuração Global de Pokémon
  function bindGlobalConfig() {
    const bindRadarCheck = (el, prop) => {
      if (el) {
        el.addEventListener('change', (e) => {
          const willBeActive = e.target.checked;

          if (willBeActive) {
            const maxSlots = getMaxSlots();
            globalConfig[prop] = true;
            const futureTotal = getActiveRulesCount() + getRadarSlotsCount();
            if (futureTotal > maxSlots) {
              e.target.checked = false;
              globalConfig[prop] = false;
              alert(`Limite de ${maxSlots} slots atingido!\n\nCada auto-snipe do Radar consome 1 slot. Desative uma regra de compra ou outro filtro do Radar para poder ativar este.`);
              updateSlotsDisplay();
              return;
            }
          } else {
            globalConfig[prop] = false;
          }

          saveAndSyncConfig();
          updateSlotsDisplay();
        });
      }
    };

    const bindNum = (el, prop, propCompat) => {
      if (el) {
        const update = (e) => {
          const raw = String(e.target.value || '').trim();
          const val = raw === '' ? 0 : (Number(raw) || 0);
          globalConfig[prop] = val;
          if (propCompat) globalConfig[propCompat] = val;
          saveAndSyncConfig();
        };
        el.addEventListener('input', update);
        el.addEventListener('change', update);
      }
    };

    bindRadarCheck(chkGlobalShiny, 'snipeAnyShiny');
    bindNum(cfgShinyCoins, 'maxPriceShinyGold');
    bindNum(cfgShinyGemas, 'maxPriceShinyGems', 'maxPriceShinyDiamonds');

    bindRadarCheck(chkGlobalP5, 'snipeAnyP5');
    bindNum(cfgP5Coins, 'maxPriceP5Gold');
    bindNum(cfgP5Gemas, 'maxPriceP5Gems', 'maxPriceP5Diamonds');

    bindRadarCheck(chkGlobalNote, 'snipeByNote');
    bindNum(cfgNoteVal, 'minNote');
    bindNum(cfgNoteCoins, 'maxPriceNoteGold');
    bindNum(cfgNoteGemas, 'maxPriceNoteGems', 'maxPriceNoteDiamonds');

  }
  bindGlobalConfig();

  function applyConfigToUI(cfg) {
    if (!cfg) return;
    globalConfig = Object.assign(globalConfig, cfg);
    globalConfig.autoMaxAffordable = true; // Calibração nativa

    // Sanitização de migração de defaults legados (10 ou 25 gemas antigos herdados):
    if (globalConfig.maxPriceShinyGems === 10 && (!cfgShinyGemas || !cfgShinyGemas.value)) {
      globalConfig.maxPriceShinyGems = 0;
      globalConfig.maxPriceShinyDiamonds = 0;
    }
    if (globalConfig.maxPriceP5Gems === 25 && (!cfgP5Gemas || !cfgP5Gemas.value)) {
      globalConfig.maxPriceP5Gems = 0;
      globalConfig.maxPriceP5Diamonds = 0;
    }
    if (globalConfig.maxPriceNoteGems === 10 && (!cfgNoteGemas || !cfgNoteGemas.value)) {
      globalConfig.maxPriceNoteGems = 0;
      globalConfig.maxPriceNoteDiamonds = 0;
    }

    if (chkGlobalShiny) chkGlobalShiny.checked = Boolean(globalConfig.snipeAnyShiny);
    if (cfgShinyCoins) cfgShinyCoins.value = (globalConfig.maxPriceShinyGold > 0) ? globalConfig.maxPriceShinyGold : '';
    if (cfgShinyGemas) cfgShinyGemas.value = (globalConfig.maxPriceShinyGems > 0 ? globalConfig.maxPriceShinyGems : (globalConfig.maxPriceShinyDiamonds > 0 ? globalConfig.maxPriceShinyDiamonds : ''));

    if (chkGlobalP5) chkGlobalP5.checked = Boolean(globalConfig.snipeAnyP5);
    if (cfgP5Coins) cfgP5Coins.value = (globalConfig.maxPriceP5Gold > 0) ? globalConfig.maxPriceP5Gold : '';
    if (cfgP5Gemas) cfgP5Gemas.value = (globalConfig.maxPriceP5Gems > 0 ? globalConfig.maxPriceP5Gems : (globalConfig.maxPriceP5Diamonds > 0 ? globalConfig.maxPriceP5Diamonds : ''));

    if (chkGlobalNote) chkGlobalNote.checked = Boolean(globalConfig.snipeByNote);
    if (cfgNoteVal && globalConfig.minNote !== undefined) cfgNoteVal.value = globalConfig.minNote;
    if (cfgNoteCoins) cfgNoteCoins.value = (globalConfig.maxPriceNoteGold > 0) ? globalConfig.maxPriceNoteGold : '';
    if (cfgNoteGemas) cfgNoteGemas.value = (globalConfig.maxPriceNoteGems > 0 ? globalConfig.maxPriceNoteGems : (globalConfig.maxPriceNoteDiamonds > 0 ? globalConfig.maxPriceNoteDiamonds : ''));

    updateSlotsDisplay();
  }

  // Carregamento inicial do Storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([
      'rotom_sniper_enabled',
      'rotom_sniper_rules',
      'rotom_sniper_config',
      'rotom_sniper_logs',
      'rotom_player_gold',
      'rotom_player_orbs',
      'rotom_player_diamonds',
      'rotom_player_vip',
      'rotom_my_listings',
      'rotom_market_catalog',
      'rotom_item_offers',
      'rotom_items_dynamic',
      'rotom_items_names'
    ], (result) => {
      // Itens novos do jogo aprendidos pela página (items_db.js só tem a curadoria)
      if (Array.isArray(result.rotom_items_dynamic) && typeof window.registerRotomItems === 'function') {
        window.registerRotomItems(result.rotom_items_dynamic);
      }
      // E o nome que o jogo mostra para cada um (tradução, Shiny Stone por tipo, casas, skins...)
      if (result.rotom_items_names && typeof window.registerRotomNames === 'function') {
        window.registerRotomNames(result.rotom_items_names);
      }
      if (result.rotom_player_vip !== undefined) {
        isPlayerVip = Boolean(result.rotom_player_vip);
        updateSlotsDisplay();
      }
      if (result.rotom_sniper_enabled !== undefined) {
        isSniperEnabled = Boolean(result.rotom_sniper_enabled);
        if (toggleMasterSniper) toggleMasterSniper.checked = isSniperEnabled;
      }
      if (Array.isArray(result.rotom_sniper_rules)) {
        let needsSync = false;
        sniperRules = result.rotom_sniper_rules.map(r => {
          const isJunkIcon = !r.icon || r.icon.indexOf('icon16') !== -1 || r.icon.indexOf('icon48') !== -1 || r.icon.indexOf('icons/') !== -1;
          if (typeof window.getRotomItem === 'function') {
            const it = window.getRotomItem(r.targetId) || window.getRotomItem(r.targetName);
            if (it && it.icon && (isJunkIcon || r.icon !== it.icon)) {
              r.icon = it.icon;
              needsSync = true;
            }
          }

          // Garantia de separação estrita de moedas (Coins vs Gemas)
          if (r.maxPriceGold === undefined && r.maxPrice !== undefined) {
            const isLegacyOrb = (r.currency === 'orb' || r.currency === 'gemas' || r.currency === 'pontos');
            r.maxPriceGold = isLegacyOrb ? 0 : (Number(r.maxPrice) || 0);
            r.maxPriceGems = isLegacyOrb ? (Number(r.maxPrice) || 0) : 0;
            r.maxPriceDiamonds = r.maxPriceGems;
            needsSync = true;
          } else {
            r.maxPriceGold = Number(r.maxPriceGold) || 0;
            r.maxPriceGems = Number(r.maxPriceGems !== undefined ? r.maxPriceGems : (r.maxPriceDiamonds || 0));
            r.maxPriceDiamonds = r.maxPriceGems;
          }

          return r;
        });
        if (needsSync) {
          saveAndSyncRules();
        }
        renderRules();
      }
      if (result.rotom_sniper_config) {
        applyConfigToUI(result.rotom_sniper_config);
      }
      if (Array.isArray(result.rotom_sniper_logs)) {
        sniperLogs = result.rotom_sniper_logs;
        renderLogs();
      }
      const gold = result.rotom_player_gold;
      const gems = result.rotom_player_orbs !== undefined ? result.rotom_player_orbs : 0;
      const diamonds = result.rotom_player_diamonds !== undefined ? result.rotom_player_diamonds : 0;
      updateBalanceDisplay(gold, gems, diamonds);

      if (Array.isArray(result.rotom_my_listings)) {
        myListings = result.rotom_my_listings;
        renderMyListings();
      }
      if (result.rotom_market_catalog && typeof result.rotom_market_catalog === 'object') {
        communityCatalog = result.rotom_market_catalog;
        renderCommunityCatalog();
      }
      if (result.rotom_item_offers && typeof result.rotom_item_offers === 'object') {
        currentItemOffersData = result.rotom_item_offers;
        renderItemOffersModal();
      }
      if (result.rotom_diamond_offers && typeof result.rotom_diamond_offers === 'object') {
        renderDiamondOffers(result.rotom_diamond_offers.offers || []);
      }
      if (result.rotom_hunts_telemetry && typeof result.rotom_hunts_telemetry === 'object') {
        farmSessionData.hunts = { ...(farmSessionData.hunts || {}), ...result.rotom_hunts_telemetry };
      }
      if (result.rotom_farm_stats && typeof result.rotom_farm_stats === 'object') {
        farmSessionData = { ...farmSessionData, ...result.rotom_farm_stats };
        if (result.rotom_farm_stats.hunts) {
          farmSessionData.hunts = { ...(farmSessionData.hunts || {}), ...result.rotom_farm_stats.hunts };
        }
        updateFarmStatsUI();
      }
    });

    // Escuta alterações em tempo real no storage
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes.rotom_player_vip !== undefined) {
        isPlayerVip = Boolean(changes.rotom_player_vip.newValue);
        updateSlotsDisplay();
        renderRules();
      }
      if (changes.rotom_sniper_rules) {
        const raw = changes.rotom_sniper_rules.newValue || [];
        sniperRules = raw.map(r => {
          if (!r.icon && typeof window.getRotomItem === 'function') {
            const it = window.getRotomItem(r.targetId) || window.getRotomItem(r.targetName);
            if (it && it.icon) r.icon = it.icon;
          }
          return r;
        });
        renderRules();
      }
      if (changes.rotom_sniper_logs) {
        sniperLogs = changes.rotom_sniper_logs.newValue || [];
        renderLogs();
      }
      if (changes.rotom_player_gold || changes.rotom_player_orbs || changes.rotom_player_diamonds) {
        chrome.storage.local.get(['rotom_player_gold', 'rotom_player_orbs', 'rotom_player_diamonds'], (res) => {
          const gold = res.rotom_player_gold;
          const gems = res.rotom_player_orbs !== undefined ? res.rotom_player_orbs : 0;
          const diamonds = res.rotom_player_diamonds !== undefined ? res.rotom_player_diamonds : 0;
          updateBalanceDisplay(gold, gems, diamonds);
        });
      }
      if (changes.rotom_diamond_offers && changes.rotom_diamond_offers.newValue) {
        renderDiamondOffers(changes.rotom_diamond_offers.newValue.offers || []);
      }
      if (changes.rotom_hunts_telemetry) {
        if (changes.rotom_hunts_telemetry.newValue && typeof changes.rotom_hunts_telemetry.newValue === 'object') {
          farmSessionData.hunts = { ...(farmSessionData.hunts || {}), ...changes.rotom_hunts_telemetry.newValue };
        } else {
          farmSessionData.hunts = {};
        }
        if (typeof renderHuntStatsDashboard === 'function') renderHuntStatsDashboard();
      }
      if (changes.rotom_farm_stats) {
        if (changes.rotom_farm_stats.newValue && typeof changes.rotom_farm_stats.newValue === 'object') {
          farmSessionData = { ...farmSessionData, ...changes.rotom_farm_stats.newValue };
          if (changes.rotom_farm_stats.newValue.hunts) {
            farmSessionData.hunts = { ...(farmSessionData.hunts || {}), ...changes.rotom_farm_stats.newValue.hunts };
          }
        } else {
          farmSessionData = {
            startTime: Date.now(),
            kills: 0,
            catches: 0,
            captures: 0,
            ballAttempts: 0,
            trainerXp: 0,
            pokemonXp: 0,
            gold: 0,
            drops: {},
            shiniesSeen: 0,
            shiniesCaught: 0,
            activeHuntSlug: '',
            activeHuntName: '',
            hunts: {}
          };
        }
        updateFarmStatsUI();
      }
      if (changes.rotom_sniper_enabled && toggleMasterSniper) {
        isSniperEnabled = Boolean(changes.rotom_sniper_enabled.newValue);
        toggleMasterSniper.checked = isSniperEnabled;
      }
      if (changes.rotom_pix_config && changes.rotom_pix_config.newValue) {
        currentPixConfig = changes.rotom_pix_config.newValue;
        if (modalPix && modalPix.classList.contains('open')) {
          updatePixUI();
        }
      }
      if (changes.rotom_my_listings) {
        myListings = Array.isArray(changes.rotom_my_listings.newValue) ? changes.rotom_my_listings.newValue : [];
        renderMyListings();
      }
      if (changes.rotom_items_dynamic && typeof window.registerRotomItems === 'function') {
        if (window.registerRotomItems(changes.rotom_items_dynamic.newValue || []) > 0) {
          // O nome do jogo pode ter chegado antes do item: reaplica os nomes guardados.
          chrome.storage.local.get(['rotom_items_names'], (r) => {
            if (r.rotom_items_names && typeof window.registerRotomNames === 'function') window.registerRotomNames(r.rotom_items_names);
            renderCommunityCatalog();
          });
        }
      }
      if (changes.rotom_items_names && typeof window.registerRotomNames === 'function') {
        if (window.registerRotomNames(changes.rotom_items_names.newValue || {}) > 0) {
          renderCommunityCatalog();
          renderRules();
        }
      }
      if (changes.rotom_market_catalog) {
        communityCatalog = (changes.rotom_market_catalog.newValue && typeof changes.rotom_market_catalog.newValue === 'object')
          ? changes.rotom_market_catalog.newValue
          : {};
        renderCommunityCatalog();
      }
      if (changes.rotom_item_offers) {
        currentItemOffersData = changes.rotom_item_offers.newValue || null;
        renderItemOffersModal();
      }
    });

    // Escuta direta de mensagens runtime do background ou content script
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === 'DIAMOND_OFFERS_UPDATE') {
          renderDiamondOffers(msg.offers || []);
        } else if (msg && msg.action === 'FARM_STATS_UPDATE') {
          if (msg.stats && typeof msg.stats === 'object') {
            farmSessionData = { ...farmSessionData, ...msg.stats };
            updateFarmStatsUI();
          }
        } else if (msg && msg.action === 'BOSSES_UPDATE') {
          if (typeof renderBosses === 'function' && currentHuntsSubtab === 'bosses') {
            renderBosses();
          }
        }
      });
    } catch (e) {}
  }

  // =========================================================================
  // 8. MODAL PIX (ME PAGUE UM CAFÉ & QR CODE NATIVO)
  // =========================================================================
  const btnOpenPix = document.getElementById('btn-open-pix');
  const modalPix = document.getElementById('modal-pix');
  const btnClosePix = document.getElementById('btn-close-pix');
  const btnPixFecharBottom = document.getElementById('btn-pix-fechar-bottom');
  const pixQrcodeContainer = document.getElementById('pix-qrcode-container');
  const pixKeyDisplay = document.getElementById('pix-key-display');
  const btnCopyPixKey = document.getElementById('btn-copy-pix-key');
  const btnCopyPixPayload = document.getElementById('btn-copy-pix-payload');

  const OFFICIAL_PIX_KEY = '46196ec9-a442-41d9-b350-d0d1123987a7';
  const currentPixConfig = {
    key: OFFICIAL_PIX_KEY,
    name: 'DEV POKEIDLE',
    city: 'BRASIL'
  };

  function crc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= (data.charCodeAt(i) << 8);
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function emvTlv(tag, value) {
    const val = String(value || '');
    const len = String(val.length).padStart(2, '0');
    return `${tag}${len}${val}`;
  }

  function generatePixPayload(key, name, city) {
    const cleanKey = String(key || OFFICIAL_PIX_KEY).trim();
    if (!cleanKey) return '';
    const cleanName = String(name || 'DEV POKEIDLE').trim().substring(0, 25).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cleanCity = String(city || 'BRASIL').trim().substring(0, 15).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const gui = emvTlv('00', 'br.gov.bcb.pix');
    const pixKey = emvTlv('01', cleanKey);
    const merchantAcc = emvTlv('26', gui + pixKey);
    const cat = emvTlv('52', '0000');
    const curr = emvTlv('53', '986');
    const country = emvTlv('58', 'BR');
    const mName = emvTlv('59', cleanName || 'DEV POKEIDLE');
    const mCity = emvTlv('60', cleanCity || 'BRASIL');
    const addData = emvTlv('62', emvTlv('05', '***'));

    const raw = emvTlv('00', '01') + emvTlv('01', '12') + merchantAcc + cat + curr + country + mName + mCity + addData + '6304';
    return raw + crc16(raw);
  }

  function updatePixUI() {
    const key = currentPixConfig.key || OFFICIAL_PIX_KEY;
    if (pixKeyDisplay) pixKeyDisplay.textContent = key;
    const payload = generatePixPayload(key, currentPixConfig.name, currentPixConfig.city);
    renderPixQrCode(payload || key);
  }

  function renderPixQrCode(payloadText) {
    if (!pixQrcodeContainer) return;
    if (!payloadText) return;

    try {
      if (typeof qrcode === 'function') {
        const qr = qrcode(0, 'M');
        qr.addData(payloadText);
        qr.make();
        const svgTag = qr.createSvgTag(4, 2);
        pixQrcodeContainer.innerHTML = svgTag;
        const svgEl = pixQrcodeContainer.querySelector('svg');
        if (svgEl) {
          svgEl.style.width = '170px';
          svgEl.style.height = '170px';
          svgEl.style.display = 'block';
        }
      }
    } catch (err) {
      console.error('[Rotom Cockpit]: Erro ao gerar QR Code do Pix:', err);
      pixQrcodeContainer.innerHTML = '<span style="color: #c00; font-size: 10px;">Erro ao gerar QR Code</span>';
    }
  }

  function copyTextWithFeedback(btn, text) {
    if (!text) return;
    const oldText = btn.textContent;
    const restore = () => {
      setTimeout(() => { btn.textContent = oldText; }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copiado!';
        restore();
      }).catch(() => {
        fallbackCopy(text);
        btn.textContent = 'Copiado!';
        restore();
      });
    } else {
      fallbackCopy(text);
      btn.textContent = 'Copiado!';
      restore();
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function openPixModal() {
    if (modalPix) modalPix.classList.add('open');
    updatePixUI();
  }

  function closePixModal() {
    if (modalPix) modalPix.classList.remove('open');
  }

  if (btnOpenPix) btnOpenPix.addEventListener('click', openPixModal);
  if (btnClosePix) btnClosePix.addEventListener('click', closePixModal);
  if (btnPixFecharBottom) btnPixFecharBottom.addEventListener('click', closePixModal);

  if (modalPix) {
    modalPix.addEventListener('click', (e) => {
      if (e.target === modalPix) closePixModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalPix && modalPix.classList.contains('open')) {
      closePixModal();
    }
  });

  if (btnCopyPixKey) {
    btnCopyPixKey.addEventListener('click', () => {
      copyTextWithFeedback(btnCopyPixKey, currentPixConfig.key);
    });
  }

  if (btnCopyPixPayload) {
    btnCopyPixPayload.addEventListener('click', () => {
      const payload = generatePixPayload(currentPixConfig.key, currentPixConfig.name, currentPixConfig.city) || currentPixConfig.key;
      copyTextWithFeedback(btnCopyPixPayload, payload);
    });
  }

  // =========================================================================
  // 9. MERCADO DA COMUNIDADE & MEUS ANÚNCIOS (CENTRAL STANDALONE)
  // =========================================================================
  const viewSniper = document.getElementById('view-sniper');
  const viewMarket = document.getElementById('view-market');
  const viewStats = document.getElementById('view-stats');
  const viewHunts = document.getElementById('view-hunts');
  const viewOferendas = document.getElementById('view-oferendas');

  const tabNavSniper = document.getElementById('tab-nav-sniper');
  const tabNavMarket = document.getElementById('tab-nav-market');
  const tabNavStats = document.getElementById('tab-nav-stats');
  const tabNavHunts = document.getElementById('tab-nav-hunts');
  const tabNavOferendas = document.getElementById('tab-nav-oferendas');

  const subtabMyListings = document.getElementById('subtab-my-listings');
  const subtabCommunityItems = document.getElementById('subtab-community-items');
  const panelMyListings = document.getElementById('panel-my-listings');
  const panelCommunityItems = document.getElementById('panel-community-items');
  const btnRefreshMarket = document.getElementById('btn-refresh-market');

  const lblMyListingsSummary = document.getElementById('lbl-my-listings-summary');
  const containerMyListingsList = document.getElementById('container-my-listings-list');

  const inputSearchMarket = document.getElementById('input-search-market');
  const marketCatButtons = document.querySelectorAll('.market-cat-btn');
  const containerCommunityItemsList = document.getElementById('container-community-items-list');

  const modalItemOffers = document.getElementById('modal-item-offers');
  const offersModalIcon = document.getElementById('offers-modal-icon');
  const offersModalTitle = document.getElementById('offers-modal-title');
  const offersModalSub = document.getElementById('offers-modal-sub');
  const btnOffersGold = document.getElementById('btn-offers-gold');
  const btnOffersGems = document.getElementById('btn-offers-gems');
  const btnQuickCreateRule = document.getElementById('btn-quick-create-rule');
  const containerOffersSellers = document.getElementById('container-offers-sellers');
  const btnCloseOffersModal = document.getElementById('btn-close-offers-modal');
  const btnCloseOffersBottom = document.getElementById('btn-close-offers-bottom');

  // --- NAVEGAÇÃO PRINCIPAL ENTRE AS 5 ABAS ---
  function switchMainView(view) {
    const tabs = [
      { id: 'sniper', btn: tabNavSniper, el: viewSniper, display: 'grid' },
      { id: 'market', btn: tabNavMarket, el: viewMarket, display: 'flex' },
      { id: 'stats', btn: tabNavStats, el: viewStats, display: 'flex' },
      { id: 'hunts', btn: tabNavHunts, el: viewHunts, display: 'flex' },
      { id: 'oferendas', btn: tabNavOferendas, el: viewOferendas, display: 'flex' }
    ];

    tabs.forEach(t => {
      const active = (t.id === view);
      if (t.btn) {
        t.btn.classList.toggle('on', active);
        t.btn.classList.toggle('apagado', !active);
      }
      if (t.el) {
        t.el.style.display = active ? t.display : 'none';
      }
    });

    if (view === 'market') {
      if (!myListings || myListings.length === 0) {
        sendToActiveTab({ action: 'FETCH_MY_LISTINGS' });
      }
      if (!communityCatalog || Object.keys(communityCatalog).length === 0) {
        sendToActiveTab({ action: 'FETCH_COMMUNITY_CATALOG' });
      }
    } else if (view === 'stats') {
      sendToActiveTab({ action: 'FETCH_FARM_STATS' });
      if (typeof updateFarmStatsUI === 'function') updateFarmStatsUI();
    } else if (view === 'hunts') {
      if (typeof initHuntsView === 'function') initHuntsView();
    } else if (view === 'oferendas') {
      if (typeof requestOferendaDepot === 'function') requestOferendaDepot();
    }
  }

  if (tabNavSniper) tabNavSniper.addEventListener('click', () => switchMainView('sniper'));
  if (tabNavMarket) tabNavMarket.addEventListener('click', () => switchMainView('market'));
  if (tabNavStats) tabNavStats.addEventListener('click', () => switchMainView('stats'));
  if (tabNavHunts) tabNavHunts.addEventListener('click', () => switchMainView('hunts'));
  if (tabNavOferendas) tabNavOferendas.addEventListener('click', () => switchMainView('oferendas'));

  // --- SUB-NAVEGAÇÃO DO MERCADO ---
  function switchMarketSubtab(sub) {
    if (sub === 'catalog') {
      if (subtabMyListings) { subtabMyListings.classList.remove('on'); subtabMyListings.classList.add('apagado'); }
      if (subtabCommunityItems) { subtabCommunityItems.classList.add('on'); subtabCommunityItems.classList.remove('apagado'); }
      if (panelMyListings) panelMyListings.style.display = 'none';
      if (panelCommunityItems) panelCommunityItems.style.display = 'flex';
      renderCommunityCatalog();
    } else {
      if (subtabCommunityItems) { subtabCommunityItems.classList.remove('on'); subtabCommunityItems.classList.add('apagado'); }
      if (subtabMyListings) { subtabMyListings.classList.add('on'); subtabMyListings.classList.remove('apagado'); }
      if (panelCommunityItems) panelCommunityItems.style.display = 'none';
      if (panelMyListings) panelMyListings.style.display = 'flex';
      renderMyListings();
    }
  }

  if (subtabMyListings) subtabMyListings.addEventListener('click', () => switchMarketSubtab('my'));
  if (subtabCommunityItems) subtabCommunityItems.addEventListener('click', () => switchMarketSubtab('catalog'));

  if (btnRefreshMarket) {
    btnRefreshMarket.addEventListener('click', () => {
      const origText = btnRefreshMarket.textContent;
      btnRefreshMarket.textContent = '🔄 Atualizando...';
      btnRefreshMarket.disabled = true;

      sendToActiveTab({ action: 'FETCH_MY_LISTINGS' });
      sendToActiveTab({ action: 'FETCH_COMMUNITY_CATALOG' });

      setTimeout(() => {
        btnRefreshMarket.textContent = origText;
        btnRefreshMarket.disabled = false;
      }, 1200);
    });
  }

  // --- MEUS ANÚNCIOS À VENDA ---
  function renderMyListings() {
    if (!containerMyListingsList) return;

    if (lblMyListingsSummary) {
      const count = myListings ? myListings.length : 0;
      lblMyListingsSummary.textContent = `${count} anúncio${count === 1 ? '' : 's'} ativo${count === 1 ? '' : 's'}`;
    }

    if (!myListings || myListings.length === 0) {
      containerMyListingsList.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);">
          <p style="font-size: 11px; margin: 0 0 6px 0;">Você não possui nenhum anúncio ativo no mercado da comunidade.</p>
          <span style="font-size: 9.5px; opacity: 0.75;">Quando colocar itens ou Pokémons à venda no jogo, eles aparecerão aqui organizados com opção de cancelamento imediato.</span>
        </div>
      `;
      return;
    }

    containerMyListingsList.innerHTML = '';
    myListings.forEach(an => {
      const card = document.createElement('div');
      card.className = 'my-listing-card';

      // Identificação inteligente: Pokémon vs Item vs Caixa Especial vs Diamante
      let itemName = 'Item Desconhecido';
      let itemIcon = 'icons/ouro.png';
      let badgeExtra = '';
      let categorySub = '';

      const f = an.ficha || an.poke || an.item || {};
      const isPoke = an.tipo === 'pokemon' || Boolean(f.speciesId || f.pokemonId || f.pId || f.level !== undefined || f.ivTotal || f.qualidade || f.quality);

      if (isPoke) {
        itemName = f.nome || f.name || an.nome || 'Pokémon';
        const isShiny = Boolean(f.shiny);
        itemIcon = (typeof window.getRotomPokemonSprite === 'function')
          ? window.getRotomPokemonSprite(f, isShiny)
          : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${isShiny ? 'shiny/' : ''}${f.speciesId || f.pokemonId || 1}.png`;

        if (isShiny) badgeExtra += '<span class="shiny-tag" style="font-size: 8px; padding: 1px 4px; background: #e6b800; color: #000; font-weight: 900; border-radius: 0px;">★ SHINY</span> ';
        if (f.level) categorySub += `Nv. ${f.level} `;

        // Atributos Oficiais do PokéIdle: P, Q, IV e N
        if (typeof window.getRotomPokemonAttributesHtml === 'function') {
          badgeExtra += window.getRotomPokemonAttributesHtml(f, { compacto: true });
        } else {
          if (f.potencia && f.potencia >= 5) badgeExtra += '<span class="p5-tag" style="font-size: 8px; padding: 1px 4px; background: #9b5de5; color: #fff; font-weight: 900; border-radius: 0px;">P5</span> ';
          else if (f.potencia) badgeExtra += `<span style="font-size: 8px; color: var(--rx-luz); font-weight: 700;">P${f.potencia}</span> `;
          if (f.nota) categorySub += `· Nota ${Number(f.nota).toFixed(1)}`;
        }
      } else if (an.tipo === 'diamante') {
        itemName = 'Diamantes';
        itemIcon = 'https://pokeidle.io/img/moeda-diamante.png';
        categorySub = 'Mercado de Câmbio';
      } else {
        // Item ou Caixa
        const itemId = Number(an.itemId || f.id || 0);

        if (f.caixaTipo || f.caixaId) {
          itemName = f.caixaTipo === 'founder' ? 'Founder Box' : (f.caixaTipo === 'cofounder' ? 'Co-Founder Box' : (f.nome || 'Box Especial'));
          itemIcon = f.caixaTipo === 'founder' ? 'https://pokeidle.io/img/itens/caixa-fundador.png' : 'https://pokeidle.io/img/itens/caixa-cofundador.png';
          categorySub = 'Caixa Especial';
          if (f.serie) badgeExtra += `<span style="font-size: 8px; color: var(--ouro); font-weight: 700;">#${f.serie}</span>`;
        } else {
          let rotomIt = null;
          if (typeof window.getRotomItem === 'function') {
            rotomIt = window.getRotomItem(itemId) || window.getRotomItem(f.nome || an.itemNome);
          }
          if (rotomIt) {
            itemName = rotomIt.name;
            itemIcon = typeof window.getItemIconUrl === 'function' ? window.getItemIconUrl(rotomIt) : (rotomIt.icon || 'icons/ouro.png');
            categorySub = rotomIt.categoryLabel || rotomIt.category || 'Item';
            if (rotomIt.type) badgeExtra += `<span style="font-size: 7.5px; padding: 1px 4px; background: rgba(255,255,255,0.15); border-radius: 0px;">${rotomIt.type}</span>`;
          } else {
            itemName = f.nome || an.itemNome || `Item #${itemId || '?'}`;
            itemIcon = typeof window.getItemIconUrl === 'function' ? window.getItemIconUrl(itemId) : 'icons/ouro.png';
            categorySub = 'Item';
          }
        }
      }

      const isGemas = (an.moeda === 'orb' || an.moeda === 'gems' || an.moeda === 'diamonds');
      const moedaIcon = isGemas ? 'icons/orbe.png' : 'icons/ouro.png';
      const moedaNome = isGemas ? 'Gemas' : 'GP';
      const precoUnit = Number(an.preco || an.unitPrice || 0);
      const qtd = Number(an.qtd || an.quantidade || 1);
      const precoTotal = precoUnit * qtd;

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="vao" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 2px; border-radius: 0px;">
            <img src="${itemIcon}" style="max-width: 40px; max-height: 40px; object-fit: contain;" alt="${itemName}">
          </div>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
            <span style="color: #fff; font-weight: 700; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemName}">${itemName}</span>
            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
              ${categorySub ? `<span style="font-size: 8px; color: var(--sobre-mad-dim);">${categorySub}</span>` : ''}
              ${badgeExtra}
            </div>
            <span style="font-size: 8.5px; color: var(--sobre-mad);">Qtd: <b style="color: #fff;">${qtd.toLocaleString()}</b> un</span>
          </div>
        </div>

        <div class="vao" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 0px;">
          <div style="display: flex; flex-direction: column; gap: 1px;">
            <span style="font-size: 8px; color: var(--vao-dim); text-transform: uppercase;">Preço Unit / Total:</span>
            <div style="display: flex; align-items: center; gap: 4px; font-size: 9.5px; color: ${isGemas ? 'var(--gemas)' : 'var(--coins)'}; font-variant-numeric: tabular-nums;">
              <img src="${moedaIcon}" style="width: 12px; height: 12px; object-fit: contain;">
              <b>${precoUnit.toLocaleString()}</b> ${moedaNome}
              <span style="color: var(--vao-dim); font-size: 8px;">(Total: ${precoTotal.toLocaleString()})</span>
            </div>
          </div>
          <button type="button" class="btn btn-cancelar btn-mini btn-cancel-listing" data-id="${an.id}" title="Cancelar anúncio e devolver para o inventário">
            Cancelar
          </button>
        </div>
      `;

      const btnCancel = card.querySelector('.btn-cancel-listing');
      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          const anId = btnCancel.getAttribute('data-id');
          if (!anId) return;

          btnCancel.textContent = 'Cancelando...';
          btnCancel.disabled = true;
          sendToActiveTab({ action: 'CANCEL_MARKET_OFFER', id: anId });
        });
      }

      containerMyListingsList.appendChild(card);
    });
  }

  // --- CATÁLOGO DA COMUNIDADE ---
  if (marketCatButtons) {
    marketCatButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        marketCatButtons.forEach(b => {
          b.classList.remove('on');
          b.classList.add('apagado');
        });
        btn.classList.add('on');
        btn.classList.remove('apagado');
        currentMarketFilterCat = btn.getAttribute('data-cat') || 'all';
        renderCommunityCatalog();
      });
    });
  }

  if (inputSearchMarket) {
    inputSearchMarket.addEventListener('input', () => {
      renderCommunityCatalog();
    });
  }

  function renderCommunityCatalog() {
    if (!containerCommunityItemsList) return;

    let allItems = [];
    if (typeof window.getAllRotomItems === 'function') {
      allItems = window.getAllRotomItems();
    } else if (window.POKEIDLE_ITEMS_DB && Array.isArray(window.POKEIDLE_ITEMS_DB)) {
      allItems = window.POKEIDLE_ITEMS_DB;
    } else if (window.ROTOM_ITEMS_DB && Array.isArray(window.ROTOM_ITEMS_DB)) {
      allItems = window.ROTOM_ITEMS_DB;
    }

    const filterText = (inputSearchMarket ? inputSearchMarket.value : '').toLowerCase().trim();

    // Filtra itens conforme categoria e busca
    let filtered = allItems.filter(it => {
      // Filtro de Categoria
      if (currentMarketFilterCat !== 'all') {
        const cat = (it.category || '').toLowerCase();
        if (currentMarketFilterCat === 'stone') {
          if (cat !== 'stone' && cat !== 'evolution_stone') return false;
        } else if (currentMarketFilterCat === 'tm') {
          if (cat !== 'tm') return false;
        } else if (currentMarketFilterCat === 'rare_loot') {
          if (cat !== 'rare_loot' && cat !== 'loot') return false;
        } else if (currentMarketFilterCat === 'box') {
          if (cat !== 'box') return false;
        } else if (currentMarketFilterCat === 'beast') {
          if (cat !== 'beast' && cat !== 'ball') return false;
        } else if (currentMarketFilterCat === 'casa') {
          if (cat !== 'casa' && cat !== 'house') return false;
        } else if (currentMarketFilterCat === 'diamante') {
          if (cat !== 'diamante' && it.id !== 999999) return false;
        } else if (currentMarketFilterCat === 'bicicleta') {
          if (cat !== 'bicicleta' && cat !== 'bike') return false;
        }
      }

      // Filtro de Texto
      if (filterText) {
        const nameMatch = [it.name || ''].concat(it.aliases || []).join('\n').toLowerCase().includes(filterText);
        const catMatch = (it.categoryLabel || it.category || '').toLowerCase().includes(filterText);
        const typeMatch = (it.type || '').toLowerCase().includes(filterText);
        if (!nameMatch && !catMatch && !typeMatch) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      containerCommunityItemsList.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim);">
          Nenhum item encontrado com os filtros selecionados.
        </div>
      `;
      return;
    }

    containerCommunityItemsList.innerHTML = '';

    // Se estiver em "Todas" e sem filtro de texto, exibe com seções visuais magníficas
    const SECTIONS_ORDER = [
      { id: 'stone', title: '💎 Pedras de Evolução & Shiny Stones' },
      { id: 'tm', title: '💿 TMs & Discos de Ataque' },
      { id: 'rare_loot', title: '🏆 Loots Raros & Fragmentos de Boss' },
      { id: 'box', title: '🎁 Boxes Especiais (Founder & Co-Founder)' },
      { id: 'beast', title: '🔮 Pokébolas Especiais (Beast Ball)' },
      { id: 'casa', title: '🏡 Casas' },
      { id: 'bicicleta', title: '🚲 Bicicletas' }
    ];

    if (currentMarketFilterCat === 'all' && !filterText) {
      SECTIONS_ORDER.forEach(sec => {
        const sectionItems = filtered.filter(it => it.category === sec.id);
        if (sectionItems.length > 0) {
          const header = document.createElement('div');
          header.className = 'catalog-section-title';
          header.innerHTML = `<span>${sec.title}</span><span style="font-size: 8.5px; opacity: 0.75;">${sectionItems.length} itens</span>`;
          containerCommunityItemsList.appendChild(header);

          sectionItems.forEach(it => {
            containerCommunityItemsList.appendChild(createCommunityItemCard(it));
          });
        }
      });
    } else {
      // Ordenação: Itens que possuem dados no communityCatalog vêm primeiro
      filtered.sort((a, b) => {
        const dataA = communityCatalog[a.id];
        const dataB = communityCatalog[b.id];
        const hasA = dataA && (dataA.minGold || dataA.minOrb || dataA.total || dataA.anuncios);
        const hasB = dataB && (dataB.minGold || dataB.minOrb || dataB.total || dataB.anuncios);
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      filtered.forEach(it => {
        containerCommunityItemsList.appendChild(createCommunityItemCard(it));
      });
    }
  }

  function createCommunityItemCard(it) {
    const card = document.createElement('div');
    card.className = 'community-item-card';

    const iconUrl = typeof window.getItemIconUrl === 'function'
      ? window.getItemIconUrl(it)
      : (it.icon || 'icons/ouro.png');

    const data = communityCatalog[it.id] || {};
    const minGold = Number(data.minGold || data.gold || 0);
    const minOrb = Number(data.minOrb || data.gems || data.orb || 0);
    const totalOffers = Number(data.anuncios || data.total || data.count || 0);

    const goldDisplay = minGold > 0 ? `${minGold.toLocaleString()} GP` : '—';
    const gemsDisplay = minOrb > 0 ? `${minOrb.toLocaleString()} Gemas` : '—';

    let typeTag = '';
    if (it.type) {
      typeTag = `<span style="font-size: 7.5px; padding: 1px 5px; background: rgba(0,0,0,0.35); border: 1px solid var(--mad-linha); color: var(--ouro); font-weight: 700;">${it.type}</span>`;
    }

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="vao" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 2px;">
          <img src="${iconUrl}" style="max-width: 34px; max-height: 34px; object-fit: contain;" alt="${it.name}">
        </div>
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
          <span style="color: #fff; font-weight: 700; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${it.name}">${it.name}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 8px; color: var(--sobre-mad-dim);">${it.categoryLabel || it.category || 'Item'}</span>
            ${typeTag}
          </div>
        </div>
      </div>

      <div class="vao" style="padding: 5px 8px; display: flex; flex-direction: column; gap: 3px; border-radius: 0px;">
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px;">
          <span style="color: var(--vao-dim); display: flex; align-items: center; gap: 3px;">
            <img src="icons/ouro.png" style="width: 11px; height: 11px; object-fit: contain;"> Menor em Coins:
          </span>
          <b style="color: ${minGold > 0 ? 'var(--coins)' : 'var(--vao-dim)'}; font-variant-numeric: tabular-nums;">${goldDisplay}</b>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px;">
          <span style="color: var(--vao-dim); display: flex; align-items: center; gap: 3px;">
            <img src="icons/orbe.png" style="width: 11px; height: 11px; object-fit: contain;"> Menor em Gemas:
          </span>
          <b style="color: ${minOrb > 0 ? 'var(--gemas)' : 'var(--vao-dim)'}; font-variant-numeric: tabular-nums;">${gemsDisplay}</b>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; padding-top: 2px;">
        <span style="font-size: 8.5px; ${totalOffers > 0 ? 'color: var(--verde); font-weight: 700;' : 'color: var(--sobre-mad-dim);'}">
          ${totalOffers > 0 ? `🟢 ${totalOffers} oferta${totalOffers > 1 ? 's' : ''}` : '⚪ Sem ofertas'}
        </span>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="btn btn-roxo btn-mini btn-open-item-offers" data-id="${it.id}" style="font-size: 8px; padding: 0 6px; height: 20px;" title="Ver ofertas deste item na comunidade">
            Ver Ofertas
          </button>
          <button type="button" class="btn apagado btn-mini btn-quick-sniper-rule" data-id="${it.id}" style="font-size: 8px; padding: 0 6px; height: 20px;" title="Criar regra de sniper no painel">
            + Sniper
          </button>
        </div>
      </div>
    `;

    const btnOffers = card.querySelector('.btn-open-item-offers');
    if (btnOffers) {
      btnOffers.addEventListener('click', (e) => {
        e.stopPropagation();
        openItemOffersModal(it);
      });
    }

    const btnQuick = card.querySelector('.btn-quick-sniper-rule');
    if (btnQuick) {
      btnQuick.addEventListener('click', (e) => {
        e.stopPropagation();
        configureSniperRuleFromItem(it, minGold, minOrb);
      });
    }

    return card;
  }

  // --- CONFIGURAR REGRA DE SNIPER A PARTIR DO ITEM DO CATÁLOGO ---
  function configureSniperRuleFromItem(it, minGold, minOrb) {
    if (!it) return;

    // Volta para o Painel Sniper
    switchMainView('sniper');

    // Seleciona o item no form
    if (typeof selectItemForNewRule === 'function') {
      selectItemForNewRule(it);
    } else {
      selectedItemObj = it;
      if (lblSelectedName) lblSelectedName.textContent = it.name;
      if (lblSelectedCat) lblSelectedCat.textContent = it.categoryLabel || it.category || 'item';
      if (imgSelectedItem) {
        imgSelectedItem.src = typeof window.getItemIconUrl === 'function' ? window.getItemIconUrl(it) : (it.icon || '');
      }
      if (boxSelectedPreview) boxSelectedPreview.style.display = 'flex';
      if (inputSearchItem) inputSearchItem.value = it.name;
    }

    // Preenche com o menor preço do mercado se disponível
    if (inputRuleCoins && minGold > 0) inputRuleCoins.value = minGold;
    if (inputRuleGemas && minOrb > 0) inputRuleGemas.value = minOrb;

    // Rola até o topo e foca o campo de quantidade
    if (inputRuleQty) inputRuleQty.focus();
  }

  // --- MODAL DE OFERTAS DO ITEM ESPECÍFICO ---
  function openItemOffersModal(it) {
    if (!it) return;
    if (it.id === 999999 || it.category === 'diamante') {
      openDiamantesModal('comprar');
      return;
    }
    if (!modalItemOffers) return;
    selectedMarketItem = it;

    if (offersModalIcon) {
      offersModalIcon.src = typeof window.getItemIconUrl === 'function' ? window.getItemIconUrl(it) : (it.icon || 'icons/ouro.png');
    }
    if (offersModalTitle) offersModalTitle.textContent = it.name;
    if (offersModalSub) offersModalSub.textContent = `Categoria: ${it.categoryLabel || it.category || 'Item'}`;

    currentOffersMoeda = 'gold';
    if (btnOffersGold) { btnOffersGold.classList.add('on'); btnOffersGold.classList.remove('apagado'); }
    if (btnOffersGems) { btnOffersGems.classList.remove('on'); btnOffersGems.classList.add('apagado'); }

    modalItemOffers.classList.add('open');

    // Busca ofertas de Coins de imediato
    fetchItemOffers(it.id, 'gold');
  }

  function closeItemOffersModal() {
    if (modalItemOffers) modalItemOffers.classList.remove('open');
  }

  if (btnCloseOffersModal) btnCloseOffersModal.addEventListener('click', closeItemOffersModal);
  if (btnCloseOffersBottom) btnCloseOffersBottom.addEventListener('click', closeItemOffersModal);

  if (modalItemOffers) {
    modalItemOffers.addEventListener('click', (e) => {
      if (e.target === modalItemOffers) closeItemOffersModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalItemOffers && modalItemOffers.classList.contains('open')) {
      closeItemOffersModal();
    }
  });

  if (btnOffersGold) {
    btnOffersGold.addEventListener('click', () => {
      currentOffersMoeda = 'gold';
      btnOffersGold.classList.add('on');
      btnOffersGold.classList.remove('apagado');
      if (btnOffersGems) {
        btnOffersGems.classList.remove('on');
        btnOffersGems.classList.add('apagado');
      }
      if (selectedMarketItem) fetchItemOffers(selectedMarketItem.id, 'gold');
    });
  }

  if (btnOffersGems) {
    btnOffersGems.addEventListener('click', () => {
      currentOffersMoeda = 'orb';
      btnOffersGems.classList.add('on');
      btnOffersGems.classList.remove('apagado');
      if (btnOffersGold) {
        btnOffersGold.classList.remove('on');
        btnOffersGold.classList.add('apagado');
      }
      if (selectedMarketItem) fetchItemOffers(selectedMarketItem.id, 'orb');
    });
  }

  if (btnQuickCreateRule) {
    btnQuickCreateRule.addEventListener('click', () => {
      if (!selectedMarketItem) return;
      closeItemOffersModal();
      configureSniperRuleFromItem(selectedMarketItem, 0, 0);
    });
  }

  function fetchItemOffers(itemId, moeda) {
    if (!containerOffersSellers) return;
    const cleanMoeda = (moeda === 'gems' || moeda === 'orb') ? 'orb' : 'gold';
    currentOffersMoeda = cleanMoeda;
    const moedaLabel = cleanMoeda === 'orb' ? 'Gemas' : 'Coins (GP)';

    containerOffersSellers.innerHTML = `<div style="text-align: center; padding: 25px; color: var(--vao-dim); font-size: 10px;">Buscando ofertas em ${moedaLabel}...</div>`;
    sendToActiveTab({ action: 'FETCH_ITEM_OFFERS', itemId: Number(itemId), moeda: cleanMoeda });
  }

  function renderItemOffersModal() {
    if (!containerOffersSellers || !modalItemOffers || !modalItemOffers.classList.contains('open')) return;
    if (!selectedMarketItem) return;

    if (!currentItemOffersData) {
      containerOffersSellers.innerHTML = '<div style="text-align: center; padding: 25px; color: var(--vao-dim); font-size: 10px;">Aguardando ofertas do mercado...</div>';
      return;
    }

    // Se as ofertas forem de outro item, aguarda o pacote do item atual
    if (currentItemOffersData.itemId && Number(currentItemOffersData.itemId) !== Number(selectedMarketItem.id)) {
      return;
    }

    const offers = currentItemOffersData.linhas || currentItemOffersData.offers || [];
    const isGemas = (currentOffersMoeda === 'gems' || currentOffersMoeda === 'orb');
    const moedaIcon = isGemas ? 'icons/orbe.png' : 'icons/ouro.png';
    const moedaLabel = isGemas ? 'Gemas' : 'GP';

    if (!Array.isArray(offers) || offers.length === 0) {
      containerOffersSellers.innerHTML = `
        <div style="text-align: center; padding: 25px; color: var(--vao-dim); font-size: 10px;">
          Nenhum vendedor ofertando este item em ${moedaLabel} no momento.
        </div>
      `;
      return;
    }

    containerOffersSellers.innerHTML = '';
    offers.forEach(off => {
      const row = document.createElement('div');
      row.className = 'vao';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '6px 8px';
      row.style.borderRadius = '0px';

      const vendedor = off.vendedor || off.seller || 'Vendedor Anônimo';
      const qtd = Number(off.qtd || off.quantidade || 1);
      const preco = Number(off.preco || off.price || 0);
      const precoTotal = preco * qtd;

      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 10px; font-weight: 700; color: #fff;">${vendedor}</span>
            <span style="font-size: 8px; color: var(--sobre-mad-dim);">Qtd: <b style="color: #fff;">${qtd.toLocaleString()}</b> un</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 9.5px; color: ${isGemas ? 'var(--gemas)' : 'var(--coins)'}; font-variant-numeric: tabular-nums;">
            <img src="${moedaIcon}" style="width: 12px; height: 12px; object-fit: contain;">
            <b>${preco.toLocaleString()}</b> ${moedaLabel} / un
            ${qtd > 1 ? `<span style="font-size: 8px; color: var(--vao-dim);">(Total: ${precoTotal.toLocaleString()})</span>` : ''}
          </div>
        </div>

        <button type="button" class="btn btn-roxo btn-mini btn-buy-offer" data-id="${off.id}" style="font-size: 8.5px; height: 24px; padding: 0 8px;">
          Comprar
        </button>
      `;

      const btnBuy = row.querySelector('.btn-buy-offer');
      if (btnBuy) {
        btnBuy.addEventListener('click', () => {
          btnBuy.textContent = 'Comprando...';
          btnBuy.disabled = true;

          sendToActiveTab({
            action: 'BUY_MANUAL_OFFER',
            offerId: off.id,
            qty: qtd,
            price: preco,
            moeda: currentOffersMoeda === 'orb' ? 'orb' : 'gold',
            targetName: selectedMarketItem ? selectedMarketItem.name : '',
            seller: vendedor
          });

          setTimeout(() => {
            btnBuy.textContent = 'Enviado!';
            if (selectedMarketItem) {
              fetchItemOffers(selectedMarketItem.id, currentOffersMoeda);
            }
          }, 1000);
        });
      }

      containerOffersSellers.appendChild(row);
    });
  }

  // =========================================================================
  // 10. MODAL DE COMPRA & VENDA DE DIAMANTES
  // =========================================================================
  let cachedDiamondOffers = [];
  let currentDiamondFilter = 'all';

  function openDiamantesModal(defaultTab) {
    if (!modalDiamantes) return;
    modalDiamantes.classList.add('open');
    switchDiamanteTab(defaultTab || 'comprar');

    // Recupera dados já existentes no storage para renderização imediata
    chrome.storage.local.get(['rotom_diamond_offers'], (res) => {
      if (res.rotom_diamond_offers && Array.isArray(res.rotom_diamond_offers.offers) && res.rotom_diamond_offers.offers.length > 0) {
        renderDiamondOffers(res.rotom_diamond_offers.offers);
      } else if (containerDiamantesOffers) {
        containerDiamantesOffers.innerHTML = `
          <div style="text-align: center; padding: 30px 10px; color: var(--sobre-mad-dim); font-size: 10.5px;">
            Buscando ofertas de Diamantes no mercado...
          </div>
        `;
      }
    });

    fetchDiamondMarketOffers();

    // Fallback de segurança: se após 3 segundos não receber resposta nova, encerra o loading
    setTimeout(() => {
      chrome.storage.local.get(['rotom_diamond_offers'], (res) => {
        const offs = res.rotom_diamond_offers?.offers;
        if (Array.isArray(offs)) {
          renderDiamondOffers(offs);
        } else {
          renderDiamondOffers([]);
        }
      });
    }, 3200);
  }

  function closeDiamantesModal() {
    if (!modalDiamantes) return;
    modalDiamantes.classList.remove('open');
  }

  function switchDiamanteTab(tab) {
    if (tab === 'vender') {
      if (tabDiamanteComprar) { tabDiamanteComprar.classList.remove('on'); tabDiamanteComprar.classList.add('apagado'); }
      if (tabDiamanteRecarga) { tabDiamanteRecarga.classList.remove('on'); tabDiamanteRecarga.classList.add('apagado'); }
      if (tabDiamanteVender) { tabDiamanteVender.classList.add('on'); tabDiamanteVender.classList.remove('apagado'); }
      if (panelDiamanteComprar) panelDiamanteComprar.style.display = 'none';
      if (panelDiamanteRecarga) panelDiamanteRecarga.style.display = 'none';
      if (panelDiamanteVender) panelDiamanteVender.style.display = 'flex';
      updateSellDiamantesResumo();
    } else if (tab === 'recarga') {
      if (tabDiamanteComprar) { tabDiamanteComprar.classList.remove('on'); tabDiamanteComprar.classList.add('apagado'); }
      if (tabDiamanteVender) { tabDiamanteVender.classList.remove('on'); tabDiamanteVender.classList.add('apagado'); }
      if (tabDiamanteRecarga) { tabDiamanteRecarga.classList.add('on'); tabDiamanteRecarga.classList.remove('apagado'); }
      if (panelDiamanteComprar) panelDiamanteComprar.style.display = 'none';
      if (panelDiamanteVender) panelDiamanteVender.style.display = 'none';
      if (panelDiamanteRecarga) panelDiamanteRecarga.style.display = 'flex';
    } else {
      if (tabDiamanteVender) { tabDiamanteVender.classList.remove('on'); tabDiamanteVender.classList.add('apagado'); }
      if (tabDiamanteRecarga) { tabDiamanteRecarga.classList.remove('on'); tabDiamanteRecarga.classList.add('apagado'); }
      if (tabDiamanteComprar) { tabDiamanteComprar.classList.add('on'); tabDiamanteComprar.classList.remove('apagado'); }
      if (panelDiamanteVender) panelDiamanteVender.style.display = 'none';
      if (panelDiamanteRecarga) panelDiamanteRecarga.style.display = 'none';
      if (panelDiamanteComprar) panelDiamanteComprar.style.display = 'flex';
    }
  }

  function fetchDiamondMarketOffers() {
    if (containerDiamantesOffers && cachedDiamondOffers.length === 0) {
      containerDiamantesOffers.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--sobre-mad-dim); font-size: 10.5px;">
          Buscando ofertas de Diamantes no mercado...
        </div>
      `;
    }
    sendToActiveTab({ action: 'FETCH_DIAMOND_OFFERS' });
  }

  function renderDiamondOffers(offers) {
    if (!containerDiamantesOffers) return;
    if (Array.isArray(offers)) {
      cachedDiamondOffers = offers;
    }

    let list = cachedDiamondOffers.slice();
    if (currentDiamondFilter === 'gold') {
      list = list.filter(o => o.moeda === 'gold');
    } else if (currentDiamondFilter === 'orb') {
      list = list.filter(o => o.moeda === 'orb' || o.moeda === 'gems');
    }

    if (!list || list.length === 0) {
      const msgFilter = currentDiamondFilter === 'gold' ? ' em Coins (GP)' : (currentDiamondFilter === 'orb' ? ' em Gemas' : '');
      containerDiamantesOffers.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--sobre-mad-dim); font-size: 10.5px;">
          Nenhum jogador anunciando Diamantes${msgFilter} no momento.<br>
          <span style="font-size: 9px; opacity: 0.8;">Use a aba "Anunciar à Venda" para criar uma oferta pública de Diamantes.</span>
        </div>
      `;
      return;
    }

    containerDiamantesOffers.innerHTML = '';
    list.forEach(off => {
      const row = document.createElement('div');
      row.className = 'vao';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 10px';
      row.style.borderRadius = '0px';

      const isGemas = off.moeda === 'orb' || off.moeda === 'gems';
      const moedaNome = isGemas ? 'Gemas' : 'GP';
      const moedaIcon = isGemas ? 'icons/orbe.png' : 'icons/ouro.png';
      const precoUnit = Number(off.preco || off.unitPrice || 0);
      const qtd = Number(off.qtd || off.quantidade || 1);
      const precoTotal = precoUnit * qtd;

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="https://pokeidle.io/img/moeda-diamante.png" style="width: 22px; height: 22px; object-fit: contain;">
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 11px; color: #fff; font-weight: 700;">${qtd.toLocaleString()} Diamantes</span>
            <span style="font-size: 8.5px; color: var(--sobre-mad-dim);">Vendedor: <b>${off.vendedor || 'Comunidade'}</b></span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="text-align: right;">
            <div style="font-size: 10.5px; color: ${isGemas ? 'var(--gemas)' : 'var(--coins)'}; font-weight: 800; display: flex; align-items: center; gap: 3px; justify-content: flex-end;">
              <img src="${moedaIcon}" style="width: 12px; height: 12px; object-fit: contain;">
              ${precoUnit.toLocaleString()} ${moedaNome} / un
            </div>
            <span style="font-size: 8.5px; color: var(--vao-dim);">Total: ${precoTotal.toLocaleString()} ${moedaNome}</span>
          </div>

          <button type="button" class="btn btn-ouro btn-mini btn-buy-diamond-offer" style="border-radius: 0px; padding: 4px 10px;" data-id="${off.id}">
            Comprar
          </button>
        </div>
      `;

      const btnBuy = row.querySelector('.btn-buy-diamond-offer');
      if (btnBuy) {
        btnBuy.addEventListener('click', () => {
          btnBuy.textContent = 'Enviando...';
          btnBuy.disabled = true;
          sendToActiveTab({
            action: 'BUY_MANUAL_OFFER',
            offerId: off.id,
            qty: qtd,
            price: precoUnit,
            moeda: off.moeda || 'gold',
            targetName: `${qtd} Diamantes`,
            seller: off.vendedor || ''
          });
          setTimeout(() => {
            btnBuy.textContent = 'Ordem Enviada!';
            fetchDiamondMarketOffers();
          }, 1000);
        });
      }

      containerDiamantesOffers.appendChild(row);
    });
  }

  function setDiamondFilter(filter) {
    currentDiamondFilter = filter;
    if (btnFilterDiamondsAll) {
      btnFilterDiamondsAll.classList.toggle('on', filter === 'all');
      btnFilterDiamondsAll.classList.toggle('apagado', filter !== 'all');
    }
    if (btnFilterDiamondsGold) {
      btnFilterDiamondsGold.classList.toggle('on', filter === 'gold');
      btnFilterDiamondsGold.classList.toggle('apagado', filter !== 'gold');
    }
    if (btnFilterDiamondsGems) {
      btnFilterDiamondsGems.classList.toggle('on', filter === 'orb');
      btnFilterDiamondsGems.classList.toggle('apagado', filter !== 'orb');
    }
    renderDiamondOffers(cachedDiamondOffers);
  }

  if (btnFilterDiamondsAll) btnFilterDiamondsAll.addEventListener('click', () => setDiamondFilter('all'));
  if (btnFilterDiamondsGold) btnFilterDiamondsGold.addEventListener('click', () => setDiamondFilter('gold'));
  if (btnFilterDiamondsGems) btnFilterDiamondsGems.addEventListener('click', () => setDiamondFilter('orb'));

  function updateSellDiamantesResumo() {
    if (!boxSellDiamantesResumo) return;
    const qtd = Number(inputSellDiamantesQtd?.value) || 0;
    const preco = Number(inputSellDiamantesPreco?.value) || 0;
    const moeda = selectSellDiamantesMoeda?.value === 'orb' ? 'Gemas' : 'GP';
    const total = qtd * preco;
    boxSellDiamantesResumo.innerHTML = `Total a receber por ${qtd.toLocaleString()} Diamantes: <b style="color: #fff;">${total.toLocaleString()} ${moeda}</b>`;
  }

  if (inputSellDiamantesQtd) inputSellDiamantesQtd.addEventListener('input', updateSellDiamantesResumo);
  if (inputSellDiamantesPreco) inputSellDiamantesPreco.addEventListener('input', updateSellDiamantesResumo);
  if (selectSellDiamantesMoeda) selectSellDiamantesMoeda.addEventListener('change', updateSellDiamantesResumo);

  if (btnOpenDiamantesModal) btnOpenDiamantesModal.addEventListener('click', () => openDiamantesModal('comprar'));
  if (btnCloseDiamantesModal) btnCloseDiamantesModal.addEventListener('click', closeDiamantesModal);
  if (btnCloseDiamantesModalBottom) btnCloseDiamantesModalBottom.addEventListener('click', closeDiamantesModal);

  if (tabDiamanteComprar) tabDiamanteComprar.addEventListener('click', () => switchDiamanteTab('comprar'));
  if (tabDiamanteVender) tabDiamanteVender.addEventListener('click', () => switchDiamanteTab('vender'));
  if (tabDiamanteRecarga) tabDiamanteRecarga.addEventListener('click', () => switchDiamanteTab('recarga'));
  if (btnRefreshDiamantesMarket) btnRefreshDiamantesMarket.addEventListener('click', fetchDiamondMarketOffers);

  if (btnSubmitSellDiamantes) {
    btnSubmitSellDiamantes.addEventListener('click', () => {
      const qtd = Number(inputSellDiamantesQtd?.value) || 0;
      const preco = Number(inputSellDiamantesPreco?.value) || 0;
      const moeda = selectSellDiamantesMoeda?.value === 'orb' ? 'orb' : 'gold';

      if (qtd <= 0) {
        alert('Informe uma quantidade válida de Diamantes.');
        return;
      }
      if (preco <= 0) {
        alert('Informe um preço unitário válido.');
        return;
      }

      btnSubmitSellDiamantes.textContent = 'Publicando no Mercado...';
      btnSubmitSellDiamantes.disabled = true;

      sendToActiveTab({
        action: 'CREATE_MARKET_LISTING',
        tipo: 'diamante',
        qtd: qtd,
        preco: preco,
        moeda: moeda
      });

      setTimeout(() => {
        btnSubmitSellDiamantes.textContent = '📢 Publicar Anúncio de Diamantes';
        btnSubmitSellDiamantes.disabled = false;
        alert(`Anúncio de ${qtd} Diamantes por ${preco.toLocaleString()} ${moeda === 'orb' ? 'Gemas' : 'GP'} cada enviado ao mercado com sucesso!`);
        closeDiamantesModal();
        sendToActiveTab({ action: 'FETCH_MY_LISTINGS' });
      }, 1000);
    });
  }

  // =========================================================================
  // 10. ESTATÍSTICAS DE FARM AO VIVO & TAXAS (XP/H, GP/H, KILLS/MIN)
  // =========================================================================
  const statsSessionTimer = document.getElementById('stats-session-timer');
  const btnResetFarmStats = document.getElementById('btn-reset-farm-stats');

  const statKillsTotal = document.getElementById('stat-kills-total');
  const statKillsRate = document.getElementById('stat-kills-rate');
  const statCatchesTotal = document.getElementById('stat-catches-total');
  const statCatchesRate = document.getElementById('stat-catches-rate');
  const statTrainerXp = document.getElementById('stat-trainer-xp');
  const statTrainerXpRate = document.getElementById('stat-trainer-xp-rate');
  const statPokeXp = document.getElementById('stat-poke-xp');
  const statPokeXpRate = document.getElementById('stat-poke-xp-rate');
  const statGoldTotal = document.getElementById('stat-gold-total');
  const statGoldRate = document.getElementById('stat-gold-rate');
  const statShiniesTotal = document.getElementById('stat-shinies-total');
  const statShiniesSub = document.getElementById('stat-shinies-sub');

  const statDropsCount = document.getElementById('stat-drops-count');
  const containerFarmDrops = document.getElementById('container-farm-drops');

  // Elementos do Dashboard de Rendimento por Hunt
  const statHuntsCount = document.getElementById('stat-hunts-count');
  const btnResetHuntsStats = document.getElementById('btn-reset-hunts-stats');
  const activeHuntName = document.getElementById('active-hunt-name');
  const activeHuntTierBadge = document.getElementById('active-hunt-tier-badge');
  const activeHuntTimer = document.getElementById('active-hunt-timer');
  const activeHuntLiveXp = document.getElementById('active-hunt-live-xp');
  const activeHuntLiveGp = document.getElementById('active-hunt-live-gp');
  const activeHuntLiveCatches = document.getElementById('active-hunt-live-catches');
  const activeHuntLiveShinies = document.getElementById('active-hunt-live-shinies');
  const containerHuntsDashboard = document.getElementById('container-hunts-dashboard');
  const huntSortBtns = document.querySelectorAll('.hunt-sort-btn');

  let currentHuntSort = 'xp';

  let farmSessionData = {
    startTime: Date.now(),
    kills: 0,
    catches: 0,
    captures: 0,
    ballAttempts: 0,
    trainerXp: 0,
    pokemonXp: 0,
    gold: 0,
    drops: {},
    shiniesSeen: 0,
    shiniesCaught: 0,
    activeHuntSlug: '',
    activeHuntName: '',
    inCenter: false,
    hunts: {}
  };

  function formatHuntDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
    return `${pad(m)}m ${pad(s)}s`;
  }

  function renderHuntStatsDashboard() {
    const huntsObj = farmSessionData.hunts || {};
    const huntEntries = Object.entries(huntsObj);
    const activeSlug = farmSessionData.activeHuntSlug || '';
    const activeHunt = huntsObj[activeSlug] || null;

    // Atualiza Banner de Hunt Ativa no Topo do Quadro
    if (farmSessionData.inCenter) {
      if (activeHuntName) {
        activeHuntName.textContent = '🏥 Centro Pokémon (Descansando / Curando)';
        activeHuntName.style.color = '#9fe4ff';
      }
      if (activeHuntTierBadge) activeHuntTierBadge.style.display = 'none';
      if (activeHuntTimer) activeHuntTimer.textContent = '⏱️ Pausado';
      if (activeHuntLiveXp) activeHuntLiveXp.textContent = '🐾 0 XP/h';
      if (activeHuntLiveGp) activeHuntLiveGp.textContent = '🪙 0 GP/h';
      if (activeHuntLiveCatches) activeHuntLiveCatches.textContent = '🎯 0 capturas';
      if (activeHuntLiveShinies) activeHuntLiveShinies.textContent = '✨ 0 vistos (0 capt.)';
    } else {
      if (activeHuntName) {
        activeHuntName.style.color = '#fff';
        if (activeHunt || farmSessionData.activeHuntName) {
          activeHuntName.textContent = (activeHunt && activeHunt.name) || farmSessionData.activeHuntName || 'Hunt Desconhecida';
          if (activeHuntTierBadge) {
            const tier = (activeHunt && activeHunt.outlandTier) || 0;
            if (tier > 0) {
              activeHuntTierBadge.textContent = `T${tier}`;
              activeHuntTierBadge.style.display = 'inline-block';
            } else {
              activeHuntTierBadge.style.display = 'none';
            }
          }
        } else {
          activeHuntName.textContent = 'Aguardando batalha...';
          if (activeHuntTierBadge) activeHuntTierBadge.style.display = 'none';
        }
      }

      if (activeHunt) {
        const aSec = Math.max(1, Math.floor((activeHunt.durationMs || 0) / 1000));
        const aHours = Math.max(0.005, aSec / 3600);
        const aXpRate = Math.round((activeHunt.pokemonXp || 0) / aHours);
        const aGpRate = Math.round((activeHunt.gold || 0) / aHours);
        const aCatches = Number(activeHunt.captures ?? activeHunt.catches) || 0;
        const aShiniesSeen = Number(activeHunt.shiniesSeen) || 0;
        const aShiniesCaught = Number(activeHunt.shiniesCaught) || 0;

        if (activeHuntTimer) activeHuntTimer.textContent = `⏱️ ${formatHuntDuration(activeHunt.durationMs || 0)}`;
        if (activeHuntLiveXp) activeHuntLiveXp.textContent = `🐾 ${aXpRate >= 1000000 ? (aXpRate / 1000000).toFixed(1) + 'M' : (aXpRate >= 1000 ? (aXpRate / 1000).toFixed(0) + 'k' : aXpRate)} XP/h`;
        if (activeHuntLiveGp) activeHuntLiveGp.textContent = `🪙 ${aGpRate >= 1000000 ? (aGpRate / 1000000).toFixed(1) + 'M' : (aGpRate >= 1000 ? (aGpRate / 1000).toFixed(0) + 'k' : aGpRate)} GP/h`;
        if (activeHuntLiveCatches) activeHuntLiveCatches.textContent = `🎯 ${aCatches} ${aCatches === 1 ? 'captura' : 'capturas'}`;
        if (activeHuntLiveShinies) activeHuntLiveShinies.textContent = `✨ ${aShiniesSeen} ${aShiniesSeen === 1 ? 'visto' : 'vistos'} (${aShiniesCaught} capt.)`;
      } else {
        if (activeHuntTimer) activeHuntTimer.textContent = '⏱️ 00:00';
        if (activeHuntLiveXp) activeHuntLiveXp.textContent = '🐾 0 XP/h';
        if (activeHuntLiveGp) activeHuntLiveGp.textContent = '🪙 0 GP/h';
        if (activeHuntLiveCatches) activeHuntLiveCatches.textContent = '🎯 0 capturas';
        if (activeHuntLiveShinies) activeHuntLiveShinies.textContent = '✨ 0 vistos (0 capt.)';
      }
    }

    // Contador de Hunts Catalogadas
    if (statHuntsCount) {
      statHuntsCount.textContent = `${huntEntries.length} ${huntEntries.length === 1 ? 'hunt' : 'hunts'}`;
    }

    if (!containerHuntsDashboard) return;

    if (huntEntries.length === 0) {
      containerHuntsDashboard.innerHTML = `
        <div style="text-align: center; padding: 35px 10px; color: var(--sobre-mad-dim); font-size: 11px;">
          Nenhuma hunt registrada nesta sessão ainda.<br>
          <span style="font-size: 9px; opacity: 0.8;">Inicie batalhas em qualquer hunt do PokéIdle para ver as médias de XP/h, GP/h, capturas e shinies.</span>
        </div>
      `;
      return;
    }

    // Enriquecimento e cálculo de médias por hunt
    const enrichedList = huntEntries.map(([slug, h]) => {
      const durMs = Math.max(1000, Number(h.durationMs) || 1000);
      const hours = Math.max(0.005, durMs / 3600000);
      const pokeXp = Number(h.pokemonXp) || 0;
      const gold = Number(h.gold) || 0;
      const kills = Number(h.kills) || 0;
      const catches = Number(h.captures ?? h.catches) || 0;
      const attempts = Number(h.attempts ?? h.ballAttempts) || 0;
      const shiniesSeen = Number(h.shiniesSeen) || 0;
      const shiniesCaught = Number(h.shiniesCaught) || 0;

      const xpHour = Math.round(pokeXp / hours);
      const gpHour = Math.round(gold / hours);
      const killsHour = Math.round(kills / hours);
      const catchRatePctNum = attempts > 0 ? (catches / attempts) * 100 : (kills > 0 ? (catches / (catches + kills)) * 100 : 0);

      return {
        slug,
        name: h.name || slug,
        outlandTier: Number(h.outlandTier) || 0,
        durationMs: durMs,
        hours,
        pokeXp,
        gold,
        kills,
        catches,
        attempts,
        shiniesSeen,
        shiniesCaught,
        xpHour,
        gpHour,
        killsHour,
        catchRatePctNum,
        catchRatePct: catchRatePctNum.toFixed(1) + '%',
        isActive: slug === activeSlug && !farmSessionData.inCenter
      };
    });

    // Identificação dos líderes de rendimento para badges de honra
    const maxXp = Math.max(...enrichedList.map(e => e.xpHour));
    const maxGp = Math.max(...enrichedList.map(e => e.gpHour));
    const maxKills = Math.max(...enrichedList.map(e => e.killsHour));
    const maxCatch = Math.max(...enrichedList.map(e => e.catchRatePctNum));

    // Ordenação dinâmica pelo filtro selecionado
    enrichedList.sort((a, b) => {
      if (currentHuntSort === 'xp') return b.xpHour - a.xpHour;
      if (currentHuntSort === 'gp') return b.gpHour - a.gpHour;
      if (currentHuntSort === 'kills') return b.killsHour - a.killsHour;
      if (currentHuntSort === 'catch') return b.catchRatePctNum - a.catchRatePctNum;
      if (currentHuntSort === 'shinies') {
        const scoreB = (b.shiniesSeen * 100) + b.shiniesCaught;
        const scoreA = (a.shiniesSeen * 100) + a.shiniesCaught;
        return scoreB - scoreA || b.shiniesSeen - a.shiniesSeen;
      }
      if (currentHuntSort === 'time') return b.durationMs - a.durationMs;
      return b.xpHour - a.xpHour;
    });

    containerHuntsDashboard.innerHTML = '';

    enrichedList.forEach(h => {
      const card = document.createElement('div');
      card.className = `stat-hunt-card ${h.isActive ? 'active-hunt-highlight' : ''}`;

      const xpDisplay = h.xpHour >= 1000000 ? `${(h.xpHour / 1000000).toFixed(2)}M` : `${h.xpHour.toLocaleString()}`;
      const gpDisplay = h.gpHour >= 1000000 ? `${(h.gpHour / 1000000).toFixed(2)}M` : `${h.gpHour.toLocaleString()}`;

      // Badges comemorativas
      let badgesHtml = '';
      if (h.outlandTier > 0) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: var(--roxo); color: #fff;">T${h.outlandTier}</span>`;
      }
      if (h.isActive) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: var(--verde-luz); color: #000;">⚡ ATIVA AGORA</span>`;
      }
      if (h.shiniesCaught > 0) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: #ffd700; color: #000; font-weight: 800;">✨ ${h.shiniesCaught} ${h.shiniesCaught === 1 ? 'SHINY CAPTURADO' : 'SHINIES CAPTURADOS'}</span>`;
      } else if (h.shiniesSeen > 0) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: rgba(255, 215, 0, 0.2); color: #ffd700; box-shadow: inset 0 0 0 1px #ffd700;">✨ ${h.shiniesSeen} ${h.shiniesSeen === 1 ? 'SHINY VISTO' : 'SHINIES VISTOS'}</span>`;
      }
      if (h.xpHour >= maxXp && maxXp > 0) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: #9333ea; color: #fff;">👑 TOP XP</span>`;
      }
      if (h.gpHour >= maxGp && maxGp > 0) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: var(--ouro); color: #000;">🪙 TOP GP</span>`;
      }
      if (h.killsHour >= maxKills && maxKills > 0) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: #ef4444; color: #fff;">⚔️ TOP KILLS</span>`;
      }
      if (h.catchRatePctNum >= maxCatch && maxCatch > 0 && h.catches > 0) {
        badgesHtml += `<span class="stat-hunt-pill" style="background: var(--azul-luz); color: #000;">🎯 TOP CAPTURA</span>`;
      }

      card.innerHTML = `
        <div class="stat-hunt-card-header">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span style="font-size: 11px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${h.name}
            </span>
            <div class="stat-hunt-badges-row">
              ${badgesHtml}
            </div>
          </div>
          <span style="font-size: 9px; font-weight: 700; color: var(--ouro); font-family: var(--fonte-mono, monospace); flex-shrink: 0;">
            ⏱️ ${formatHuntDuration(h.durationMs)}
          </span>
        </div>

        <div class="stat-hunt-grid">
          <div class="stat-hunt-col">
            <span class="stat-hunt-col-label">XP / h</span>
            <span class="stat-hunt-col-val" style="color: #c084fc;">${xpDisplay}</span>
            <span class="stat-hunt-col-sub">+${h.pokeXp.toLocaleString()} XP</span>
          </div>
          <div class="stat-hunt-col">
            <span class="stat-hunt-col-label">GP / h</span>
            <span class="stat-hunt-col-val" style="color: var(--coins);">${gpDisplay}</span>
            <span class="stat-hunt-col-sub">+${h.gold.toLocaleString()} GP</span>
          </div>
          <div class="stat-hunt-col">
            <span class="stat-hunt-col-label">Kills / h</span>
            <span class="stat-hunt-col-val" style="color: #fff;">${h.killsHour.toLocaleString()}</span>
            <span class="stat-hunt-col-sub">${h.kills.toLocaleString()} abates</span>
          </div>
          <div class="stat-hunt-col">
            <span class="stat-hunt-col-label">Taxa Captura</span>
            <span class="stat-hunt-col-val" style="color: var(--verde-luz);">${h.catchRatePct}</span>
            <span class="stat-hunt-col-sub">${h.catches} un / ${h.attempts || h.catches} bolas</span>
          </div>
        </div>

        ${(h.shiniesSeen > 0 || h.shiniesCaught > 0) ? `
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; color: #ffd700; background: rgba(255, 215, 0, 0.12); padding: 4px 8px; box-shadow: inset 0 0 0 1px rgba(255, 215, 0, 0.35); font-weight: 700;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>✨ Shinies na Hunt:</span>
              <span style="color: #fff;">👁️ <b>${h.shiniesSeen}</b> ${h.shiniesSeen === 1 ? 'visto' : 'vistos'}</span>
              <span>•</span>
              <span style="color: var(--verde-luz);">🎯 <b>${h.shiniesCaught}</b> ${h.shiniesCaught === 1 ? 'capturado' : 'capturados'}</span>
            </div>
            <span style="font-family: var(--fonte-mono, monospace); font-size: 8.5px; opacity: 0.9;">
              Taxa de Captura: ${h.shiniesSeen > 0 ? ((h.shiniesCaught / h.shiniesSeen) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ` : `
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 8.5px; color: var(--sobre-mad-dim); background: rgba(0, 0, 0, 0.25); padding: 3px 8px; box-shadow: inset 0 0 0 1px var(--mad-linha);">
            <span>✨ Shinies na Hunt: 0 vistos • 0 capturados</span>
            <span style="opacity: 0.6;">Nenhum shiny avistado ainda</span>
          </div>
        `}
      `;

      containerHuntsDashboard.appendChild(card);
    });
  }

  function updateFarmStatsUI() {
    const now = Date.now();
    const start = Number(farmSessionData.startTime) || now;
    const elapsedMs = Math.max(1000, now - start);

    // Formatação de Tempo (HH:MM:SS)
    const totalSec = Math.floor(elapsedMs / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (statsSessionTimer) {
      statsSessionTimer.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }

    // Cálculo de Taxas Globais
    const minutes = elapsedMs / 60000;
    const hours = elapsedMs / 3600000;

    const killsVal = Number(farmSessionData.kills) || 0;
    const catchesVal = Number(farmSessionData.catches ?? farmSessionData.captures) || 0;
    const trainerXpVal = Number(farmSessionData.trainerXp) || 0;
    const pokeXpVal = Number(farmSessionData.pokemonXp) || 0;
    const goldVal = Number(farmSessionData.gold) || 0;
    const shiniesSeenVal = Number(farmSessionData.shiniesSeen) || 0;
    const shiniesCaughtVal = Number(farmSessionData.shiniesCaught) || 0;

    const killsPerMin = minutes > 0.05 ? (killsVal / minutes).toFixed(1) : '0.0';
    const catchesPerHour = hours > 0.01 ? Math.round(catchesVal / hours) : 0;
    const trainerXpPerHour = hours > 0.01 ? Math.round(trainerXpVal / hours) : 0;
    const pokeXpPerHour = hours > 0.01 ? Math.round(pokeXpVal / hours) : 0;
    const goldPerHour = hours > 0.01 ? Math.round(goldVal / hours) : 0;

    if (statKillsTotal) statKillsTotal.textContent = killsVal.toLocaleString();
    if (statKillsRate) statKillsRate.textContent = `${killsPerMin} / min`;

    if (statCatchesTotal) statCatchesTotal.textContent = catchesVal.toLocaleString();
    if (statCatchesRate) statCatchesRate.textContent = `${catchesPerHour.toLocaleString()} / h`;

    if (statTrainerXp) statTrainerXp.textContent = trainerXpVal.toLocaleString();
    if (statTrainerXpRate) statTrainerXpRate.textContent = `${trainerXpPerHour.toLocaleString()} XP / h`;

    if (statPokeXp) statPokeXp.textContent = pokeXpVal.toLocaleString();
    if (statPokeXpRate) statPokeXpRate.textContent = `${pokeXpPerHour.toLocaleString()} XP / h`;

    if (statGoldTotal) statGoldTotal.textContent = `${goldVal.toLocaleString()} GP`;
    if (statGoldRate) statGoldRate.textContent = `${goldPerHour.toLocaleString()} GP / h`;

    if (statShiniesTotal) statShiniesTotal.textContent = shiniesSeenVal.toLocaleString();
    if (statShiniesSub) statShiniesSub.textContent = `${shiniesCaughtVal.toLocaleString()} Capturados`;

    // Renderiza o Dashboard Comparativo de Hunts
    renderHuntStatsDashboard();

    // Renderização dos Drops Acumulados
    if (containerFarmDrops) {
      const dropsObj = farmSessionData.drops || {};
      const dropEntries = Object.entries(dropsObj);

      if (statDropsCount) {
        statDropsCount.textContent = `${dropEntries.length} ${dropEntries.length === 1 ? 'item dropado' : 'tipos de itens'}`;
      }

      if (dropEntries.length === 0) {
        containerFarmDrops.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim); font-size: 11px;">
            Nenhum drop registrado nesta sessão ainda.<br>
            <span style="font-size: 9px; opacity: 0.8;">Bata em monstros e complete hunts no jogo para acumular loots.</span>
          </div>
        `;
      } else {
        // Ordena por quantidade descrescente
        dropEntries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));

        containerFarmDrops.innerHTML = '';
        dropEntries.forEach(([itemName, itemQty]) => {
          let rotomIt = null;
          if (typeof window.getRotomItem === 'function') {
            rotomIt = window.getRotomItem(itemName);
          }
          const iconUrl = rotomIt && typeof window.getItemIconUrl === 'function'
            ? window.getItemIconUrl(rotomIt)
            : 'icons/ouro.png';

          const card = document.createElement('div');
          card.className = 'stat-drop-card';
          card.innerHTML = `
            <img src="${iconUrl}" class="stat-drop-icon" alt="${itemName}">
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
              <span style="font-size: 11px; color: #fff; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemName}">${itemName}</span>
              <span style="font-size: 9px; color: var(--ouro); font-weight: 800;">${Number(itemQty).toLocaleString()} un</span>
            </div>
            ${rotomIt ? `<button type="button" class="btn btn-mini btn-roxo btn-snipe-this-drop" style="font-size: 8px; padding: 2px 6px; border-radius: 0px;" title="Criar regra de compra no mercado">🎯 Snipe</button>` : ''}
          `;

          const btnSnipe = card.querySelector('.btn-snipe-this-drop');
          if (btnSnipe && rotomIt) {
            btnSnipe.addEventListener('click', () => {
              configureSniperRuleFromItem(rotomIt, 0, 0);
              switchMainView('sniper');
            });
          }

          containerFarmDrops.appendChild(card);
        });
      }
    }
  }

  // Cronômetro contínuo a cada segundo
  setInterval(() => {
    const start = Number(farmSessionData.startTime);
    if (start && start > 0) {
      updateFarmStatsUI();
    }
  }, 1000);

  // Botões de ordenação do Dashboard de Hunts
  if (huntSortBtns && huntSortBtns.length > 0) {
    huntSortBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        huntSortBtns.forEach(b => {
          b.classList.remove('on');
          b.classList.add('apagado');
        });
        btn.classList.add('on');
        btn.classList.remove('apagado');
        currentHuntSort = btn.getAttribute('data-sort') || 'xp';
        renderHuntStatsDashboard();
      });
    });
  }

  // Reset exclusivo do histórico de hunts
  if (btnResetHuntsStats) {
    btnResetHuntsStats.addEventListener('click', () => {
      if (!confirm('Deseja limpar o histórico de rendimento por hunt?')) return;
      if (farmSessionData) farmSessionData.hunts = {};
      renderHuntStatsDashboard();
      sendToActiveTab({ action: 'RESET_HUNTS_STATS' });
    });
  }

  if (btnResetFarmStats) {
    btnResetFarmStats.addEventListener('click', () => {
      if (!confirm('Deseja reiniciar a sessão atual de telemetria de farm?')) return;
      const curSlug = farmSessionData.activeHuntSlug || '';
      const curName = farmSessionData.activeHuntName || '';
      farmSessionData = {
        startTime: Date.now(),
        kills: 0,
        catches: 0,
        captures: 0,
        ballAttempts: 0,
        trainerXp: 0,
        pokemonXp: 0,
        gold: 0,
        drops: {},
        shiniesSeen: 0,
        shiniesCaught: 0,
        activeHuntSlug: curSlug,
        activeHuntName: curName,
        hunts: {}
      };
      updateFarmStatsUI();
      sendToActiveTab({ action: 'RESET_FARM_STATS' });
    });
  }

  // =========================================================================
  // 11. ENCICLOPÉDIA DE HUNTS & BOSSES
  // =========================================================================
  const subtabHuntsList = document.getElementById('subtab-hunts-list');
  const subtabBossesList = document.getElementById('subtab-bosses-list');

  const panelHuntsList = document.getElementById('panel-hunts-list');
  const panelBossesList = document.getElementById('panel-bosses-list');

  const boxHuntsFilters = document.getElementById('box-hunts-filters');
  const inputSearchHunts = document.getElementById('input-search-hunts');
  const huntLvlFilters = document.querySelectorAll('.hunt-lvl-filter');
  const huntTypeFilters = document.querySelectorAll('.hunt-type-filter');
  const containerHuntsGrid = document.getElementById('container-hunts-grid');
  const containerBossesGrid = document.getElementById('container-bosses-grid');
  const lblHuntsCounter = document.getElementById('lbl-hunts-counter');
  const lblBossesCounter = document.getElementById('lbl-bosses-counter');

  // Calculadora Probabilística de Boss Tokens & Drops Canônicos
  const bossCalcSelect = document.getElementById('boss-calc-select');
  const bossCalcReward = document.getElementById('boss-calc-reward');
  const bossCalcTargetQty = document.getElementById('boss-calc-target-qty');
  const bossCalcDropChance = document.getElementById('boss-calc-drop-chance');
  const btnRunBossCalc = document.getElementById('btn-run-boss-calc');
  const bossCalcDetailsTxt = document.getElementById('boss-calc-details-txt');
  const bossCalcEntryCost = document.getElementById('boss-calc-entry-cost');
  const resBossExpected = document.getElementById('res-boss-expected');
  const resBossExpectedGp = document.getElementById('res-boss-expected-gp');
  const resBossLucky = document.getElementById('res-boss-lucky');
  const resBossSafe = document.getElementById('res-boss-safe');
  const resBossDays = document.getElementById('res-boss-days');
  const bossFilterFocusBtns = document.querySelectorAll('.boss-filter-focus');

  let currentHuntsSubtab = 'hunts'; // 'hunts' | 'bosses'
  let currentBossFocus = 'all'; // 'all' | 'aoe' | 'tm'
  let currentHuntLvlFilter = 'all';
  let currentHuntTypeFilter = 'all';
  let currentHuntSearchQuery = '';
  let huntsViewInitialized = false;

  const POKEMON_TYPE_COLORS = {
    BUG: '#92BC2C',
    DARK: '#595761',
    DRAGON: '#0C69C8',
    ELECTRIC: '#F2D94E',
    FAIRY: '#EE90E6',
    FIGHTING: '#D3425F',
    FIRE: '#FBA54C',
    FLYING: '#A1BBEC',
    GHOST: '#5F6DBC',
    GRASS: '#5FBD58',
    GROUND: '#DA7C4D',
    ICE: '#75D0C1',
    NORMAL: '#A0A29F',
    POISON: '#B763CF',
    PSYCHIC: '#FA8581',
    ROCK: '#C9BB8A',
    STEEL: '#5695A3',
    WATER: '#539DDF'
  };

  function initHuntsView() {
    if (!huntsViewInitialized) {
      huntsViewInitialized = true;
      renderHunts();
      populateBossSelect();
      renderBosses();
    }
  }

  function switchHuntsSubtab(sub) {
    currentHuntsSubtab = sub;
    const isHunts = (sub === 'hunts');
    const isBosses = (sub === 'bosses');

    if (subtabHuntsList) { subtabHuntsList.classList.toggle('on', isHunts); subtabHuntsList.classList.toggle('apagado', !isHunts); }
    if (subtabBossesList) { subtabBossesList.classList.toggle('on', isBosses); subtabBossesList.classList.toggle('apagado', !isBosses); }

    if (panelHuntsList) panelHuntsList.style.display = isHunts ? 'flex' : 'none';
    if (panelBossesList) panelBossesList.style.display = isBosses ? 'flex' : 'none';

    // Oculta os filtros de nível/fraqueza quando estiver nos Bosses
    if (boxHuntsFilters) {
      boxHuntsFilters.style.display = isHunts ? 'flex' : 'none';
    }

    if (isBosses) {
      populateBossSelect();
      renderBosses();
      runBossProbabilityCalculation();
    } else {
      renderHunts();
    }
  }

  if (subtabHuntsList) subtabHuntsList.addEventListener('click', () => switchHuntsSubtab('hunts'));
  if (subtabBossesList) subtabBossesList.addEventListener('click', () => switchHuntsSubtab('bosses'));

  // --- POPULA O SELECT DE BOSSES CANÔNICOS ---
  function populateBossSelect(preselectKey) {
    if (!bossCalcSelect) return;
    const db = window.ROTOM_BOSSES_DB || [];
    
    // Filtro por foco: 'all' | 'aoe' | 'tm'
    const filtered = db.filter(b => {
      if (currentBossFocus === 'all') return true;
      const drops = b.drops || [];
      const isAoe = drops.some(d => (d.n || '').toLowerCase().includes('aoe'));
      if (currentBossFocus === 'aoe') return isAoe;
      if (currentBossFocus === 'tm') return !isAoe;
      return true;
    });

    const previousVal = preselectKey || bossCalcSelect.value;
    bossCalcSelect.innerHTML = '';

    filtered.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.k;
      const dropSummary = (b.drops || []).map(d => `${d.n} (${Number(d.c).toFixed(1)}%)`).join(', ');
      const lvlStr = b.lvl ? Number(b.lvl).toLocaleString() : 'Boss';
      opt.textContent = `${b.n} (Nv. ${lvlStr} • ${dropSummary})`;
      bossCalcSelect.appendChild(opt);
    });

    if (filtered.some(b => b.k === previousVal)) {
      bossCalcSelect.value = previousVal;
    } else if (filtered.length > 0) {
      bossCalcSelect.value = filtered[0].k;
    }

    updateBossRewardOptions();
  }

  // --- ATUALIZA OS DROPS DO CHEFE SELECIONADO NA CALCULADORA ---
  function updateBossRewardOptions() {
    if (!bossCalcReward || !bossCalcSelect) return;
    const db = window.ROTOM_BOSSES_DB || [];
    const selectedBossKey = bossCalcSelect.value;
    const boss = db.find(b => b.k === selectedBossKey);

    bossCalcReward.innerHTML = '';
    if (!boss) {
      if (bossCalcDetailsTxt) bossCalcDetailsTxt.textContent = 'Nenhum chefe selecionado.';
      return;
    }

    // Atualiza banner de detalhes
    if (bossCalcDetailsTxt) {
      const types = [boss.t1, boss.t2].filter(Boolean).join('/');
      const teamReq = boss.teamLevel ? ` • Req. Time Nv. ${Number(boss.teamLevel).toLocaleString()}` : '';
      bossCalcDetailsTxt.innerHTML = `<span style="color: var(--ouro); font-weight: 800;">${boss.n}</span> (Nv. ${Number(boss.lvl || 0).toLocaleString()} • Tipo ${types}${teamReq})`;
    }
    if (bossCalcEntryCost) {
      bossCalcEntryCost.textContent = `Entrada: ${boss.ent || '1× Bronze Boss Token'}`;
    }

    const drops = boss.drops || [];
    drops.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = String(d.itemId || d.n);
      opt.setAttribute('data-chance', String(d.c));
      opt.setAttribute('data-name', d.n);
      opt.textContent = `${d.n} — ${Number(d.c).toFixed(1)}% por run`;
      if (idx === 0) opt.selected = true;
      bossCalcReward.appendChild(opt);
    });

    if (drops.length > 0 && bossCalcDropChance) {
      bossCalcDropChance.value = Number(drops[0].c).toFixed(1);
    }

    // Se for peça de TM (10 peças para montar 1 TM completo), sugerir 10
    if (drops.length > 0 && (drops[0].n.includes('Piece') || drops[0].n.includes('Disk'))) {
      if (bossCalcTargetQty && (!bossCalcTargetQty.value || Number(bossCalcTargetQty.value) <= 1)) {
        bossCalcTargetQty.value = 10;
      }
    }

    runBossProbabilityCalculation();
  }

  // --- CALCULADORA PROBABILÍSTICA OFICIAL DE BOSS TOKENS ---
  function runBossProbabilityCalculation() {
    const targetQty = Math.max(1, Number(bossCalcTargetQty?.value) || 10);
    const dropChancePct = Math.max(0.01, Number(bossCalcDropChance?.value) || 1.0);
    const p = dropChancePct / 100.0;

    // 1. Média Esperada E[N] = k / p
    const expectedRuns = Math.round(targetQty / p);

    // 2. Desvio Padrão da Binomial Negativa: sqrt(k * (1-p) / p^2)
    const stdDev = Math.sqrt(targetQty * (1 - p) / (p * p));

    // 3. Cenário Sorte Alta (Percentil 25% ~ Z = -0.675)
    const luckyRuns = Math.max(targetQty, Math.round(expectedRuns - 0.675 * stdDev));

    // 4. Cenário de Segurança 90% (Percentil 90% ~ Z = +1.282)
    const safeRuns = Math.max(expectedRuns, Math.round(expectedRuns + 1.282 * stdDev));

    // 5. Custo em GP no Mercado (Preço de referência do Bronze Boss Token: ~70.000 GP)
    const TOKEN_AVG_PRICE_GP = 70000;
    const totalCostGp = expectedRuns * TOKEN_AVG_PRICE_GP;
    let costGpFormatted = '';
    if (totalCostGp >= 1000000) {
      costGpFormatted = `~ ${(totalCostGp / 1000000).toFixed(1)}M GP no mercado`;
    } else {
      costGpFormatted = `~ ${(totalCostGp / 1000).toFixed(0)}k GP no mercado`;
    }

    // 6. Entradas Diárias (1 grátis por dia)
    const freeDailyDays = expectedRuns;

    if (resBossExpected) resBossExpected.textContent = `~ ${expectedRuns.toLocaleString()} Tokens`;
    if (resBossExpectedGp) resBossExpectedGp.textContent = costGpFormatted;
    if (resBossLucky) resBossLucky.textContent = `~ ${luckyRuns.toLocaleString()} Tokens`;
    if (resBossSafe) resBossSafe.textContent = `~ ${safeRuns.toLocaleString()} Tokens`;
    if (resBossDays) resBossDays.textContent = `~ ${freeDailyDays.toLocaleString()} Dias`;
  }

  if (btnRunBossCalc) {
    btnRunBossCalc.addEventListener('click', runBossProbabilityCalculation);
  }

  if (bossCalcReward) {
    bossCalcReward.addEventListener('change', () => {
      const selected = bossCalcReward.options[bossCalcReward.selectedIndex];
      const ch = selected?.getAttribute('data-chance');
      if (ch && bossCalcDropChance) {
        bossCalcDropChance.value = Number(ch).toFixed(1);
      }
      runBossProbabilityCalculation();
    });
  }

  if (bossCalcSelect) {
    bossCalcSelect.addEventListener('change', () => {
      updateBossRewardOptions();
    });
  }

  // Filtros de Foco de Boss (Todos / AoE TM / TM Piece)
  if (bossFilterFocusBtns) {
    bossFilterFocusBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        bossFilterFocusBtns.forEach(b => { b.classList.remove('on'); b.classList.add('apagado'); });
        btn.classList.add('on');
        btn.classList.remove('apagado');
        currentBossFocus = btn.getAttribute('data-focus') || 'all';
        populateBossSelect();
        renderBosses();
      });
    });
  }

  // Filtros de Nível
  if (huntLvlFilters) {
    huntLvlFilters.forEach(btn => {
      btn.addEventListener('click', () => {
        huntLvlFilters.forEach(b => { b.classList.remove('on'); b.classList.add('apagado'); });
        btn.classList.add('on');
        btn.classList.remove('apagado');
        currentHuntLvlFilter = btn.getAttribute('data-lvl') || 'all';
        renderHunts();
      });
    });
  }

  // Filtros de Fraqueza
  if (huntTypeFilters) {
    huntTypeFilters.forEach(btn => {
      btn.addEventListener('click', () => {
        huntTypeFilters.forEach(b => { b.classList.remove('on'); b.classList.add('apagado'); });
        btn.classList.add('on');
        btn.classList.remove('apagado');
        currentHuntTypeFilter = btn.getAttribute('data-type') || 'all';
        renderHunts();
      });
    });
  }

  // Busca textual
  let huntSearchDebounce = null;
  if (inputSearchHunts) {
    inputSearchHunts.addEventListener('input', () => {
      clearTimeout(huntSearchDebounce);
      huntSearchDebounce = setTimeout(() => {
        currentHuntSearchQuery = (inputSearchHunts.value || '').trim().toLowerCase();
        if (currentHuntsSubtab === 'bosses') {
          renderBosses();
        } else {
          renderHunts();
        }
      }, 150);
    });
  }

  function renderHunts() {
    if (!containerHuntsGrid) return;
    const db = window.ROTOM_HUNTS_DB || [];

    let list = db.filter(h => {
      // Filtro de Nível
      if (currentHuntLvlFilter !== 'all') {
        const lvl = Number(h.lvl) || 1;
        if (currentHuntLvlFilter === '1-20' && (lvl < 1 || lvl > 20)) return false;
        if (currentHuntLvlFilter === '21-40' && (lvl < 21 || lvl > 40)) return false;
        if (currentHuntLvlFilter === '41-60' && (lvl < 41 || lvl > 60)) return false;
        if (currentHuntLvlFilter === '61-80' && (lvl < 61 || lvl > 80)) return false;
        if (currentHuntLvlFilter === '81-100' && (lvl < 81 || lvl > 100)) return false;
        if (currentHuntLvlFilter === '100+' && lvl <= 100) return false;
      }

      // Filtro de Fraqueza Elemental
      if (currentHuntTypeFilter !== 'all') {
        const t = currentHuntTypeFilter.toUpperCase();
        const has4x = Array.isArray(h.w4x) && h.w4x.includes(t);
        const has2x = Array.isArray(h.w2x) && h.w2x.includes(t);
        if (!has4x && !has2x) return false;
      }

      // Busca por Texto
      if (currentHuntSearchQuery) {
        const q = currentHuntSearchQuery;
        const nomeMatch = (h.nome || '').toLowerCase().includes(q);
        const regMatch = (h.reg || '').toLowerCase().includes(q);
        const typesMatch = Array.isArray(h.types) && h.types.some(tp => tp.toLowerCase().includes(q));
        const dropsMatch = Array.isArray(h.drops) && h.drops.some(d => (d.n || '').toLowerCase().includes(q));
        if (!nomeMatch && !regMatch && !typesMatch && !dropsMatch) return false;
      }

      return true;
    });

    if (lblHuntsCounter) {
      lblHuntsCounter.textContent = `${list.length} criatura${list.length === 1 ? '' : 's'} encontrada${list.length === 1 ? '' : 's'}`;
    }

    if (list.length === 0) {
      containerHuntsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim); font-size: 11px;">
          Nenhuma hunt encontrada com os filtros selecionados.<br>
          <span style="font-size: 9px; opacity: 0.8;">Tente selecionar outra faixa de nível ou limpar a busca.</span>
        </div>
      `;
      return;
    }

    // Ordenação e paginação leve (primeiros 90 itens para render suave)
    list.sort((a, b) => (a.lvl - b.lvl) || a.nome.localeCompare(b.nome));
    const renderList = list.slice(0, 90);

    containerHuntsGrid.innerHTML = '';
    renderList.forEach(h => {
      const card = document.createElement('div');
      card.className = 'hunt-card';

      const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${h.pid}.png`;

      // Renderiza tipos do Pokémon
      const typesHtml = (h.types || []).map(tp => {
        const bg = POKEMON_TYPE_COLORS[tp] || '#4b5563';
        return `<span class="hunt-type-badge" style="background: ${bg};">${tp}</span>`;
      }).join(' ');

      // Renderiza fraquezas 4x e 2x
      const w4xChips = (h.w4x || []).map(tp => `<span class="hunt-weak-chip-4x" title="Fraqueza Crítica 4x">${tp} 4x</span>`).join(' ');
      const w2xChips = (h.w2x || []).map(tp => `<span class="hunt-weak-chip-2x" title="Fraqueza 2x">${tp} 2x</span>`).join(' ');

      // Renderiza drops
      const dropsRows = (h.drops || []).map(d => {
        let rotomIt = null;
        if (typeof window.getRotomItem === 'function') {
          rotomIt = window.getRotomItem(d.n);
        }
        return `
          <div class="hunt-drop-row">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${rotomIt ? 'cursor: pointer; text-decoration: underline;' : ''}" class="hunt-drop-name" data-item="${d.n}">
              ${d.n}
            </span>
            <span class="hunt-drop-chance">${Number(d.c).toFixed(1)}%</span>
          </div>
        `;
      }).join('');

      card.innerHTML = `
        <div class="hunt-card-top">
          <img src="${spriteUrl}" class="hunt-poke-sprite" alt="${h.nome}">
          <div class="hunt-poke-info">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
              <span class="hunt-poke-name">${h.nome}</span>
              <span style="font-size: 9px; color: var(--ouro); font-weight: 800; background: var(--vao); padding: 1px 5px; border-radius: 0px;">Nv. ${h.lvl}</span>
            </div>
            <div class="hunt-poke-meta">
              <span>${h.reg || 'Kanto'}</span>
              ${h.out ? '<span style="color: #c084fc; font-weight: 700;">[Outland]</span>' : ''}
              <div style="display: flex; gap: 2px; margin-left: auto;">${typesHtml}</div>
            </div>
          </div>
        </div>

        <!-- Fraquezas Elementais -->
        <div class="hunt-weak-row">
          <span style="font-size: 8.5px; color: var(--sobre-mad-dim); font-weight: 700;">Fraquezas:</span>
          ${w4xChips}
          ${w2xChips}
          ${(!w4xChips && !w2xChips) ? '<span style="font-size: 8.5px; color: var(--vao-dim);">Nenhuma destacada</span>' : ''}
        </div>

        <!-- Barra de Rendimento Base -->
        <div class="hunt-yield-bar">
          <span style="color: #9fe4ff;">XP: <b>+${Number(h.xp || 0).toLocaleString()}</b></span>
          <span style="color: var(--coins);">GP: <b>+${Number(h.gp || 0).toLocaleString()}</b></span>
        </div>

        <!-- Lista de Drops e Loots -->
        <div class="hunt-drops-container">
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 8px; color: var(--vao-dim); text-transform: uppercase; font-weight: 800; padding-bottom: 2px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span>Item / Loot</span>
            <span>Chance</span>
          </div>
          ${dropsRows || '<span style="font-size: 8.5px; color: var(--sobre-mad-dim); text-align: center;">Sem drops catalogados</span>'}
        </div>
      `;

      // Event listener para abrir regra no Sniper ao clicar em item conhecido
      card.querySelectorAll('.hunt-drop-name').forEach(el => {
        const dropName = el.getAttribute('data-item');
        if (dropName && typeof window.getRotomItem === 'function') {
          const it = window.getRotomItem(dropName);
          if (it) {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              configureSniperRuleFromItem(it, 0, 0);
              switchMainView('sniper');
            });
          }
        }
      });

      containerHuntsGrid.appendChild(card);
    });

    if (list.length > 90) {
      const moreTip = document.createElement('div');
      moreTip.style.gridColumn = '1 / -1';
      moreTip.style.textAlign = 'center';
      moreTip.style.padding = '10px';
      moreTip.style.fontSize = '10px';
      moreTip.style.color = 'var(--ouro)';
      moreTip.textContent = `Mostrando as 90 primeiras criaturas de ${list.length}. Use o campo de busca ou os filtros de nível/tipo para refinar.`;
      containerHuntsGrid.appendChild(moreTip);
    }
  }

  function renderBosses() {
    if (!containerBossesGrid) return;
    const db = window.ROTOM_BOSSES_DB || [];

    let list = db.filter(b => {
      // Filtro de foco
      if (currentBossFocus !== 'all') {
        const drops = b.drops || [];
        const isAoe = drops.some(d => (d.n || '').toLowerCase().includes('aoe'));
        if (currentBossFocus === 'aoe' && !isAoe) return false;
        if (currentBossFocus === 'tm' && isAoe) return false;
      }

      // Busca por texto
      if (currentHuntSearchQuery) {
        const q = currentHuntSearchQuery;
        const nomeMatch = (b.n || '').toLowerCase().includes(q);
        const typesMatch = [b.t1, b.t2].filter(Boolean).some(tp => tp.toLowerCase().includes(q));
        const dropsMatch = Array.isArray(b.drops) && b.drops.some(d => {
          const name = typeof d === 'string' ? d : (d.n || '');
          return name.toLowerCase().includes(q);
        });
        if (!nomeMatch && !typesMatch && !dropsMatch) return false;
      }
      return true;
    });

    if (lblBossesCounter) {
      lblBossesCounter.textContent = `${list.length} chefe${list.length === 1 ? '' : 's'} oficial${list.length === 1 ? '' : 'is'} catalogado${list.length === 1 ? '' : 's'}`;
    }

    if (list.length === 0) {
      containerBossesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim); font-size: 11px;">
          Nenhum chefe oficial encontrado com os filtros selecionados.<br>
          <span style="font-size: 9px; opacity: 0.8;">Tente mudar o filtro de foco (AoE / TM) ou limpar a busca.</span>
        </div>
      `;
      return;
    }

    containerBossesGrid.innerHTML = '';
    list.forEach(b => {
      const card = document.createElement('div');
      card.className = 'hunt-card';

      const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${b.pid}.png`;

      const t1Badge = b.t1 ? `<span class="hunt-type-badge" style="background: ${POKEMON_TYPE_COLORS[b.t1] || '#4b5563'};">${b.t1}</span>` : '';
      const t2Badge = b.t2 ? `<span class="hunt-type-badge" style="background: ${POKEMON_TYPE_COLORS[b.t2] || '#4b5563'};">${b.t2}</span>` : '';

      const dropsRows = (b.drops || []).map(d => {
        const dName = typeof d === 'string' ? d : d.n;
        const dChance = typeof d === 'object' && d.c !== undefined ? Number(d.c).toFixed(1) + '%' : 'Raro';
        const isAoe = dName.toLowerCase().includes('aoe');
        const badgeColor = isAoe ? '#38bdf8' : '#a78bfa';

        let rotomIt = null;
        if (typeof window.getRotomItem === 'function') {
          rotomIt = window.getRotomItem(dName);
        }

        return `
          <div class="hunt-drop-row" style="padding: 2px 0;">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; ${rotomIt ? 'cursor: pointer; text-decoration: underline;' : ''}" class="hunt-drop-name" data-item="${dName}">
              ${isAoe ? '⚡' : '💿'} ${dName}
            </span>
            <span class="hunt-drop-chance" style="color: ${badgeColor}; font-weight: 800; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 0px;">${dChance}</span>
          </div>
        `;
      }).join('');

      card.innerHTML = `
        <div class="hunt-card-top">
          <img src="${spriteUrl}" class="hunt-poke-sprite" alt="${b.n}">
          <div class="hunt-poke-info">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
              <span class="hunt-poke-name" style="color: var(--ouro);">${b.n}</span>
              <span style="font-size: 9px; color: #fff; font-weight: 800; background: var(--rx); padding: 1px 5px; border-radius: 0px;">Nv. ${Number(b.lvl || 0).toLocaleString()}</span>
            </div>
            <div class="hunt-poke-meta">
              <span>Time Req: <b>Nv. ${Number(b.teamLevel || b.lvl).toLocaleString()}</b></span>
              <div style="display: flex; gap: 2px; margin-left: auto;">${t1Badge} ${t2Badge}</div>
            </div>
          </div>
        </div>

        <!-- Custo de Entrada -->
        <div style="font-size: 8.5px; color: var(--sobre-mad-dim); background: rgba(0,0,0,0.25); padding: 3px 6px; border-radius: 0px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <span>🎟️ Custo por Entrada:</span>
          <span style="color: var(--ouro); font-weight: 700;">${b.ent || '1× Bronze Boss Token'}</span>
        </div>

        <!-- Tabela de Drops Oficiais de Chefes -->
        <div class="hunt-drops-container">
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 8px; color: var(--vao-dim); text-transform: uppercase; font-weight: 800; padding-bottom: 2px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span>Drop Oficial</span>
            <span>Chance</span>
          </div>
          ${dropsRows || '<span style="font-size: 8.5px; color: var(--sobre-mad-dim); text-align: center;">Tabela indisponível</span>'}
        </div>

        <!-- Botão de Ação: Simular Tokens deste Boss -->
        <button type="button" class="btn btn-ouro btn-simulate-boss" data-boss="${b.k}" style="width: 100%; height: 22px; font-size: 9px; font-weight: 800; border-radius: 0px; margin-top: 4px;">
          🎲 Simular Tokens deste Chefe
        </button>
      `;

      // Event listener para abrir regra no Sniper ao clicar em item conhecido
      card.querySelectorAll('.hunt-drop-name').forEach(el => {
        const dropName = el.getAttribute('data-item');
        if (dropName && typeof window.getRotomItem === 'function') {
          const it = window.getRotomItem(dropName);
          if (it) {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              configureSniperRuleFromItem(it, 0, 0);
              switchMainView('sniper');
            });
          }
        }
      });

      // Event listener para simular este chefe diretamente na calculadora
      const btnSimulate = card.querySelector('.btn-simulate-boss');
      if (btnSimulate) {
        btnSimulate.addEventListener('click', () => {
          if (bossCalcSelect) {
            bossCalcSelect.value = b.k;
            updateBossRewardOptions();
            const banner = document.getElementById('boss-calc-info-banner');
            if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      }

      containerBossesGrid.appendChild(card);
    });
  }

  // =========================================================================
  // 12. ALTAR PRO — OFERENDA EM LOTE TURBO
  // =========================================================================
  let ofrNotaMax = 5.0;
  let ofrSelectedType = 'ALL';
  let ofrMaxBatches = 0;
  let ofrActiveCandidates = [];
  let ofrIsRunning = false;
  let ofrPacingMs = 800;

  const btnRefreshOferendaDepot = document.getElementById('btn-refresh-oferenda-depot');
  const ofrNotaFilters = document.querySelectorAll('.ofr-nota-filter');
  const inputOferendaNotaManual = document.getElementById('input-oferenda-nota-manual');
  const selectOferendaTipo = document.getElementById('select-oferenda-tipo');
  const selectOferendaMaxBatches = document.getElementById('select-oferenda-max-batches');
  const selectOferendaPacing = document.getElementById('select-oferenda-pacing');
  const btnRunOferendaBatch = document.getElementById('btn-run-oferenda-batch');

  const lblOfrCandidatos = document.getElementById('lbl-ofr-candidatos');
  const lblOfrPedras = document.getElementById('lbl-ofr-pedras');
  const lblOfrProtegidos = document.getElementById('lbl-ofr-protegidos');
  const lblOfrSobra = document.getElementById('lbl-ofr-sobra');
  const containerOferendaPreviewGrid = document.getElementById('container-oferenda-preview-grid');

  const ofrProgressBarContainer = document.getElementById('ofr-progress-bar-container');
  const ofrProgressStatusTxt = document.getElementById('ofr-progress-status-txt');
  const ofrProgressCountTxt = document.getElementById('ofr-progress-count-txt');
  const ofrProgressFill = document.getElementById('ofr-progress-fill');

  const ofrResultSummaryBox = document.getElementById('ofr-result-summary-box');
  const ofrResultTotalsTxt = document.getElementById('ofr-result-totals-txt');
  const ofrResultStonesChips = document.getElementById('ofr-result-stones-chips');

  function requestOferendaDepot() {
    sendToActiveTab({
      action: 'FETCH_OFERENDA_CANDIDATES',
      maxNota: ofrNotaMax,
      notaMax: ofrNotaMax,
      elemento: ofrSelectedType,
      tipo: ofrSelectedType
    });
  }

  // Leitura inicial de candidatos do storage se já existirem
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['rotom_oferenda_candidates'], (res) => {
      if (res && res.rotom_oferenda_candidates) {
        const d = res.rotom_oferenda_candidates;
        updateOferendaUI(d.candidates, d.protectedCount, d.totalDepot);
      }
    });
  }

  function updateOferendaUI(candidates, protectedCount, totalDepot) {
    ofrActiveCandidates = candidates || [];
    let total = ofrActiveCandidates.length;
    if (ofrMaxBatches > 0 && total > ofrMaxBatches * 5) {
      total = ofrMaxBatches * 5;
    }
    const safeCount = total - (total % 5);
    const batchesCount = Math.floor(safeCount / 5);
    const displayed = ofrActiveCandidates.slice(0, safeCount);
    const leftover = Math.max(0, (totalDepot || 0) - safeCount);

    if (lblOfrCandidatos) lblOfrCandidatos.textContent = safeCount;
    if (lblOfrPedras) lblOfrPedras.textContent = `${batchesCount} Pedras`;
    if (lblOfrProtegidos) lblOfrProtegidos.textContent = protectedCount || 0;
    if (lblOfrSobra) lblOfrSobra.textContent = leftover;

    if (btnRunOferendaBatch) {
      btnRunOferendaBatch.disabled = (safeCount < 5 || ofrIsRunning);
      btnRunOferendaBatch.textContent = ofrIsRunning
        ? '⏳ Sacrificando em Lote...'
        : `🔮 Executar Oferenda em Lote (${batchesCount} Pedras Garantidas)`;
    }

    if (containerOferendaPreviewGrid) {
      containerOferendaPreviewGrid.innerHTML = '';
      if (displayed.length === 0) {
        containerOferendaPreviewGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--sobre-mad-dim); font-size: 11px;">
            Nenhum Pokémon elegível encontrado para oferenda com os filtros atuais.<br>
            <span style="font-size: 9px; color: var(--vao-dim);">Tente aumentar a nota de corte ou selecionar Todos os Tipos.</span>
          </div>
        `;
        return;
      }

      displayed.forEach((pk, idx) => {
        const card = document.createElement('div');
        card.className = 'community-item-card';
        card.style.padding = '6px 8px';
        card.style.gap = '4px';

        const pDexId = Number(pk.speciesId || pk.pokemonId || pk.pId || 1);
        const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pDexId}.png`;
        const notaFmt = Number(pk.nota || 0).toFixed(1);

        card.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden;">
              <img src="${spriteUrl}" style="width: 24px; height: 24px; image-rendering: pixelated; object-fit: contain; flex-shrink: 0;" onerror="this.src='https://pokeidle.io/assets/site/assets/ui/ball-poke.png';">
              <span style="font-size: 10px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${pk.nome}">
                ${pk.nome}
              </span>
            </div>
            <span style="font-size: 8px; color: var(--sobre-mad-dim); font-weight: 700; white-space: nowrap;">#Lote ${Math.floor(idx / 5) + 1}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px; background: rgba(0,0,0,0.3); padding: 2px 5px; border-radius: 0px;">
            <span style="color: var(--vao-dim);">Nv. ${pk.level || 1}</span>
            <span style="color: var(--ouro); font-weight: 800;">Nota ${notaFmt}</span>
          </div>
        `;
        containerOferendaPreviewGrid.appendChild(card);
      });
    }
  }

  // Filtro de Nota Manual com Debounce
  let ofrNotaDebounce = null;
  if (inputOferendaNotaManual) {
    inputOferendaNotaManual.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val >= 0 && val <= 10) {
        ofrNotaMax = val;
        ofrNotaFilters.forEach(b => {
          const bVal = parseFloat(b.getAttribute('data-nota'));
          const isMatch = Math.abs(bVal - val) < 0.05;
          b.classList.toggle('on', isMatch);
          b.classList.toggle('apagado', !isMatch);
        });
        clearTimeout(ofrNotaDebounce);
        ofrNotaDebounce = setTimeout(() => requestOferendaDepot(), 250);
      }
    });
  }

  // Filtros de Nota Presets
  ofrNotaFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      ofrNotaFilters.forEach(b => { b.classList.remove('on'); b.classList.add('apagado'); });
      btn.classList.remove('apagado');
      btn.classList.add('on');
      ofrNotaMax = Number(btn.getAttribute('data-nota')) || 5.0;
      if (inputOferendaNotaManual) inputOferendaNotaManual.value = ofrNotaMax.toFixed(1);
      requestOferendaDepot();
    });
  });

  if (selectOferendaTipo) {
    selectOferendaTipo.addEventListener('change', (e) => {
      ofrSelectedType = e.target.value;
      requestOferendaDepot();
    });
  }

  if (selectOferendaMaxBatches) {
    selectOferendaMaxBatches.addEventListener('change', (e) => {
      ofrMaxBatches = Number(e.target.value) || 0;
      requestOferendaDepot();
    });
  }

  if (selectOferendaPacing) {
    selectOferendaPacing.addEventListener('change', (e) => {
      ofrPacingMs = Number(e.target.value) || 800;
    });
  }

  if (btnRefreshOferendaDepot) {
    btnRefreshOferendaDepot.addEventListener('click', () => {
      requestOferendaDepot();
    });
  }

  if (btnRunOferendaBatch) {
    btnRunOferendaBatch.addEventListener('click', () => {
      let total = ofrActiveCandidates.length;
      if (ofrMaxBatches > 0 && total > ofrMaxBatches * 5) {
        total = ofrMaxBatches * 5;
      }
      const safeCount = total - (total % 5);
      if (safeCount < 5 || ofrIsRunning) return;

      const ids = ofrActiveCandidates.slice(0, safeCount).map(p => Number(p.id));
      ofrIsRunning = true;
      if (btnRunOferendaBatch) {
        btnRunOferendaBatch.disabled = true;
        btnRunOferendaBatch.textContent = '⏳ Sacrificando em Lote...';
      }

      if (ofrProgressBarContainer) ofrProgressBarContainer.style.display = 'flex';
      if (ofrResultSummaryBox) ofrResultSummaryBox.style.display = 'none';

      sendToActiveTab({
        action: 'EXECUTE_OFERENDA_BATCH',
        pokemonIds: ids,
        pacingMs: ofrPacingMs || 800
      });
    });
  }

  // Listener para atualizações de candidatos e progresso vindas da aba do jogo
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.rotom_oferenda_candidates && changes.rotom_oferenda_candidates.newValue) {
        const d = changes.rotom_oferenda_candidates.newValue;
        updateOferendaUI(d.candidates, d.protectedCount, d.totalDepot);
      }
      if (changes.rotom_oferenda_progress && changes.rotom_oferenda_progress.newValue) {
        const p = changes.rotom_oferenda_progress.newValue;
        if (ofrProgressBarContainer) ofrProgressBarContainer.style.display = 'flex';
        if (ofrProgressCountTxt) ofrProgressCountTxt.textContent = `Lote ${p.batch} / ${p.totalBatches} (${p.sacrificed} Pokémons)`;
        if (ofrProgressFill) {
          const pct = Math.min(100, Math.round((p.batch / (p.totalBatches || 1)) * 100));
          ofrProgressFill.style.width = pct + '%';
        }
      }
      if (changes.rotom_oferenda_completed && changes.rotom_oferenda_completed.newValue) {
        const c = changes.rotom_oferenda_completed.newValue;
        ofrIsRunning = false;
        if (ofrProgressBarContainer) ofrProgressBarContainer.style.display = 'none';
        if (ofrResultSummaryBox) ofrResultSummaryBox.style.display = 'flex';
        if (ofrResultTotalsTxt) {
          ofrResultTotalsTxt.textContent = `${c.totalSacrificed} Pokémons sacrificados em ${c.batchesExecuted} giros`;
        }
        if (ofrResultStonesChips) {
          ofrResultStonesChips.innerHTML = '';
          const entries = Object.entries(c.stonesReceived || {});
          if (entries.length === 0) {
            ofrResultStonesChips.innerHTML = '<span style="font-size: 10px; color: var(--ouro);">Pedras adicionadas à bolsa com sucesso!</span>';
          } else {
            entries.forEach(([stone, qtd]) => {
              const chip = document.createElement('span');
              chip.className = 'slot-pill';
              chip.style.padding = '3px 8px';
              chip.style.fontSize = '10px';
              chip.style.fontWeight = '800';
              chip.textContent = `${stone}: +${qtd}`;
              ofrResultStonesChips.appendChild(chip);
            });
          }
        }
        requestOferendaDepot();
      }
    });
  }

  // Verifica se foi aberto com intenção de ir para uma aba específica (ex: URL ?tab=oferendas ou storage)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get('tab');
    if (targetTab && ['sniper', 'market', 'stats', 'hunts', 'oferendas'].includes(targetTab)) {
      switchMainView(targetTab);
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['rotom_pending_cockpit_tab'], (res) => {
        if (res && res.rotom_pending_cockpit_tab) {
          const tab = res.rotom_pending_cockpit_tab;
          chrome.storage.local.remove('rotom_pending_cockpit_tab');
          if (['sniper', 'market', 'stats', 'hunts', 'oferendas'].includes(tab)) {
            switchMainView(tab);
          }
        }
      });
    }
  } catch (e) {}
});

}
let panel;
function openPanel() {
  if (!document.body) return;
  if (panel) { panel.hidden = !panel.hidden; return; }
  panel = document.createElement('section');
  panel.id = 'pio-auto-sniper-panel';
  panel.style.cssText = 'position:fixed;inset:5vh 3vw;z-index:2147483001;background:#2c1b1c;border:2px solid #9c6a3f;border-radius:10px;overflow:hidden;box-shadow:0 14px 44px #000b';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;color:#ffe3a2;background:#4d3027;font:14px system-ui';
  bar.textContent = 'Auto-Sniper · v1.5.2.1';
  const close = document.createElement('button');
  close.textContent = 'Fechar ×';
  close.onclick = () => { panel.hidden = true; };
  bar.append(close);
  const frame = document.createElement('iframe');
  frame.title = 'Auto-Sniper — cockpit';
  frame.style.cssText = 'width:100%;height:calc(100% - 34px);border:0';
  panel.append(bar, frame);
  document.body.append(panel);
  const doc = frame.contentDocument;
  doc.open(); doc.write(cockpitHTML); doc.close();
  runCockpit(frame.contentWindow, doc, chrome);
}
function mountLauncher() {
  if (!document.body || document.getElementById('pio-auto-sniper-menu')) return;
  const button = document.createElement('button');
  button.id = 'pio-auto-sniper-menu';
  button.textContent = 'Auto-Sniper';
  button.style.cssText = 'position:fixed;bottom:15px;right:15px;z-index:2147483000;padding:9px 14px;color:#ffe3a2;background:linear-gradient(#68452d,#3b261d);border:1px solid #b48850;border-radius:7px;cursor:pointer;font:bold 13px system-ui';
  button.onclick = openPanel;
  document.body.append(button);
}
window.PIOAutoSniper = {open:openPanel, diagnostico:() => ({version:'1.5.2.1', socket:window.__activeGameWs?.readyState, panel:!!panel, storage:'localStorage', earlyHook:true})};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLauncher, {once:true});
else mountLauncher();

})();