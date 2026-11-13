'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.join(__dirname, '..', 'rust-migration', 'ui');
const source = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(base, 'src', 'ui', 'sniper-catalog.json'), 'utf8'));

function region(begin, end) {
  const start = source.indexOf(begin);
  const stop = source.indexOf(end, start + begin.length);
  assert.ok(start >= 0 && stop > start, `Fonte de integração ausente: ${begin}`);
  return source.slice(start, stop);
}

// Executa exatamente os produtores usados pelo launcher, com dependências de IO controladas.
const dropsSource = region('    const PIO_STATIC_ITEMS = {', '    // ----- Leitura periódica das contas:');
const sniperSource = region('    const pioEstado = {};', '    window.getPioHeadlessColeta =');

function harness(initialDrops = []) {
  const now = Date.now();
  const alerts = [], csv = [], listeners = [];
  const storage = new Map([['pio-drops-v1', JSON.stringify(initialDrops)]]);
  const context = vm.createContext({
    window: {
      PioSniperPanel: { getState: () => ({ itemsCatalog: catalog }) },
      pokeAPI: {
        onSniperUpdated: cb => { listeners.push(cb); return Promise.resolve(() => {}); }
      }
    },
    pioLer: (key, fallback) => storage.has(key) ? JSON.parse(storage.get(key)) : fallback,
    pioGravar: (key, value) => storage.set(key, JSON.stringify(value)),
    pioAvisar: (conta, fonte, msg, nivel, t) => alerts.push({ conta, fonte, msg, nivel, t }),
    pioCsvLinha: (file, columns, fields) => csv.push({ file, fields }),
    pioDataHora: t => new Date(t || now).toISOString(),
    pioMes: () => '2026-11',
    pioNum: x => Number(x).toLocaleString('pt-BR'),
    pioInicio: now - 10_000,
    PIO_AV_KEY: 'pio-avisos-v1',
    pioAv: { vistos: {}, itens: [], lidoAte: 0 },
    pioUltimo: {},
    itensCache: { 987654: { n: 'Exclusivo do jogo' } }
  });
  vm.runInContext(dropsSource + '\n' + sniperSource, context);
  return {
    now, alerts, csv, storage, listeners,
    run(code) { return vm.runInContext(code, context); },
    reloadAvisos() { context.pioAv = JSON.parse(storage.get('pio-avisos-v1')); },
    feedVisual(conta, nick, logs) {
      context.testLogs = logs;
      vm.runInContext('pioProcessarSniperLogs(' + conta + ', ' + JSON.stringify(nick) + ', testLogs)', context);
    },
    feedNative(accounts) { listeners[0]({ accounts }); }
  };
}

test('classifica todos os grupos de itens rastreados sem confundir pedras normais', () => {
  const h = harness();
  for (const item of ['Beast Ball', 'Common House', 'Co-Founder Box', 'Rare Bicycle', 'Fragmento de MEGA Stone',
    'Fragmento de Ovo Shiny', 'Safari Ticket', 'Shiny Stone Fragment', 'AoE TM Disk', '70014', '70060', '70080', '70095']) {
    const res = h.run(`pioTipoItem(${JSON.stringify(item)})`);
    assert.equal(res, 'raro', `${item} deveria ser reconhecido como raro`);
  }
  assert.equal(h.run('pioTipoItem("Fire Stone")'), 'pedra');
  assert.equal(h.run('pioTipoItem("Fire Shiny Stone")'), 'raro');
  assert.equal(h.run('pioTipoItem("987654")'), null, 'fallback legado itensCache continua disponível');
  assert.equal(h.run('pioNomeItem("987654")'), 'Exclusivo do jogo');
  assert.equal(h.run('pioTipoItem("Item #70080")'), 'raro');
});

test('migra registros raros antigos sem inventar novas aquisições', () => {
  const now = Date.now();
  const h = harness([{ t: now, conta: 1, item: '70080', qtd: 2, tipo: 'pedra', origem: 'drop' }]);
  const drops = JSON.parse(h.storage.get('pio-drops-v1'));
  assert.equal(drops.length, 1);
  assert.equal(drops[0].item, 'Common Bicycle');
  assert.equal(drops[0].tipo, 'raro');
  assert.equal(h.alerts.length, 0);
  assert.equal(h.csv.length, 0);
});

test('troca de sessão, personagem e desconexão não transformam totais antigos em drops', () => {
  const h = harness();
  const feed = (conta, nick, st, qty, sockOk = true) => h.run(`pioDropsTrack(${conta}, ${JSON.stringify({
    nick, sess: { st }, sockOk, slug: 'hunt',
    drops: { 'Key Fragment': { name: 'Key Fragment', qty } }
  })})`);
  feed(2, 'Treinador A', 100, 0);
  feed(2, 'Treinador A', 200, 1);
  feed(4, 'Treinador D', 300, 1);
  feed(2, 'Treinador B', 200, 1);
  feed(2, 'Treinador B', 200, 1, false);
  feed(2, 'Treinador B', 200, 1);
  assert.equal(JSON.parse(h.storage.get('pio-drops-v1')).length, 0);
  assert.equal(h.alerts.length, 0);
  assert.equal(h.csv.length, 0);

  feed(2, 'Treinador B', 200, 2);
  const drops = JSON.parse(h.storage.get('pio-drops-v1'));
  assert.equal(drops.length, 1);
  assert.equal(drops[0].conta, 2);
  assert.equal(drops[0].item, 'Key Fragment');
  assert.equal(drops[0].qtd, 1);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.csv.length, 1);
});

test('duas fontes da mesma vitória confirmada geram só um aviso e uma compra rara', () => {
  const h = harness();
  h.feedVisual(1, 'Treinador', [{
    id: 'sorteio_ok_visual_42', timestamp: h.now, status: 'CONFIRMADO', targetName: 'Rare Bicycle',
    offerId: 42, qty: 2, price: 10, currency: 'orb'
  }]);
  h.feedNative([{ index: 0, logs: [{
    id: 'ok_native_42', timestamp: h.now, status: 'CONFIRMADO', targetName: 'Rare Bicycle',
    offerId: 42, qty: 2, price: 10, currency: 'orb', lotteryResult: 'won',
    details: '✅ Confirmado pelo servidor: 2x Rare Bicycle'
  }] }]);
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0].msg, /venceu o sorteio e comprou 2× Rare Bicycle/);
  assert.equal(h.alerts[0].nivel, 'ok');
  assert.equal(h.csv.filter(x => x.file === 'sniper/compras.csv').length, 1);
  const drops = JSON.parse(h.storage.get('pio-drops-v1'));
  assert.equal(drops.length, 1);
  assert.equal(drops[0].tipo, 'raro');
  assert.equal(drops[0].qtd, 2);
  assert.equal(drops[0].origem, 'sniper');
});

test('derrota terminal no sorteio é avisada; recusa comum não vira derrota', () => {
  const h = harness();
  h.feedNative([{ index: 0, logs: [
    { id: 'old_loss', timestamp: h.now, status: 'RECUSADO', targetName: 'Beast Ball', offerId: 43,
      details: 'Recusado pelo servidor: market.sorteioPerdeu' },
    { id: 'ordinary_refusal', timestamp: h.now, status: 'RECUSADO', targetName: 'Beast Ball', offerId: 44,
      details: 'Saldo insuficiente' },
    { id: 'pending', timestamp: h.now, status: 'DISPARADO', targetName: 'Beast Ball', offerId: 45 },
    { id: 'missed_opportunity', timestamp: h.now, status: 'PERDIDO', targetName: 'Beast Ball', offerId: 46 }
  ] }]);
  assert.equal(h.alerts.filter(a => /perdeu o sorteio/.test(a.msg)).length, 1);
  assert.equal(h.alerts.filter(a => /compra recusada/.test(a.msg)).length, 1);
  assert.equal(h.alerts.filter(a => /venceu o sorteio/.test(a.msg)).length, 0);
  assert.equal(h.csv.filter(x => x.file === 'sniper/perdas.csv').length, 2);
  assert.equal(JSON.parse(h.storage.get('pio-drops-v1')).length, 0);
});

test('compra comum confirmada não é rotulada como vitória no sorteio', () => {
  const h = harness();
  h.feedNative([{ index: 0, logs: [{ id: 'purchase', timestamp: h.now, status: 'CONFIRMADO',
    targetName: 'Common House', offerId: 47, qty: 1, price: 200, currency: 'gold',
    details: 'Confirmado pelo servidor: Common House' }] }]);
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0].msg, /^comprou 1× Common House/);
  assert.equal(JSON.parse(h.storage.get('pio-drops-v1'))[0].tipo, 'raro');
});

test('deduplica quando o snapshot nativo chega antes do log da WebView', () => {
  const h = harness();
  const native = { id: 'ok_native', timestamp: h.now, status: 'CONFIRMADO',
    targetName: 'Mystic Ticket', offerId: 55, qty: 1, price: 50, currency: 'gold', lotteryResult: 'won' };
  h.feedNative([{ index: 0, logs: [native] }]);
  h.feedVisual(1, 'Treinador', [{ ...native, id: 'sorteio_ok_visual' }]);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.csv.filter(x => x.file === 'sniper/compras.csv').length, 1);
  assert.equal(JSON.parse(h.storage.get('pio-drops-v1')).length, 1);
});

test('mesmo sorteio perdido em estados legados distintos produz um único alerta', () => {
  const h = harness();
  h.feedVisual(1, 'Treinador', [{ id: 'sorteio_perdeu_visual', timestamp: h.now,
    status: 'PERDIDO', targetName: 'Mystic Ticket', offerId: 60 }]);
  h.feedNative([{ index: 0, logs: [{ id: 'sorteio_perdeu_native', timestamp: h.now + 1,
    status: 'RECUSADO', targetName: 'Mystic Ticket', offerId: 60, lotteryResult: 'lost' }] }]);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.csv.length, 1);
  assert.equal(JSON.parse(h.storage.get('pio-drops-v1')).length, 0);
});

test('resultados explícitos de sorteio antigo e novo têm precedência sobre mensagens vagas', () => {
  const h = harness();
  h.feedVisual(2, 'Treinador', [
    { id: 'win', timestamp: h.now, status: 'CONFIRMADO', targetName: 'Beast Ball',
      offerId: 49, lotteryResult: 'won', details: 'Confirmado pelo servidor: entregue na mochila' },
    { id: 'lose', timestamp: h.now + 1, status: 'RECUSADO', targetName: 'Beast Ball',
      offerId: 50, lotteryResult: 'lost', details: 'Recusado pelo servidor' },
    { id: 'pending', timestamp: h.now + 2, status: 'DISPARADO', targetName: 'Beast Ball',
      offerId: 51, lotteryResult: 'won', details: 'Pedido iniciado' }
  ]);
  assert.equal(h.alerts.filter(a => /venceu o sorteio/.test(a.msg)).length, 1);
  assert.equal(h.alerts.filter(a => /perdeu o sorteio/.test(a.msg)).length, 1);
  assert.equal(h.alerts.length, 2);
});

test('registro persistente evita recontagem após 950 logs e reinício do launcher', () => {
  const h = harness();
  const logs = Array.from({ length: 950 }, (_, i) => ({
    id: 'terminal_' + i, timestamp: h.now + i, status: 'RECUSADO',
    targetName: 'Beast Ball', offerId: 10000 + i, lotteryResult: 'lost',
    details: 'Recusado pelo servidor: market.sorteioPerdeu'
  }));
  h.feedNative([{ index: 0, logs }]);
  assert.equal(h.alerts.length, 950);
  assert.equal(h.csv.length, 950);
  const registro = JSON.parse(h.storage.get('pio-avisos-v1')).sniperVistos['1'];
  assert.equal(registro.chaves.length, 800);
  assert.ok(registro.ate >= h.now + 149);
  h.feedNative([{ index: 0, logs }]);
  assert.equal(h.alerts.length, 950, 'polling não duplica avisos');
  assert.equal(h.csv.length, 950, 'polling não duplica gravação CSV');
  h.reloadAvisos();
  h.feedNative([{ index: 0, logs }]);
  assert.equal(h.alerts.length, 950, 'reinício não duplica avisos');
  assert.equal(h.csv.length, 950, 'reinício não duplica gravação CSV');
  h.feedNative([{ index: 0, logs: [{
    id: 'new_late', timestamp: h.now + 955, status: 'RECUSADO', targetName: 'Beast Ball',
    offerId: 20000, lotteryResult: 'lost'
  }] }]);
  assert.equal(h.alerts.length, 951, 'evento novo do servidor é processado');
});

test('o script real do launcher continua com JavaScript válido', () => {
  const begin = source.indexOf('  <script>');
  const end = source.lastIndexOf('  </script>');
  assert.ok(begin >= 0 && end > begin);
  assert.doesNotThrow(() => new vm.Script(source.slice(begin + '  <script>'.length, end)));
});
