/**
 * Variantes Outland — espécies `#2001+` (pokeId = dex exibido na Pokedex).
 *
 * O espelho idleworld ainda pode vir com `10501+` (= 10000 + slot 501); o boot remapeia
 * para `2001+` via {@link remapOutlandPokeId}. O artefato `10001 Blastoise` continua fora.
 */

export const OUTLAND_DEX_BASE = 2001;

/** Primeiro pokeId de variante Outland (Brave Blastoise). */
export const OUTLAND_POKE_MIN = 2001;

/** Teto exclusivo — Orre começa em 13000. */
export const OUTLAND_POKE_MAX = 2059;

/** Faixa legada do espelho idleworld (antes da migração v1.39). */
export const OUTLAND_POKE_LEGADO_MIN = 10501;
export const OUTLAND_POKE_LEGADO_MAX = 10548;

/** 10501 − 2001 — conversão espelho → IDs normalizados. */
export const OUTLAND_POKE_REMAP_OFFSET = OUTLAND_POKE_LEGADO_MIN - OUTLAND_POKE_MIN;

export function isOutlandPokeId(pokeId) {
  const id = Number(pokeId);
  return id >= OUTLAND_POKE_MIN && id < OUTLAND_POKE_MAX;
}

export function isOutlandPokeIdLegado(pokeId) {
  const id = Number(pokeId);
  return id >= OUTLAND_POKE_LEGADO_MIN && id < OUTLAND_POKE_LEGADO_MAX;
}

/** Converte pokeId legado do espelho (10501+) para faixa normalizada (2001+). */
export function remapOutlandPokeId(pokeId) {
  const id = Number(pokeId);
  if (!Number.isFinite(id)) return pokeId;
  if (isOutlandPokeIdLegado(id)) return id - OUTLAND_POKE_REMAP_OFFSET;
  return id;
}

/** Espelho `10000+dexId` (ex.: 10001) — não é Outland nem dex nacional; não listar na Pokedex. */
export function isEspelhoFantasmaPokeId(pokeId) {
  const id = Number(pokeId);
  return id >= 10000 && id < OUTLAND_POKE_LEGADO_MIN;
}

/** pokeId → #dex Outland — identidade: pokeId JÁ É o número da Pokedex. */
export function montarOutlandDex(especiesMap) {
  const lista = [...especiesMap.values()]
    .filter((e) => isOutlandPokeId(e.pokeId))
    .sort((a, b) => a.pokeId - b.pokeId);
  const pokeToDex = {};
  const dexToPoke = {};
  for (const e of lista) {
    pokeToDex[e.pokeId] = e.pokeId;
    dexToPoke[e.pokeId] = e.pokeId;
  }
  const total = lista.length;
  return {
    pokeToDex,
    dexToPoke,
    total,
    min: OUTLAND_DEX_BASE,
    max: total ? OUTLAND_DEX_BASE + total - 1 : OUTLAND_DEX_BASE,
  };
}

export function dexChaveOutland(pokeId) {
  return isOutlandPokeId(pokeId) ? pokeId : null;
}

/** Mapa #2001… → pokeId legado 10501+ (migração de saves v1.29–1.38). */
export function montarOutlandDexLegado48(_speciesMap) {
  const dexToPoke = {};
  for (let i = 0; i < 47; i++) {
    dexToPoke[OUTLAND_DEX_BASE + i] = OUTLAND_POKE_LEGADO_MIN + i;
  }
  return dexToPoke;
}

/** Aplica remap 10501+ → 2001+ numa lista de criaturas (espelho legado). */
export function aplicarRemapOutlandLista(lista) {
  for (const c of lista) {
    if (isOutlandPokeIdLegado(c.pokeId)) c.pokeId = remapOutlandPokeId(c.pokeId);
    if (c.evolvesToId && isOutlandPokeIdLegado(c.evolvesToId)) {
      c.evolvesToId = remapOutlandPokeId(c.evolvesToId);
    }
  }
}
