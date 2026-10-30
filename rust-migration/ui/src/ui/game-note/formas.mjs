/**
 * FORMAS — regionais e alternativas como ESPÉCIES de verdade (contrato de sprites, 16/10/2026).
 *
 * ### O número diz de quem a forma é
 *
 * O mesmo desenho das megas (`#3000 + dex`, ver `megas.mjs`) e das variantes de Outland: a forma
 * é uma espécie com `pokeId` próprio, derivado do dex nacional da espécie BASE.
 *
 *   Alola    #4000 + dex    (#4019 Alolan Rattata, #4026 Alolan Raichu…)
 *   Galar    #5000 + dex    (#5052 Galarian Meowth, #5144 Galarian Articuno…)
 *   Hisui    #6000 + dex    (#6058 Hisuian Growlithe, #6706 Hisuian Goodra…)
 *   Paldea   #7000 + dex    (#7128 Paldean Tauros, #7194 Paldean Wooper)
 *   formas   #8000 + dex (1ª), #9000 + dex (2ª), #11000 + dex (3ª), #12000 + dex (4ª)
 *            e #1000 + dex para a 5ª — só o Mow Rotom (#1479): o Rotom tem cinco.
 *
 * A faixa #10000–#10999 fica de fora DE PROPÓSITO: o espelho reserva #10000–#10500 para os
 * "fantasmas" (`isEspelhoFantasmaPokeId`, descartados no boot) e #10501–#10547 para o Outland
 * legado — e o looktype `60000 + #10xxx` cairia em cima dos shinys `70000 + dex`.
 *
 * ### A arte
 *
 * Comum: `60000 + pokeId` — a regra que `temSpriteJogo` já cobra de todo pokeId entre 1000 e
 * 12999, então a forma passa pela mesma trava das nacionais #1001+. Shiny: `70000 + pokeId`
 * (74xxx–79xxx, 81xxx e 82xxx, faixas vazias no `outfits-index.json`), menos o #1479, cujo
 * `70000 + pokeId` (71479) seria o comum do #11479 — o dele é 91479.
 *
 * As folhas moram em `Pokedex Backup/FORMAS/<pokeId>_<slug>.png` e saem pelo
 * `tools/publicar-sprites-formas.mjs`; as fichas (bases, tipos, evolução, nível) em
 * `server/dados/creatures-formas.json`, lido pelas duas pontas como os outros catálogos nossos.
 *
 * ### O que este arquivo responde
 *
 * Só o que precisa ser síncrono nas duas pontas: QUEM é forma, de qual espécie, em qual grupo
 * (a aba da Pokedex) e com qual arte. O resto é da ficha.
 */

/** Os grupos — a aba da Pokedex e a região (Galar e Paldea moram na aba de Alola do mapa). */
export const GRUPOS_FORMA = ['alola', 'galar', 'hisui', 'paldea', 'forma'];

/**
 * As formas.
 *
 *   pokeId          o número da espécie da forma
 *   dex             o dex nacional da espécie base
 *   nome            o nome da forma (em inglês, como o resto do catálogo)
 *   grupo           alola | galar | hisui | paldea | forma
 *   looktype        a arte comum (60000 + pokeId)
 *   looktypeShiny   a arte shiny
 */
export const FORMAS = [
  { pokeId: 4019, dex: 19, nome: 'Alolan Rattata', grupo: 'alola', looktype: 64019, looktypeShiny: 74019 },
  { pokeId: 4020, dex: 20, nome: 'Alolan Raticate', grupo: 'alola', looktype: 64020, looktypeShiny: 74020 },
  { pokeId: 4026, dex: 26, nome: 'Alolan Raichu', grupo: 'alola', looktype: 64026, looktypeShiny: 74026 },
  { pokeId: 4027, dex: 27, nome: 'Alolan Sandshrew', grupo: 'alola', looktype: 64027, looktypeShiny: 74027 },
  { pokeId: 4028, dex: 28, nome: 'Alolan Sandslash', grupo: 'alola', looktype: 64028, looktypeShiny: 74028 },
  { pokeId: 4037, dex: 37, nome: 'Alolan Vulpix', grupo: 'alola', looktype: 64037, looktypeShiny: 74037 },
  { pokeId: 4038, dex: 38, nome: 'Alolan Ninetales', grupo: 'alola', looktype: 64038, looktypeShiny: 74038 },
  { pokeId: 4050, dex: 50, nome: 'Alolan Diglett', grupo: 'alola', looktype: 64050, looktypeShiny: 74050 },
  { pokeId: 4051, dex: 51, nome: 'Alolan Dugtrio', grupo: 'alola', looktype: 64051, looktypeShiny: 74051 },
  { pokeId: 4052, dex: 52, nome: 'Alolan Meowth', grupo: 'alola', looktype: 64052, looktypeShiny: 74052 },
  { pokeId: 5052, dex: 52, nome: 'Galarian Meowth', grupo: 'galar', looktype: 65052, looktypeShiny: 75052 },
  { pokeId: 4053, dex: 53, nome: 'Alolan Persian', grupo: 'alola', looktype: 64053, looktypeShiny: 74053 },
  { pokeId: 6058, dex: 58, nome: 'Hisuian Growlithe', grupo: 'hisui', looktype: 66058, looktypeShiny: 76058 },
  { pokeId: 6059, dex: 59, nome: 'Hisuian Arcanine', grupo: 'hisui', looktype: 66059, looktypeShiny: 76059 },
  { pokeId: 4074, dex: 74, nome: 'Alolan Geodude', grupo: 'alola', looktype: 64074, looktypeShiny: 74074 },
  { pokeId: 4075, dex: 75, nome: 'Alolan Graveler', grupo: 'alola', looktype: 64075, looktypeShiny: 74075 },
  { pokeId: 5077, dex: 77, nome: 'Galarian Ponyta', grupo: 'galar', looktype: 65077, looktypeShiny: 75077 },
  { pokeId: 5078, dex: 78, nome: 'Galarian Rapidash', grupo: 'galar', looktype: 65078, looktypeShiny: 75078 },
  { pokeId: 5079, dex: 79, nome: 'Galarian Slowpoke', grupo: 'galar', looktype: 65079, looktypeShiny: 75079 },
  { pokeId: 5080, dex: 80, nome: 'Galarian Slowbro', grupo: 'galar', looktype: 65080, looktypeShiny: 75080 },
  { pokeId: 5083, dex: 83, nome: 'Galarian Farfetch\'d', grupo: 'galar', looktype: 65083, looktypeShiny: 75083 },
  { pokeId: 4088, dex: 88, nome: 'Alolan Grimer', grupo: 'alola', looktype: 64088, looktypeShiny: 74088 },
  { pokeId: 4089, dex: 89, nome: 'Alolan Muk', grupo: 'alola', looktype: 64089, looktypeShiny: 74089 },
  { pokeId: 6100, dex: 100, nome: 'Hisuian Voltorb', grupo: 'hisui', looktype: 66100, looktypeShiny: 76100 },
  { pokeId: 6101, dex: 101, nome: 'Hisuian Electrode', grupo: 'hisui', looktype: 66101, looktypeShiny: 76101 },
  { pokeId: 4103, dex: 103, nome: 'Alolan Exeggutor', grupo: 'alola', looktype: 64103, looktypeShiny: 74103 },
  { pokeId: 4105, dex: 105, nome: 'Alolan Marowak', grupo: 'alola', looktype: 64105, looktypeShiny: 74105 },
  { pokeId: 5110, dex: 110, nome: 'Galarian Weezing', grupo: 'galar', looktype: 65110, looktypeShiny: 75110 },
  { pokeId: 5122, dex: 122, nome: 'Galarian Mr. Mime', grupo: 'galar', looktype: 65122, looktypeShiny: 75122 },
  { pokeId: 7128, dex: 128, nome: 'Paldean Tauros', grupo: 'paldea', looktype: 67128, looktypeShiny: 77128 },
  { pokeId: 8128, dex: 128, nome: 'Paldean Tauros Blaze', grupo: 'forma', looktype: 68128, looktypeShiny: 78128 },
  { pokeId: 9128, dex: 128, nome: 'Paldean Tauros Aqua', grupo: 'forma', looktype: 69128, looktypeShiny: 79128 },
  { pokeId: 5144, dex: 144, nome: 'Galarian Articuno', grupo: 'galar', looktype: 65144, looktypeShiny: 75144 },
  { pokeId: 5145, dex: 145, nome: 'Galarian Zapdos', grupo: 'galar', looktype: 65145, looktypeShiny: 75145 },
  { pokeId: 5146, dex: 146, nome: 'Galarian Moltres', grupo: 'galar', looktype: 65146, looktypeShiny: 75146 },
  { pokeId: 6157, dex: 157, nome: 'Hisuian Typhlosion', grupo: 'hisui', looktype: 66157, looktypeShiny: 76157 },
  { pokeId: 7194, dex: 194, nome: 'Paldean Wooper', grupo: 'paldea', looktype: 67194, looktypeShiny: 77194 },
  { pokeId: 5199, dex: 199, nome: 'Galarian Slowking', grupo: 'galar', looktype: 65199, looktypeShiny: 75199 },
  { pokeId: 6211, dex: 211, nome: 'Hisuian Qwilfish', grupo: 'hisui', looktype: 66211, looktypeShiny: 76211 },
  { pokeId: 6215, dex: 215, nome: 'Hisuian Sneasel', grupo: 'hisui', looktype: 66215, looktypeShiny: 76215 },
  { pokeId: 5222, dex: 222, nome: 'Galarian Corsola', grupo: 'galar', looktype: 65222, looktypeShiny: 75222 },
  { pokeId: 5263, dex: 263, nome: 'Galarian Zigzagoon', grupo: 'galar', looktype: 65263, looktypeShiny: 75263 },
  { pokeId: 5264, dex: 264, nome: 'Galarian Linoone', grupo: 'galar', looktype: 65264, looktypeShiny: 75264 },
  { pokeId: 8351, dex: 351, nome: 'Castform Rainy', grupo: 'forma', looktype: 68351, looktypeShiny: 78351 },
  { pokeId: 9351, dex: 351, nome: 'Castform Snowy', grupo: 'forma', looktype: 69351, looktypeShiny: 79351 },
  { pokeId: 11351, dex: 351, nome: 'Castform Sunny', grupo: 'forma', looktype: 71351, looktypeShiny: 81351 },
  { pokeId: 8386, dex: 386, nome: 'Deoxys Attack', grupo: 'forma', looktype: 68386, looktypeShiny: 78386 },
  { pokeId: 9386, dex: 386, nome: 'Deoxys Defense', grupo: 'forma', looktype: 69386, looktypeShiny: 79386 },
  { pokeId: 11386, dex: 386, nome: 'Deoxys Speed', grupo: 'forma', looktype: 71386, looktypeShiny: 81386 },
  { pokeId: 8413, dex: 413, nome: 'Wormadam Sandy', grupo: 'forma', looktype: 68413, looktypeShiny: 78413 },
  { pokeId: 9413, dex: 413, nome: 'Wormadam Trash', grupo: 'forma', looktype: 69413, looktypeShiny: 79413 },
  { pokeId: 1479, dex: 479, nome: 'Mow Rotom', grupo: 'forma', looktype: 61479, looktypeShiny: 91479 },
  { pokeId: 8479, dex: 479, nome: 'Heat Rotom', grupo: 'forma', looktype: 68479, looktypeShiny: 78479 },
  { pokeId: 9479, dex: 479, nome: 'Wash Rotom', grupo: 'forma', looktype: 69479, looktypeShiny: 79479 },
  { pokeId: 11479, dex: 479, nome: 'Frost Rotom', grupo: 'forma', looktype: 71479, looktypeShiny: 81479 },
  { pokeId: 12479, dex: 479, nome: 'Fan Rotom', grupo: 'forma', looktype: 72479, looktypeShiny: 82479 },
  { pokeId: 8483, dex: 483, nome: 'Dialga Origin', grupo: 'forma', looktype: 68483, looktypeShiny: 78483 },
  { pokeId: 8484, dex: 484, nome: 'Palkia Origin', grupo: 'forma', looktype: 68484, looktypeShiny: 78484 },
  { pokeId: 8492, dex: 492, nome: 'Shaymin Sky', grupo: 'forma', looktype: 68492, looktypeShiny: 78492 },
  { pokeId: 6503, dex: 503, nome: 'Hisuian Samurott', grupo: 'hisui', looktype: 66503, looktypeShiny: 76503 },
  { pokeId: 6549, dex: 549, nome: 'Hisuian Lilligant', grupo: 'hisui', looktype: 66549, looktypeShiny: 76549 },
  { pokeId: 5554, dex: 554, nome: 'Galarian Darumaka', grupo: 'galar', looktype: 65554, looktypeShiny: 75554 },
  { pokeId: 5555, dex: 555, nome: 'Galarian Darmanitan', grupo: 'galar', looktype: 65555, looktypeShiny: 75555 },
  { pokeId: 8555, dex: 555, nome: 'Darmanitan Zen', grupo: 'forma', looktype: 68555, looktypeShiny: 78555 },
  { pokeId: 9555, dex: 555, nome: 'Galarian Darmanitan Zen', grupo: 'forma', looktype: 69555, looktypeShiny: 79555 },
  { pokeId: 5562, dex: 562, nome: 'Galarian Yamask', grupo: 'galar', looktype: 65562, looktypeShiny: 75562 },
  { pokeId: 6570, dex: 570, nome: 'Hisuian Zorua', grupo: 'hisui', looktype: 66570, looktypeShiny: 76570 },
  { pokeId: 6571, dex: 571, nome: 'Hisuian Zoroark', grupo: 'hisui', looktype: 66571, looktypeShiny: 76571 },
  { pokeId: 5618, dex: 618, nome: 'Galarian Stunfisk', grupo: 'galar', looktype: 65618, looktypeShiny: 75618 },
  { pokeId: 6628, dex: 628, nome: 'Hisuian Braviary', grupo: 'hisui', looktype: 66628, looktypeShiny: 76628 },
  { pokeId: 8641, dex: 641, nome: 'Tornadus Therian', grupo: 'forma', looktype: 68641, looktypeShiny: 78641 },
  { pokeId: 8642, dex: 642, nome: 'Thundurus Therian', grupo: 'forma', looktype: 68642, looktypeShiny: 78642 },
  { pokeId: 8645, dex: 645, nome: 'Landorus Therian', grupo: 'forma', looktype: 68645, looktypeShiny: 78645 },
  { pokeId: 8646, dex: 646, nome: 'White Kyurem', grupo: 'forma', looktype: 68646, looktypeShiny: 78646 },
  { pokeId: 9646, dex: 646, nome: 'Black Kyurem', grupo: 'forma', looktype: 69646, looktypeShiny: 79646 },
  { pokeId: 8647, dex: 647, nome: 'Keldeo Resolute', grupo: 'forma', looktype: 68647, looktypeShiny: 78647 },
  { pokeId: 8681, dex: 681, nome: 'Aegislash Blade', grupo: 'forma', looktype: 68681, looktypeShiny: 78681 },
  { pokeId: 6705, dex: 705, nome: 'Hisuian Sliggoo', grupo: 'hisui', looktype: 66705, looktypeShiny: 76705 },
  { pokeId: 6706, dex: 706, nome: 'Hisuian Goodra', grupo: 'hisui', looktype: 66706, looktypeShiny: 76706 },
  { pokeId: 6713, dex: 713, nome: 'Hisuian Avalugg', grupo: 'hisui', looktype: 66713, looktypeShiny: 76713 },
  { pokeId: 8718, dex: 718, nome: 'Zygarde 10%', grupo: 'forma', looktype: 68718, looktypeShiny: 78718 },
  { pokeId: 9718, dex: 718, nome: 'Zygarde Complete', grupo: 'forma', looktype: 69718, looktypeShiny: 79718 },
  { pokeId: 8720, dex: 720, nome: 'Hoopa Unbound', grupo: 'forma', looktype: 68720, looktypeShiny: 78720 },
  { pokeId: 6724, dex: 724, nome: 'Hisuian Decidueye', grupo: 'hisui', looktype: 66724, looktypeShiny: 76724 },
  { pokeId: 8741, dex: 741, nome: 'Oricorio Pom-Pom', grupo: 'forma', looktype: 68741, looktypeShiny: 78741 },
  { pokeId: 9741, dex: 741, nome: 'Oricorio Pa\'u', grupo: 'forma', looktype: 69741, looktypeShiny: 79741 },
  { pokeId: 11741, dex: 741, nome: 'Oricorio Sensu', grupo: 'forma', looktype: 71741, looktypeShiny: 81741 },
  { pokeId: 8745, dex: 745, nome: 'Lycanroc Midnight', grupo: 'forma', looktype: 68745, looktypeShiny: 78745 },
  { pokeId: 9745, dex: 745, nome: 'Lycanroc Dusk', grupo: 'forma', looktype: 69745, looktypeShiny: 79745 },
  { pokeId: 8746, dex: 746, nome: 'Wishiwashi School', grupo: 'forma', looktype: 68746, looktypeShiny: 78746 },
  { pokeId: 8774, dex: 774, nome: 'Minior Core', grupo: 'forma', looktype: 68774, looktypeShiny: 78774 },
  { pokeId: 8888, dex: 888, nome: 'Zacian Crowned', grupo: 'forma', looktype: 68888, looktypeShiny: 78888 },
  { pokeId: 8889, dex: 889, nome: 'Zamazenta Crowned', grupo: 'forma', looktype: 68889, looktypeShiny: 78889 },
  { pokeId: 8901, dex: 901, nome: 'Bloodmoon Ursaluna', grupo: 'forma', looktype: 68901, looktypeShiny: 78901 },
  { pokeId: 8902, dex: 902, nome: 'Basculegion Female', grupo: 'forma', looktype: 68902, looktypeShiny: 78902 },
  { pokeId: 8905, dex: 905, nome: 'Enamorus Therian', grupo: 'forma', looktype: 68905, looktypeShiny: 78905 },
  { pokeId: 8964, dex: 964, nome: 'Palafin Hero', grupo: 'forma', looktype: 68964, looktypeShiny: 78964 },
];

/** pokeId da forma → a ficha dela. */
export const FORMA_POR_POKEID = new Map(FORMAS.map((f) => [f.pokeId, f]));

/** É uma forma (regional ou alternativa)? */
export const isFormaPokeId = (pokeId) => FORMA_POR_POKEID.has(Number(pokeId));

/** A ficha da forma, ou `null`. */
export const formaPorPokeId = (pokeId) => FORMA_POR_POKEID.get(Number(pokeId)) ?? null;

/** O dex nacional da espécie base de uma forma (#4019 → 19), ou `null` se não é forma. */
export const dexBaseDaForma = (pokeId) => FORMA_POR_POKEID.get(Number(pokeId))?.dex ?? null;

/** pokeId da forma → looktype shiny (o `catalogoShiny` do servidor monta a partir daqui). */
export const looktypeShinyDaForma = (pokeId) => FORMA_POR_POKEID.get(Number(pokeId))?.looktypeShiny ?? null;
