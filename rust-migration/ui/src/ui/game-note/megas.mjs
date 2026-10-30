/**
 * MEGA EVOLUÇÃO — as 88 megas (mais 5 segundas, ver `MEGAS_SEGUNDAS`), a pedra de cada uma, a
 * arte e o lugar delas na Pokedex.
 *
 * ### As megas são ESPÉCIES, na faixa #3000
 *
 * O mesmo desenho das variantes de Outland (`#2001+`, ver `outland.mjs`): cada mega é uma
 * espécie de verdade no catálogo, com `pokeId = 3000 + dex nacional` — Mega Venusaur é o
 * **#3003**, Mega Gengar o **#3094**, Mega Gallade o **#3475**. Elas ganham a aba "Mega" na
 * Pokedex, do lado da aba "Outland", e entram na Coleção como qualquer outra espécie.
 *
 * `3000 + dex` e não uma contagem corrida (3001, 3002, …) porque o número precisa DIZER de
 * quem ele é. Com a soma, #3094 é Gengar para sempre; numa contagem, inserir a mega do
 * Abomasnow um dia empurraria metade da lista e mudaria o número de bichos que os jogadores já
 * têm. A maior mega é a do Baxcalibur (#998), então a faixa usada vai até #3998 e não encosta
 * nos clones de Orre (`13xxx`). A 2ª mega de um mesmo dex (Charizard X, Raichu X, Mewtwo X,
 * Garchomp Z, Lucario Z) não cabe na soma e mora no `9000 + dex` — ver `MEGAS_SEGUNDAS`.
 *
 * Por serem espécies de verdade, não há nada de "mega" para ensinar ao resto do servidor:
 * `especies.get(pk.speciesId)` devolve a mega já com as bases, os tipos e a arte certos, e
 * combate, PvP, ginásios, Mercado, ranking e nota funcionam sem uma linha a mais.
 *
 * ### As bases vêm da pokemondb, inteiras — não são um bônus
 *
 * `bases` SUBSTITUI as seis bases da espécie, com os números da aba "Mega Evolution" da ficha
 * de cada pokemon na pokemondb. Não é "+X%": Mega Alakazam tem 175 de Sp. Atk contra 135, e
 * Mega Aggron troca Sp. Atk por 230 de Defense. Um multiplicador único apagaria exatamente o
 * que diferencia uma mega da outra.
 *
 * O IV, a qualidade, a potência e o REFINO continuam valendo por cima — a mega troca o chão,
 * não o prédio. Quem refinou +40 em ATK continua com +40 depois de megaevoluir.
 *
 * ### Os tipos também mudam
 *
 * Mega Gyarados vira WATER/DARK, Mega Ampharos ganha DRAGON, Mega Charizard Y continua
 * FIRE/FLYING. Isso mexe em STAB, em efetividade e na pedra de refino — de propósito, é metade
 * da graça de megaevoluir.
 *
 * ### Quais entraram, e por que só estas
 *
 * Duas listas mandam: a arte em `Pokedex Backup/MEGAS` e a aba "Mega Evolution" na pokemondb.
 * A pedra do pokesprite NÃO manda — ele só tem as 47 de X/Y e ORAS, e as megas de Legends: Z-A
 * (Clefable, Victreebel, Starmie, Dragonite, Meganium, Feraligatr, Skarmory, Froslass,
 * Excadrill, Scolipede, Eelektross, Chandelure, Pyroar, Greninja, Malamar, Barbaracle,
 * Dragalge, Hawlucha, Drampa, e as do DLC: Raichu Y e Chimecho) não estão lá. A pedra delas é feita em
 * `tools/gerar-icones-mega.py`: as 47 são a mesma silhueta com paleta trocada, então uma a
 * mais no conjunto é só uma cor a mais. Os NOMES são os oficiais (Serebii, lista de Z-A) e os
 * stats e os tipos, os da pokemondb — só a Dragonitite é nossa (a oficial é "Dragoninite").
 *
 * (Esta regra nasceu errada: a primeira leva usou a lista de PEDRAS como filtro e cortou
 * Dragonite, Meganium e Greninja antes de consultar a pokemondb — os três têm aba lá. Os dois
 * primeiros voltaram na v1.148.0; o Greninja precisou esperar a arte BASE dele, porque o
 * Greninja do jogo era `looktype: 1` e ninguém conseguia ter um para megaevoluir.)
 *
 * A leva do contrato de sprites (16/10/2026) trouxe mais 25 e as três segundas: Mewtwo (X e Y),
 * Latias, Latios, Kyogre e Groudon Primal, Rayquaza, Lopunny e Diancie, que estavam aqui por falta
 * de arte, mais Staraptor, Heatran, Darkrai, Scrafty, Golurk, Chesnaught, Delphox, Floette,
 * Meowstic, Zygarde, Crabominable, Golisopod, Magearna, Zeraora, Falinks, Tatsugiri e Baxcalibur
 * (Legends: Z-A e o DLC), Mega Charizard X e Mega Lucario Z. Stats e tipos da PokeAPI; as pedras
 * de Z-A que o pokesprite não tem saem de `tools/gerar-icones-mega.py`, como as anteriores.
 *
 * A leva de 18/10/2026 trouxe a arte que faltava a quatro e a duas segundas: Salamence e Audino
 * (a pedra do pokesprite já existia, faltava o desenho), Emboar e Scovillain (Z-A e o DLC), e as
 * segundas Mega Raichu X e Mega Garchomp Z. Mesma régua: stats e tipos da PokeAPI.
 *
 * Fica de fora a Mega Absol Z, a outra forma "Z" de Legends: Z-A — sem arte.
 *
 * Todas têm arte comum E shiny. `semShiny: true` continua existindo na ficha para o dia em que
 * uma mega nova chegar só com a arte comum: ela fica sem Shiny Stone no catálogo e a bancada
 * do Professor não a oferece, em vez de vender uma pedra que não dá para usar. O Aggron foi
 * esse caso por um dia (22/09/2026) e deixou de ser quando a arte shiny dele entrou.
 *
 * ### Os looktypes
 *
 * `80000 + dex` para a mega comum e `85000 + dex` para a mega shiny, nas mesmas regras dos
 * `60000 + dex` / `70000 + dex` do Pokedex Backup (ver `tools/publicar-sprites-megas.mjs`).
 * As duas faixas estavam vazias no `outfits-index.json`, e 85000 evita de longe os 909xx que
 * os outfits de NPC e das Caixas de Fundador ocupam. A 2ª mega usa `83000 + dex` e `88000 + dex`.
 *
 * Quem precisa do número de uma mega a partir da ficha usa `pokeIdDaMega` / `looktypeDaMega` /
 * `looktypeShinyDaMega`, que já sabem das duas faixas; `megaPokeId(dex)` e `looktypeMega(dex)`
 * continuam valendo só para a 1ª.
 */
import { dexDe } from './escala-hunt-level.mjs';
import { isOutlandPokeId } from './outland.mjs';
import { COOLDOWN_MEGA_MS } from './cooldown-golpes.mjs';
import { golpesDaPlanilhaDaMega } from './golpes-planilhas.mjs';

/** Primeiro pokeId da faixa das megas — `MEGA_POKE_BASE + dex nacional`. */
export const MEGA_POKE_BASE = 3000;

/** Teto exclusivo da faixa. Nada mora entre #3000 e #4000 além das megas. */
export const MEGA_POKE_MAX = 4000;

/** Looktype da arte da mega comum: `80000 + dex nacional`. */
export const MEGA_LOOKTYPE_BASE = 80000;

/** Looktype da arte da mega SHINY: `85000 + dex nacional`. */
export const MEGA_SHINY_LOOKTYPE_BASE = 85000;

export const looktypeMega = (dex) => MEGA_LOOKTYPE_BASE + Number(dex);
export const looktypeMegaShiny = (dex) => MEGA_SHINY_LOOKTYPE_BASE + Number(dex);

/** pokeId da mega de uma espécie: #3 (Venusaur) → #3003. */
export const megaPokeId = (dex) => MEGA_POKE_BASE + Number(dex);

export function isMegaPokeId(pokeId) {
  const id = Number(pokeId);
  return (id > MEGA_POKE_BASE && id < MEGA_POKE_MAX) || MEGA_SEGUNDA_POR_POKEID.has(id);
}

/**
 * As 88 megas — a 1ª de cada dex.
 *
 *   dex    o nacional da espécie base — a chave de tudo (`pokeId` da mega = 3000 + dex)
 *   slug   o nome do arquivo em `Pokedex Backup/MEGAS` (`mega_<slug>.png`)
 *   nome   o nome da espécie mega, como aparece na Pokedex
 *   pedra  o nome da Mega Stone, em inglês como o resto do catálogo
 *   icone  o PNG do pokesprite em `img/itens/mega/<icone>.png`
 *   tipos  os tipos DEPOIS da mega (substituem os da espécie)
 *   bases  as seis bases DEPOIS da mega (substituem as da espécie)
 */
export const MEGAS = [
  {
    dex: 3,
    slug: 'venusaur',
    nome: 'Mega Venusaur',
    pedra: 'Venusaurite',
    icone: 'venusaurite',
    tipos: ['GRASS', 'POISON'],
    bases: { hp: 80, atk: 100, def: 123, spAtk: 122, spDef: 120, speed: 80 },
  },
  {
    dex: 6,
    slug: 'charizard',
    nome: 'Mega Charizard Y',
    pedra: 'Charizardite Y',
    icone: 'charizardite-y',
    tipos: ['FIRE', 'FLYING'],
    bases: { hp: 78, atk: 104, def: 78, spAtk: 159, spDef: 115, speed: 100 },
  },
  {
    dex: 9,
    slug: 'blastoise',
    nome: 'Mega Blastoise',
    pedra: 'Blastoisinite',
    icone: 'blastoisinite',
    tipos: ['WATER'],
    bases: { hp: 79, atk: 103, def: 120, spAtk: 135, spDef: 115, speed: 78 },
  },
  {
    dex: 15,
    slug: 'beedrill',
    nome: 'Mega Beedrill',
    pedra: 'Beedrillite',
    icone: 'beedrillite',
    tipos: ['BUG', 'POISON'],
    bases: { hp: 65, atk: 150, def: 40, spAtk: 15, spDef: 80, speed: 145 },
  },
  {
    dex: 18,
    slug: 'pidgeot',
    nome: 'Mega Pidgeot',
    pedra: 'Pidgeotite',
    icone: 'pidgeotite',
    tipos: ['NORMAL', 'FLYING'],
    bases: { hp: 83, atk: 80, def: 80, spAtk: 135, spDef: 80, speed: 121 },
  },
  {
    // A forma Y, que chegou primeiro (25/09/2026). A X é outro sprite e outra pedra, e as duas
    // não cabem no mesmo `3000 + dex`: ela chegou em 18/10/2026 e mora em `MEGAS_SEGUNDAS`.
    dex: 26,
    slug: 'raichu_y',
    nome: 'Mega Raichu Y',
    pedra: 'Raichunite Y',
    icone: 'raichunite-y',
    tipos: ['ELECTRIC'],
    bases: { hp: 60, atk: 100, def: 55, spAtk: 160, spDef: 80, speed: 130 },
  },
  {
    dex: 36,
    slug: 'clefable',
    nome: 'Mega Clefable',
    pedra: 'Clefablite',
    icone: 'clefablite',
    tipos: ['FAIRY', 'FLYING'],
    bases: { hp: 95, atk: 80, def: 93, spAtk: 135, spDef: 110, speed: 70 },
  },
  {
    dex: 65,
    slug: 'alakazam',
    nome: 'Mega Alakazam',
    pedra: 'Alakazite',
    icone: 'alakazite',
    tipos: ['PSYCHIC'],
    bases: { hp: 55, atk: 50, def: 65, spAtk: 175, spDef: 105, speed: 150 },
  },
  {
    dex: 71,
    slug: 'victreebel',
    nome: 'Mega Victreebel',
    pedra: 'Victreebelite',
    icone: 'victreebelite',
    tipos: ['GRASS', 'POISON'],
    bases: { hp: 80, atk: 125, def: 85, spAtk: 135, spDef: 95, speed: 70 },
  },
  {
    dex: 80,
    slug: 'slowbro',
    nome: 'Mega Slowbro',
    pedra: 'Slowbronite',
    icone: 'slowbronite',
    tipos: ['WATER', 'PSYCHIC'],
    bases: { hp: 95, atk: 75, def: 180, spAtk: 130, spDef: 80, speed: 30 },
  },
  {
    dex: 94,
    slug: 'gengar',
    nome: 'Mega Gengar',
    pedra: 'Gengarite',
    icone: 'gengarite',
    tipos: ['GHOST', 'POISON'],
    bases: { hp: 60, atk: 65, def: 80, spAtk: 170, spDef: 95, speed: 130 },
  },
  {
    dex: 115,
    slug: 'kangaskhan',
    nome: 'Mega Kangaskhan',
    pedra: 'Kangaskhanite',
    icone: 'kangaskhanite',
    tipos: ['NORMAL'],
    bases: { hp: 105, atk: 125, def: 100, spAtk: 60, spDef: 100, speed: 100 },
  },
  {
    dex: 121,
    slug: 'starmie',
    nome: 'Mega Starmie',
    pedra: 'Starminite',
    icone: 'starminite',
    tipos: ['WATER', 'PSYCHIC'],
    bases: { hp: 60, atk: 140, def: 105, spAtk: 130, spDef: 105, speed: 120 },
  },
  {
    dex: 127,
    slug: 'pinsir',
    nome: 'Mega Pinsir',
    pedra: 'Pinsirite',
    icone: 'pinsirite',
    tipos: ['BUG', 'FLYING'],
    bases: { hp: 65, atk: 155, def: 120, spAtk: 65, spDef: 90, speed: 105 },
  },
  {
    dex: 130,
    slug: 'gyarados',
    nome: 'Mega Gyarados',
    pedra: 'Gyaradosite',
    icone: 'gyaradosite',
    tipos: ['WATER', 'DARK'],
    bases: { hp: 95, atk: 155, def: 109, spAtk: 70, spDef: 130, speed: 81 },
  },
  {
    dex: 142,
    slug: 'aerodactyl',
    nome: 'Mega Aerodactyl',
    pedra: 'Aerodactylite',
    icone: 'aerodactylite',
    tipos: ['ROCK', 'FLYING'],
    bases: { hp: 80, atk: 135, def: 85, spAtk: 70, spDef: 95, speed: 150 },
  },
  {
    dex: 149,
    slug: 'dragonite',
    nome: 'Mega Dragonite',
    pedra: 'Dragonitite',
    icone: 'dragonitite',
    tipos: ['DRAGON', 'FLYING'],
    bases: { hp: 91, atk: 124, def: 115, spAtk: 145, spDef: 125, speed: 100 },
  },
  {
    // A Y fica com o `3000 + dex` (a primeira a ser desenhada); a X é a 2ª mega do Mewtwo —
    // ver `MEGAS_SEGUNDAS`.
    dex: 150,
    slug: 'mewtwo_y',
    nome: 'Mega Mewtwo Y',
    pedra: 'Mewtwonite Y',
    icone: 'mewtwonite-y',
    tipos: ['PSYCHIC'],
    bases: { hp: 106, atk: 150, def: 70, spAtk: 194, spDef: 120, speed: 140 },
  },
  {
    dex: 154,
    slug: 'meganium',
    nome: 'Mega Meganium',
    pedra: 'Meganiumite',
    icone: 'meganiumite',
    tipos: ['GRASS', 'FAIRY'],
    bases: { hp: 80, atk: 92, def: 115, spAtk: 143, spDef: 115, speed: 80 },
  },
  {
    dex: 160,
    slug: 'feraligatr',
    nome: 'Mega Feraligatr',
    pedra: 'Feraligite',
    icone: 'feraligite',
    tipos: ['WATER', 'DRAGON'],
    bases: { hp: 85, atk: 160, def: 125, spAtk: 89, spDef: 93, speed: 78 },
  },
  {
    dex: 181,
    slug: 'ampharos',
    nome: 'Mega Ampharos',
    pedra: 'Ampharosite',
    icone: 'ampharosite',
    tipos: ['ELECTRIC', 'DRAGON'],
    bases: { hp: 90, atk: 95, def: 105, spAtk: 165, spDef: 110, speed: 45 },
  },
  {
    dex: 208,
    slug: 'steelix',
    nome: 'Mega Steelix',
    pedra: 'Steelixite',
    icone: 'steelixite',
    tipos: ['STEEL', 'GROUND'],
    bases: { hp: 75, atk: 125, def: 230, spAtk: 55, spDef: 95, speed: 30 },
  },
  {
    dex: 212,
    slug: 'scizor',
    nome: 'Mega Scizor',
    pedra: 'Scizorite',
    icone: 'scizorite',
    tipos: ['BUG', 'STEEL'],
    bases: { hp: 70, atk: 150, def: 140, spAtk: 65, spDef: 100, speed: 75 },
  },
  {
    dex: 214,
    slug: 'heracross',
    nome: 'Mega Heracross',
    pedra: 'Heracronite',
    icone: 'heracronite',
    tipos: ['BUG', 'FIGHTING'],
    bases: { hp: 80, atk: 185, def: 115, spAtk: 40, spDef: 105, speed: 75 },
  },
  {
    dex: 227,
    slug: 'skarmory',
    nome: 'Mega Skarmory',
    pedra: 'Skarmorite',
    icone: 'skarmorite',
    tipos: ['STEEL', 'FLYING'],
    bases: { hp: 65, atk: 140, def: 110, spAtk: 40, spDef: 100, speed: 110 },
  },
  {
    dex: 229,
    slug: 'houndoom',
    nome: 'Mega Houndoom',
    pedra: 'Houndoominite',
    icone: 'houndoominite',
    tipos: ['DARK', 'FIRE'],
    bases: { hp: 75, atk: 90, def: 90, spAtk: 140, spDef: 90, speed: 115 },
  },
  {
    dex: 248,
    slug: 'tyranitar',
    nome: 'Mega Tyranitar',
    pedra: 'Tyranitarite',
    icone: 'tyranitarite',
    tipos: ['ROCK', 'DARK'],
    bases: { hp: 100, atk: 164, def: 150, spAtk: 95, spDef: 120, speed: 71 },
  },
  {
    dex: 254,
    slug: 'sceptile',
    nome: 'Mega Sceptile',
    pedra: 'Sceptilite',
    icone: 'sceptilite',
    tipos: ['GRASS', 'DRAGON'],
    bases: { hp: 70, atk: 110, def: 75, spAtk: 145, spDef: 85, speed: 145 },
  },
  {
    dex: 257,
    slug: 'blaziken',
    nome: 'Mega Blaziken',
    pedra: 'Blazikenite',
    icone: 'blazikenite',
    tipos: ['FIRE', 'FIGHTING'],
    bases: { hp: 80, atk: 160, def: 80, spAtk: 130, spDef: 80, speed: 100 },
  },
  {
    dex: 260,
    slug: 'swampert',
    nome: 'Mega Swampert',
    pedra: 'Swampertite',
    icone: 'swampertite',
    tipos: ['WATER', 'GROUND'],
    bases: { hp: 100, atk: 150, def: 110, spAtk: 95, spDef: 110, speed: 70 },
  },
  {
    dex: 282,
    slug: 'gardevoir',
    nome: 'Mega Gardevoir',
    pedra: 'Gardevoirite',
    icone: 'gardevoirite',
    tipos: ['PSYCHIC', 'FAIRY'],
    bases: { hp: 68, atk: 85, def: 65, spAtk: 165, spDef: 135, speed: 100 },
  },
  {
    dex: 302,
    slug: 'sableye',
    nome: 'Mega Sableye',
    pedra: 'Sablenite',
    icone: 'sablenite',
    tipos: ['DARK', 'GHOST'],
    bases: { hp: 50, atk: 85, def: 125, spAtk: 85, spDef: 115, speed: 20 },
  },
  {
    dex: 303,
    slug: 'mawile',
    nome: 'Mega Mawile',
    pedra: 'Mawilite',
    icone: 'mawilite',
    tipos: ['STEEL', 'FAIRY'],
    bases: { hp: 50, atk: 105, def: 125, spAtk: 55, spDef: 95, speed: 50 },
  },
  {
    dex: 306,
    slug: 'aggron',
    nome: 'Mega Aggron',
    pedra: 'Aggronite',
    icone: 'aggronite',
    // STEEL puro, a oficial. De 03/10 a 21/10/2026 guardou o ROCK do Aggron (planilha "Megas
    // 03-10"), para seguir usando os TMs de ROCK da base; a "Novas Megas Arrumadas" (21/10) a
    // escreve só STEEL e tira todos os golpes de ROCK. O TM de ROCK já aplicado fica (o Z-Move
    // mora no pokemon, como o FLYING do Gyarados que vira Mega Gyarados), só sem STAB.
    tipos: ['STEEL'],
    bases: { hp: 70, atk: 140, def: 230, spAtk: 60, spDef: 80, speed: 50 },
  },
  {
    dex: 308,
    slug: 'medicham',
    nome: 'Mega Medicham',
    pedra: 'Medichamite',
    icone: 'medichamite',
    tipos: ['FIGHTING', 'PSYCHIC'],
    bases: { hp: 60, atk: 100, def: 85, spAtk: 80, spDef: 85, speed: 100 },
  },
  {
    dex: 310,
    slug: 'manectric',
    nome: 'Mega Manectric',
    pedra: 'Manectite',
    icone: 'manectite',
    tipos: ['ELECTRIC'],
    bases: { hp: 70, atk: 75, def: 80, spAtk: 135, spDef: 80, speed: 135 },
  },
  {
    dex: 319,
    slug: 'sharpedo',
    nome: 'Mega Sharpedo',
    pedra: 'Sharpedonite',
    icone: 'sharpedonite',
    tipos: ['WATER', 'DARK'],
    bases: { hp: 70, atk: 140, def: 70, spAtk: 110, spDef: 65, speed: 105 },
  },
  {
    dex: 323,
    slug: 'camerupt',
    nome: 'Mega Camerupt',
    pedra: 'Cameruptite',
    icone: 'cameruptite',
    tipos: ['FIRE', 'GROUND'],
    bases: { hp: 70, atk: 120, def: 100, spAtk: 145, spDef: 105, speed: 20 },
  },
  {
    dex: 334,
    slug: 'altaria',
    nome: 'Mega Altaria',
    pedra: 'Altarianite',
    icone: 'altarianite',
    tipos: ['DRAGON', 'FAIRY'],
    bases: { hp: 75, atk: 110, def: 110, spAtk: 110, spDef: 105, speed: 80 },
  },
  {
    dex: 354,
    slug: 'banette',
    nome: 'Mega Banette',
    pedra: 'Banettite',
    icone: 'banettite',
    tipos: ['GHOST'],
    bases: { hp: 64, atk: 165, def: 75, spAtk: 93, spDef: 83, speed: 75 },
  },
  {
    dex: 358,
    slug: 'chimecho',
    nome: 'Mega Chimecho',
    pedra: 'Chimechite',
    icone: 'chimechite',
    tipos: ['PSYCHIC', 'STEEL'],
    bases: { hp: 75, atk: 50, def: 110, spAtk: 135, spDef: 120, speed: 65 },
  },
  {
    dex: 359,
    slug: 'absol',
    nome: 'Mega Absol',
    pedra: 'Absolite',
    icone: 'absolite',
    tipos: ['DARK'],
    bases: { hp: 65, atk: 150, def: 60, spAtk: 115, spDef: 60, speed: 115 },
  },
  {
    dex: 362,
    slug: 'glalie',
    nome: 'Mega Glalie',
    pedra: 'Glalitite',
    icone: 'glalitite',
    tipos: ['ICE'],
    bases: { hp: 80, atk: 120, def: 80, spAtk: 120, spDef: 80, speed: 100 },
  },
  {
    dex: 373,
    slug: 'salamence',
    nome: 'Mega Salamence',
    pedra: 'Salamencite',
    icone: 'salamencite',
    tipos: ['DRAGON', 'FLYING'],
    bases: { hp: 95, atk: 145, def: 130, spAtk: 120, spDef: 90, speed: 120 },
  },
  {
    dex: 376,
    slug: 'metagross',
    nome: 'Mega Metagross',
    pedra: 'Metagrossite',
    icone: 'metagrossite',
    tipos: ['STEEL', 'PSYCHIC'],
    bases: { hp: 80, atk: 145, def: 150, spAtk: 105, spDef: 110, speed: 110 },
  },
  {
    dex: 380,
    slug: 'latias',
    nome: 'Mega Latias',
    pedra: 'Latiasite',
    icone: 'latiasite',
    tipos: ['DRAGON', 'PSYCHIC'],
    bases: { hp: 80, atk: 100, def: 120, spAtk: 140, spDef: 150, speed: 110 },
  },
  {
    dex: 381,
    slug: 'latios',
    nome: 'Mega Latios',
    pedra: 'Latiosite',
    icone: 'latiosite',
    tipos: ['DRAGON', 'PSYCHIC'],
    bases: { hp: 80, atk: 130, def: 100, spAtk: 160, spDef: 120, speed: 110 },
  },
  {
    // Reversão Primal, e não mega: no jogo de origem a Blue Orb não é Mega Stone. Aqui ela segue
    // o mesmo caminho (pedra, Professor, fragmentos) porque o efeito na ficha é o mesmo.
    dex: 382,
    slug: 'kyogre_primal',
    nome: 'Primal Kyogre',
    pedra: 'Blue Orb',
    icone: 'blue-orb',
    tipos: ['WATER'],
    bases: { hp: 100, atk: 150, def: 90, spAtk: 180, spDef: 160, speed: 90 },
  },
  {
    // Reversão Primal, como a do Kyogre, com a Red Orb.
    dex: 383,
    slug: 'groudon_primal',
    nome: 'Primal Groudon',
    pedra: 'Red Orb',
    icone: 'red-orb',
    tipos: ['GROUND', 'FIRE'],
    bases: { hp: 100, atk: 180, def: 160, spAtk: 150, spDef: 90, speed: 90 },
  },
  {
    // A Jade Orb no lugar de pedra: o Rayquaza não tem Mega Stone no jogo de origem (megaevolui
    // pelo Dragon Ascent). Aqui ele precisa de um item, como todo mundo.
    dex: 384,
    slug: 'rayquaza',
    nome: 'Mega Rayquaza',
    pedra: 'Jade Orb',
    icone: 'jade-orb',
    tipos: ['DRAGON', 'FLYING'],
    bases: { hp: 105, atk: 180, def: 100, spAtk: 180, spDef: 100, speed: 115 },
  },
  {
    dex: 398,
    slug: 'staraptor',
    nome: 'Mega Staraptor',
    pedra: 'Staraptite',
    icone: 'staraptite',
    tipos: ['FIGHTING', 'FLYING'],
    bases: { hp: 85, atk: 140, def: 100, spAtk: 60, spDef: 90, speed: 110 },
  },
  {
    dex: 428,
    slug: 'lopunny',
    nome: 'Mega Lopunny',
    pedra: 'Lopunnite',
    icone: 'lopunnite',
    tipos: ['NORMAL', 'FIGHTING'],
    bases: { hp: 65, atk: 136, def: 94, spAtk: 54, spDef: 96, speed: 135 },
  },
  {
    dex: 445,
    slug: 'garchomp',
    nome: 'Mega Garchomp',
    pedra: 'Garchompite',
    icone: 'garchompite',
    tipos: ['DRAGON', 'GROUND'],
    bases: { hp: 108, atk: 170, def: 115, spAtk: 120, spDef: 95, speed: 92 },
  },
  {
    dex: 448,
    slug: 'lucario',
    nome: 'Mega Lucario',
    pedra: 'Lucarionite',
    icone: 'lucarionite',
    tipos: ['FIGHTING', 'STEEL'],
    bases: { hp: 70, atk: 145, def: 88, spAtk: 140, spDef: 70, speed: 112 },
  },
  {
    dex: 460,
    slug: 'abomasnow',
    nome: 'Mega Abomasnow',
    pedra: 'Abomasite',
    icone: 'abomasite',
    tipos: ['GRASS', 'ICE'],
    bases: { hp: 90, atk: 132, def: 105, spAtk: 132, spDef: 105, speed: 30 },
  },
  {
    dex: 475,
    slug: 'gallade',
    nome: 'Mega Gallade',
    pedra: 'Galladite',
    icone: 'galladite',
    tipos: ['PSYCHIC', 'FIGHTING'],
    bases: { hp: 68, atk: 165, def: 95, spAtk: 65, spDef: 115, speed: 110 },
  },
  {
    dex: 478,
    slug: 'froslass',
    nome: 'Mega Froslass',
    pedra: 'Froslassite',
    icone: 'froslassite',
    tipos: ['ICE', 'GHOST'],
    bases: { hp: 70, atk: 80, def: 70, spAtk: 140, spDef: 100, speed: 120 },
  },
  {
    dex: 485,
    slug: 'heatran',
    nome: 'Mega Heatran',
    pedra: 'Heatranite',
    icone: 'heatranite',
    tipos: ['FIRE', 'STEEL'],
    bases: { hp: 91, atk: 120, def: 106, spAtk: 175, spDef: 141, speed: 67 },
  },
  {
    dex: 491,
    slug: 'darkrai',
    nome: 'Mega Darkrai',
    pedra: 'Darkranite',
    icone: 'darkranite',
    tipos: ['DARK'],
    bases: { hp: 70, atk: 120, def: 130, spAtk: 165, spDef: 130, speed: 85 },
  },
  {
    dex: 500,
    slug: 'emboar',
    nome: 'Mega Emboar',
    pedra: 'Emboarite',
    icone: 'emboarite',
    tipos: ['FIRE', 'FIGHTING'],
    bases: { hp: 110, atk: 148, def: 75, spAtk: 110, spDef: 110, speed: 75 },
  },
  {
    dex: 530,
    slug: 'excadrill',
    nome: 'Mega Excadrill',
    pedra: 'Excadrite',
    icone: 'excadrite',
    tipos: ['GROUND', 'STEEL'],
    bases: { hp: 110, atk: 165, def: 100, spAtk: 65, spDef: 65, speed: 103 },
  },
  {
    dex: 531,
    slug: 'audino',
    nome: 'Mega Audino',
    pedra: 'Audinite',
    icone: 'audinite',
    tipos: ['NORMAL', 'FAIRY'],
    bases: { hp: 103, atk: 60, def: 126, spAtk: 80, spDef: 126, speed: 50 },
  },
  {
    dex: 545,
    slug: 'scolipede',
    nome: 'Mega Scolipede',
    pedra: 'Scolipite',
    icone: 'scolipite',
    tipos: ['BUG', 'POISON'],
    bases: { hp: 60, atk: 140, def: 149, spAtk: 75, spDef: 99, speed: 62 },
  },
  {
    dex: 560,
    slug: 'scrafty',
    nome: 'Mega Scrafty',
    pedra: 'Scraftinite',
    icone: 'scraftinite',
    tipos: ['DARK', 'FIGHTING'],
    bases: { hp: 65, atk: 130, def: 135, spAtk: 55, spDef: 135, speed: 68 },
  },
  {
    dex: 604,
    slug: 'eelektross',
    nome: 'Mega Eelektross',
    pedra: 'Eelektrossite',
    icone: 'eelektrossite',
    tipos: ['ELECTRIC'],
    bases: { hp: 85, atk: 145, def: 80, spAtk: 135, spDef: 90, speed: 80 },
  },
  {
    dex: 609,
    slug: 'chandelure',
    nome: 'Mega Chandelure',
    pedra: 'Chandelurite',
    icone: 'chandelurite',
    tipos: ['GHOST', 'FIRE'],
    bases: { hp: 60, atk: 75, def: 110, spAtk: 175, spDef: 110, speed: 90 },
  },
  {
    dex: 623,
    slug: 'golurk',
    nome: 'Mega Golurk',
    pedra: 'Golurkite',
    icone: 'golurkite',
    tipos: ['GROUND', 'GHOST'],
    bases: { hp: 89, atk: 159, def: 105, spAtk: 70, spDef: 105, speed: 55 },
  },
  {
    dex: 652,
    slug: 'chesnaught',
    nome: 'Mega Chesnaught',
    pedra: 'Chesnaughtite',
    icone: 'chesnaughtite',
    tipos: ['GRASS', 'FIGHTING'],
    bases: { hp: 88, atk: 137, def: 172, spAtk: 74, spDef: 115, speed: 44 },
  },
  {
    dex: 655,
    slug: 'delphox',
    nome: 'Mega Delphox',
    pedra: 'Delphoxite',
    icone: 'delphoxite',
    tipos: ['FIRE', 'PSYCHIC'],
    bases: { hp: 75, atk: 69, def: 72, spAtk: 159, spDef: 125, speed: 134 },
  },
  {
    dex: 658,
    slug: 'greninja',
    nome: 'Mega Greninja',
    pedra: 'Greninjite',
    icone: 'greninjite',
    tipos: ['WATER', 'DARK'],
    bases: { hp: 72, atk: 125, def: 77, spAtk: 133, spDef: 81, speed: 142 },
  },
  {
    dex: 668,
    slug: 'pyroar',
    nome: 'Mega Pyroar',
    pedra: 'Pyroarite',
    icone: 'pyroarite',
    tipos: ['FIRE', 'NORMAL'],
    bases: { hp: 86, atk: 88, def: 92, spAtk: 129, spDef: 86, speed: 126 },
  },
  {
    // A mega da Floette de flor eterna no jogo de origem; aqui, da Floette do catálogo.
    dex: 670,
    slug: 'floette',
    nome: 'Mega Floette',
    pedra: 'Floettite',
    icone: 'floettite',
    tipos: ['FAIRY'],
    bases: { hp: 74, atk: 85, def: 87, spAtk: 155, spDef: 148, speed: 102 },
  },
  {
    dex: 678,
    slug: 'meowstic',
    nome: 'Mega Meowstic',
    pedra: 'Meowsticite',
    icone: 'meowsticite',
    tipos: ['PSYCHIC'],
    bases: { hp: 74, atk: 48, def: 76, spAtk: 143, spDef: 101, speed: 124 },
  },
  {
    dex: 687,
    slug: 'malamar',
    nome: 'Mega Malamar',
    pedra: 'Malamarite',
    icone: 'malamarite',
    tipos: ['DARK', 'PSYCHIC'],
    bases: { hp: 86, atk: 102, def: 88, spAtk: 98, spDef: 120, speed: 88 },
  },
  {
    dex: 689,
    slug: 'barbaracle',
    nome: 'Mega Barbaracle',
    pedra: 'Barbaracite',
    icone: 'barbaracite',
    tipos: ['ROCK', 'FIGHTING'],
    bases: { hp: 72, atk: 140, def: 130, spAtk: 64, spDef: 106, speed: 88 },
  },
  {
    dex: 691,
    slug: 'dragalge',
    nome: 'Mega Dragalge',
    pedra: 'Dragalgite',
    icone: 'dragalgite',
    tipos: ['POISON', 'DRAGON'],
    bases: { hp: 65, atk: 85, def: 105, spAtk: 132, spDef: 163, speed: 44 },
  },
  {
    dex: 701,
    slug: 'hawlucha',
    nome: 'Mega Hawlucha',
    pedra: 'Hawluchanite',
    icone: 'hawluchanite',
    tipos: ['FIGHTING', 'FLYING'],
    bases: { hp: 78, atk: 137, def: 100, spAtk: 74, spDef: 93, speed: 118 },
  },
  {
    // A partir do Zygarde base (50%) do catálogo — o 10% e o Completo são formas próprias
    // (`formas.mjs`) e não megaevoluem.
    dex: 718,
    slug: 'zygarde',
    nome: 'Mega Zygarde',
    pedra: 'Zygardite',
    icone: 'zygardite',
    tipos: ['DRAGON', 'GROUND'],
    bases: { hp: 216, atk: 70, def: 91, spAtk: 216, spDef: 85, speed: 100 },
  },
  {
    dex: 719,
    slug: 'diancie',
    nome: 'Mega Diancie',
    pedra: 'Diancite',
    icone: 'diancite',
    tipos: ['ROCK', 'FAIRY'],
    bases: { hp: 50, atk: 160, def: 110, spAtk: 160, spDef: 110, speed: 110 },
  },
  {
    dex: 740,
    slug: 'crabominable',
    nome: 'Mega Crabominable',
    pedra: 'Crabominite',
    icone: 'crabominite',
    tipos: ['FIGHTING', 'ICE'],
    bases: { hp: 97, atk: 157, def: 122, spAtk: 62, spDef: 107, speed: 33 },
  },
  {
    dex: 768,
    slug: 'golisopod',
    nome: 'Mega Golisopod',
    pedra: 'Golisopite',
    icone: 'golisopite',
    tipos: ['BUG', 'STEEL'],
    bases: { hp: 75, atk: 150, def: 175, spAtk: 70, spDef: 120, speed: 40 },
  },
  {
    dex: 780,
    slug: 'drampa',
    nome: 'Mega Drampa',
    pedra: 'Drampanite',
    icone: 'drampanite',
    tipos: ['NORMAL', 'DRAGON'],
    bases: { hp: 78, atk: 85, def: 110, spAtk: 160, spDef: 116, speed: 36 },
  },
  {
    dex: 801,
    slug: 'magearna',
    nome: 'Mega Magearna',
    pedra: 'Magearnite',
    icone: 'magearnite',
    tipos: ['STEEL', 'FAIRY'],
    bases: { hp: 80, atk: 125, def: 115, spAtk: 170, spDef: 115, speed: 95 },
  },
  {
    dex: 807,
    slug: 'zeraora',
    nome: 'Mega Zeraora',
    pedra: 'Zeraorite',
    icone: 'zeraorite',
    tipos: ['ELECTRIC'],
    bases: { hp: 88, atk: 157, def: 75, spAtk: 147, spDef: 80, speed: 153 },
  },
  {
    dex: 870,
    slug: 'falinks',
    nome: 'Mega Falinks',
    pedra: 'Falinksite',
    icone: 'falinksite',
    tipos: ['FIGHTING'],
    bases: { hp: 65, atk: 135, def: 135, spAtk: 70, spDef: 65, speed: 100 },
  },
  {
    dex: 952,
    slug: 'scovillain',
    nome: 'Mega Scovillain',
    pedra: 'Scovillainite',
    icone: 'scovillainite',
    tipos: ['GRASS', 'FIRE'],
    bases: { hp: 65, atk: 138, def: 85, spAtk: 138, spDef: 85, speed: 75 },
  },
  {
    dex: 978,
    slug: 'tatsugiri',
    nome: 'Mega Tatsugiri',
    pedra: 'Tatsugirinite',
    icone: 'tatsugirinite',
    tipos: ['DRAGON', 'WATER'],
    bases: { hp: 68, atk: 65, def: 90, spAtk: 135, spDef: 125, speed: 92 },
  },
  {
    dex: 998,
    slug: 'baxcalibur',
    nome: 'Mega Baxcalibur',
    pedra: 'Baxcalibrite',
    icone: 'baxcalibrite',
    tipos: ['DRAGON', 'ICE'],
    bases: { hp: 115, atk: 175, def: 117, spAtk: 105, spDef: 101, speed: 87 },
  },
];

/**
 * A 2ª MEGA de um dex — Mega Charizard X, Mega Mewtwo X e Mega Lucario Z (contrato de 16/10/2026),
 * e Mega Raichu X e Mega Garchomp Z (18/10/2026).
 *
 * `3000 + dex` só cabe UMA mega por espécie, e o dex já era a chave de tudo (a pedra, a arte, o
 * Professor). A segunda mora noutro milhar, com o mesmo desenho:
 *
 *   pokeId     `9000 + dex`   (#9006 Mega Charizard X, #9026 Mega Raichu X, #9150 Mega Mewtwo X,
 *                             #9445 Mega Garchomp Z, #9448 Mega Lucario Z)
 *   arte       `83000 + dex` comum e `88000 + dex` shiny
 *   pedra      `74000 + dex` comum e `75000 + dex` shiny (`itens-nossos.mjs`)
 *
 * O milhar #9xxx é dividido com a 2ª forma alternativa (`formas.mjs`: #9351 Castform Snowy, #9479
 * Wash Rotom…) — quem decide de quem é cada número é o REGISTRO (esta tabela e a das formas),
 * nunca a conta. Por isso `isMegaPokeId` consulta o mapa para esta faixa em vez de olhar o milhar.
 * A arte NÃO vai para `81000 + dex`: lá caem as shinys das formas do milhar #11xxx (`70000 + pokeId`).
 *
 * Qual das duas é a "primeira" não é juízo de valor: é a que chegou antes (a Y do Charizard, de
 * 2025) ou, no Mewtwo, a que vem antes na ordem oficial das pedras (Y no `3000 + dex`, X aqui). As
 * duas são megas completas e iguais em tudo — o jogador escolhe na hora de megaevoluir, e o
 * Professor desfaz a escolha (Retroceder Mega-Evolução) para quem quiser trocar.
 */
export const MEGAS_SEGUNDAS = [
  {
    dex: 6,
    segunda: true,
    slug: 'charizard_x',
    nome: 'Mega Charizard X',
    pedra: 'Charizardite X',
    icone: 'charizardite-x',
    tipos: ['FIRE', 'DRAGON'],
    bases: { hp: 78, atk: 130, def: 111, spAtk: 130, spDef: 85, speed: 100 },
  },
  {
    dex: 26,
    segunda: true,
    slug: 'raichu_x',
    nome: 'Mega Raichu X',
    pedra: 'Raichunite X',
    icone: 'raichunite-x',
    tipos: ['ELECTRIC'],
    bases: { hp: 60, atk: 135, def: 95, spAtk: 90, spDef: 95, speed: 110 },
  },
  {
    dex: 150,
    segunda: true,
    slug: 'mewtwo_x',
    nome: 'Mega Mewtwo X',
    pedra: 'Mewtwonite X',
    icone: 'mewtwonite-x',
    tipos: ['PSYCHIC', 'FIGHTING'],
    bases: { hp: 106, atk: 190, def: 100, spAtk: 154, spDef: 100, speed: 130 },
  },
  {
    dex: 445,
    segunda: true,
    slug: 'garchomp_z',
    nome: 'Mega Garchomp Z',
    pedra: 'Garchompite Z',
    icone: 'garchompite-z',
    tipos: ['DRAGON'],
    bases: { hp: 108, atk: 130, def: 85, spAtk: 141, spDef: 85, speed: 151 },
  },
  {
    dex: 448,
    segunda: true,
    slug: 'lucario_z',
    nome: 'Mega Lucario Z',
    pedra: 'Lucarionite Z',
    icone: 'lucarionite-z',
    tipos: ['FIGHTING', 'STEEL'],
    bases: { hp: 70, atk: 100, def: 70, spAtk: 164, spDef: 70, speed: 151 },
  },
];

/** Primeiro pokeId da faixa das 2ªs megas — `MEGA2_POKE_BASE + dex nacional`. */
export const MEGA2_POKE_BASE = 9000;

/** Looktype da arte da 2ª mega comum: `83000 + dex nacional`. */
export const MEGA2_LOOKTYPE_BASE = 83000;

/** Looktype da arte da 2ª mega SHINY: `88000 + dex nacional`. */
export const MEGA2_SHINY_LOOKTYPE_BASE = 88000;

/** As duas listas juntas — o que todo laço "para cada mega" percorre. */
export const TODAS_AS_MEGAS = [...MEGAS, ...MEGAS_SEGUNDAS];

/** O pokeId de uma ficha de mega (a 1ª no `3000 + dex`, a 2ª no `9000 + dex`). */
export const pokeIdDaMega = (meta) => (meta.segunda ? MEGA2_POKE_BASE : MEGA_POKE_BASE) + Number(meta.dex);

/** O looktype da arte comum de uma ficha de mega. */
export const looktypeDaMega = (meta) => (meta.segunda ? MEGA2_LOOKTYPE_BASE : MEGA_LOOKTYPE_BASE) + Number(meta.dex);

/** O looktype da arte shiny de uma ficha de mega. */
export const looktypeShinyDaMega = (meta) =>
  (meta.segunda ? MEGA2_SHINY_LOOKTYPE_BASE : MEGA_SHINY_LOOKTYPE_BASE) + Number(meta.dex);

/** dex nacional → a ficha da mega. */
export const MEGA_POR_DEX = new Map(MEGAS.map((m) => [m.dex, m]));

/** dex nacional → a ficha da 2ª mega (Charizard, Raichu, Mewtwo, Garchomp e Lucario). */
export const MEGA_SEGUNDA_POR_DEX = new Map(MEGAS_SEGUNDAS.map((m) => [m.dex, m]));

/** pokeId da mega (#3xxx, e a 2ª no #9xxx) → a ficha dela. */
export const MEGA_POR_POKEID = new Map(TODAS_AS_MEGAS.map((m) => [pokeIdDaMega(m), m]));

/** Só as 2ªs megas, por pokeId — a consulta de `isMegaPokeId` fora da faixa #3xxx. */
const MEGA_SEGUNDA_POR_POKEID = new Map(MEGAS_SEGUNDAS.map((m) => [pokeIdDaMega(m), m]));

/**
 * O dex nacional por trás de um `pokeId`, para efeito de mega.
 *
 * Aceita o clone de Orre (`13xxx`) porque ele É a mesma espécie com outra hunt — um Tyranitar
 * de Orre megaevolui com a mesma Tyranitarite. Recusa Outland (`#2001+`): lá as variantes já
 * são outra criatura, com base e tipos próprios, e a mega em cima disso seria um terceiro
 * conjunto de números sem arte que o represente. Recusa a própria mega: ela não megaevolui de
 * novo.
 */
export function dexDaMega(pokeId) {
  const id = Number(pokeId);
  if (!Number.isFinite(id) || isOutlandPokeId(id) || isMegaPokeId(id)) return null;
  const dex = dexDe(id);
  return MEGA_POR_DEX.has(dex) ? dex : null;
}

/**
 * A ficha da mega em que esta espécie pode virar, ou `null` quando ela não tem mega.
 *
 * `segunda: true` pede a 2ª mega do dex (Mega Charizard X…), e devolve `null` onde ela não existe —
 * nunca cai na primeira. Quem precisa das duas usa `megasDaEspecie`.
 */
export function megaDaEspecie(pokeId, segunda = false) {
  const dex = dexDaMega(pokeId);
  if (dex == null) return null;
  return (segunda ? MEGA_SEGUNDA_POR_DEX.get(dex) : MEGA_POR_DEX.get(dex)) ?? null;
}

/** As megas desta espécie, a 1ª antes — `[]`, `[Y]` ou `[Y, X]`. */
export function megasDaEspecie(pokeId) {
  const dex = dexDaMega(pokeId);
  if (dex == null) return [];
  return [MEGA_POR_DEX.get(dex), MEGA_SEGUNDA_POR_DEX.get(dex)].filter(Boolean);
}

/** A ficha da mega a partir do pokeId DELA (#3094 → Mega Gengar, #9006 → Mega Charizard X). */
export const megaPorPokeId = (pokeId) => MEGA_POR_POKEID.get(Number(pokeId)) ?? null;

/** A espécie tem mega SHINY? (Aggron é a única que não tem — ver o cabeçalho.) */
export const megaTemShiny = (meta) => !!meta && !meta.semShiny;

/** Soma das seis bases da mega — tabelas, auditoria e testes. */
export const totalBasesMega = (m) =>
  m.bases.hp + m.bases.atk + m.bases.def + m.bases.spAtk + m.bases.spDef + m.bases.speed;

/**
 * O GOLPE DE MEGA — um por tipo, 600 de poder e 30 s de recarga.
 *
 * ### O que a mega ganha de golpe, e o que ela NÃO ganha
 *
 * O moveset da mega é o da espécie base, **cópia exata**, mais este. Nada sai, nada é
 * rederivado: um Mega Venusaur bate com os mesmos golpes do Venusaur. É a regra mais simples
 * possível, e a única que não surpreende quem passou a conta de dez fragmentos de boss.
 *
 * A exceção é a planilha: a mega que está numa tabela de mega de `golpes-planilhas.mjs` tem moveset
 * próprio, montado de acordo com os tipos DELA. Desde 29/10/2026 são TODAS as 93, em
 * `GOLPES_MEGAS_2026_10_29` (as planilhas "Mega -1 Move" e "Lendários -1 Move", do CEO de Moves), e as
 * duas TIRARAM o golpe de mega: a mega fica só com os golpes de 600 comuns — dois, três na de lendário —,
 * com os 60 s da curva. Esta regra (a cópia da base mais este golpe) segue no código, mas hoje só valeria
 * para uma mega nova que chegasse sem lista em planilha; o resto deste cabeçalho conta por que o golpe
 * existiu.
 *
 * A trava que sustenta isso está em `elegivelParaGolpeEspecial` (`golpes-especiais.mjs`), que
 * recusa a mega: o injetor de golpes de 600 deriva do TIPO, e os tipos da mega mudam. Sem ela,
 * Mega Gyarados (WATER/DARK contra o WATER/FLYING do Gyarados) ganhava na ficha um golpe de
 * DARK que não existia no catálogo do servidor.
 *
 * ### Por que 30 s, e não os 60 s de todo golpe de 600
 *
 * Porque é isto que a mega entrega. Um terceiro golpe de 600 na mesma recarga dos outros dois
 * seria mais uma linha na ficha e quase nenhum dano a mais — o gargalo de um pokemon de
 * endgame é o cooldown, não a falta de opção. Na metade do tempo, ele dispara duas vezes por
 * ciclo dos outros: é ritmo, que é o que se sente numa luta idle.
 *
 * Ele sai da curva de `cooldown-golpes.mjs` de propósito, e por isso carrega `cdFixo: true` —
 * a marca que impede `fixarCooldownGolpe600` de "consertá-lo" de volta para 60 s na primeira
 * vez que a ficha for montada.
 *
 * ### O tipo é o PRIMÁRIO da mega
 *
 * O primário DELA, não o da base: Mega Gyarados é WATER/DARK, e o golpe sai WATER. É a mesma
 * régua da pedra de evolução e da Shiny Stone (ver `shiny-stone.mjs`), e ela garante STAB —
 * o golpe mais forte do bicho sempre bate no tipo em que ele é mais forte.
 *
 * ### Os nomes começam com "Mega "
 *
 * Não é enfeite: o cooldown é guardado pelo NOME do golpe (`cdGolpes[g.name]`), então um nome
 * repetido faria dois golpes dividirem o mesmo relógio. O prefixo garante que nenhum deles
 * colide com os 549 nomes do catálogo — as três exceções que já usam a palavra (Mega Drain,
 * Mega Kick, Mega Punch) estão fora desta lista, e o teste `teste-megas.mjs` confere.
 */
export const GOLPE_MEGA_POR_TIPO = {
  NORMAL: 'Mega Onslaught',
  FIRE: 'Mega Inferno',
  WATER: 'Mega Maelstrom',
  GRASS: 'Mega Bloom',
  ELECTRIC: 'Mega Thunderstorm',
  ICE: 'Mega Permafrost',
  FIGHTING: 'Mega Rampage',
  POISON: 'Mega Venom',
  GROUND: 'Mega Earthshock',
  FLYING: 'Mega Tempest',
  PSYCHIC: 'Mega Mindbreak',
  BUG: 'Mega Swarm',
  ROCK: 'Mega Landslide',
  GHOST: 'Mega Eclipse',
  DRAGON: 'Mega Cataclysm',
  DARK: 'Mega Abyss',
  STEEL: 'Mega Forge',
  FAIRY: 'Mega Radiance',
};

/**
 * O golpe de mega de uma ficha da tabela `MEGAS`, pronto para entrar na lista de golpes.
 *
 * A categoria segue a MESMA regra dos golpes de assinatura (`injetarGolpesEspeciais`): o lado
 * de ataque mais forte da mega. Mega Gengar tem 170 de Sp. Atk contra 65 de Atk e bate
 * especial; Mega Heracross tem 185 de Atk e bate físico. Escolher pelo lado fraco daria um
 * golpe de 600 que não acerta.
 */
export function golpeMegaDe(meta) {
  const tipo = meta?.tipos?.[0];
  const nome = GOLPE_MEGA_POR_TIPO[tipo];
  if (!nome) return null;
  return {
    name: nome,
    power: 600,
    type: tipo,
    category: (meta.bases.atk ?? 0) >= (meta.bases.spAtk ?? 0) ? 'PHYSICAL' : 'SPECIAL',
    cooldownMs: COOLDOWN_MEGA_MS,
    learnLevel: 1,
    // Ver o cabeçalho: sem esta marca o golpe volta para os 60 s de todo golpe de 600.
    cdFixo: true,
    // O que a tela usa para pintar o selo de "golpe da mega" na ficha.
    golpeMega: true,
  };
}

/**
 * Monta as espécies mega (as 84 de `MEGAS` e as 3 de `MEGAS_SEGUNDAS`) a partir das espécies
 * base já carregadas.
 *
 * Rodar DEPOIS dos golpes das planilhas e dos ajustes de evolução: o que a mega herda da base
 * (golpes, loot, nível de hunt, experiência) tem de ser o valor final, não o que o espelho
 * trouxe. Ver a chamada em `content.mjs`.
 *
 * Herda quase tudo e troca só o que a mega muda: nome, arte, tipos, as seis bases e o fim da
 * cadeia. `evolvesToId: 0` é a trava — megaevoluído não evolui mais; sem ela o Mega Scizor
 * continuaria oferecendo a evolução do Scizor e o jogador trocaria a mega por um bicho comum
 * gastando uma pedra, sem volta.
 *
 * O `huntLevel` e o `loot` vêm da base de propósito, embora mega nenhuma apareça numa hunt:
 * são eles que a Pokedex mostra na ficha ("onde aparece", "o que dropa"), e a resposta certa
 * para um Mega Gengar é a do Gengar.
 *
 * @param lista  todas as espécies do catálogo (base do espelho + nossas)
 * @returns as espécies mega, para serem concatenadas na lista
 */
export function criarEspeciesMega(lista) {
  const porId = new Map(lista.map((c) => [c.pokeId, c]));
  const saida = [];
  for (const m of TODAS_AS_MEGAS) {
    const base = porId.get(m.dex);
    if (!base) continue;
    const pokeId = pokeIdDaMega(m);
    saida.push({
      ...base,
      pokeId,
      name: m.nome,
      looktype: looktypeDaMega(m),
      description: `a ${m.nome.toLowerCase()}`,
      type1: m.tipos[0],
      type2: m.tipos[1] ?? null,
      baseHp: m.bases.hp,
      baseAtk: m.bases.atk,
      baseDef: m.bases.def,
      baseSpAtk: m.bases.spAtk,
      baseSpDef: m.bases.spDef,
      baseSpeed: m.bases.speed,
      evolvesToId: 0,
      evolveLevel: 0,
      // O teto de quem NÃO evolui (`TETO_CAPTURA_MAX` em `teto-captura.mjs`, aqui sem o import para
      // não fechar um ciclo de módulos). Até 16/10 toda mega era de última evolução e herdava o 100 da
      // base; a Mega Floette é a primeira de uma forma do meio (Flabébé → Floette → Florges), e
      // herdaria o 40 da Floette — o que uma segunda passagem do teto desfaria.
      tetoCaptura: 100,
      // `loot` e `attacks` viriam por REFERÊNCIA no espalhamento acima, e passagens do boot
      // ainda dão `push` neles (ver `aplicarDropsNossos`). Copiar aqui é o que impede a mega
      // de escrever na ficha do Gengar de verdade.
      loot: (base.loot ?? []).map((l) => ({ ...l })),
      // O moveset da planilha, quando a mega está nela; senão o da base, CÓPIA EXATA, mais o
      // golpe de mega — e nada mais. Ver o cabeçalho de `GOLPE_MEGA_POR_TIPO` para por que a
      // cópia não é rederivada dos tipos novos.
      attacks: golpesDaPlanilhaDaMega(pokeId) ?? [
        ...(base.attacks ?? []).map((a) => ({ ...a })),
        ...(golpeMegaDe(m) ? [golpeMegaDe(m)] : []),
      ],
      megaDeDex: m.dex,
      ...(m.segunda ? { megaSegunda: true } : {}),
    });
  }
  return saida;
}

/**
 * Os elos "base → mega" para o piso da linhagem da nota.
 *
 * Megaevoluir tem de SUBIR o N= pela mesma razão que evoluir (ver `linhagem-nota.mjs`): a
 * régua da nota é por espécie, e a mega levanta muito as bases — um nascimento com IV
 * relativamente alto cairia de nota ao virar mega. O elo não mora em `evolvesToId` de
 * propósito: se morasse, a mega apareceria como destino normal de evolução e uma pedra comum
 * de tipo a alcançaria.
 */
export function elosMegaDaNota(lista) {
  const existe = new Set(lista.map((c) => c.pokeId));
  const elos = [];
  for (const m of TODAS_AS_MEGAS) {
    const mega = pokeIdDaMega(m);
    if (!existe.has(m.dex) || !existe.has(mega)) continue;
    elos.push([m.dex, mega]);
  }
  return elos;
}
