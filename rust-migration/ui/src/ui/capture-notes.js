(function (root) {
  'use strict';
  let calculate = null, species = null, names = null;
  function attributes(entry) {
    const power = [entry.potencia, entry.pot].map(v => /^(?:P)?([1-5])$/i.exec(String(v ?? ''))).find(Boolean);
    const note = [entry.nt, entry.nota].find(v => v != null && v !== '' && Number.isFinite(+v) && +v >= 0 && +v <= 10);
    return { potencia: power ? +power[1] : null, nota: note == null ? null : +note };
  }
  function enrich(entry) {
    Object.assign(entry, attributes(entry));
    if (!calculate || entry.nota != null || entry.potencia == null || !(entry.q > 0) || !(entry.iv > 0 || entry.ivs)) return entry;
    const esp = species.get(+entry.sid) || (!entry.sid && names.get(String(entry.n || '').toLowerCase()));
    if (!esp) return entry;
    const n = calculate({ iv: entry.iv || undefined, ivs: entry.ivs, quality: entry.q, potencia: entry.potencia, shiny: !!entry.sh }, esp);
    if (n != null && Number.isFinite(n)) { entry.nota = n; entry.sid = esp.pokeId; }
    return entry;
  }
  async function load() {
    const [mod, response] = await Promise.all([import('./game-note/nota-pokemon.mjs'), fetch('src/ui/game-note/catalog.json')]);
    if (!response.ok) throw new Error('Catálogo de notas indisponível');
    const list = await response.json();
    species = new Map(list.map(e => [e.pokeId,e]));
    names = new Map();
    for (const e of list) {
      const k = String(e.name || '').toLowerCase();
      if (k) names.set(k, names.has(k) ? null : e); // ambiguous historical names stay unknown
    }
    calculate = mod.notaDePokemon;
  }
  const api = { attributes, enrich, load };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PioCaptureNotes = api;
})(typeof window === 'object' ? window : globalThis);
