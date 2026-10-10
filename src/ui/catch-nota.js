// A NOTA (N= 0 a 10) e a POTENCIA (P1 a P5) de cada captura, com a conta do proprio jogo.
//
// Roda DENTRO do painel (mesma origem do jogo), que e o unico lugar onde `/shared/*.mjs` existe:
// o launcher abre de file:// e um fetch de la seria barrado. O mesmo caminho que o
// `capture-value.js` ja usa para o valor de venda.
//
// A nota NAO e inventada aqui: `notaDePokemon` e o modulo do jogo, entao o numero da coluna
// "Melhor catch" e o mesmo N= que a calculadora mostra na ficha. Sem a conta do jogo, duas
// implementacoes dariam dois numeros e o jogador acreditaria no errado.
(function (root) {
  'use strict';

  // TUDO que a funcao usa mora DENTRO dela: ela e injetada no painel por `toString()`
  // (como a do capture-value), e constante declarada aqui fora chegaria la como
  // ReferenceError no primeiro ciclo.
  function installCatchNota(dependencies) {
    const P = window.__poke;
    if (!P || P.catchNota) return;

    // O catalogo vem de TRES arquivos: `creatures.json` sozinho tem 486 especies, e as 730 de
    // `creatures-novos` (Sinnoh para frente) sao exatamente as hunts altas de quem joga ha mais
    // tempo — o Annihilape de um painel real so existe la. Faltando o arquivo, a especie nao
    // acha base e a captura ficaria sem nota justamente nas contas adiantadas.
    const CATALOGOS = ['/assets/creatures.json', '/assets/creatures-novos.json', '/assets/creatures-outland-novos.json'];
    // Só o que a nota e o piso de linhagem leem. O catalogo cheio sao ~1 MB por painel, e com
    // quatro contas abertas isso e memoria viva o tempo todo; estes campos dao a MESMA nota
    // (conferido especie a especie, nas 1.227) por 224 kB.
    const CAMPOS = ['pokeId', 'looktype', 'evolvesToId', 'evolveLevel',
      'baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed'];
    const RECARGA_MS = 60000; // catalogo ou modulo fora do ar: tenta de novo, sem insistir em loop
    const CICLO_MS = 3000;

    /**
     * Potencia como NUMERO de 1 a 5.
     *
     * O jogo manda `potencia` numerica, mas o snapshot ja chegou como 'P3' (e o exportador do
     * launcher trata as duas formas). `Number('P3')` e NaN, e o modulo do jogo cai em P1 sem
     * reclamar: a nota desceria de 3,01 para 2,70 e ninguem veria o erro. Devolve 0 quando nao
     * da para saber — quem chama decide, e a coluna prefere omitir a mentir.
     */
    const potenciaDe = (valor) => {
      if (valor == null) return 0;
      if (typeof valor === 'number') {
        return Number.isFinite(valor) ? Math.min(5, Math.max(0, Math.round(valor))) : 0;
      }
      const m = String(valor).match(/[1-5]/);
      return m ? +m[0] : 0;
    };

    let nota = null; // modulo /shared/nota-pokemon.mjs
    let especies = null; // Map pokeId -> especie enxuta, com `notaAncestrais` ja anotado
    let carregando = null;
    let tentarEm = 0;

    const carregar = () => {
      if (carregando || Date.now() < tentarEm) return;
      carregando = (async () => {
        const mods = dependencies ? dependencies.modules : await Promise.all([
          import('/shared/nota-pokemon.mjs'),
          import('/shared/linhagem-nota.mjs'),
          import('/shared/megas.mjs'),
        ]);
        const [notaMod, linhagemMod, megasMod] = mods;
        const docs = dependencies ? dependencies.docs : await Promise.all(CATALOGOS.map(async (url) => {
          try {
            const r = await fetch(url, { cache: 'no-cache' });
            return r.ok ? await r.json() : null;
          } catch (e) { return null; }
        }));
        const lista = [];
        for (const doc of docs) {
          for (const c of (doc && doc.creatures) || []) {
            if (!c || c.pokeId == null) continue;
            const enxuta = {};
            for (const k of CAMPOS) enxuta[k] = c[k];
            lista.push(enxuta);
          }
        }
        if (!lista.length) throw new Error('catalogo de especies vazio');
        const mapa = new Map();
        for (const c of lista) if (!mapa.has(c.pokeId)) mapa.set(c.pokeId, c);
        // O piso da linhagem: sem ele 458 especies (as que evoluem) ficariam com nota ABAIXO da
        // que o jogo mostra, porque a regua da forma nova mede o mesmo nascimento mais baixo.
        try {
          linhagemMod.anotarLinhagemDaNota(lista, (id) => mapa.get(id), megasMod.elosMegaDaNota(lista));
        } catch (e) { /* sem o piso a nota ainda sai, so nao sobe nas evoluidas */ }
        nota = notaMod;
        especies = mapa;
      })().catch(() => { tentarEm = Date.now() + RECARGA_MS; }).finally(() => { carregando = null; });
    };

    /** A potencia de uma captura: a que ela ja guarda, senao a do pokemon que ainda esta na conta. */
    const potenciaDaCaptura = (c) => {
      // `pot` e o campo deste modulo; `potencia` e o que o coletor/capture-value ja gravam.
      const propria = potenciaDe(c.pot) || potenciaDe(c.potencia);
      if (propria) return propria;
      const dono = c.id != null ? (P.pokemonsMap || {})[c.id] : null;
      return dono ? potenciaDe(dono.potencia) : 0;
    };

    function anotar() {
      const log = P.catchLog;
      if (!log || !log.length) return;
      if (!nota || !especies) { carregar(); return; }
      for (const c of log) {
        if (!c) continue;
        const pot = potenciaDaCaptura(c);
        // Recalcula quando a potencia aparece depois (a captura entra no log antes de o pokemon
        // chegar na lista da conta), e so nesse caso: a nota e de nascimento e nao muda sozinha.
        if (c.nt != null && c.ntP === pot) continue;
        const esp = especies.get(+c.sid || 0);
        if (!esp) continue;
        // Sem potencia a conta cairia em P1 — e P1 contra P5 e 2,70 contra 4,99 no MESMO
        // nascimento. Fica sem nota ate a potencia aparecer; a coluna entao omite P e N.
        if (!pot) continue;
        try {
          const n = nota.notaDePokemon({
            iv: c.iv, ivs: c.ivs, quality: c.q, potencia: pot, shiny: !!c.sh,
          }, esp);
          if (n != null) { c.nt = n; c.ntP = pot; c.pot = pot; }
        } catch (e) { /* uma captura estranha nao pode parar as outras */ }
      }
    }

    P.catchNota = anotar;
    carregar();
    anotar();
    setInterval(anotar, CICLO_MS);
  }

  if (typeof module === 'object' && module.exports) module.exports = { installCatchNota };
  else root.PioCatchNota = { installCatchNota };
})(typeof window === 'object' ? window : globalThis);
