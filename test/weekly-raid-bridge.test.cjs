const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../rust-migration/src-tauri/src/gameplay_bridge.js'), 'utf8');
const NOW = Date.UTC(2026, 10, 10, 16); // terça, 13h de Brasília

function setup(enabled = true) {
  const timers = [];
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.listeners = {}; this.sent = []; }
    addEventListener(name, cb) { (this.listeners[name] ||= []).push(cb); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; }
    emit(name, payload = {}) {
      const event = { data: JSON.stringify(payload), stopImmediatePropagation() {} };
      for (const cb of this.listeners[name] || []) cb(event);
    }
  }
  const page = {
    __idleioAutoRaidEnabled: enabled,
    WebSocket: Socket, location: { href: 'https://pokeidle.io/app' },
    __TAURI_INTERNALS__: { invoke: async () => {} },
    localStorage: { getItem: () => null },
    performance: { now: () => NOW },
    crypto: { randomUUID: () => 'test-session' },
    setTimeout: (cb) => { timers.push(cb); return timers.length; },
    setInterval: (cb) => { timers.push(cb); return timers.length; },
    queueMicrotask, URL, Date, Object, Number, JSON, Reflect,
  };
  page.window = page;
  page.top = page;
  vm.runInNewContext(source, page);
  const socket = new page.WebSocket('wss://pokeidle.io/ws');
  socket.emit('open');
  const serverPacket = (extra = {}) => ({
    t: 'raid', agora: NOW, edicao: {
      id: 'raid-2026-11-16', inscricoesDe: NOW - 3600000, inscricoesAte: NOW + 3600000,
    }, eu: { inscrito: false }, ...extra,
  });
  return { page, socket, timers, serverPacket };
}

test('inscreve uma vez após resposta do servidor, sem enviar se já inscrito', () => {
  const { socket, timers, serverPacket } = setup();
  socket.emit('message', { t: 'welcome', estado: { items: { '70000': 1 } } });
  timers.forEach(cb => cb());
  assert.equal(socket.sent.filter(m => m.t === 'raid.info').length, 1);
  socket.emit('message', serverPacket());
  socket.emit('message', serverPacket());
  assert.equal(socket.sent.filter(m => m.t === 'raid.inscrever').length, 1);
  socket.emit('message', serverPacket({ eu: { inscrito: true } }));
  socket.emit('message', serverPacket());
  assert.equal(socket.sent.filter(m => m.t === 'raid.inscrever').length, 1);
});

test('não envia inscrição desativado, sem token, fora da janela ou sem confirmação de status', () => {
  const { socket, page, serverPacket } = setup(false);
  socket.emit('message', { t: 'welcome', estado: { items: { '70000': 1 } } });
  socket.emit('message', serverPacket());
  assert.equal(socket.sent.length, 0);
  page.__idleioAutoRaidEnabled = true;
  socket.emit('message', { t: 'estado', items: { '70000': 0 } });
  socket.emit('message', serverPacket());
  socket.emit('message', serverPacket({ eu: {} }));
  socket.emit('message', serverPacket({ edicao: { id: 'old', inscricoesDe: NOW - 5000, inscricoesAte: NOW - 1 } }));
  assert.equal(socket.sent.filter(m => m.t === 'raid.inscrever').length, 0);
});

test('aplica janela semanal de Brasília quando edição não fornece limites', () => {
  const { socket, serverPacket } = setup();
  socket.emit('message', { t: 'welcome', estado: { items: { '70000': 1 } } });
  socket.emit('message', serverPacket({ edicao: { id: 'weekly' } }));
  assert.equal(socket.sent.filter(m => m.t === 'raid.inscrever').length, 1);
  const { socket: closed, serverPacket: closedPacket } = setup();
  closed.emit('message', { t: 'welcome', estado: { items: { '70000': 1 } } });
  const mon = Date.UTC(2026, 10, 9, 20); // segunda, 17h em Brasília
  closed.emit('message', closedPacket({ agora: mon, edicao: { id: 'closed' } }));
  assert.equal(closed.sent.filter(m => m.t === 'raid.inscrever').length, 0);
});
