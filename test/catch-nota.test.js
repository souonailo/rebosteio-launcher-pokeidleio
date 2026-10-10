'use strict';
// Catalogo e modulos publicos do jogo, sessao efemera; nenhuma conta, nenhum comando.
// Prova que a nota da coluna "Melhor catch" e a MESMA que o jogo calcula — se o jogo mudar a
// formula ou mover os arquivos, este teste cai antes de o jogador ver numero errado na tela.
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { installCatchNota } = require('../src/ui/catch-nota');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { partition: 'catch-nota-test', sandbox: true } });
  await win.loadURL('https://pokeidle.io/app');
  const result = await win.webContents.executeJavaScript(`(async () => {
    // Primeape (#57, evolui) e Annihilape (#979, so existe em creatures-novos.json).
    window.__poke = {
      sess: {}, pokemonsMap: { 'p-sem-pot': { id: 'p-sem-pot' } },
      catchLog: [
        { id: 'a', n: 'Primeape', sid: 57, iv: 94, q: 1.52, sh: false, pot: 3, t: Date.now() },
        { id: 'b', n: 'Annihilape', sid: 979, iv: 94, q: 1.52, sh: false, pot: 'P3', t: Date.now() },
        { id: 'b2', n: 'Annihilape', sid: 979, iv: 94, q: 1.52, sh: false, pot: 3, t: Date.now() },
        { id: 'c', n: 'Primeape', sid: 57, iv: 174, q: 1.71, sh: true, pot: 5, t: Date.now() },
        { id: 'p-sem-pot', n: 'Primeape', sid: 57, iv: 94, q: 1.52, sh: false, t: Date.now() },
        { id: 'd', n: 'Desconhecido', sid: 999999, iv: 94, q: 1.52, sh: false, pot: 2, t: Date.now() }
      ]
    };
    (${installCatchNota.toString()})();
    const P = window.__poke;
    const pronto = () => P.catchLog[0].nt != null;
    for (let i = 0; i < 160 && !pronto(); i++) await new Promise(r => setTimeout(r, 250));

    // A verdade: a conta do proprio jogo, no mesmo nascimento.
    const nota = await import('/shared/nota-pokemon.mjs');
    const doc = await (await fetch('/assets/creatures.json')).json();
    const esperadoPrimeape = nota.notaDePokemon(
      { iv: 94, quality: 1.52, potencia: 3, shiny: false },
      doc.creatures.find(c => c.pokeId === 57)
    );
    // Annihilape (#979) nao esta em creatures.json: confirma, pelo proprio arquivo, que a
    // especie so aparece quando os tres catalogos entram.
    const soNoPrimeiroArquivo = !!doc.creatures.find(c => c.pokeId === 979);

    const porId = (id) => P.catchLog.find(c => c.id === id);
    return {
      primeape: porId('a').nt,
      esperadoPrimeape,
      soNoPrimeiroArquivo,
      novosTexto: porId('b').nt,     // potencia como 'P3'
      novosNumero: porId('b2').nt,   // a mesma captura com potencia 3
      shinyP5: porId('c').nt,
      semPotencia: porId('p-sem-pot').nt === undefined,
      semEspecie: porId('d').nt === undefined
    };
  })()`);

  assert.equal(typeof result.primeape, 'number', 'a nota e calculada a partir do catalogo do jogo');
  assert.equal(result.primeape, result.esperadoPrimeape, 'a nota da coluna e a mesma do modulo do jogo');
  assert.equal(result.soNoPrimeiroArquivo, false, 'Annihilape nao esta em creatures.json');
  assert.equal(typeof result.novosTexto, 'number',
    'especie que so existe em creatures-novos.json tambem recebe nota');
  assert.equal(result.novosTexto, result.novosNumero,
    'potencia "P3" vale o mesmo que 3 (sem normalizar, cairia em P1 e a nota sairia menor)');
  assert.ok(result.shinyP5 > result.primeape, 'shiny P5 nasce mais forte que o mesmo bicho comum');
  assert.equal(result.semPotencia, true, 'sem potencia nao inventa nota (P1 presumido daria numero menor e errado)');
  assert.equal(result.semEspecie, true, 'especie fora do catalogo fica sem nota, em vez de usar bases genericas');
  console.log('PASS: nota N= igual a do jogo, catalogo das tres fontes, potencia em texto, shiny/P5 e as duas recusas.');
  win.destroy();
  app.exit(0);
}).catch(e => { console.error(e.stack); app.exit(1); });

setTimeout(() => { console.error('Catch nota test timed out'); app.exit(1); }, 60000);
