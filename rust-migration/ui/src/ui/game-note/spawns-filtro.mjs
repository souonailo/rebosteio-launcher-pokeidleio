/** Quem NÃO entra no editor de spawns — só lendários (míticos podem passar). */
export const LENDARIO_DEX = new Set([
  // 3ª Hoenn
  377, 378, 379, 380, 381, 382, 383, 384,
  // 4ª Sinnoh
  480, 481, 482, 483, 484, 485, 486, 487, 488,
  // 5ª Unova
  638, 639, 640, 641, 642, 643, 644, 645, 646,
  // 6ª Kalos
  716, 717, 718,
  // 7ª Alola (Type: Null e Silvally, Tapu, nebulosa, UB, Necrozma). O Type: Null (#772) e o Silvally (#773) entraram
  // em 18/10/2026 (pedido do dono): são lendários, só pelo Mystic Ticket — tinham ficado de fora e viraram hunt de
  // Alola (Nv 75.000 e 120.550) quando a região abriu, em 17/10.
  772, 773,
  785, 786, 787, 788, 789, 790, 791, 792,
  793, 794, 795, 796, 797, 798, 799, 800,
  803, 804, 805, 806,
  // 8ª Galar (+ Crown Tundra, Legends Arceus)
  888, 889, 890, 891, 892, 894, 895, 896, 897, 898, 905,
  // 9ª Paldea (+ DLC / Teal Mask / Indigo Disk)
  1001, 1002, 1003, 1004, 1007, 1008, 1009, 1010,
  1014, 1015, 1016, 1017, 1020, 1021, 1022, 1023, 1024,
]);

/** Míticos entram no editor se tiverem sprite — só referência. */
export const MITICO_DEX = new Set([
  385, 386,
  489, 490, 491, 492, 493,
  647, 648, 649,
  719, 720, 721,
  801, 802, 807, 808, 809,
  893, 1025,
]);

/** Alias usado pelo jogo (escala de hunt etc.) — só lendários. */
export const LENDARIOS_DEX = LENDARIO_DEX;

/**
 * Formas fora do pool do jogo (Pokedex, spawns, espécies novas) — hoje NENHUMA.
 *
 * Bonsly, Happiny, Meloetta (Aria) e Meowstic moraram aqui até 16/10/2026, por falta de arte jogável;
 * o contrato de sprites trouxe as quatro e o dono as liberou, com a Mega Meowstic. Com isso a Chansey
 * passa a ser 2ª evolução (Happiny → Chansey → Blissey), o Sudowoodo também (Bonsly → Sudowoodo), o
 * Espurr evolui para o Meowstic e a Meloetta entra no sorteio da Arena Mística como todo mítico com
 * arte. Os conjuntos ficam (vazios) porque o servidor, o cliente e as ferramentas do Sprite Lab ainda
 * filtram por eles — o próximo omitido entra aqui.
 */
export const SLUGS_OMITIDOS = new Set();

/** Mesmos omitidos, pelo nome exato em creatures-novos.json. */
export const NOMES_OMITIDOS = new Set();

/** Hunt Kanto espelhada por tipo — mesma lógica de hunts-sinnoh.json. */
export const FONTE_POR_TIPO = {
  FIRE: 'charmander',
  WATER: 'squirtle',
  GRASS: 'ivysaur',
  ROCK: 'geodude',
  GROUND: 'sandshrew',
  ELECTRIC: 'pikachu',
  // Era o Abra (a pirâmide), trocado a pedido do dono em 18/10/2026 pelo mapa do Brave Alakazam: é o das hunts
  // psíquicas de Unova em diante, e o layout uniforme dele calibra no alvo (o do Alakazam de Kanto, compacto, deixava
  // essas hunts 30–45% mais rápidas). As psíquicas de antes de Unova têm "fonte": "alakazam" explícita.
  PSYCHIC: 'brave_alakazam',
  GHOST: 'haunter',
  DARK: 'houndour',
  STEEL: 'magnemite',
  FIGHTING: 'primeape',
  NORMAL: 'pidgey',
  FAIRY: 'clefairy',
  BUG: 'butterfree',
  DRAGON: 'dragonair',
  POISON: 'ivysaur',
  FLYING: 'pidgey',
  ICE: 'squirtle',
  'BUG/FIRE': 'butterfree',
  'BUG/FLYING': 'butterfree',
  'DARK/FLYING': 'houndour',
  'DRAGON/FLYING': 'dragonair',
  'FIGHTING/DARK': 'primeape',
  'GROUND/FLYING': 'sandshrew',
  'GROUND/ROCK': 'sandshrew',
  'POISON/DRAGON': 'ivysaur',
  'POISON/WATER': 'ivysaur',
  'ROCK/FLYING': 'geodude',
  'ROCK/STEEL': 'geodude',
  'STEEL/GHOST': 'magnemite',
  'STEEL/PSYCHIC': 'magnemite',
  'WATER/PSYCHIC': 'squirtle',
  'WATER/ROCK': 'squirtle',
};

export function fontePorTipo(tipo) {
  if (!tipo) return 'pidgey';
  return FONTE_POR_TIPO[tipo] ?? FONTE_POR_TIPO[tipo.split('/')[0]] ?? 'pidgey';
}
