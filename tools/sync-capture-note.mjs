// Snapshot the game's public calculation, without translating its formula.
// Run explicitly when updating the game compatibility snapshot.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const tmp = path.join(root, 'scratch/note-source');
await fs.mkdir(tmp, { recursive: true });
const seen = new Set();
async function moduleFile(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const res = await fetch('https://pokeidle.io/shared/' + name);
  if (!res.ok) throw new Error(name + ': ' + res.status);
  const code = await res.text();
  await fs.writeFile(path.join(tmp, name), code);
  for (const m of code.matchAll(/(?:from\s*|import\s*)['"]\.\/([^'"]+\.mjs)['"]/g)) await moduleFile(m[1]);
}
for (const n of ['nota-pokemon', 'linhagem-nota', 'megas', 'outland', 'evolucoes-cruzadas', 'evolucoes-ramificadas', 'teto-captura', 'ajustes-especie-espelho']) await moduleFile(n + '.mjs');
const imp = n => import(pathToFileURL(path.join(tmp, n + '.mjs')));
const [lineage, megas, outland, evol, branches, ceiling, adjustments] = await Promise.all(['linhagem-nota','megas','outland','evolucoes-cruzadas','evolucoes-ramificadas','teto-captura','ajustes-especie-espelho'].map(imp));
const list = [];
for (const n of ['creatures','creatures-novos','creatures-outland-novos']) {
  const r = await fetch('https://pokeidle.io/assets/' + n + '.json');
  if (!r.ok) throw new Error(n + ': ' + r.status);
  list.push(...(await r.json()).creatures);
}
outland.aplicarRemapOutlandLista(list);
evol.aplicarCadeiasTruncadas(list); evol.normalizarEvolveLevel600(list);
adjustments.aplicarAjustesHuntLevel(id => list.find(c => c.pokeId === id));
const map = new Map();
for (const c of list) {
  if (outland.isEspelhoFantasmaPokeId(c.pokeId)) continue;
  if (outland.isOutlandPokeId(c.pokeId)) { c.evolvesToId = 0; c.evolveLevel = 0; }
  map.set(c.pokeId, c);
}
evol.aplicarEvolucoesEntreGeracoes(list); branches.alinharNivelPadraoRamificado(list); evol.corrigirNiveisDeEvolucao(list);
ceiling.aplicarTetoDeCaptura(list, id => map.get(id));
for (const c of megas.criarEspeciesMega(list)) { list.push(c); map.set(c.pokeId, c); }
lineage.anotarLinhagemDaNota(list, id => map.get(id), megas.elosMegaDaNota(list));
const fields = ['pokeId','name','baseHp','baseAtk','baseDef','baseSpAtk','baseSpDef','baseSpeed','notaAncestrais'];
const catalog = [...map.values()].map(c => Object.fromEntries(fields.filter(k => c[k] !== undefined).map(k => [k,c[k]])));
const dest = path.join(root, 'rust-migration/ui/src/ui/game-note');
await fs.mkdir(dest, { recursive:true });
const copied = new Set();
async function copy(name) {
  if (copied.has(name)) return;
  copied.add(name);
  const code = await fs.readFile(path.join(tmp,name),'utf8');
  await fs.writeFile(path.join(dest,name),code);
  for (const m of code.matchAll(/(?:from\s*|import\s*)['"]\.\/([^'"]+\.mjs)['"]/g)) await copy(m[1]);
}
await copy('nota-pokemon.mjs');
await fs.writeFile(path.join(dest,'catalog.json'),JSON.stringify(catalog));
await fs.writeFile(path.join(dest,'SOURCE.json'),JSON.stringify({source:'https://pokeidle.io',retrievedAt:new Date().toISOString(),modules:[...copied],species:catalog.length},null,2)+'\n');
console.log('Snapshot:', catalog.length, 'species;', copied.size, 'modules');
