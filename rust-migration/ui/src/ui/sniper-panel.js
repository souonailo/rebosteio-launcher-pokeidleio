/**
 * @file sniper-panel.js
 * Painel Central de Auto-Sniper (Mercado) para PIO Rebosteio.
 * Gerencia regras para 4 contas fixas (0..3) com suporte tanto para
 * contas Visuais (Userscript) quanto Headless (Nativo WebSocket).
 * Inclui opções completas de radar (Shiny, P5, Nota mínima), regras
 * por categoria agregada e seletor de cadência de varredura.
 */

((root) => {
  'use strict';

  // Categorias canônicas suportadas para regras de compra agregada
  const CANONICAL_CATEGORIES = [
    { id: 'stone', name: 'Pedras' },
    { id: 'tm', name: 'TMs' },
    { id: 'rare_loot', name: 'Loots Raros (4 itens)' },
    { id: 'beast', name: 'Beast Balls' },
    { id: 'casa', name: 'Casas' },
    { id: 'box', name: 'Boxes' },
    { id: 'bicicleta', name: 'Bicicletas' },
    { id: 'fragment', name: 'Fragmentos de Mega e Ovo Shiny' },
    { id: 'ticket', name: 'Tickets' }
  ];

  // Catálogo compartilhado de 80 itens do PokeIdle para busca e autocompletar
  const DEFAULT_ITEMS_CATALOG = [
  {
    "id": 999999,
    "name": "Diamantes",
    "icon": "https://pokeidle.io/img/moeda-diamante.png",
    "category": "diamante",
    "categoryLabel": "Diamantes",
    "type": "CAMBIO",
    "npcPrice": 0
  },
  {
    "id": 2,
    "name": "Ancient Stone",
    "icon": "/assets/stones/ancient_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "DRAGON",
    "npcPrice": 0
  },
  {
    "id": 23,
    "name": "Cocoon Stone",
    "icon": "cocoon_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "BUG",
    "npcPrice": 0
  },
  {
    "id": 28,
    "name": "Crystal Stone",
    "icon": "crystal_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "ICE",
    "npcPrice": 0
  },
  {
    "id": 31,
    "name": "Darkness Stone",
    "icon": "darkness_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "DARK",
    "npcPrice": 0
  },
  {
    "id": 40,
    "name": "Earth Stone",
    "icon": "earth_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "GROUND",
    "npcPrice": 0
  },
  {
    "id": 45,
    "name": "Enigma Stone",
    "icon": "enigma_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "PSYCHIC",
    "npcPrice": 0
  },
  {
    "id": 49,
    "name": "Feather Stone",
    "icon": "/assets/stones/feather_stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FLYING",
    "npcPrice": 0
  },
  {
    "id": 53,
    "name": "Fire Stone",
    "icon": "fire_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FIRE",
    "npcPrice": 0
  },
  {
    "id": 66,
    "name": "Heart Stone",
    "icon": "heart_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "NORMAL",
    "npcPrice": 0
  },
  {
    "id": 71,
    "name": "Ice Stone",
    "icon": "ice_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "ICE",
    "npcPrice": 0
  },
  {
    "id": 76,
    "name": "Leaf Stone",
    "icon": "leaf_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "GRASS",
    "npcPrice": 0
  },
  {
    "id": 87,
    "name": "Metal Stone",
    "icon": "/assets/stones/metal_stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "STEEL",
    "npcPrice": 0
  },
  {
    "id": 106,
    "name": "Punch Stone",
    "icon": "punch_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FIGHTING",
    "npcPrice": 0
  },
  {
    "id": 109,
    "name": "Rock Stone",
    "icon": "rock_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "ROCK",
    "npcPrice": 0
  },
  {
    "id": 209,
    "name": "Sun Stone",
    "icon": "/assets/stones/sun_stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FIRE",
    "npcPrice": 0
  },
  {
    "id": 133,
    "name": "Thunder Stone",
    "icon": "thunder_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "ELECTRIC",
    "npcPrice": 0
  },
  {
    "id": 139,
    "name": "Venom Stone",
    "icon": "venom_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "POISON",
    "npcPrice": 0
  },
  {
    "id": 142,
    "name": "Water Stone",
    "icon": "water_stone.gif",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "WATER",
    "npcPrice": 0
  },
  {
    "id": 70031,
    "name": "Bug Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "BUG",
    "npcPrice": 0
  },
  {
    "id": 70035,
    "name": "Dark Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "DARK",
    "npcPrice": 0
  },
  {
    "id": 70034,
    "name": "Dragon Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "DRAGON",
    "npcPrice": 0
  },
  {
    "id": 70024,
    "name": "Electric Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "ELECTRIC",
    "npcPrice": 0
  },
  {
    "id": 70037,
    "name": "Fairy Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FAIRY",
    "npcPrice": 0
  },
  {
    "id": 70026,
    "name": "Fighting Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FIGHTING",
    "npcPrice": 0
  },
  {
    "id": 70021,
    "name": "Fire Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FIRE",
    "npcPrice": 0
  },
  {
    "id": 70029,
    "name": "Flying Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "FLYING",
    "npcPrice": 0
  },
  {
    "id": 70033,
    "name": "Ghost Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "GHOST",
    "npcPrice": 0
  },
  {
    "id": 70023,
    "name": "Grass Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "GRASS",
    "npcPrice": 0
  },
  {
    "id": 70028,
    "name": "Ground Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "GROUND",
    "npcPrice": 0
  },
  {
    "id": 70025,
    "name": "Ice Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "ICE",
    "npcPrice": 0
  },
  {
    "id": 70020,
    "name": "Normal Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "NORMAL",
    "npcPrice": 0
  },
  {
    "id": 70027,
    "name": "Poison Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "POISON",
    "npcPrice": 0
  },
  {
    "id": 70030,
    "name": "Psychic Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "PSYCHIC",
    "npcPrice": 0
  },
  {
    "id": 70032,
    "name": "Rock Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "ROCK",
    "npcPrice": 0
  },
  {
    "id": 70036,
    "name": "Steel Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "STEEL",
    "npcPrice": 0
  },
  {
    "id": 70022,
    "name": "Water Shiny Stone",
    "icon": "/img/itens/shiny-stone.png",
    "category": "stone",
    "categoryLabel": "Pedras",
    "type": "WATER",
    "npcPrice": 0
  },
  {
    "id": 40575,
    "name": "AoE TM Disk",
    "icon": "/assets/items/tm_disk_aoe.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": null,
    "npcPrice": 0
  },
  {
    "id": 40530,
    "name": "AoE TM Disk Piece",
    "icon": "/assets/items/tm_piece_aoe.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": null,
    "npcPrice": 0
  },
  {
    "id": 59194,
    "name": "TM Disk Piece",
    "icon": "/assets/items/tm_disk_piece.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Fragmento de Z-Move"
    ]
  },
  {
    "id": 59200,
    "name": "Normal-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "NORMAL",
    "npcPrice": 0
  },
  {
    "id": 59201,
    "name": "Fire-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "FIRE",
    "npcPrice": 0
  },
  {
    "id": 59202,
    "name": "Water-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "WATER",
    "npcPrice": 0
  },
  {
    "id": 59203,
    "name": "Grass-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "GRASS",
    "npcPrice": 0
  },
  {
    "id": 59204,
    "name": "Electric-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "ELECTRIC",
    "npcPrice": 0
  },
  {
    "id": 59205,
    "name": "Ice-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "ICE",
    "npcPrice": 0
  },
  {
    "id": 59206,
    "name": "Fighting-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "FIGHTING",
    "npcPrice": 0
  },
  {
    "id": 59207,
    "name": "Poison-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "POISON",
    "npcPrice": 0
  },
  {
    "id": 59208,
    "name": "Ground-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "GROUND",
    "npcPrice": 0
  },
  {
    "id": 59209,
    "name": "Flying-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "FLYING",
    "npcPrice": 0
  },
  {
    "id": 59210,
    "name": "Psychic-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "PSYCHIC",
    "npcPrice": 0
  },
  {
    "id": 59211,
    "name": "Bug-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "BUG",
    "npcPrice": 0
  },
  {
    "id": 59212,
    "name": "Rock-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "ROCK",
    "npcPrice": 0
  },
  {
    "id": 59213,
    "name": "Ghost-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "GHOST",
    "npcPrice": 0
  },
  {
    "id": 59214,
    "name": "Dragon-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "DRAGON",
    "npcPrice": 0
  },
  {
    "id": 59215,
    "name": "Dark-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "DARK",
    "npcPrice": 0
  },
  {
    "id": 59216,
    "name": "Steel-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "STEEL",
    "npcPrice": 0
  },
  {
    "id": 59247,
    "name": "Fairy-Type TM Disk",
    "icon": "/assets/items/tm_disk_elemental.png",
    "category": "tm",
    "categoryLabel": "TMs",
    "type": "FAIRY",
    "npcPrice": 0
  },
  {
    "id": 70012,
    "name": "Shiny Stone Fragment",
    "icon": "/img/itens/shiny-stone.png",
    "category": "rare_loot",
    "categoryLabel": "Loots Raros",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Fragmento de Shiny Stone"
    ]
  },
  {
    "id": 70011,
    "name": "Key Fragment",
    "icon": "/img/itens/fragmento-chave.png",
    "category": "rare_loot",
    "categoryLabel": "Loots Raros",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Fragmento de Chave"
    ]
  },
  {
    "id": 70000,
    "name": "Bronze Boss Token",
    "icon": "/assets/items/bronze_boss_token.png",
    "category": "rare_loot",
    "categoryLabel": "Loots Raros",
    "type": null,
    "npcPrice": 250000
  },
  {
    "id": 70013,
    "name": "Bicycle Fragment",
    "icon": "/img/itens/fragmento-bicicleta.png",
    "category": "rare_loot",
    "categoryLabel": "Loots Raros",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Fragmento de Bicicleta"
    ]
  },
  {
    "id": 5,
    "name": "Beast Ball",
    "icon": "/img/ball-beast.png",
    "category": "beast",
    "categoryLabel": "Beast Balls",
    "type": null,
    "npcPrice": 0
  },
  {
    "id": 70040,
    "name": "Common House",
    "icon": "/img/itens/casa-comum.png",
    "category": "casa",
    "categoryLabel": "Casas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Casa Comum"
    ]
  },
  {
    "id": 70041,
    "name": "Uncommon House",
    "icon": "/img/itens/casa-incomum.png",
    "category": "casa",
    "categoryLabel": "Casas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Casa Incomum"
    ]
  },
  {
    "id": 70042,
    "name": "Rare House",
    "icon": "/img/itens/casa-rara.png",
    "category": "casa",
    "categoryLabel": "Casas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Casa Rara"
    ]
  },
  {
    "id": 70043,
    "name": "Mythic House",
    "icon": "/img/itens/casa-mitica.png",
    "category": "casa",
    "categoryLabel": "Casas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Casa Mítica"
    ]
  },
  {
    "id": 70044,
    "name": "Legendary House",
    "icon": "/img/itens/casa-lendaria.png",
    "category": "casa",
    "categoryLabel": "Casas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Casa Lendária"
    ]
  },
  {
    "id": 70060,
    "name": "Founder Box",
    "icon": "/img/itens/caixa-fundador.png",
    "category": "box",
    "categoryLabel": "Boxes",
    "type": null,
    "npcPrice": 0
  },
  {
    "id": 70061,
    "name": "Co-Founder Box",
    "icon": "/img/itens/caixa-cofundador.png",
    "category": "box",
    "categoryLabel": "Boxes",
    "type": null,
    "npcPrice": 0
  },
  {
    "id": 70080,
    "name": "Common Bicycle",
    "icon": "/img/itens/bicicleta-comum.png",
    "category": "bicicleta",
    "categoryLabel": "Bicicletas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Bicicleta Comum"
    ]
  },
  {
    "id": 70081,
    "name": "Uncommon Bicycle",
    "icon": "/img/itens/bicicleta-incomum.png",
    "category": "bicicleta",
    "categoryLabel": "Bicicletas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Bicicleta Incomum"
    ]
  },
  {
    "id": 70082,
    "name": "Rare Bicycle",
    "icon": "/img/itens/bicicleta-rara.png",
    "category": "bicicleta",
    "categoryLabel": "Bicicletas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Bicicleta Rara"
    ]
  },
  {
    "id": 70083,
    "name": "Mythic Bicycle",
    "icon": "/img/itens/bicicleta-mitica.png",
    "category": "bicicleta",
    "categoryLabel": "Bicicletas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Bicicleta Mítica"
    ]
  },
  {
    "id": 70084,
    "name": "Legendary Bicycle",
    "icon": "/img/itens/bicicleta-lendaria.png",
    "category": "bicicleta",
    "categoryLabel": "Bicicletas",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Bicicleta Lendária"
    ]
  },
  {
    "id": 70014,
    "name": "Fragmento de MEGA Stone",
    "icon": "",
    "category": "fragment",
    "categoryLabel": "Fragmentos de Mega e Ovo Shiny",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Mega Stone Fragment"
    ]
  },
  {
    "id": 70015,
    "name": "Fragmento de MEGA Shiny Stone",
    "icon": "",
    "category": "fragment",
    "categoryLabel": "Fragmentos de Mega e Ovo Shiny",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Mega Shiny Stone Fragment"
    ]
  },
  {
    "id": 70017,
    "name": "Fragmento de Ovo Shiny",
    "icon": "",
    "category": "fragment",
    "categoryLabel": "Fragmentos de Mega e Ovo Shiny",
    "type": null,
    "npcPrice": 0,
    "aliases": [
      "Shiny Egg Fragment"
    ]
  },
  {
    "id": 70090,
    "name": "Mystic Ticket",
    "icon": "",
    "category": "ticket",
    "categoryLabel": "Tickets",
    "type": null,
    "npcPrice": 0
  },
  {
    "id": 70095,
    "name": "Safari Ticket",
    "icon": "",
    "category": "ticket",
    "categoryLabel": "Tickets",
    "type": null,
    "npcPrice": 0
  }
];

  function createDefaultConfig() {
    return {
      scanMode: 'original',
      scanIntervalMs: 45000,
      fastScanIntervalMs: 3000,
      snipeAnyShiny: false,
      maxPriceShinyGold: 0,
      maxPriceShinyGems: 0,
      maxPriceShinyDiamonds: 0,
      snipeAnyP5: false,
      maxPriceP5Gold: 0,
      maxPriceP5Gems: 0,
      maxPriceP5Diamonds: 0,
      snipeByNote: false,
      minNote: 7.0,
      maxPriceNoteGold: 0,
      maxPriceNoteGems: 0,
      maxPriceNoteDiamonds: 0,
      maxActiveSlots: 5,
      autoMaxAffordable: true
    };
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeConfigAliases(rawCfg) {
    if (!rawCfg || typeof rawCfg !== 'object') return {};
    const cfg = Object.assign({}, rawCfg);

    // Shiny diamonds <-> gems alias
    if (cfg.maxPriceShinyDiamonds != null && cfg.maxPriceShinyGems == null) {
      cfg.maxPriceShinyGems = cfg.maxPriceShinyDiamonds;
    } else if (cfg.maxPriceShinyGems != null && cfg.maxPriceShinyDiamonds == null) {
      cfg.maxPriceShinyDiamonds = cfg.maxPriceShinyGems;
    }

    // P5 diamonds <-> gems alias
    if (cfg.maxPriceP5Diamonds != null && cfg.maxPriceP5Gems == null) {
      cfg.maxPriceP5Gems = cfg.maxPriceP5Diamonds;
    } else if (cfg.maxPriceP5Gems != null && cfg.maxPriceP5Diamonds == null) {
      cfg.maxPriceP5Diamonds = cfg.maxPriceP5Gems;
    }

    // Note diamonds <-> gems alias
    if (cfg.maxPriceNoteDiamonds != null && cfg.maxPriceNoteGems == null) {
      cfg.maxPriceNoteGems = cfg.maxPriceNoteDiamonds;
    } else if (cfg.maxPriceNoteGems != null && cfg.maxPriceNoteDiamonds == null) {
      cfg.maxPriceNoteDiamonds = cfg.maxPriceNoteGems;
    }

    return cfg;
  }

  function isNonNegativeInteger(n) {
    return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
  }

  function validateConfig(rawCfg) {
    if (!rawCfg || typeof rawCfg !== 'object') {
      return { ok: true, config: createDefaultConfig() };
    }

    const cfg = normalizeConfigAliases(rawCfg);

    // Validação estrita de modo de varredura
    if (cfg.scanMode != null) {
      if (cfg.scanMode !== 'original' && cfg.scanMode !== 'adaptive') {
        return { ok: false, error: `Modo de cadência inválido: '${cfg.scanMode}'. Valores aceitos: 'original' ou 'adaptive'.` };
      }
    }

    // Validação estrita de limites numéricos do Rust / loop
    if (cfg.scanIntervalMs != null) {
      if (!isNonNegativeInteger(cfg.scanIntervalMs) || cfg.scanIntervalMs < 1000) {
        return { ok: false, error: 'O intervalo de varredura normal deve ser um número inteiro maior ou igual a 1000ms.' };
      }
    }
    if (cfg.fastScanIntervalMs != null) {
      if (!isNonNegativeInteger(cfg.fastScanIntervalMs) || cfg.fastScanIntervalMs < 500) {
        return { ok: false, error: 'O intervalo de varredura rápida deve ser um número inteiro maior ou igual a 500ms.' };
      }
    }

    // Validação estrita de tetos de preços (sem converter frações/negativos/Infinity para 0)
    const priceFields = [
      { key: 'maxPriceShinyGold', name: 'Coins de Qualquer Shiny' },
      { key: 'maxPriceShinyGems', name: 'Gemas de Qualquer Shiny' },
      { key: 'maxPriceShinyDiamonds', name: 'Diamantes de Qualquer Shiny' },
      { key: 'maxPriceP5Gold', name: 'Coins de Qualquer P5' },
      { key: 'maxPriceP5Gems', name: 'Gemas de Qualquer P5' },
      { key: 'maxPriceP5Diamonds', name: 'Diamantes de Qualquer P5' },
      { key: 'maxPriceNoteGold', name: 'Coins de Nota Mínima' },
      { key: 'maxPriceNoteGems', name: 'Gemas de Nota Mínima' },
      { key: 'maxPriceNoteDiamonds', name: 'Diamantes de Nota Mínima' }
    ];

    for (const f of priceFields) {
      if (cfg[f.key] != null) {
        if (!isNonNegativeInteger(cfg[f.key])) {
          return { ok: false, error: `O teto de ${f.name} deve ser um número inteiro não negativo.` };
        }
      }
    }

    // Validação estrita de slots
    if (cfg.maxActiveSlots != null) {
      if (!isNonNegativeInteger(cfg.maxActiveSlots) || cfg.maxActiveSlots < 1 || cfg.maxActiveSlots > 50) {
        return { ok: false, error: 'O limite de slots ativos deve ser entre 1 e 50.' };
      }
    }

    // Validação estrita de minNote (1.0..10.0, passo 0.1, sem arredondamento silencioso)
    if (cfg.minNote != null) {
      const note = Number(cfg.minNote);
      if (!Number.isFinite(note) || note < 1.0 || note > 10.0) {
        return { ok: false, error: 'A nota mínima deve ser um valor entre 1.0 e 10.0.' };
      }
      // Verifica se possui no máximo 1 casa decimal
      if (Math.round(note * 10) !== Math.round(note * 100) / 10) {
        return { ok: false, error: 'A nota mínima deve ter no máximo uma casa decimal (passo de 0.1).' };
      }
    }

    const def = createDefaultConfig();
    const config = Object.assign({}, def, cfg);

    // Sincroniza aliases bidirecionalmente
    config.maxPriceShinyDiamonds = config.maxPriceShinyGems;
    config.maxPriceP5Diamonds = config.maxPriceP5Gems;
    config.maxPriceNoteDiamonds = config.maxPriceNoteGems;

    // Validação de tetos obrigatórios quando ativado
    if (Boolean(config.snipeAnyShiny)) {
      if (config.maxPriceShinyGold === 0 && config.maxPriceShinyGems === 0) {
        return { ok: false, error: 'Radar "Qualquer Shiny" ativo requer ao menos um teto de preço (Coins ou Gemas) maior que zero.' };
      }
    }

    if (Boolean(config.snipeAnyP5)) {
      if (config.maxPriceP5Gold === 0 && config.maxPriceP5Gems === 0) {
        return { ok: false, error: 'Radar "Qualquer P5" ativo requer ao menos um teto de preço (Coins ou Gemas) maior que zero.' };
      }
    }

    if (Boolean(config.snipeByNote)) {
      if (config.maxPriceNoteGold === 0 && config.maxPriceNoteGems === 0) {
        return { ok: false, error: 'Radar "Nota mínima" ativo requer ao menos um teto de preço (Coins ou Gemas) maior que zero.' };
      }
    }

    config.autoMaxAffordable = config.autoMaxAffordable !== false;

    return { ok: true, config };
  }

  function validateRule(rule) {
    if (!rule || typeof rule !== 'object') {
      return { ok: false, error: 'Regra inválida ou não especificada.' };
    }
    if (rule.targetType == null) {
      return { ok: false, error: 'Tipo de alvo não especificado.' };
    }
    const rawType = String(rule.targetType).toLowerCase();
    if (rawType !== 'item' && rawType !== 'category' && rawType !== 'pokemon') {
      return { ok: false, error: `Tipo de alvo inválido: '${rule.targetType}'. Valores aceitos: 'item', 'category' ou 'pokemon'.` };
    }
    const targetType = rawType;
    let targetName = String(rule.targetName || '').trim();
    let targetId = null;
    let targetCategory = null;

    let validatedExclusions = [];

    if (targetType === 'category') {
      const catId = String(rule.targetCategory || '').trim().toLowerCase();
      const canonical = CANONICAL_CATEGORIES.find(c => c.id === catId);
      if (!canonical) {
        return { ok: false, error: 'Categoria inválida. Categorias suportadas: stone, tm, rare_loot, beast, casa, box, bicicleta, fragment, ticket.' };
      }
      targetCategory = canonical.id;
      targetId = null;
      targetName = canonical.name;

      if (rule.excludedItemIds != null) {
        if (!Array.isArray(rule.excludedItemIds)) {
          return { ok: false, error: 'A lista de exclusões (excludedItemIds) deve ser um array de IDs numéricos.' };
        }
        const catalogList = (sniperState && Array.isArray(sniperState.itemsCatalog) && sniperState.itemsCatalog.length > 0)
          ? sniperState.itemsCatalog
          : DEFAULT_ITEMS_CATALOG;
        const validCategoryItems = catalogList.filter(item => item.category === targetCategory);
        const validCategoryIds = new Set(validCategoryItems.map(item => item.id));

        const seen = new Set();
        for (const rawId of rule.excludedItemIds) {
          if (typeof rawId !== 'number' || !Number.isSafeInteger(rawId) || rawId <= 0) {
            return { ok: false, error: `ID de exclusão inválido: ${JSON.stringify(rawId)}. Deve ser um número inteiro positivo.` };
          }
          if (!validCategoryIds.has(rawId)) {
            return { ok: false, error: `O item ID ${rawId} não pertence à categoria '${targetCategory}'.` };
          }
          if (!seen.has(rawId)) {
            seen.add(rawId);
            validatedExclusions.push(rawId);
          }
        }
      }
    } else {
      // Regra item/pokemon com exclusões não vazias deve gerar erro claro
      if (rule.excludedItemIds != null) {
        if (!Array.isArray(rule.excludedItemIds)) {
          return { ok: false, error: 'A lista de exclusões (excludedItemIds) deve ser um array de IDs numéricos.' };
        }
        if (rule.excludedItemIds.length > 0) {
          return { ok: false, error: 'Exclusões de itens só podem ser configuradas em regras de categoria.' };
        }
      }

      if (rule.targetId != null && String(rule.targetId).trim() !== '') {
        const s = String(rule.targetId).trim();
        if (/^\d+$/.test(s) && parseInt(s, 10) > 0) {
          targetId = parseInt(s, 10);
        }
      }

      // Se nome do item for um alias conhecido, normaliza para o nome canônico mantendo targetId como informado
      if (targetType === 'item' && targetName) {
        const catalogList = (sniperState && Array.isArray(sniperState.itemsCatalog) && sniperState.itemsCatalog.length > 0)
          ? sniperState.itemsCatalog
          : DEFAULT_ITEMS_CATALOG;
        const q = targetName.toLowerCase();
        const found = catalogList.find(it =>
          Array.isArray(it.aliases) && it.aliases.some(a => (a || '').toLowerCase() === q)
        );
        if (found) {
          targetName = found.name;
        }
      }

      if (!targetName && targetId == null) {
        return { ok: false, error: 'Informe o nome ou o ID positivo do item/pokémon.' };
      }
      if (!targetName) {
        targetName = targetType === 'pokemon' ? ('Pokémon #' + targetId) : ('Item #' + targetId);
      }
    }

    const maxPriceGold = Number(rule.maxPriceGold) || 0;
    const maxPriceGems = Number(rule.maxPriceGems) || 0;
    if (!Number.isFinite(maxPriceGold) || maxPriceGold < 0 || !Number.isFinite(maxPriceGems) || maxPriceGems < 0) {
      return { ok: false, error: 'Os tetos de preço não podem ser negativos ou inválidos.' };
    }
    if (maxPriceGold === 0 && maxPriceGems === 0) {
      return { ok: false, error: 'Defina ao menos um teto de preço (Coins ou Gemas) maior que zero.' };
    }

    const infinite = Boolean(rule.infinite);
    let maxQty = infinite ? 0 : Number(rule.maxQty);
    if (!infinite && (!Number.isFinite(maxQty) || maxQty <= 0)) {
      maxQty = 1;
    }

    const validated = {
      ...rule,
      id: rule.id || ('r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      targetType,
      targetId,
      targetName,
      maxPriceGold: Math.floor(maxPriceGold),
      maxPriceGems: Math.floor(maxPriceGems),
      maxQty: Math.floor(maxQty),
      infinite,
      active: rule.active !== false,
      totalBought: Number(rule.totalBought) || 0
    };

    if (targetType === 'category') {
      validated.targetCategory = targetCategory;
      validated.excludedItemIds = validatedExclusions;
    } else {
      validated.excludedItemIds = [];
    }

    return {
      ok: true,
      rule: validated
    };
  }

  async function loadCatalog(pathOrUrl) {
    if (typeof window !== 'undefined' && window.__SNIPER_CATALOG__ && Array.isArray(window.__SNIPER_CATALOG__)) {
      sniperState.itemsCatalog = [...window.__SNIPER_CATALOG__];
      return sniperState.itemsCatalog;
    }
    if (typeof require === 'function' && typeof module === 'object' && !pathOrUrl) {
      try {
        const cat = require('./sniper-catalog.json');
        if (Array.isArray(cat)) {
          sniperState.itemsCatalog = [...cat];
          return sniperState.itemsCatalog;
        }
      } catch {}
    }
    const targetUrl = pathOrUrl || (typeof location !== 'undefined' && location.pathname && location.pathname.includes('/src/ui/') ? 'sniper-catalog.json' : 'src/ui/sniper-catalog.json');
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(targetUrl);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            sniperState.itemsCatalog = list;
            return list;
          }
        }
      } catch {}
    }
    return sniperState.itemsCatalog;
  }

  function getIntegration() {
    if (root.__PIO_SNIPER_INTEGRATION__) {
      return Object.assign({
        getWebview: (i) => (Array.isArray(root.webviews) ? root.webviews[i] : null),
        getAllWebviews: () => (Array.isArray(root.webviews) ? root.webviews : []),
        isAccountOff: (i) => (Array.isArray(root.off) ? Boolean(root.off[i]) : false),
        isScriptOn: (id) => (root.scriptsOn ? Boolean(root.scriptsOn[id]) : false),
        setScriptOn: (id, val) => {},
        ensurePresetLoaded: async (idx) => ({ ok: true }),
        injectScripts: async (wv) => {}
      }, root.__PIO_SNIPER_INTEGRATION__);
    }
    return {
      getWebview: (i) => (Array.isArray(root.webviews) ? root.webviews[i] : null),
      getAllWebviews: () => (Array.isArray(root.webviews) ? root.webviews : []),
      isAccountOff: (i) => (Array.isArray(root.off) ? Boolean(root.off[i]) : false),
      isScriptOn: (id) => (root.scriptsOn ? Boolean(root.scriptsOn[id]) : false),
      setScriptOn: (id, val) => {
        if (root.scriptsOn) root.scriptsOn[id] = Boolean(val);
        if (typeof root.saveScripts === 'function') root.saveScripts(true);
      },
      ensurePresetLoaded: async (idx) => {
        if (root.scriptsOn) root.scriptsOn['pio-sniper'] = true;
        if (typeof root.saveScripts === 'function') root.saveScripts(true);
      },
      injectScripts: async (wv) => {
        if (typeof root.injectScripts === 'function') await root.injectScripts(wv);
      }
    };
  }

  // Estado interno do módulo
  const sniperState = {
    accounts: Array.from({ length: 4 }, (_, i) => ({
      index: i,
      configured: false,
      enabled: false,
      rules: [],
      config: createDefaultConfig(),
      logs: []
    })),
    drafts: {}, // { [accountIndex]: { configured, enabled, rules, config, isDirty } }
    activeTab: 'all', // 'all' ou 0..3
    historyFilter: 'all', // 'all' ou 0..3
    isOpen: false,
    openerEl: null,
    editingRuleId: null,
    ruleDraft: {
      targetType: 'item',
      targetName: '',
      targetId: '',
      targetCategory: 'stone',
      catalogCategoryFilter: '',
      maxPriceGold: 10000,
      maxPriceGems: 0,
      maxQty: 1,
      infinite: false,
      active: true,
      excludedItemIds: []
    },
    itemsCatalog: [...DEFAULT_ITEMS_CATALOG],
    backendSupported: true,
    lastError: null,
    lastSuccess: null,
    logPollTimer: null
  };

  function getAccountState(idx) {
    if (idx === 'all') return null;
    const i = Number(idx);
    return sniperState.accounts[i] || null;
  }

  function getDraftState(idx) {
    if (idx === 'all') return null;
    const i = Number(idx);
    if (!sniperState.drafts[i]) {
      const acc = sniperState.accounts[i] || {
        configured: false,
        enabled: false,
        rules: [],
        config: createDefaultConfig()
      };
      const normCfg = normalizeConfigAliases(acc.config);
      sniperState.drafts[i] = {
        configured: Boolean(acc.configured),
        enabled: Boolean(acc.enabled),
        rules: (acc.rules || []).map(r => ({ ...r })),
        config: Object.assign(createDefaultConfig(), normCfg),
        isDirty: false
      };
    }
    return sniperState.drafts[i];
  }

  function getAccountMode(idx) {
    const i = Number(idx);
    if (root.PioBattleHud && typeof root.PioBattleHud.isBlasterActive === 'function') {
      if (root.PioBattleHud.isBlasterActive(i)) {
        return 'headless';
      }
    }
    const integration = getIntegration();
    if (integration.isAccountOff(i)) {
      return 'offline';
    }
    const wv = integration.getWebview(i);
    if (wv) {
      return 'visual';
    }
    return 'offline';
  }

  /**
   * Sincroniza configuração autoritativa com o armazenamento visual (PIOSniperStorage)
   */
  async function syncVisualWebview(idx, settings) {
    const i = Number(idx);
    const mode = getAccountMode(i);

    if (mode === 'headless' || mode === 'offline') {
      return { ok: true, skipped: true, mode };
    }

    const integration = getIntegration();
    const wv = integration.getWebview(i);
    if (!wv || typeof wv.executeJavaScript !== 'function') {
      return { ok: false, error: 'Webview indisponível na Conta ' + (i + 1) };
    }

    if (typeof integration.isLoginUrl === 'function' && integration.isLoginUrl(wv)) {
      return { ok: true, skipped: true, reason: 'login_screen' };
    }

    const payloadRules = settings.rules || [];
    const payloadConfig = Object.assign(createDefaultConfig(), settings.config || {});
    const payloadEnabled = Boolean(settings.enabled);

    // PASSO 1: Pré-alimenta o armazenamento visual (localStorage e PIOSniperStorage) PRIMEIRO,
    // antes de carregar o preset, para que o userscript nunca inicialize com regras defasadas
    const writeScript = `(async () => {
      try {
        const prefix = 'pio-auto-sniper-v1:';
        let existingMap = new Map();

        if (typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem(prefix + 'rotom_sniper_rules');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                parsed.forEach(r => { if (r && r.id != null) existingMap.set(String(r.id), Number(r.totalBought) || 0); });
              }
            }
          } catch {}
        }

        const S = window.PIOSniperStorage;
        if (S && typeof S.get === 'function') {
          try {
            const existingData = await S.get(['rotom_sniper_rules']);
            if (existingData && Array.isArray(existingData.rotom_sniper_rules)) {
              existingData.rotom_sniper_rules.forEach(r => {
                if (r && r.id != null) {
                  const cur = existingMap.get(String(r.id)) || 0;
                  existingMap.set(String(r.id), Math.max(cur, Number(r.totalBought) || 0));
                }
              });
            }
          } catch {}
        }

        const rulesToSave = (${JSON.stringify(payloadRules)}).map(r => {
          const visualCount = existingMap.get(String(r.id)) || 0;
          const nativeCount = Number(r.totalBought) || 0;
          return {
            ...r,
            totalBought: Math.max(nativeCount, visualCount)
          };
        });

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(prefix + 'rotom_sniper_enabled', JSON.stringify(${JSON.stringify(payloadEnabled)}));
          localStorage.setItem(prefix + 'rotom_sniper_rules', JSON.stringify(rulesToSave));
          localStorage.setItem(prefix + 'rotom_sniper_config', JSON.stringify(${JSON.stringify(payloadConfig)}));
        }

        if (S && typeof S.set === 'function') {
          await S.set({
            rotom_sniper_enabled: ${JSON.stringify(payloadEnabled)},
            rotom_sniper_rules: rulesToSave,
            rotom_sniper_config: ${JSON.stringify(payloadConfig)}
          });
          window.postMessage({ source: 'ROTOM_POPUP', type: 'SET_SNIPER_ENABLED', enabled: ${JSON.stringify(payloadEnabled)} }, '*');
          window.postMessage({ source: 'ROTOM_POPUP', type: 'UPDATE_SNIPER_RULES', rules: rulesToSave }, '*');
          window.postMessage({ source: 'ROTOM_POPUP', type: 'UPDATE_SNIPER_CONFIG', config: ${JSON.stringify(payloadConfig)} }, '*');
        }

        return { ok: true, mergedRules: rulesToSave };
      } catch (e) {
        return { ok: false, msg: String(e && e.message || e) };
      }
    })()`;

    let res;
    try {
      res = await wv.executeJavaScript(writeScript);
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }

    if (res == null || !res.ok) {
      return { ok: false, error: (res && res.msg) || 'Retorno nulo ou inválido do painel visual' };
    }

    // PASSO 2: Agora que o armazenamento está pré-populado com as regras autoritativas e o novo enabled,
    // garante que o preset esteja carregado se a conta estiver ativada
    if (settings.enabled) {
      const presetRes = typeof integration.ensurePresetLoaded === 'function' ? await integration.ensurePresetLoaded(i) : { ok: true };
      if (presetRes && presetRes.ok === false) {
        return { ok: false, error: presetRes.error || 'Falha ao carregar motor do Auto-Sniper no jogo' };
      }
      try {
        await wv.executeJavaScript(`(() => {
          if (window.PIOSniperStorage) {
            window.postMessage({ source: 'ROTOM_POPUP', type: 'SET_SNIPER_ENABLED', enabled: true }, '*');
          }
        })()`);
      } catch {}
    }

    return { ok: true, mergedRules: res.mergedRules };
  }

  async function restoreConfiguredVisualAccount(idx) {
    const i = Number(idx);
    try {
      await loadCatalog();
    } catch (catErr) {
      console.warn('[sniper-panel] Erro ao carregar catálogo dinâmico, utilizando catálogo local base:', catErr);
      sniperState.catalogLoadWarning = true;
    }

    try {
      await loadBackendState();
    } catch (err) {
      console.warn(`[sniper-panel] Falha ao carregar estado do backend em restoreConfiguredVisualAccount (${i}):`, err);
      return { ok: false, error: 'Falha ao obter estado do backend: ' + (err.message || err) };
    }
    const acc = sniperState.accounts[i];
    if (!acc || !acc.configured) {
      return { ok: true, skipped: true, reason: 'not_configured' };
    }
    if (getAccountMode(i) === 'headless') {
      return { ok: true, skipped: true, reason: 'headless' };
    }
    return await syncVisualWebview(i, acc);
  }

  async function preseedVisualAccount(idx, wv) {
    const i = Number(idx);
    try {
      await loadCatalog();
    } catch (catErr) {
      console.warn('[sniper-panel] Erro ao carregar catálogo dinâmico, utilizando catálogo local base:', catErr);
      sniperState.catalogLoadWarning = true;
    }

    try {
      await loadBackendState();
    } catch (err) {
      return { ok: false, error: 'Falha ao carregar estado do backend: ' + (err.message || err) };
    }

    const acc = sniperState.accounts[i];
    const mode = getAccountMode(i);

    if (!acc || !acc.configured) {
      if (mode === 'headless') {
        const script = `(() => {
          try {
            const prefix = 'pio-auto-sniper-v1:';
            if (typeof localStorage !== 'undefined') localStorage.setItem(prefix + 'rotom_sniper_enabled', 'false');
            if (window.PIOSniperStorage && typeof window.PIOSniperStorage.set === 'function') {
              window.PIOSniperStorage.set({ rotom_sniper_enabled: false }).catch(() => {});
              window.postMessage({ source: 'ROTOM_POPUP', type: 'SET_SNIPER_ENABLED', enabled: false }, '*');
            }
            return { ok: true, headlessDisabled: true };
          } catch (e) { return { ok: false, error: String(e) }; }
        })()`;
        try {
          await wv.executeJavaScript(script);
        } catch {}
      }
      return { ok: true, skipped: true, reason: 'unconfigured' };
    }

    const targetEnabled = mode === 'headless' ? false : Boolean(acc.enabled);
    const targetRules = acc.rules || [];
    const targetConfig = Object.assign(createDefaultConfig(), normalizeConfigAliases(acc.config));

    const payloadRulesJson = JSON.stringify(targetRules);
    const payloadConfigJson = JSON.stringify(targetConfig);
    const payloadEnabledJson = JSON.stringify(targetEnabled);

    const script = `(async () => {
      try {
        const prefix = 'pio-auto-sniper-v1:';
        let existingMap = new Map();

        if (typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem(prefix + 'rotom_sniper_rules');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                parsed.forEach(r => { if (r && r.id != null) existingMap.set(String(r.id), Number(r.totalBought) || 0); });
              }
            }
          } catch {}
        }

        const S = window.PIOSniperStorage;
        if (S && typeof S.get === 'function') {
          try {
            const existingData = await S.get(['rotom_sniper_rules']);
            if (existingData && Array.isArray(existingData.rotom_sniper_rules)) {
              existingData.rotom_sniper_rules.forEach(r => {
                if (r && r.id != null) {
                  const cur = existingMap.get(String(r.id)) || 0;
                  existingMap.set(String(r.id), Math.max(cur, Number(r.totalBought) || 0));
                }
              });
            }
          } catch {}
        }

        const mergedRules = (${payloadRulesJson}).map(r => {
          const visualCount = existingMap.get(String(r.id)) || 0;
          const nativeCount = Number(r.totalBought) || 0;
          return {
            ...r,
            totalBought: Math.max(nativeCount, visualCount)
          };
        });

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(prefix + 'rotom_sniper_enabled', JSON.stringify(${payloadEnabledJson}));
          localStorage.setItem(prefix + 'rotom_sniper_rules', JSON.stringify(mergedRules));
          localStorage.setItem(prefix + 'rotom_sniper_config', JSON.stringify(${payloadConfigJson}));
        }

        if (S && typeof S.set === 'function') {
          await S.set({
            rotom_sniper_enabled: ${payloadEnabledJson},
            rotom_sniper_rules: mergedRules,
            rotom_sniper_config: ${payloadConfigJson}
          });
          window.postMessage({ source: 'ROTOM_POPUP', type: 'SET_SNIPER_ENABLED', enabled: ${payloadEnabledJson} }, '*');
          window.postMessage({ source: 'ROTOM_POPUP', type: 'UPDATE_SNIPER_RULES', rules: mergedRules }, '*');
          window.postMessage({ source: 'ROTOM_POPUP', type: 'UPDATE_SNIPER_CONFIG', config: ${payloadConfigJson} }, '*');
        }

        return { ok: true, mergedRules };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`;

    try {
      const res = await wv.executeJavaScript(script);
      if (res && res.ok && Array.isArray(res.mergedRules)) {
        const bMap = new Map();
        res.mergedRules.forEach(r => { if (r && r.id != null) bMap.set(String(r.id), Number(r.totalBought) || 0); });
        acc.rules.forEach(r => {
          if (r && r.id != null && bMap.has(String(r.id))) {
            r.totalBought = bMap.get(String(r.id));
          }
        });
        const d = sniperState.drafts[i];
        if (d && !d.isDirty) {
          d.rules.forEach(r => {
            if (r && r.id != null && bMap.has(String(r.id))) {
              r.totalBought = bMap.get(String(r.id));
            }
          });
        }
      }
      return res || { ok: true };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  }

  async function importFromVisual(idx) {
    const i = Number(idx);
    const integration = getIntegration();
    const wv = integration.getWebview(i);
    if (!wv || typeof wv.executeJavaScript !== 'function') {
      throw new Error('A aba do jogo visual precisa estar aberta para importar as regras.');
    }

    const readScript = `(async () => {
      const S = window.PIOSniperStorage;
      if (S && typeof S.get === 'function') {
        const data = await S.get(['rotom_sniper_rules', 'rotom_sniper_enabled', 'rotom_sniper_config']);
        return {
          ok: true,
          rules: data.rotom_sniper_rules || [],
          enabled: Boolean(data.rotom_sniper_enabled),
          config: data.rotom_sniper_config || {}
        };
      }
      return { ok: false, error: 'PIOSniperStorage não encontrado no jogo visual' };
    })()`;

    const res = await wv.executeJavaScript(readScript);
    if (!res || !res.ok) {
      throw new Error(res?.error || 'Falha ao ler dados visuais');
    }

    const draft = getDraftState(i);
    if (draft) {
      draft.configured = true;
      draft.rules = (res.rules || []).map(r => ({
        ...r,
        excludedItemIds: Array.isArray(r.excludedItemIds) ? [...r.excludedItemIds] : [],
        id: r.id || ('r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
        totalBought: Number(r.totalBought) || 0
      }));
      draft.enabled = Boolean(res.enabled);
      const normCfg = normalizeConfigAliases(res.config);
      draft.config = Object.assign(createDefaultConfig(), draft.config, normCfg);
      draft.isDirty = true;
    }
    return res;
  }

  const ingestedLogKeys = new Set();
  async function flush(idx) {
    const i = Number(idx);
    try {
      await loadCatalog();
    } catch (catErr) {
      console.warn('[sniper-panel] Erro ao carregar catálogo dinâmico, utilizando catálogo local base:', catErr);
      sniperState.catalogLoadWarning = true;
    }

    try {
      await loadBackendState();
    } catch (err) {
      throw new Error(`Falha ao obter estado do Sniper do backend antes de iniciar Headless na Conta ${i + 1}: ${err.message || err}`);
    }

    const acc = sniperState.accounts[i];
    if (!acc || !acc.configured) return { ok: true, skipped: true, reason: 'not_configured' };
    if (getAccountMode(i) !== 'visual') return { ok: true, skipped: true, mode: getAccountMode(i) };

    const integration = getIntegration();
    const wv = integration.getWebview(i);
    if (!wv || typeof wv.executeJavaScript !== 'function') {
      throw new Error(`Painel visual da Conta ${i + 1} indisponível para descarregar dados antes do Headless.`);
    }

    const script = `(async () => {
      try {
        const S = window.PIOSniperStorage;
        if (!S) return { ok: false, msg: 'PIOSniperStorage indisponível' };
        const data = await S.get(['rotom_sniper_logs', 'rotom_sniper_rules']);
        await S.set({ rotom_sniper_enabled: false });
        window.postMessage({ source: 'ROTOM_POPUP', type: 'SET_SNIPER_ENABLED', enabled: false }, '*');
        return {
          ok: true,
          logs: data.rotom_sniper_logs || [],
          rules: data.rotom_sniper_rules || []
        };
      } catch (e) {
        return { ok: false, msg: String(e && e.message || e) };
      }
    })()`;

    let res;
    try {
      res = await wv.executeJavaScript(script);
    } catch (err) {
      throw new Error(`Falha no descarregamento da Conta ${i + 1}: ${err.message || err}`);
    }

    if (!res || !res.ok) {
      throw new Error(`Falha no descarregamento da Conta ${i + 1}: ${(res && res.msg) || 'resposta nula'}`);
    }

    const logs = (Array.isArray(res.logs) ? res.logs : []).filter(isConfirmedSuccessLog);
    const rules = Array.isArray(res.rules) ? res.rules : [];
    const progress = rules.map(r => ({ id: r.id, totalBought: Number(r.totalBought) || 0 }));

    if (root.pokeAPI && typeof root.pokeAPI.sniperIngest === 'function') {
      await root.pokeAPI.sniperIngest(i, logs, progress);
      logs.forEach(l => {
        const key = i + '_' + (l.id || l.timestamp || l.hora || JSON.stringify(l));
        ingestedLogKeys.add(key);
      });
      if (ingestedLogKeys.size > 2000) {
        const arr = Array.from(ingestedLogKeys).slice(-1000);
        ingestedLogKeys.clear();
        arr.forEach(k => ingestedLogKeys.add(k));
      }
    }

    return { ok: true, flushedLogs: logs.length, progress };
  }

  function isConfirmedSuccessLog(log) {
    if (!log || typeof log !== 'object') return false;
    if (log.falha === true) return false;
    const rawStatus = String(log.status == null ? '' : log.status).trim();
    if (!rawStatus) {
      return Boolean(log.success === true || log.msg || log.mensagem);
    }
    const stUpper = rawStatus.toUpperCase();
    return stUpper === 'CONFIRMADO' || stUpper === 'OK' || log.success === true;
  }

  function resolveCatalogItemName(rawName) {
    let targetName = String(rawName == null ? '' : rawName).trim();
    if (/^Item\s*#\d+$/i.test(targetName)) {
      const idMatch = targetName.match(/(\d+)/);
      if (idMatch) {
        const numId = Number(idMatch[1]);
        const found = (sniperState.itemsCatalog || []).find(it => Number(it.id) === numId);
        if (found && found.name) return found.name;
      }
    }
    return targetName;
  }

  function isGenericCategoryDisplayLabel(name) {
    const norm = String(name == null ? '' : name).trim().toLowerCase();
    if (!norm) return false;
    const known = new Set([
      'pedras', 'pedra', 'pedras de evolução', 'pedras de evolucao', 'pedras evolutivas', 'stone', 'stones',
      'tms', 'tm',
      'loots raros', 'loot raro', 'itens raros', 'rare_loot', 'rare loot',
      'beast balls', 'beast ball', 'beast',
      'casas', 'casa',
      'boxes', 'box', 'caixas', 'caixa',
      'bicicletas', 'bicicleta', 'bikes', 'bike',
      'fragmentos', 'fragmento', 'fragment',
      'tickets', 'ticket'
    ]);
    if (known.has(norm)) return true;
    return CANONICAL_CATEGORIES.some(c => String(c.id || '').toLowerCase() === norm || String(c.name || c.label || '').toLowerCase() === norm);
  }

  function extractItemNameFromServerDetails(details) {
    const raw = String(details == null ? '' : details).trim();
    if (!raw) return '';
    const match = raw.match(/Confirmado pelo servidor:\s*(.+)$/i);
    const candidate = (match ? match[1] : raw)
      .split('·')[0]
      .replace(/^✅\s*/, '')
      .replace(/^\s*\d+\s*[x×]\s*/i, '')
      .trim();
    if (
      !candidate ||
      /^Anúncio\s*#/i.test(candidate) ||
      /^Regra:/i.test(candidate) ||
      /entregue na mochila|entregue no depot|venceu o sorteio/i.test(candidate)
    ) {
      return '';
    }
    return candidate;
  }

  function formatConfirmedPurchaseSummary(log) {
    if (!log || typeof log !== 'object') return '';
    if ((log.msg || log.mensagem) && !log.targetName && !log.item) {
      return String(log.msg || log.mensagem).trim();
    }

    let rawTarget = String(log.targetName || log.item || '').trim();
    const prefixQty = /^\s*(\d+)\s*[x×]\s*(.+)$/i.exec(rawTarget);
    let parsedQty = Number(log.qty);
    if (prefixQty) {
      if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
        parsedQty = Number(prefixQty[1]);
      }
      rawTarget = prefixQty[2].trim();
    }

    const needsDetailsFallback = (
      !rawTarget ||
      /^Item\s*#\d+$/i.test(rawTarget) ||
      /^Offer\s*#\d+$/i.test(rawTarget) ||
      isGenericCategoryDisplayLabel(rawTarget) ||
      /entregue na mochila|entregue no depot|venceu o sorteio/i.test(rawTarget)
    );
    if (needsDetailsFallback) {
      const fromDetails = extractItemNameFromServerDetails(log.details);
      if (fromDetails) {
        rawTarget = fromDetails;
      } else if (!rawTarget || /entregue na mochila|entregue no depot|venceu o sorteio/i.test(rawTarget)) {
        rawTarget = 'Item';
      }
    }
    const targetName = resolveCatalogItemName(rawTarget) || 'Item';
    const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? Math.floor(parsedQty) : 1;

    let seller = String(log.seller || '').trim().replace(/^@+/, '');
    if (!seller && log.details) {
      const sellerMatch = String(log.details).match(/de\s+@([a-zA-Z0-9_-]+)/i);
      if (sellerMatch) seller = sellerMatch[1];
    }

    const hasPrice = log.price != null && log.price !== '' && Number(log.price) > 0;
    const unitNum = hasPrice ? Number(log.price) : 0;
    const currRaw = String(log.currency || 'gold').trim().toLowerCase();
    const isGems = (
      currRaw === 'orb' || currRaw === 'orbs' ||
      currRaw === 'gem' || currRaw === 'gems' ||
      currRaw === 'gema' || currRaw === 'gemas' ||
      currRaw === 'diamond' || currRaw === 'diamonds' ||
      currRaw === 'diamante' || currRaw === 'diamantes' ||
      currRaw === 'pontos'
    );
    const currLabel = isGems ? 'Gemas' : 'Coins';

    let summary = `${qty}x ${targetName}`;
    if (seller) {
      summary += ` de @${seller}`;
    }
    if (hasPrice) {
      const unitFmt = unitNum.toLocaleString('pt-BR');
      if (qty > 1) {
        const totalFmt = (qty * unitNum).toLocaleString('pt-BR');
        summary += ` — por ${unitFmt} ${currLabel}/un (Total: ${totalFmt} ${currLabel})`;
      } else {
        summary += ` — por ${unitFmt} ${currLabel}`;
      }
    }
    if (log.offerId != null && log.offerId !== '') {
      summary += ` (#${log.offerId})`;
    }
    return summary;
  }

  async function ingestVisualLogs(idx) {
    const i = Number(idx);
    if (getAccountMode(i) !== 'visual') return;
    const integration = getIntegration();
    const wv = integration.getWebview(i);
    if (!wv || typeof wv.executeJavaScript !== 'function') return;

    const script = `(async () => {
      try {
        const S = window.PIOSniperStorage;
        if (!S) return [];
        const res = await S.get(['rotom_sniper_logs']);
        return res.rotom_sniper_logs || [];
      } catch (e) { return []; }
    })()`;

    try {
      const logs = await wv.executeJavaScript(script);
      if (Array.isArray(logs) && logs.length && root.pokeAPI?.sniperIngest) {
        const freshLogs = logs.filter(l => {
          if (!isConfirmedSuccessLog(l)) return false;
          const key = i + '_' + (l.id || l.timestamp || l.hora || JSON.stringify(l));
          return !ingestedLogKeys.has(key);
        });
        if (freshLogs.length) {
          await root.pokeAPI.sniperIngest(i, freshLogs);
          freshLogs.forEach(l => {
            const key = i + '_' + (l.id || l.timestamp || l.hora || JSON.stringify(l));
            ingestedLogKeys.add(key);
          });
          if (ingestedLogKeys.size > 2000) {
            const arr = Array.from(ingestedLogKeys).slice(-1000);
            ingestedLogKeys.clear();
            arr.forEach(k => ingestedLogKeys.add(k));
          }
        }
      }
    } catch { }
  }

  let backendLoadPromise = null;

  async function loadBackendState() {
    if (backendLoadPromise) return backendLoadPromise;

    backendLoadPromise = (async () => {
      if (!root.pokeAPI || typeof root.pokeAPI.sniperGetState !== 'function') {
        sniperState.backendSupported = false;
        throw new Error('Tauri indisponível ou método sniperGetState não exposto.');
      }
      sniperState.backendSupported = true;
      try {
        const snapshot = await root.pokeAPI.sniperGetState();
        if (snapshot && Array.isArray(snapshot.accounts)) {
          snapshot.accounts.forEach(acc => {
            const idx = acc.index;
            if (idx >= 0 && idx < 4) {
              const currentAcc = sniperState.accounts[idx];
              const boughtMap = new Map();
              (currentAcc.rules || []).forEach(r => {
                if (r.id != null) boughtMap.set(String(r.id), r.totalBought || 0);
              });

              const mergedRules = (acc.rules || []).map(r => {
                const prevBought = boughtMap.get(String(r.id)) || 0;
                return {
                  ...r,
                  excludedItemIds: Array.isArray(r.excludedItemIds) ? [...r.excludedItemIds] : [],
                  totalBought: Math.max(prevBought, Number(r.totalBought) || 0)
                };
              });

              const normCfg = normalizeConfigAliases(acc.config);
              sniperState.accounts[idx] = {
                index: idx,
                configured: Boolean(acc.configured),
                enabled: Boolean(acc.enabled),
                rules: mergedRules,
                config: Object.assign(createDefaultConfig(), normCfg),
                logs: acc.logs || []
              };

              const draft = sniperState.drafts[idx];
              if (!draft || !draft.isDirty) {
                sniperState.drafts[idx] = {
                  configured: Boolean(acc.configured),
                  enabled: Boolean(acc.enabled),
                  rules: mergedRules.map(r => ({ ...r })),
                  config: Object.assign(createDefaultConfig(), normCfg),
                  isDirty: false
                };
              }
            }
          });
        }
        return snapshot;
      } catch (err) {
        sniperState.lastError = 'Falha ao conectar com o backend do Sniper: ' + (err.message || String(err));
        throw err;
      }
    })().finally(() => {
      backendLoadPromise = null;
    });

    return backendLoadPromise;
  }

  async function saveAccount(idx) {
    const i = Number(idx);
    const draft = getDraftState(i);
    if (!draft) return { ok: false, error: 'Draft não encontrado' };

    const valConfig = validateConfig(draft.config);
    if (!valConfig.ok) {
      sniperState.lastError = valConfig.error;
      renderModal();
      return { ok: false, error: valConfig.error };
    }
    draft.config = valConfig.config;

    const settings = {
      configured: true,
      enabled: Boolean(draft.enabled),
      rules: draft.rules.map(r => ({ ...r })),
      config: Object.assign({}, draft.config)
    };

    if (!root.pokeAPI || typeof root.pokeAPI.sniperSave !== 'function') {
      throw new Error('Backend nativo indisponível para salvar.');
    }

    let snapshot;
    try {
      snapshot = await root.pokeAPI.sniperSave([i], settings);
    } catch (err) {
      sniperState.lastError = 'Falha ao salvar no backend: ' + (err.message || err);
      throw err;
    }

    let authAcc = null;
    if (snapshot && Array.isArray(snapshot.accounts)) {
      authAcc = snapshot.accounts.find(a => a.index === i);
    }

    if (authAcc) {
      sniperState.accounts[i] = {
        ...authAcc,
        configured: true,
        rules: (authAcc.rules || []).map(r => ({ ...r }))
      };
      draft.configured = true;
      draft.enabled = Boolean(authAcc.enabled);
      draft.rules = (authAcc.rules || []).map(r => ({ ...r }));
      draft.config = Object.assign(createDefaultConfig(), authAcc.config || settings.config);
      draft.isDirty = false;
    } else {
      sniperState.accounts[i].configured = true;
      sniperState.accounts[i].enabled = settings.enabled;
      sniperState.accounts[i].rules = settings.rules;
      sniperState.accounts[i].config = settings.config;
      draft.configured = true;
      draft.isDirty = false;
    }

    const syncRes = await syncVisualWebview(i, sniperState.accounts[i]);
    if (!syncRes.ok && !syncRes.skipped) {
      const errMsg = `Salvo no backend nativo, mas falhou ao aplicar no painel visual: ${syncRes.error}. O painel visual precisa estar aberto e logado para aplicar.`;
      sniperState.lastError = errMsg;
      return { ok: false, backendSaved: true, visualSynced: false, error: syncRes.error, snapshot };
    }

    sniperState.lastError = null;
    sniperState.lastSuccess = `Configurações da Conta ${i + 1} salvas com sucesso!`;
    return { ok: true, snapshot };
  }

  async function applyAll(templateRules, masterEnabled, templateConfig) {
    if (!root.pokeAPI || typeof root.pokeAPI.sniperSave !== 'function') {
      throw new Error('Backend nativo indisponível para aplicar em todas as contas.');
    }

    const rulesWithZeroBought = templateRules.map(r => ({
      ...r,
      excludedItemIds: Array.isArray(r.excludedItemIds) ? [...r.excludedItemIds] : [],
      id: r.id || ('r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
      totalBought: 0
    }));

    const valConfig = validateConfig(templateConfig);
    if (!valConfig.ok) {
      sniperState.lastError = valConfig.error;
      renderModal();
      return { ok: false, error: valConfig.error };
    }
    const config = valConfig.config;

    const settings = {
      configured: true,
      enabled: Boolean(masterEnabled),
      rules: rulesWithZeroBought,
      config
    };

    const snapshot = await root.pokeAPI.sniperSave([0, 1, 2, 3], settings);

    if (snapshot && Array.isArray(snapshot.accounts)) {
      snapshot.accounts.forEach(acc => {
        const idx = acc.index;
        if (idx >= 0 && idx < 4) {
          sniperState.accounts[idx] = {
            ...acc,
            configured: true,
            rules: (acc.rules || []).map(r => ({ ...r }))
          };
          sniperState.drafts[idx] = {
            configured: true,
            enabled: Boolean(acc.enabled),
            rules: (acc.rules || []).map(r => ({ ...r })),
            config: Object.assign(createDefaultConfig(), acc.config || config),
            isDirty: false
          };
        }
      });
    } else {
      for (let i = 0; i < 4; i++) {
        sniperState.accounts[i].configured = true;
        sniperState.accounts[i].enabled = settings.enabled;
        sniperState.accounts[i].rules = settings.rules.map(r => ({ ...r }));
        sniperState.accounts[i].config = Object.assign({}, config);
        sniperState.drafts[i] = {
          configured: true,
          enabled: settings.enabled,
          rules: settings.rules.map(r => ({ ...r })),
          config: Object.assign({}, config),
          isDirty: false
        };
      }
    }

    const visualFailures = [];
    for (let i = 0; i < 4; i++) {
      const sRes = await syncVisualWebview(i, sniperState.accounts[i]);
      if (!sRes.ok && !sRes.skipped) {
        visualFailures.push(`Conta ${i + 1}: ${sRes.error}`);
      }
    }

    if (visualFailures.length > 0) {
      sniperState.lastError = `Salvo no backend nativo, mas aplicação visual pendente em ${visualFailures.length} conta(s): ${visualFailures.join('; ')}. Abra e logue os painéis para sincronizar.`;
      sniperState.lastSuccess = null;
      return { ok: false, backendSaved: true, visualSynced: false, failures: visualFailures, snapshot };
    } else {
      sniperState.lastError = null;
      sniperState.lastSuccess = 'Regras e configurações aplicadas e salvas nas 4 contas com sucesso!';
      return { ok: true, snapshot };
    }
  }

  async function clearHistory(idx) {
    if (!root.pokeAPI || typeof root.pokeAPI.sniperClearHistory !== 'function') {
      throw new Error('Backend nativo indisponível para limpar histórico.');
    }

    if (idx === 'all') {
      for (let i = 0; i < 4; i++) {
        await root.pokeAPI.sniperClearHistory(i);
        sniperState.accounts[i].logs = [];
      }
    } else {
      const i = Number(idx);
      await root.pokeAPI.sniperClearHistory(i);
      sniperState.accounts[i].logs = [];
    }
    sniperState.lastSuccess = 'Histórico limpo com sucesso.';
  }

  // =========================================================================
  // Interface de Usuário (DOM & Acessibilidade)
  // =========================================================================

  function renderModal(onlyUpdateStatus = false) {
    let overlay = document.getElementById('sniperOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sniperOverlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'sniperTitle');
      document.body.appendChild(overlay);
    }

    const activeEl = document.activeElement;
    const formIsFocused = activeEl && overlay.querySelector('#sniperRuleForm')?.contains(activeEl);
    if (onlyUpdateStatus && formIsFocused) {
      updateBadgesAndStatus(overlay);
      return;
    }

    const activeTab = sniperState.activeTab;
    const activeDraft = activeTab !== 'all' ? getDraftState(activeTab) : null;
    const mode = activeTab !== 'all' ? getAccountMode(activeTab) : null;

    let tabsHtml = `
      <button class="sniper-tab-btn ${activeTab === 'all' ? 'active' : ''}" data-tab="all" role="tab" aria-selected="${activeTab === 'all'}">
        <span>🌐 Todas as Contas</span>
      </button>
    `;

    for (let i = 0; i < 4; i++) {
      const accDraft = getDraftState(i);
      const accMode = getAccountMode(i);
      const isConfigured = accDraft.configured;
      const isOn = accDraft.enabled;
      const rulesCount = accDraft.rules.length;
      const isDirty = accDraft.isDirty;

      const modeBadge = accMode === 'headless'
        ? '<span class="sniper-badge headless" title="Modo Headless (Nativo)">HEADLESS</span>'
        : accMode === 'visual'
        ? '<span class="sniper-badge visual" title="Modo Visual (Navegador)">VISUAL</span>'
        : '<span class="sniper-badge off" title="Conta Desconectada">OFF</span>';

      const statusBadge = isOn
        ? '<span class="sniper-badge on">ON</span>'
        : isConfigured
        ? '<span class="sniper-badge off">PAUSA</span>'
        : '<span class="sniper-badge off">OFF</span>';

      const dirtyBadge = isDirty ? '<span class="sniper-badge draft">*</span>' : '';

      tabsHtml += `
        <button class="sniper-tab-btn ${activeTab === i ? 'active' : ''}" data-tab="${i}" role="tab" aria-selected="${activeTab === i}">
          <span>Conta ${i + 1}</span>
          ${statusBadge}
          ${modeBadge}
          ${dirtyBadge}
          <span style="font-size:10px;opacity:0.7">(${rulesCount})</span>
        </button>
      `;
    }

    let bannerHtml = '';
    if (sniperState.lastError) {
      bannerHtml = `
        <div class="sniper-banner error" role="alert">
          <span>⚠️ ${escapeHtml(sniperState.lastError)}</span>
          <button class="sniper-banner-close" data-action="dismiss-banner">×</button>
        </div>
      `;
    } else if (sniperState.lastSuccess) {
      bannerHtml = `
        <div class="sniper-banner success" role="status">
          <span>✅ ${escapeHtml(sniperState.lastSuccess)}</span>
          <button class="sniper-banner-close" data-action="dismiss-banner">×</button>
        </div>
      `;
    }

    let contentHtml = '';

    if (activeTab === 'all') {
      let accountsCardsHtml = '';
      for (let i = 0; i < 4; i++) {
        const d = getDraftState(i);
        const m = getAccountMode(i);
        const isOn = d.enabled;
        accountsCardsHtml += `
          <div class="sniper-controls-row">
            <div>
              <div style="font-weight:700;font-size:14px">Conta ${i + 1}</div>
              <div style="font-size:11.5px;color:var(--color-text-secondary,#8b949e)">
                Modo: <b>${m === 'headless' ? 'Modo Headless (Nativo)' : m === 'visual' ? 'Modo Visual (Navegador)' : 'Desconectada'}</b>
                · ${d.rules.length} regras configuradas
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <label class="sniper-toggle-label">
                <input type="checkbox" class="sniper-switch" data-acc-toggle="${i}" ${isOn ? 'checked' : ''}>
                <span>${isOn ? 'Ativado' : 'Pausado'}</span>
              </label>
              <button class="sniper-btn secondary" data-action="switch-tab" data-target-tab="${i}">Editar regras →</button>
            </div>
          </div>
        `;
      }

      contentHtml = `
        <div class="sniper-section">
          <div class="sniper-section-header">
            <h3 class="sniper-section-title">Controle Global das 4 Contas</h3>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="sniper-btn primary" data-action="enable-all-accounts">⚡ Ativar em Todas as 4 Contas</button>
            <button class="sniper-btn secondary" data-action="disable-all-accounts">⏸ Pausar Todas as Contas</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${accountsCardsHtml}
          </div>
        </div>

        <div class="sniper-section">
          <div class="sniper-section-header">
            <h3 class="sniper-section-title">Configuração para as 4 contas</h3>
          </div>
          <p style="font-size:12px;color:var(--color-text-secondary,#8b949e);margin:0">
            Deseja replicar as regras e opções completas de radar/cadência de uma conta para as 4 contas? Selecione a conta modelo abaixo.
            O botão <b>Substituir regras nas 4 contas</b> substitui a lista de regras e espelha o radar em todas as contas mantendo os IDs estáveis.
          </p>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <label style="font-size:12px;font-weight:600">Copiar regras e radar da:</label>
            <select id="sniperMasterSourceSelect" class="sniper-select">
              <option value="0">Conta 1 (${getDraftState(0).rules.length} regras)</option>
              <option value="1">Conta 2 (${getDraftState(1).rules.length} regras)</option>
              <option value="2">Conta 3 (${getDraftState(2).rules.length} regras)</option>
              <option value="3">Conta 4 (${getDraftState(3).rules.length} regras)</option>
            </select>
            <button class="sniper-btn warning-action" id="sniperReplaceAllBtn" data-action="replace-all-rules">
              ⚠️ Substituir regras nas 4 contas
            </button>
          </div>
        </div>
      `;
    } else {
      const i = Number(activeTab);
      const isHeadless = mode === 'headless';
      const isVisual = mode === 'visual';
      const cfg = activeDraft.config || createDefaultConfig();

      let rulesRowsHtml = '';
      if (!activeDraft.rules || activeDraft.rules.length === 0) {
        rulesRowsHtml = `
          <tr>
            <td colspan="7">
              <div class="sniper-empty">
                <span class="sniper-empty-icon">🎯</span>
                <div class="sniper-empty-text">Nenhuma regra de compra configurada para a Conta ${i + 1}.</div>
                <div style="font-size:11px;color:var(--color-text-secondary)">Adicione regras no formulário abaixo ou importe do jogo visual.</div>
              </div>
            </td>
          </tr>
        `;
      } else {
        activeDraft.rules.forEach((rule, rIdx) => {
          const isCategory = rule.targetType === 'category';
          const isPokemon = rule.targetType === 'pokemon';

          const typeBadge = isCategory
            ? '<span class="sniper-badge category" style="background:rgba(163,113,247,0.2);color:#bc8cff;border:1px solid rgba(163,113,247,0.4)">CATEGORIA</span>'
            : isPokemon
            ? '<span class="sniper-badge" style="background:rgba(238,107,47,0.2);color:#ff9b6a;border:1px solid rgba(238,107,47,0.4)">POKÉMON</span>'
            : '<span class="sniper-badge" style="background:rgba(88,166,255,0.2);color:#58a6ff;border:1px solid rgba(88,166,255,0.4)">ITEM</span>';

          const statusBadge = rule.active
            ? '<span class="sniper-badge on">ATIVA</span>'
            : '<span class="sniper-badge off">PAUSADA</span>';

          const goldPrice = Number(rule.maxPriceGold) ? Number(rule.maxPriceGold).toLocaleString('pt-BR') + ' 🟡' : '—';
          const gemsPrice = Number(rule.maxPriceGems) ? Number(rule.maxPriceGems).toLocaleString('pt-BR') + ' 🔮' : '—';
          const qtyText = rule.infinite ? 'Infinito ♾️' : (isCategory ? `${rule.maxQty || 1} (agregado)` : String(rule.maxQty || 1));
          const bought = Number(rule.totalBought) || 0;

          let metaText = isCategory
            ? `Categoria: ${escapeHtml(rule.targetCategory || '')} · ${typeBadge}`
            : `ID: ${escapeHtml(rule.targetId)} · ${typeBadge}`;
          if (isCategory) {
            const exclCount = Array.isArray(rule.excludedItemIds) ? rule.excludedItemIds.length : 0;
            const exclBadge = exclCount > 0
              ? ` <span class="sniper-exclusion-table-badge" title="Itens bloqueados: ${rule.excludedItemIds.join(', ')}">(${exclCount} excluído${exclCount > 1 ? 's' : ''})</span>`
              : ` <span style="font-size:10px;color:var(--color-text-secondary);opacity:0.8">(todos)</span>`;
            metaText = `Categoria: ${escapeHtml(rule.targetCategory || '')}${exclBadge} · ${typeBadge}`;
          }

          rulesRowsHtml += `
            <tr data-rule-id="${escapeHtml(rule.id)}">
              <td>
                <div class="sniper-rule-target">
                  <div class="sniper-rule-icon">
                    ${isCategory ? '🗂️' : isPokemon ? '🐾' : '📦'}
                  </div>
                  <div>
                    <div class="sniper-rule-name">${escapeHtml(rule.targetName)}</div>
                    <div class="sniper-rule-meta">${metaText}</div>
                  </div>
                </div>
              </td>
              <td>${goldPrice}</td>
              <td>${gemsPrice}</td>
              <td>${qtyText}</td>
              <td><b>${bought}</b></td>
              <td>
                <button class="sniper-btn icon-only secondary" data-action="toggle-rule" data-rule-index="${rIdx}" title="${rule.active ? 'Pausar regra' : 'Ativar regra'}">
                  ${statusBadge}
                </button>
              </td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="sniper-btn icon-only secondary" data-action="edit-rule" data-rule-index="${rIdx}" title="Editar regra">✏️</button>
                  <button class="sniper-btn icon-only danger" data-action="delete-rule" data-rule-index="${rIdx}" title="Excluir regra">🗑️</button>
                </div>
              </td>
            </tr>
          `;
        });
      }

      contentHtml = `
        <div class="sniper-section">
          <div class="sniper-section-header">
            <h3 class="sniper-section-title">Configurações da Conta ${i + 1}</h3>
            <div style="display:flex;align-items:center;gap:8px">
              ${isHeadless ? '<span class="sniper-badge headless">MODO HEADLESS (NATIVO)</span>' : isVisual ? '<span class="sniper-badge visual">MODO VISUAL (NAVEGADOR)</span>' : '<span class="sniper-badge off">DESCONECTADA</span>'}
              <button class="sniper-btn secondary" data-action="import-visual" data-acc="${i}" title="Importa as regras gravadas no armazenamento da extensão/userscript desta conta">
                📥 Importar do jogo visual
              </button>
            </div>
          </div>

          <div class="sniper-controls-row">
            <label class="sniper-toggle-label">
              <input type="checkbox" class="sniper-switch" id="sniperAccountMasterToggle" ${activeDraft.enabled ? 'checked' : ''}>
              <span>Ativar Auto-Sniper nesta conta</span>
            </label>
            <div style="font-size:12px;color:var(--color-text-secondary,#8b949e)">
              ${isHeadless ? 'Execução via motor nativo de segundo plano.' : 'Execução sincronizada com a janela visual.'}
            </div>
          </div>

          <!-- Seletor de Modo de Varredura e Cadência -->
          <div class="sniper-cadence-section">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <label for="cfgScanMode" style="font-size:12px;font-weight:700">Modo de Cadência:</label>
                <select id="cfgScanMode" class="sniper-select">
                  <option value="original" ${cfg.scanMode === 'original' ? 'selected' : ''}>Original (3 segundos)</option>
                  <option value="adaptive" ${cfg.scanMode === 'adaptive' ? 'selected' : ''}>Adaptativo (segundos)</option>
                </select>
              </div>
              <span class="sniper-badge ${cfg.scanMode === 'original' ? 'headless' : 'visual'}">
                ${cfg.scanMode === 'original' ? 'ORIGINAL' : 'ADAPTATIVO'}
              </span>
            </div>
            <div id="cfgScanOriginalInfo" class="sniper-cadence-info" style="${cfg.scanMode === 'original' ? '' : 'display:none'}">
              Loop de 3 segundos para itens de mercado com offset intercalado de 700ms para pokémon.
            </div>
            <div id="cfgScanAdaptiveInputs" class="sniper-cadence-inputs" style="${cfg.scanMode === 'adaptive' ? '' : 'display:none'}">
              <div class="sniper-form-group" style="flex:1;min-width:180px">
                <label for="cfgScanInterval">Varredura Normal (segundos)</label>
                <input type="number" id="cfgScanInterval" class="sniper-input" min="1" step="1" value="${cfg.scanIntervalMs != null ? (cfg.scanIntervalMs / 1000) : 45}">
              </div>
              <div class="sniper-form-group" style="flex:1;min-width:180px">
                <label for="cfgFastScanInterval">Varredura Rápida / Ofertas (segundos)</label>
                <input type="number" id="cfgFastScanInterval" class="sniper-input" min="0.5" step="0.5" value="${cfg.fastScanIntervalMs != null ? (cfg.fastScanIntervalMs / 1000) : 3}">
              </div>
            </div>
          </div>
        </div>

        <!-- Seção de Radar de Oportunidades & Filtros Globais -->
        <div class="sniper-section sniper-radar-section">
          <div class="sniper-section-header">
            <h3 class="sniper-section-title">📡 Radar de Oportunidades & Filtros Globais</h3>
          </div>
          <p class="sniper-radar-notice">
            As opções de radar operam como alternativas independentes às regras específicas da lista abaixo.
          </p>
          <div class="sniper-radar-grid">
            <!-- Card Qualquer Shiny -->
            <div class="sniper-radar-card ${cfg.snipeAnyShiny ? 'active' : ''}">
              <div class="sniper-radar-card-header">
                <label class="sniper-toggle-label">
                  <input type="checkbox" class="sniper-switch" id="radarSnipeAnyShiny" ${cfg.snipeAnyShiny ? 'checked' : ''}>
                  <span style="font-weight:700">✨ Qualquer Shiny</span>
                </label>
              </div>
              <p class="sniper-radar-card-desc">Compra qualquer Pokémon Shiny anunciado no mercado dentro dos tetos estipulados.</p>
              <div class="sniper-radar-card-inputs">
                <div class="sniper-form-group">
                  <label for="radarMaxPriceShinyGold">Teto Coins</label>
                  <input type="number" id="radarMaxPriceShinyGold" class="sniper-input" min="0" step="1000" placeholder="0" value="${cfg.maxPriceShinyGold || 0}">
                </div>
                <div class="sniper-form-group">
                  <label for="radarMaxPriceShinyGems">Teto Gemas</label>
                  <input type="number" id="radarMaxPriceShinyGems" class="sniper-input" min="0" step="1" placeholder="0" value="${cfg.maxPriceShinyGems || 0}">
                </div>
              </div>
            </div>

            <!-- Card Qualquer P5 -->
            <div class="sniper-radar-card ${cfg.snipeAnyP5 ? 'active' : ''}">
              <div class="sniper-radar-card-header">
                <label class="sniper-toggle-label">
                  <input type="checkbox" class="sniper-switch" id="radarSnipeAnyP5" ${cfg.snipeAnyP5 ? 'checked' : ''}>
                  <span style="font-weight:700">⭐ Qualquer P5</span>
                </label>
              </div>
              <p class="sniper-radar-card-desc">Compra qualquer Pokémon com potência 5 ou superior anunciado até o teto de preço.</p>
              <div class="sniper-radar-card-inputs">
                <div class="sniper-form-group">
                  <label for="radarMaxPriceP5Gold">Teto Coins</label>
                  <input type="number" id="radarMaxPriceP5Gold" class="sniper-input" min="0" step="1000" placeholder="0" value="${cfg.maxPriceP5Gold || 0}">
                </div>
                <div class="sniper-form-group">
                  <label for="radarMaxPriceP5Gems">Teto Gemas</label>
                  <input type="number" id="radarMaxPriceP5Gems" class="sniper-input" min="0" step="1" placeholder="0" value="${cfg.maxPriceP5Gems || 0}">
                </div>
              </div>
            </div>

            <!-- Card Nota Mínima -->
            <div class="sniper-radar-card ${cfg.snipeByNote ? 'active' : ''}">
              <div class="sniper-radar-card-header">
                <label class="sniper-toggle-label">
                  <input type="checkbox" class="sniper-switch" id="radarSnipeByNote" ${cfg.snipeByNote ? 'checked' : ''}>
                  <span style="font-weight:700">🎯 Nota Mínima</span>
                </label>
              </div>
              <p class="sniper-radar-card-desc">Compra Pokémon com nota informada pelo mercado igual ou superior à nota mínima estipulada.</p>
              <div class="sniper-radar-card-inputs">
                <div class="sniper-form-group">
                  <label for="radarMinNote">Nota Mínima (1..10)</label>
                  <input type="number" id="radarMinNote" class="sniper-input" min="1.0" max="10.0" step="0.1" value="${cfg.minNote != null ? cfg.minNote : 7.0}">
                </div>
                <div class="sniper-form-group">
                  <label for="radarMaxPriceNoteGold">Teto Coins</label>
                  <input type="number" id="radarMaxPriceNoteGold" class="sniper-input" min="0" step="1000" placeholder="0" value="${cfg.maxPriceNoteGold || 0}">
                </div>
                <div class="sniper-form-group">
                  <label for="radarMaxPriceNoteGems">Teto Gemas</label>
                  <input type="number" id="radarMaxPriceNoteGems" class="sniper-input" min="0" step="1" placeholder="0" value="${cfg.maxPriceNoteGems || 0}">
                </div>
              </div>
            </div>
          </div>

          <!-- Linha Compacta de Execução / Slots de Largura Inteira -->
          <div class="sniper-execution-bar">
            <div class="sniper-form-group" style="margin-bottom:0;flex:1;min-width:200px">
              <label for="radarMaxActiveSlots">Limite de regras ativas (1..50)</label>
              <input type="number" id="radarMaxActiveSlots" class="sniper-input" min="1" max="50" step="1" value="${cfg.maxActiveSlots || 5}">
            </div>
            <div class="sniper-form-group" style="margin-bottom:0;display:flex;align-items:center;padding-top:14px">
              <label class="sniper-toggle-label" style="font-size:12px;cursor:pointer">
                <input type="checkbox" id="radarAutoMaxAffordable" ${cfg.autoMaxAffordable !== false ? 'checked' : ''}>
                <span>Ajustar quantidade ao saldo disponível</span>
              </label>
            </div>
          </div>
        </div>

        <div class="sniper-section">
          <div class="sniper-section-header">
            <h3 class="sniper-section-title">Regras Específicas de Compra</h3>
          </div>
          <div class="sniper-table-wrapper">
            <table class="sniper-table">
              <thead>
                <tr>
                  <th>Alvo / Nome</th>
                  <th>Teto Coins</th>
                  <th>Teto Gemas</th>
                  <th>Qtd Máxima</th>
                  <th title="Limite usado (inclui ordens pendentes ou incertas)">Limite usado</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rulesRowsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Formulário de Adicionar / Editar Regra -->
        <div class="sniper-form-card" id="sniperRuleForm">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h4 class="sniper-form-title">${sniperState.editingRuleId ? 'Editar Regra de Compra' : 'Adicionar Nova Regra de Compra'}</h4>
            ${sniperState.editingRuleId ? '<button class="sniper-btn secondary" data-action="cancel-rule-edit" style="padding:3px 8px;font-size:11px">Cancelar edição</button>' : ''}
          </div>

          <div class="sniper-form-grid">
            <div class="sniper-form-group">
              <label for="ruleTargetType">Tipo de Alvo</label>
              <select id="ruleTargetType" class="sniper-select">
                <option value="item" ${sniperState.ruleDraft.targetType === 'item' ? 'selected' : ''}>Item específico</option>
                <option value="category" ${sniperState.ruleDraft.targetType === 'category' ? 'selected' : ''}>Categoria de itens</option>
                <option value="pokemon" ${sniperState.ruleDraft.targetType === 'pokemon' ? 'selected' : ''}>Pokémon específico</option>
              </select>
            </div>

            <!-- Se Tipo = Categoria -->
            <div class="sniper-form-group" id="ruleCategoryGroup" style="grid-column:1 / -1;${sniperState.ruleDraft.targetType === 'category' ? '' : 'display:none'}">
              <label for="ruleTargetCategory">Selecionar Categoria</label>
              <select id="ruleTargetCategory" class="sniper-select">
                ${CANONICAL_CATEGORIES.map(c => `
                  <option value="${c.id}" ${sniperState.ruleDraft.targetCategory === c.id ? 'selected' : ''}>${c.name} (${c.id})</option>
                `).join('')}
              </select>
              <div id="ruleCategoryNotice" class="sniper-category-notice" style="font-size:11px;color:#e3b341;margin-top:4px">
                ${sniperState.ruleDraft.targetCategory === 'rare_loot'
                  ? '⚠️ Loots Raros inclui exclusivamente os 4 itens originais: Shiny Stone Fragment (70012), Key Fragment (70011), Bronze Boss Token (70000) e Bicycle Fragment (70013). Não cobre outros itens raros.'
                  : '⚠️ Atenção: A quantidade máxima é agregada para todos os itens da categoria selecionada.'}
              </div>
            </div>

            <!-- Se Tipo = Item ou Pokémon: Campo de Busca com filtro de categoria -->
            <div class="sniper-form-group" id="ruleSearchGroup" style="grid-column:1 / -1;${sniperState.ruleDraft.targetType === 'category' ? 'display:none' : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <label for="ruleTargetSearch">${sniperState.ruleDraft.targetType === 'pokemon' ? 'Buscar Pokémon' : 'Buscar Item / Nome'}</label>
                ${sniperState.ruleDraft.targetType === 'item' ? `
                  <div style="display:flex;align-items:center;gap:6px">
                    <label for="ruleCatalogCategoryFilter" style="font-size:11px;color:var(--color-text-secondary)">Filtrar catálogo:</label>
                    <select id="ruleCatalogCategoryFilter" class="sniper-select" style="padding:2px 6px;font-size:11px">
                      <option value="">Todas as categorias</option>
                      ${CANONICAL_CATEGORIES.map(c => `
                        <option value="${c.id}" ${sniperState.ruleDraft.catalogCategoryFilter === c.id ? 'selected' : ''}>${c.name}</option>
                      `).join('')}
                    </select>
                  </div>
                ` : ''}
              </div>
              <input type="text" id="ruleTargetSearch" class="sniper-input" placeholder="${sniperState.ruleDraft.targetType === 'pokemon' ? 'Ex: Mewtwo, Charizard, Gengar...' : 'Ex: Water Stone, Ancient Stone, Beast Ball...'}" value="${escapeHtml(sniperState.ruleDraft.targetName)}" autocomplete="off">
              <div class="sniper-autocomplete-list" id="sniperAutocomplete"></div>
            </div>

            <div class="sniper-form-group" id="ruleIdGroup" style="${sniperState.ruleDraft.targetType === 'category' ? 'display:none' : ''}">
              <label for="ruleTargetId">ID Oficial</label>
              <input type="text" id="ruleTargetId" class="sniper-input" placeholder="Ex: 142" value="${escapeHtml(sniperState.ruleDraft.targetId)}">
            </div>

            <div class="sniper-form-group">
              <label for="ruleMaxPriceGold">Teto Coins (Gold)</label>
              <input type="number" id="ruleMaxPriceGold" class="sniper-input" min="0" step="1000" placeholder="0" value="${sniperState.ruleDraft.maxPriceGold}">
            </div>

            <div class="sniper-form-group">
              <label for="ruleMaxPriceGems">Teto Gemas</label>
              <input type="number" id="ruleMaxPriceGems" class="sniper-input" min="0" step="1" placeholder="0" value="${sniperState.ruleDraft.maxPriceGems}">
            </div>

            <div class="sniper-form-group">
              <label for="ruleMaxQty">Quantidade Máxima</label>
              <input type="number" id="ruleMaxQty" class="sniper-input" min="1" step="1" value="${sniperState.ruleDraft.maxQty}" ${sniperState.ruleDraft.infinite ? 'disabled' : ''}>
              <label style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:4px;cursor:pointer">
                <input type="checkbox" id="ruleInfinite" ${sniperState.ruleDraft.infinite ? 'checked' : ''}>
                <span>Comprar infinitamente ♾️</span>
              </label>
            </div>

            <!-- Exclusões de Itens na Categoria (no fim do grid, span total) -->
            <div class="sniper-form-group" id="ruleExclusionsGroup" style="grid-column:1 / -1;${sniperState.ruleDraft.targetType === 'category' ? '' : 'display:none'}">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">
                <div style="display:flex;align-items:center;gap:8px">
                  <label for="ruleExclusionsSearch" style="margin:0;font-weight:600;font-size:12px">Exclusões de Itens</label>
                  <span class="sniper-exclusions-badge" id="ruleExclusionsCountBadge">${(sniperState.ruleDraft.excludedItemIds || []).length} excluído(s)</span>
                </div>
                <div style="font-size:11px;color:var(--color-text-secondary)">
                  Marque os itens que esta regra não deve comprar.
                </div>
              </div>
              <input type="text" id="ruleExclusionsSearch" class="sniper-input" aria-label="Filtrar itens desta categoria" placeholder="Filtrar itens desta categoria por nome, ID ou alias..." style="margin-bottom:8px;font-size:12px;padding:5px 8px">
              <div class="sniper-exclusions-list" id="ruleExclusionsList" style="max-height:160px;overflow-y:auto;border:1px solid var(--color-border,#30363d);border-radius:6px;padding:6px;background:var(--color-bg-secondary,#161b22)">
              </div>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px">
            <button class="sniper-btn primary" id="sniperSaveRuleBtn">
              ${sniperState.editingRuleId ? 'Atualizar Regra' : '➕ Adicionar Regra'}
            </button>
          </div>
        </div>
      `;
    }

    const historyAcc = sniperState.historyFilter;
    let historyEntries = [];
    if (historyAcc === 'all') {
      sniperState.accounts.forEach((acc, aI) => {
        (acc.logs || []).forEach(l => {
          if (isConfirmedSuccessLog(l)) {
            historyEntries.push({ ...l, accountIndex: aI });
          }
        });
      });
    } else {
      const aI = Number(historyAcc);
      (sniperState.accounts[aI]?.logs || []).forEach(l => {
        if (isConfirmedSuccessLog(l)) {
          historyEntries.push({ ...l, accountIndex: aI });
        }
      });
    }

    historyEntries.sort((a, b) => (b.timestamp || b.time || 0) - (a.timestamp || a.time || 0));

    let historyListHtml = '';
    if (!historyEntries.length) {
      historyListHtml = `
        <div class="sniper-empty" style="padding:20px">
          <span style="font-size:20px;opacity:0.5">📜</span>
          <div style="font-size:12px">Nenhuma compra confirmada registrada para este filtro.</div>
        </div>
      `;
    } else {
      historyEntries.slice(0, 50).forEach(log => {
        const timeStr = log.hora || (log.timestamp ? new Date(log.timestamp).toLocaleTimeString('pt-BR') : '—');
        const desc = formatConfirmedPurchaseSummary(log);

        historyListHtml += `
          <div class="sniper-history-entry success">
            <span class="sniper-history-time">[${escapeHtml(timeStr)}]</span>
            <span class="sniper-badge">Conta ${log.accountIndex + 1}</span>
            <span class="sniper-history-desc">${escapeHtml(desc)}</span>
          </div>
        `;
      });
    }

    const historySectionHtml = `
      <div class="sniper-section">
        <div class="sniper-section-header">
          <h3 class="sniper-section-title">Histórico de Compras Confirmadas</h3>
          <div style="display:flex;align-items:center;gap:10px">
            <label style="font-size:11px;color:var(--color-text-secondary)">Filtrar:</label>
            <select id="sniperHistoryFilter" class="sniper-select" style="padding:4px 8px;font-size:11px">
              <option value="all" ${historyAcc === 'all' ? 'selected' : ''}>Todas as Contas</option>
              <option value="0" ${historyAcc === '0' || historyAcc === 0 ? 'selected' : ''}>Conta 1</option>
              <option value="1" ${historyAcc === '1' || historyAcc === 1 ? 'selected' : ''}>Conta 2</option>
              <option value="2" ${historyAcc === '2' || historyAcc === 2 ? 'selected' : ''}>Conta 3</option>
              <option value="3" ${historyAcc === '3' || historyAcc === 3 ? 'selected' : ''}>Conta 4</option>
            </select>
            <button class="sniper-btn secondary" data-action="clear-history" style="padding:4px 8px;font-size:11px">
              🧹 Limpar histórico
            </button>
          </div>
        </div>
        <div class="sniper-history-list">
          ${historyListHtml}
        </div>
      </div>
    `;

    let footerRightHtml = '';
    if (activeTab === 'all') {
      footerRightHtml = `
        <button class="sniper-btn secondary" data-action="close">Fechar</button>
      `;
    } else {
      const i = Number(activeTab);
      const isDirty = activeDraft && activeDraft.isDirty;
      footerRightHtml = `
        <button class="sniper-btn secondary" data-action="close">Fechar</button>
        <button class="sniper-btn primary" data-action="save-account" data-acc="${i}" ${isDirty ? '' : 'disabled'}>
          💾 Salvar Alterações da Conta ${i + 1}
        </button>
      `;
    }

    overlay.innerHTML = `
      <section id="sniperModal" role="document">
        <div class="sniper-header">
          <div class="sniper-header-info">
            <h2 id="sniperTitle">🎯 Central de Auto-Sniper</h2>
            <p>Monitore e compre itens ou Pokémon automaticamente. Compre conforme os limites definidos para cada conta.</p>
          </div>
          <button class="sniper-close-btn" data-action="close" aria-label="Fechar painel" title="Fechar (Esc)">✕</button>
        </div>

        ${bannerHtml}

        <div class="sniper-tabs-row" role="tablist">
          ${tabsHtml}
        </div>

        <div class="sniper-content">
          ${contentHtml}
          ${historySectionHtml}
        </div>

        <div class="sniper-footer">
          <div class="sniper-footer-left">
            <span>Configurações e histórico separados por conta.</span>
          </div>
          <div class="sniper-footer-right">
            ${footerRightHtml}
          </div>
        </div>
      </section>
    `;

    bindModalEvents(overlay);
  }

  function updateBadgesAndStatus(overlay) {
    for (let i = 0; i < 4; i++) {
      const btn = overlay.querySelector(`.sniper-tab-btn[data-tab="${i}"]`);
      if (!btn) continue;
      const accDraft = getDraftState(i);
      const accMode = getAccountMode(i);
      const isConfigured = accDraft.configured;
      const isOn = accDraft.enabled;
      const rulesCount = accDraft.rules.length;
      const isDirty = accDraft.isDirty;

      const modeBadge = accMode === 'headless'
        ? '<span class="sniper-badge headless" title="Modo Headless (Nativo)">HEADLESS</span>'
        : accMode === 'visual'
        ? '<span class="sniper-badge visual" title="Modo Visual (Navegador)">VISUAL</span>'
        : '<span class="sniper-badge off" title="Conta Desconectada">OFF</span>';

      const statusBadge = isOn
        ? '<span class="sniper-badge on">ON</span>'
        : isConfigured
        ? '<span class="sniper-badge off">PAUSA</span>'
        : '<span class="sniper-badge off">OFF</span>';

      const dirtyBadge = isDirty ? '<span class="sniper-badge draft">*</span>' : '';

      btn.innerHTML = `
        <span>Conta ${i + 1}</span>
        ${statusBadge}
        ${modeBadge}
        ${dirtyBadge}
        <span style="font-size:10px;opacity:0.7">(${rulesCount})</span>
      `;
    }
  }

  function bindModalEvents(overlay) {
    overlay.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.onclick = () => closePanel();
    });

    overlay.onclick = (e) => {
      if (e.target === overlay) closePanel();
    };

    overlay.querySelectorAll('[data-action="dismiss-banner"]').forEach(btn => {
      btn.onclick = () => {
        sniperState.lastError = null;
        sniperState.lastSuccess = null;
        renderModal();
      };
    });

    overlay.querySelectorAll('.sniper-tab-btn, [data-action="switch-tab"]').forEach(btn => {
      btn.onclick = () => {
        const targetTab = btn.dataset.tab !== undefined ? btn.dataset.tab : btn.dataset.targetTab;
        sniperState.activeTab = targetTab === 'all' ? 'all' : Number(targetTab);
        sniperState.editingRuleId = null;
        renderModal();
      };
    });

    const histFilterSelect = overlay.querySelector('#sniperHistoryFilter');
    if (histFilterSelect) {
      histFilterSelect.onchange = () => {
        sniperState.historyFilter = histFilterSelect.value;
        renderModal();
      };
    }

    const clearHistBtn = overlay.querySelector('[data-action="clear-history"]');
    if (clearHistBtn) {
      clearHistBtn.onclick = async () => {
        const filter = sniperState.historyFilter;
        if (!confirm('Deseja realmente limpar o histórico selecionado?')) return;
        try {
          await clearHistory(filter);
          renderModal();
        } catch (err) {
          sniperState.lastError = String(err.message || err);
          renderModal();
        }
      };
    }

    const accMasterToggle = overlay.querySelector('#sniperAccountMasterToggle');
    if (accMasterToggle && sniperState.activeTab !== 'all') {
      accMasterToggle.onchange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.enabled = accMasterToggle.checked;
          draft.isDirty = true;
          renderModal();
        }
      };
    }

    // Cadência e Varredura
    const scanModeSelect = overlay.querySelector('#cfgScanMode');
    if (scanModeSelect && sniperState.activeTab !== 'all') {
      scanModeSelect.onchange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.scanMode = scanModeSelect.value;
          draft.isDirty = true;
          renderModal();
        }
      };
    }

    const scanIntervalInp = overlay.querySelector('#cfgScanInterval');
    const fastScanIntervalInp = overlay.querySelector('#cfgFastScanInterval');
    if (scanIntervalInp && sniperState.activeTab !== 'all') {
      const onScanChange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          const val = scanIntervalInp.value.trim() === '' ? NaN : Number(scanIntervalInp.value);
          draft.config.scanIntervalMs = val * 1000;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
      scanIntervalInp.oninput = onScanChange;
      scanIntervalInp.onchange = onScanChange;
    }
    if (fastScanIntervalInp && sniperState.activeTab !== 'all') {
      const onFastChange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          const val = fastScanIntervalInp.value.trim() === '' ? NaN : Number(fastScanIntervalInp.value);
          draft.config.fastScanIntervalMs = val * 1000;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
      fastScanIntervalInp.oninput = onFastChange;
      fastScanIntervalInp.onchange = onFastChange;
    }

    // Radar Controls
    const radarShinyChk = overlay.querySelector('#radarSnipeAnyShiny');
    const radarShinyGold = overlay.querySelector('#radarMaxPriceShinyGold');
    const radarShinyGems = overlay.querySelector('#radarMaxPriceShinyGems');

    if (radarShinyChk && sniperState.activeTab !== 'all') {
      radarShinyChk.onchange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.snipeAnyShiny = radarShinyChk.checked;
          draft.isDirty = true;
          renderModal();
        }
      };
    }
    if (radarShinyGold && sniperState.activeTab !== 'all') {
      radarShinyGold.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.maxPriceShinyGold = Number(radarShinyGold.value) || 0;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }
    if (radarShinyGems && sniperState.activeTab !== 'all') {
      radarShinyGems.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          const val = Number(radarShinyGems.value) || 0;
          draft.config.maxPriceShinyGems = val;
          draft.config.maxPriceShinyDiamonds = val;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }

    const radarP5Chk = overlay.querySelector('#radarSnipeAnyP5');
    const radarP5Gold = overlay.querySelector('#radarMaxPriceP5Gold');
    const radarP5Gems = overlay.querySelector('#radarMaxPriceP5Gems');

    if (radarP5Chk && sniperState.activeTab !== 'all') {
      radarP5Chk.onchange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.snipeAnyP5 = radarP5Chk.checked;
          draft.isDirty = true;
          renderModal();
        }
      };
    }
    if (radarP5Gold && sniperState.activeTab !== 'all') {
      radarP5Gold.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.maxPriceP5Gold = Number(radarP5Gold.value) || 0;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }
    if (radarP5Gems && sniperState.activeTab !== 'all') {
      radarP5Gems.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          const val = Number(radarP5Gems.value) || 0;
          draft.config.maxPriceP5Gems = val;
          draft.config.maxPriceP5Diamonds = val;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }

    const radarNoteChk = overlay.querySelector('#radarSnipeByNote');
    const radarMinNote = overlay.querySelector('#radarMinNote');
    const radarNoteGold = overlay.querySelector('#radarMaxPriceNoteGold');
    const radarNoteGems = overlay.querySelector('#radarMaxPriceNoteGems');

    if (radarNoteChk && sniperState.activeTab !== 'all') {
      radarNoteChk.onchange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.snipeByNote = radarNoteChk.checked;
          draft.isDirty = true;
          renderModal();
        }
      };
    }
    if (radarMinNote && sniperState.activeTab !== 'all') {
      radarMinNote.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.minNote = Number(radarMinNote.value) || 7.0;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }
    if (radarNoteGold && sniperState.activeTab !== 'all') {
      radarNoteGold.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.maxPriceNoteGold = Number(radarNoteGold.value) || 0;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }
    if (radarNoteGems && sniperState.activeTab !== 'all') {
      radarNoteGems.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          const val = Number(radarNoteGems.value) || 0;
          draft.config.maxPriceNoteGems = val;
          draft.config.maxPriceNoteDiamonds = val;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }

    const radarSlots = overlay.querySelector('#radarMaxActiveSlots');
    const radarAutoMax = overlay.querySelector('#radarAutoMaxAffordable');

    if (radarSlots && sniperState.activeTab !== 'all') {
      radarSlots.oninput = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.maxActiveSlots = Number(radarSlots.value) || 5;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }
    if (radarAutoMax && sniperState.activeTab !== 'all') {
      radarAutoMax.onchange = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (draft) {
          draft.config.autoMaxAffordable = radarAutoMax.checked;
          draft.isDirty = true;
          updateDirtyState();
        }
      };
    }

    function updateDirtyState() {
      const saveBtn = overlay.querySelector('[data-action="save-account"]');
      if (saveBtn) saveBtn.disabled = false;
      updateBadgesAndStatus(overlay);
    }

    overlay.querySelectorAll('[data-acc-toggle]').forEach(chk => {
      chk.onchange = async () => {
        const idx = Number(chk.dataset.accToggle);
        const draft = getDraftState(idx);
        if (draft) {
          draft.enabled = chk.checked;
          draft.isDirty = true;
          try {
            await saveAccount(idx);
            renderModal();
          } catch (err) {
            sniperState.lastError = String(err.message || err);
            renderModal();
          }
        }
      };
    });

    const enableAllBtn = overlay.querySelector('[data-action="enable-all-accounts"]');
    if (enableAllBtn) {
      enableAllBtn.onclick = async () => {
        try {
          const failures = [];
          for (let i = 0; i < 4; i++) {
            const draft = getDraftState(i);
            draft.enabled = true;
            const res = await saveAccount(i);
            if (res && res.visualSynced === false && res.visualError) {
              failures.push(`Conta ${i + 1} (${res.visualError})`);
            }
          }
          if (failures.length) {
            sniperState.lastSuccess = null;
            sniperState.lastError = 'Salvo no backend, mas sincronização visual pendente: ' + failures.join(', ');
          } else {
            sniperState.lastSuccess = 'Todas as 4 contas foram ativadas!';
            sniperState.lastError = null;
          }
          renderModal();
        } catch (err) {
          sniperState.lastError = String(err.message || err);
          renderModal();
        }
      };
    }

    const disableAllBtn = overlay.querySelector('[data-action="disable-all-accounts"]');
    if (disableAllBtn) {
      disableAllBtn.onclick = async () => {
        try {
          const failures = [];
          for (let i = 0; i < 4; i++) {
            const draft = getDraftState(i);
            draft.enabled = false;
            const res = await saveAccount(i);
            if (res && res.visualSynced === false && res.visualError) {
              failures.push(`Conta ${i + 1} (${res.visualError})`);
            }
          }
          if (failures.length) {
            sniperState.lastSuccess = null;
            sniperState.lastError = 'Salvo no backend, mas sincronização visual pendente: ' + failures.join(', ');
          } else {
            sniperState.lastSuccess = 'Todas as 4 contas foram pausadas.';
            sniperState.lastError = null;
          }
          renderModal();
        } catch (err) {
          sniperState.lastError = String(err.message || err);
          renderModal();
        }
      };
    }

    const replaceAllBtn = overlay.querySelector('[data-action="replace-all-rules"]');
    if (replaceAllBtn) {
      replaceAllBtn.onclick = async () => {
        const select = overlay.querySelector('#sniperMasterSourceSelect');
        const srcIdx = select ? Number(select.value) : 0;
        const srcDraft = getDraftState(srcIdx);
        const srcRules = srcDraft.rules;

        if (!confirm(`Tem certeza de que deseja SUBSTITUIR todas as regras das 4 contas pelo conjunto da Conta ${srcIdx + 1} (${srcRules.length} regras)?\nEsta ação substitui as regras anteriores e espelha a configuração completa de radar em todas as contas mantendo os IDs de regras estáveis.`)) {
          return;
        }

        try {
          await applyAll(srcRules, sniperState.accounts[srcIdx].enabled, srcDraft.config);
          renderModal();
        } catch (err) {
          sniperState.lastError = String(err.message || err);
          renderModal();
        }
      };
    }

    overlay.querySelectorAll('[data-action="import-visual"]').forEach(btn => {
      btn.onclick = async () => {
        const idx = Number(btn.dataset.acc);
        try {
          btn.disabled = true;
          btn.textContent = 'Importando...';
          const res = await importFromVisual(idx);
          sniperState.lastSuccess = `Importadas ${res.rules.length} regras da Conta ${idx + 1} (visual). Revise e clique em Salvar.`;
          renderModal();
        } catch (err) {
          sniperState.lastError = String(err.message || err);
          renderModal();
        }
      };
    });

    overlay.querySelectorAll('[data-action="save-account"]').forEach(btn => {
      btn.onclick = async () => {
        const idx = Number(btn.dataset.acc);
        try {
          btn.disabled = true;
          btn.textContent = 'Salvando...';
          await saveAccount(idx);
          renderModal();
        } catch (err) {
          sniperState.lastError = String(err.message || err);
          renderModal();
        }
      };
    });

    overlay.querySelectorAll('[data-action="toggle-rule"]').forEach(btn => {
      btn.onclick = () => {
        const rIdx = Number(btn.dataset.ruleIndex);
        const draft = getDraftState(sniperState.activeTab);
        if (draft && draft.rules[rIdx]) {
          draft.rules[rIdx].active = !draft.rules[rIdx].active;
          draft.isDirty = true;
          renderModal();
        }
      };
    });

    overlay.querySelectorAll('[data-action="delete-rule"]').forEach(btn => {
      btn.onclick = () => {
        const rIdx = Number(btn.dataset.ruleIndex);
        const draft = getDraftState(sniperState.activeTab);
        if (draft && draft.rules[rIdx]) {
          const name = draft.rules[rIdx].targetName;
          if (!confirm(`Remover a regra de compra para "${name}"?`)) return;
          draft.rules.splice(rIdx, 1);
          draft.isDirty = true;
          renderModal();
        }
      };
    });

    overlay.querySelectorAll('[data-action="edit-rule"]').forEach(btn => {
      btn.onclick = () => {
        const rIdx = Number(btn.dataset.ruleIndex);
        const draft = getDraftState(sniperState.activeTab);
        if (draft && draft.rules[rIdx]) {
          const rule = draft.rules[rIdx];
          sniperState.editingRuleId = rule.id;
          sniperState.ruleDraft = {
            ...rule,
            targetCategory: rule.targetCategory || 'stone',
            catalogCategoryFilter: '',
            excludedItemIds: Array.isArray(rule.excludedItemIds) ? [...rule.excludedItemIds] : []
          };
          renderModal();
          const form = document.getElementById('sniperRuleForm');
          form?.scrollIntoView({ behavior: 'smooth' });
        }
      };
    });

    overlay.querySelectorAll('[data-action="cancel-rule-edit"]').forEach(btn => {
      btn.onclick = () => {
        sniperState.editingRuleId = null;
        sniperState.ruleDraft = {
          targetType: 'item',
          targetName: '',
          targetId: '',
          targetCategory: 'stone',
          catalogCategoryFilter: '',
          maxPriceGold: 10000,
          maxPriceGems: 0,
          maxQty: 1,
          infinite: false,
          active: true,
          excludedItemIds: []
        };
        renderModal();
      };
    });

    const searchInput = overlay.querySelector('#ruleTargetSearch');
    const autocompleteList = overlay.querySelector('#sniperAutocomplete');
    const targetIdInput = overlay.querySelector('#ruleTargetId');
    const targetTypeSelect = overlay.querySelector('#ruleTargetType');
    const targetCategorySelect = overlay.querySelector('#ruleTargetCategory');
    const catalogCatFilterSelect = overlay.querySelector('#ruleCatalogCategoryFilter');
    const maxPriceGoldInput = overlay.querySelector('#ruleMaxPriceGold');
    const maxPriceGemsInput = overlay.querySelector('#ruleMaxPriceGems');
    const maxQtyInput = overlay.querySelector('#ruleMaxQty');
    const infiniteCheckbox = overlay.querySelector('#ruleInfinite');

    if (infiniteCheckbox && maxQtyInput) {
      infiniteCheckbox.onchange = () => {
        maxQtyInput.disabled = infiniteCheckbox.checked;
        sniperState.ruleDraft.infinite = infiniteCheckbox.checked;
      };
    }

    if (targetTypeSelect) {
      targetTypeSelect.onchange = () => {
        // Preserva valores digitados no formulário
        if (maxPriceGoldInput) sniperState.ruleDraft.maxPriceGold = Number(maxPriceGoldInput.value) || 0;
        if (maxPriceGemsInput) sniperState.ruleDraft.maxPriceGems = Number(maxPriceGemsInput.value) || 0;
        if (maxQtyInput) sniperState.ruleDraft.maxQty = Number(maxQtyInput.value) || 1;
        if (infiniteCheckbox) sniperState.ruleDraft.infinite = Boolean(infiniteCheckbox.checked);

        sniperState.ruleDraft.targetType = targetTypeSelect.value;
        renderModal();
      };
    }

    const exclusionsSearchInput = overlay.querySelector('#ruleExclusionsSearch');
    const exclusionsList = overlay.querySelector('#ruleExclusionsList');
    const exclusionsBadge = overlay.querySelector('#ruleExclusionsCountBadge');

    function renderExclusionsList(filterText = '') {
      if (!exclusionsList) return;
      const currentCat = sniperState.ruleDraft.targetCategory;
      const catalogList = (sniperState && Array.isArray(sniperState.itemsCatalog) && sniperState.itemsCatalog.length > 0)
        ? sniperState.itemsCatalog
        : DEFAULT_ITEMS_CATALOG;
      const catItems = catalogList.filter(it => it.category === currentCat);
      const excludedSet = new Set(sniperState.ruleDraft.excludedItemIds || []);

      if (exclusionsBadge) {
        exclusionsBadge.textContent = `${excludedSet.size} excluído(s)`;
      }

      const q = (filterText || '').trim().toLowerCase();
      const filteredItems = catItems.filter(it => {
        if (!q) return true;
        const nameMatch = (it.name || '').toLowerCase().includes(q);
        const idMatch = String(it.id).includes(q);
        const aliasMatch = Array.isArray(it.aliases) && it.aliases.some(a => (a || '').toLowerCase().includes(q));
        return nameMatch || idMatch || aliasMatch;
      });

      if (catItems.length === 0) {
        exclusionsList.innerHTML = '<div class="sniper-exclusion-empty">Nenhum item catalogado nesta categoria.</div>';
        return;
      }

      if (filteredItems.length === 0) {
        exclusionsList.innerHTML = '<div class="sniper-exclusion-empty">Nenhum item corresponde ao filtro.</div>';
        return;
      }

      exclusionsList.innerHTML = filteredItems.map(item => {
        const isChecked = excludedSet.has(item.id);
        let aliasTag = '';
        if (Array.isArray(item.aliases) && item.aliases.length > 0) {
          aliasTag = ` <span class="sniper-exclusion-alias">(${escapeHtml(item.aliases.join(', '))})</span>`;
        }
        return `
          <label class="sniper-exclusion-item ${isChecked ? 'checked' : ''}" data-id="${item.id}" data-name="${escapeHtml(item.name)}">
            <input type="checkbox" class="sniper-exclusion-checkbox" data-exclude-id="${item.id}" ${isChecked ? 'checked' : ''}>
            <span class="sniper-exclusion-name">${escapeHtml(item.name)}</span>
            <span class="sniper-exclusion-id">(ID: ${item.id})</span>
            ${aliasTag}
          </label>
        `;
      }).join('');

      exclusionsList.querySelectorAll('.sniper-exclusion-checkbox').forEach(cb => {
        cb.onchange = () => {
          const id = Number(cb.getAttribute('data-exclude-id'));
          if (!sniperState.ruleDraft.excludedItemIds) sniperState.ruleDraft.excludedItemIds = [];
          const idx = sniperState.ruleDraft.excludedItemIds.indexOf(id);
          if (cb.checked) {
            if (idx === -1) sniperState.ruleDraft.excludedItemIds.push(id);
            cb.closest('.sniper-exclusion-item')?.classList.add('checked');
          } else {
            if (idx !== -1) sniperState.ruleDraft.excludedItemIds.splice(idx, 1);
            cb.closest('.sniper-exclusion-item')?.classList.remove('checked');
          }
          if (exclusionsBadge) {
            exclusionsBadge.textContent = `${sniperState.ruleDraft.excludedItemIds.length} excluído(s)`;
          }
        };
      });
    }

    if (sniperState.ruleDraft.targetType === 'category') {
      renderExclusionsList(exclusionsSearchInput ? exclusionsSearchInput.value : '');
    }

    if (exclusionsSearchInput) {
      exclusionsSearchInput.oninput = () => {
        renderExclusionsList(exclusionsSearchInput.value);
      };
    }

    if (targetCategorySelect) {
      targetCategorySelect.onchange = () => {
        const oldCat = sniperState.ruleDraft.targetCategory;
        const newCat = targetCategorySelect.value;
        if (oldCat !== newCat) {
          sniperState.ruleDraft.targetCategory = newCat;
          sniperState.ruleDraft.excludedItemIds = [];
          const noticeEl = overlay.querySelector('#ruleCategoryNotice');
          if (noticeEl) {
            noticeEl.textContent = newCat === 'rare_loot'
              ? '⚠️ Loots Raros inclui exclusivamente os 4 itens originais: Shiny Stone Fragment (70012), Key Fragment (70011), Bronze Boss Token (70000) e Bicycle Fragment (70013). Não cobre outros itens raros.'
              : '⚠️ Atenção: A quantidade máxima é agregada para todos os itens da categoria selecionada.';
          }
          if (exclusionsSearchInput) exclusionsSearchInput.value = '';
          renderExclusionsList();
        }
      };
    }

    if (catalogCatFilterSelect) {
      catalogCatFilterSelect.onchange = () => {
        sniperState.ruleDraft.catalogCategoryFilter = catalogCatFilterSelect.value;
        if (searchInput && searchInput.value.trim()) {
          searchInput.dispatchEvent(new Event('input'));
        }
      };
    }

    if (searchInput) {
      searchInput.oninput = () => {
        sniperState.ruleDraft.targetName = searchInput.value;
        const q = searchInput.value.trim().toLowerCase();
        if (!q || !autocompleteList) {
          autocompleteList?.classList.remove('open');
          if (autocompleteList) autocompleteList.innerHTML = '';
          return;
        }

        const isPkmn = targetTypeSelect?.value === 'pokemon';
        let matches = [];

        if (isPkmn) {
          const pkList = root.PIW_ALL_POKEMON_THEMES || [];
          matches = pkList.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 8);
        } else {
          const catFilter = catalogCatFilterSelect ? catalogCatFilterSelect.value : sniperState.ruleDraft.catalogCategoryFilter;
          matches = sniperState.itemsCatalog.filter(it => {
            if (catFilter && it.category !== catFilter) return false;
            const nameMatch = (it.name || '').toLowerCase().includes(q);
            const idMatch = String(it.id) === q;
            const aliasMatch = Array.isArray(it.aliases) && it.aliases.some(a => (a || '').toLowerCase().includes(q));
            return nameMatch || idMatch || aliasMatch;
          }).slice(0, 8);
        }

        if (!matches.length) {
          autocompleteList.classList.remove('open');
          autocompleteList.innerHTML = '';
          return;
        }

        autocompleteList.innerHTML = matches.map(m => {
          let aliasLabel = '';
          if (Array.isArray(m.aliases) && m.aliases.length > 0) {
            const matchedAlias = m.aliases.find(a => (a || '').toLowerCase().includes(q));
            if (matchedAlias && !(m.name || '').toLowerCase().includes(q)) {
              aliasLabel = ` <span style="font-size:10px;color:var(--color-text-secondary);opacity:0.85">(alias: ${escapeHtml(matchedAlias)})</span>`;
            }
          }
          return `
          <div class="sniper-autocomplete-item" data-id="${escapeHtml(m.id || m.dex)}" data-name="${escapeHtml(m.name)}">
            <span>${isPkmn ? '🐾' : '📦'}</span>
            <span><b>${escapeHtml(m.name)}</b> (ID: ${escapeHtml(m.id || m.dex)})${aliasLabel}</span>
          </div>
        `;
        }).join('');

        autocompleteList.querySelectorAll('.sniper-autocomplete-item').forEach(itemEl => {
          itemEl.onclick = () => {
            searchInput.value = itemEl.dataset.name;
            if (targetIdInput) targetIdInput.value = itemEl.dataset.id;
            sniperState.ruleDraft.targetName = itemEl.dataset.name;
            sniperState.ruleDraft.targetId = itemEl.dataset.id;
            autocompleteList.classList.remove('open');
          };
        });

        autocompleteList.classList.add('open');
      };

      document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !autocompleteList?.contains(e.target)) {
          autocompleteList?.classList.remove('open');
        }
      });
    }

    if (targetIdInput) {
      targetIdInput.oninput = () => {
        sniperState.ruleDraft.targetId = targetIdInput.value;
      };
    }
    if (maxPriceGoldInput) {
      maxPriceGoldInput.oninput = () => {
        sniperState.ruleDraft.maxPriceGold = Number(maxPriceGoldInput.value) || 0;
      };
    }
    if (maxPriceGemsInput) {
      maxPriceGemsInput.oninput = () => {
        sniperState.ruleDraft.maxPriceGems = Number(maxPriceGemsInput.value) || 0;
      };
    }
    if (maxQtyInput) {
      maxQtyInput.oninput = () => {
        sniperState.ruleDraft.maxQty = Number(maxQtyInput.value) || 1;
      };
    }

    const saveRuleBtn = overlay.querySelector('#sniperSaveRuleBtn');
    if (saveRuleBtn) {
      saveRuleBtn.onclick = () => {
        const draft = getDraftState(sniperState.activeTab);
        if (!draft) return;

        const prevRule = sniperState.editingRuleId ? draft.rules.find(r => r.id === sniperState.editingRuleId) : null;
        const curType = targetTypeSelect?.value || 'item';

        const rawRule = {
          ...(prevRule || {}),
          id: sniperState.editingRuleId || null,
          targetType: curType,
          targetCategory: curType === 'category' ? (targetCategorySelect?.value || 'stone') : undefined,
          targetName: curType === 'category' ? '' : (searchInput?.value || ''),
          targetId: curType === 'category' ? '' : (targetIdInput?.value || ''),
          maxPriceGold: maxPriceGoldInput ? Number(maxPriceGoldInput.value) : 0,
          maxPriceGems: maxPriceGemsInput ? Number(maxPriceGemsInput.value) : 0,
          maxQty: maxQtyInput ? Number(maxQtyInput.value) : 1,
          infinite: Boolean(infiniteCheckbox?.checked),
          active: prevRule ? (prevRule.active !== false) : true,
          totalBought: prevRule ? (Number(prevRule.totalBought) || 0) : 0,
          excludedItemIds: curType === 'category' ? [...(sniperState.ruleDraft.excludedItemIds || [])] : []
        };

        const validated = validateRule(rawRule);
        if (!validated.ok) {
          sniperState.lastError = validated.error;
          renderModal();
          return;
        }

        if (sniperState.editingRuleId) {
          const idx = draft.rules.findIndex(r => r.id === sniperState.editingRuleId);
          if (idx >= 0) {
            const existing = draft.rules[idx];
            draft.rules[idx] = {
              ...existing,
              ...validated.rule,
              active: existing.active !== undefined ? existing.active : validated.rule.active,
              totalBought: Number(existing.totalBought) || 0
            };
          }
          sniperState.editingRuleId = null;
        } else {
          draft.rules.push(validated.rule);
        }

        draft.isDirty = true;
        sniperState.lastError = null;
        sniperState.ruleDraft = {
          targetType: 'item',
          targetName: '',
          targetId: '',
          targetCategory: 'stone',
          catalogCategoryFilter: '',
          maxPriceGold: 10000,
          maxPriceGems: 0,
          maxQty: 1,
          infinite: false,
          active: true,
          excludedItemIds: []
        };

        renderModal();
      };
    }
  }

  // =========================================================================
  // Gerenciamento de Foco e Airspace
  // =========================================================================

  function trapFocus(modal, e) {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }

  function handleKeydown(e) {
    if (!sniperState.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
      return;
    }
    const modal = document.getElementById('sniperModal');
    if (modal) trapFocus(modal, e);
  }

  async function openPanel(options = {}) {
    sniperState.openerEl = options.opener || document.activeElement;
    if (options.accountIndex !== undefined) {
      sniperState.activeTab = options.accountIndex;
    }

    renderModal();
    const overlay = document.getElementById('sniperOverlay');
    if (overlay) {
      overlay.classList.add('show');
    }
    sniperState.isOpen = true;

    document.addEventListener('keydown', handleKeydown, true);

    const closeBtn = overlay?.querySelector('.sniper-close-btn');
    closeBtn?.focus();

    try {
      await loadCatalog();
    } catch (catErr) {
      console.warn('[sniper-panel] Erro ao carregar catálogo dinâmico, utilizando catálogo local base:', catErr);
      sniperState.catalogLoadWarning = true;
    }

    try {
      await loadBackendState();
      renderModal(true);
      if (!overlay?.contains(document.activeElement)) {
        const liveBtn = overlay?.querySelector('.sniper-close-btn') || overlay?.querySelector('.sniper-tab-btn');
        liveBtn?.focus();
      }
    } catch {
      renderModal();
    }

    startLogPolling();
  }

  function closePanel() {
    if (!sniperState.isOpen) return;
    sniperState.isOpen = false;
    stopLogPolling();

    const overlay = document.getElementById('sniperOverlay');
    if (overlay) {
      overlay.classList.remove('show');
    }

    document.removeEventListener('keydown', handleKeydown, true);

    if (sniperState.openerEl && typeof sniperState.openerEl.focus === 'function') {
      sniperState.openerEl.focus();
    }

    window.dispatchEvent(new Event('resize'));
  }

  function startLogPolling() {
    stopLogPolling();
    sniperState.logPollTimer = setInterval(() => {
      if (!sniperState.isOpen) return;
      for (let i = 0; i < 4; i++) {
        ingestVisualLogs(i);
      }
    }, 6000);
  }

  function stopLogPolling() {
    if (sniperState.logPollTimer) {
      clearInterval(sniperState.logPollTimer);
      sniperState.logPollTimer = null;
    }
  }

  if (root.pokeAPI && typeof root.pokeAPI.onSniperUpdated === 'function') {
    try {
      root.pokeAPI.onSniperUpdated((payload) => {
        if (!payload || !Array.isArray(payload.accounts)) return;
        payload.accounts.forEach(acc => {
          const idx = acc.index;
          if (idx >= 0 && idx < 4) {
            sniperState.accounts[idx] = {
              ...sniperState.accounts[idx],
              ...acc
            };
            const draft = sniperState.drafts[idx];
            if (!draft || !draft.isDirty) {
              sniperState.drafts[idx] = {
                configured: Boolean(acc.configured),
                enabled: Boolean(acc.enabled),
                rules: (acc.rules || []).map(r => ({ ...r })),
                config: Object.assign(createDefaultConfig(), acc.config || {}),
                isDirty: false
              };
            }
          }
        });
        if (sniperState.isOpen) renderModal(true);
      });
    } catch (e) {
      console.warn('[SniperPanel] Falha ao registrar onSniperUpdated:', e);
    }
  }

  // Carga inicial do estado autoritativo do backend em background no startup
  if (root.pokeAPI && typeof root.pokeAPI.sniperGetState === 'function') {
    loadBackendState().catch(() => {});
  }

  const api = {
    open: openPanel,
    close: closePanel,
    isOpen: () => sniperState.isOpen,
    getState: () => sniperState,
    validateRule,
    validateConfig,
    normalizeConfigAliases,
    createDefaultConfig,
    CANONICAL_CATEGORIES,
    loadCatalog,
    escapeHtml,
    isConfirmedSuccessLog,
    formatConfirmedPurchaseSummary,
    syncVisualWebview,
    restoreConfiguredVisualAccount,
    preseedVisualAccount,
    importFromVisual,
    ingestVisualLogs,
    flush,
    saveAccount,
    applyAll,
    clearHistory,
    loadBackendState,
    getAccountMode,
    getIntegration
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PioSniperPanel = api;
  }
})(typeof window === 'object' ? window : globalThis);
