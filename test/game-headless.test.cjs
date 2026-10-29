const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PokeIdleHeadlessClient, GameHeadlessManager } = require('../src/domain/game-headless-service');

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sent = [];
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (typeof this.onopen === 'function') this.onopen();
    }, 5);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (typeof this.onclose === 'function') this.onclose();
  }

  simulateMessage(msg) {
    if (typeof this.onmessage === 'function') {
      this.onmessage({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    }
  }
}

test('PokeIdleHeadlessClient - handshake, telemetry, combat and lifecycle', async () => {
  globalThis.WebSocket = MockWebSocket;

  const client = new PokeIdleHeadlessClient(0, {
    wsUrl: 'wss://pokeidle.io/ws',
    token: 'test_token_xyz',
    nick: 'AshKetchum',
    hunt: 'vulpix',
    balls: 100,
    team: [{ id: 1, sid: 7, name: 'Squirtle', level: 25, ld: true }],
    a: { seconds: 10, xph: 36000, shinyCap: 0, kills: 5, balls: 2, captures: 2 }
  });

  let latestUpdate = null;
  client.on('update', ({ index, state }) => {
    latestUpdate = state;
  });

  client.connect();
  await new Promise(r => setTimeout(r, 20));

  assert.equal(client.status, 'connected');
  assert.ok(client.ws);
  assert.equal(client.ws.sent.length >= 1, true);

  const handshake = JSON.parse(client.ws.sent[0]);
  assert.deepEqual(handshake, { t: 'hello', nick: 'AshKetchum', token: 'test_token_xyz' });

  // 1. Simula 'welcome'
  client.ws.simulateMessage({
    t: 'welcome',
    estado: {
      nick: 'AshKetchum',
      level: 42,
      gold: 15000,
      huntSlug: 'charizard_valley',
      balls: { 1: 50, 2: 30 },
      items: { 70000: 3, 70011: 0 },
      pokemons: [
        { id: 1, speciesId: 7, nome: 'Squirtle', level: 26, shiny: false, slot: 0 },
        { id: 2, speciesId: 25, nome: 'Pikachu', level: 30, shiny: true, slot: 1 }
      ]
    }
  });

  assert.equal(latestUpdate.level, 42);
  assert.equal(latestUpdate.gold, 15000);
  assert.equal(latestUpdate.hunt, 'charizard_valley');
  assert.equal(latestUpdate.balls, 80);
  assert.equal(latestUpdate.invMap[70000], 3);
  assert.equal(latestUpdate.team.length, 2);

  // 2. Simula 'campo.init'
  client.ws.simulateMessage({
    t: 'campo.init',
    slug: 'seafoam_islands'
  });
  assert.equal(latestUpdate.hunt, 'seafoam_islands');

  // 3. Simula evento de batalha com shiny spawn, kill, drops e captura
  client.ws.simulateMessage({
    t: 'batalha',
    ev: [
      { k: 'spawn', shiny: true, nome: 'Articuno' },
      { k: 'bola', ballId: 3 },
      { k: 'morte', quem: 'selvagem', xp: 500, xpTreinador: 2280, shiny: true, drops: [{ itemId: 70000, nome: 'Bronze Boss Token', qtd: 2 }] },
      { k: 'capturado', pokemon: { shiny: true, nome: 'Articuno', speciesId: 144 } }
    ]
  });

  assert.equal(latestUpdate.a.xp, 2280); // prioritizes xpTreinador (2280) over unmultiplied base xp (500)
  assert.equal(latestUpdate.a.shinyFound >= 1, true);
  assert.equal(latestUpdate.a.shinyCap, 1);
  assert.equal(latestUpdate.a.kills, 6);
  assert.equal(latestUpdate.a.balls, 3);
  assert.equal(latestUpdate.a.captures, 3);
  assert.equal(latestUpdate.balls, 79);
  assert.equal(latestUpdate.invMap[70000], 5);
  assert.equal(latestUpdate.rawDrops[70000].qty, 2);
  assert.equal(latestUpdate.drops[70000].qty, 2);
  assert.equal(latestUpdate.drops[70000].name, 'Bronze Boss Token');
  assert.equal(latestUpdate.shinyLog.length >= 2, true);
  assert.equal(latestUpdate.catchLog.length >= 1, true);
  assert.equal(latestUpdate.catchLog[0].n, 'Articuno');
  assert.equal(latestUpdate.catchLog[0].sid, 144);
  assert.equal(latestUpdate.catchLog[0].sh, true);

  // 4. Teste de comandos
  client.throwBall(2);
  assert.equal(client.ws.sent[client.ws.sent.length - 1], JSON.stringify({ t: 'ball.throw', ballId: 2 }));

  client.changeHunt('cerulean_cave');
  assert.equal(client.ws.sent[client.ws.sent.length - 1], JSON.stringify({ type: 'enter-hunt', t: 'hunt.select', slug: 'cerulean_cave' }));

  // 5. Desconexão limpa
  client.disconnect();
  assert.equal(client.status, 'disconnected');
  assert.equal(client.ws, null);
});

test('GameHeadlessManager - start, getStatus, stop, stopAll', async () => {
  globalThis.WebSocket = MockWebSocket;
  const manager = new GameHeadlessManager();

  const client = manager.start(0, {
    wsUrl: 'wss://pokeidle.io/ws',
    token: 'tok_1',
    nick: 'Treinador 1'
  });

  assert.ok(client);
  await new Promise(r => setTimeout(r, 20));

  const status = manager.getStatus(0);
  assert.equal(status.active, true);
  assert.equal(status.status, 'connected');
  assert.equal(manager.isMasterBlasterActive(0), true);

  manager.stop(0);
  const statusAfter = manager.getStatus(0);
  assert.equal(statusAfter.active, false);
  assert.equal(manager.isMasterBlasterActive(0), false);
});
