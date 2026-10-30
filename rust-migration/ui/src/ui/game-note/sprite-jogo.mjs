import { isOutlandPokeId } from './outland.mjs';
import { isMegaPokeId, looktypeDaMega, megaPorPokeId } from './megas.mjs';

/** Looktype do Sprite Lab para forma normal publicada: 60000 + dex nacional. */
export const LOOKTYPE_NORMAL_BASE = 60000;

/** O `looktype` que significa "sem arte". Não existe no índice de outfits. */
export const LOOKTYPE_SEM_ARTE = 1;

/**
 * A espécie tem sprite publicado no jogo?
 *
 * `looktype: 1` = placeholder vazio. Nacional #1000+ com looktype reciclado do Gen 1
 * (60001, 60002…) ainda não tem arte — Wo-Chien, Koraidon, etc.
 */
export function temSpriteJogo(especie) {
  const lt = especie?.looktype ?? LOOKTYPE_SEM_ARTE;
  if (lt <= LOOKTYPE_SEM_ARTE) return false;
  const id = Number(especie?.pokeId);
  if (!Number.isFinite(id)) return false;
  // A MEGA (#3xxx, e a 2ª no #9xxx) cai na faixa "1000+" da regra abaixo, mas o looktype dela é
  // 80000+dex (83000+dex na 2ª) e não 60000+pokeId — sem esta linha toda mega seria lida como
  // "sem arte" e sumiria da Pokedex. A checagem é a mesma em espírito: a arte tem de ser a DAQUELA
  // mega, e um número da faixa sem ficha de mega não tem arte nenhuma.
  if (isMegaPokeId(id)) {
    const meta = megaPorPokeId(id);
    return !!meta && lt === looktypeDaMega(meta);
  }
  if (!isOutlandPokeId(id) && id >= 1000 && id < 13000 && lt !== LOOKTYPE_NORMAL_BASE + id) {
    return false;
  }
  return true;
}
