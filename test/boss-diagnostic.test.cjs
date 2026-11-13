const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('captura somente campos permitidos e para ao encerrar', () => {
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.listeners = {}; }
    addEventListener(n, f) { (this.listeners[n] ||= []).push(f); }
    send() {}
    emit(n, data) { for (const f of this.listeners[n] || []) f({data: JSON.stringify(data), stopImmediatePropagation() {}}); }
  }
  const p = { WebSocket: Socket, location: {href:'https://pokeidle.io/'}, __TAURI_INTERNALS__: {invoke: async()=>{}}, crypto: {randomUUID:()=> 'test'}, setInterval:()=>0, setTimeout:()=>0, performance:{now:()=>0}, URL, queueMicrotask };
  p.window=p; p.top=p;
  vm.runInNewContext(fs.readFileSync('rust-migration/src-tauri/src/gameplay_bridge.js','utf8'),p);
  const socket = new p.WebSocket('wss://pokeidle.io/ws'); socket.emit('open',{});
  p.__pioBossDiagnosticStart();
  socket.send(JSON.stringify({t:'hello',token:'secret'}));
  socket.send(JSON.stringify({t:'centro.ir',token:'secret'}));
  socket.emit('message',{t:'campo.init',slug:'boss_suicune',mobs:[{s:1,n:'Suicune',hp:82.7,mhp:150,extra:'private'}],nick:'private',token:'secret'});
  socket.emit('message',{t:'estado',estado:{noCentro:true,boss:{auto:false},email:'private'}});
  socket.emit('message',{t:'batalha',ev:[{k:'bossMorto',key:'suicune',drops:[{itemId:70011,qtd:2,token:'secret'}]}]});
  const result = p.__pioBossDiagnosticStop();
  assert.equal(result.events.length,4);
  const field = result.events.find(event => event.packet.t === 'campo.init').packet;
  assert.deepEqual(JSON.parse(JSON.stringify(field.mobs)), [{s:1,n:'Suicune',hp:82.7,mhp:150}]);
  assert.match(JSON.stringify(result), /70011/);
  const serialized = JSON.stringify(result);
  assert.ok(serialized.includes('centro.ir'));
  assert.ok(serialized.includes('noCentro'));
  assert.ok(!serialized.includes('secret'));
  assert.ok(!serialized.includes('private'));
  assert.throws(() => p.__pioBossDiagnosticStop());
});

test('telemetria preserva HP do mob do boss e descarta campos privados', async () => {
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.listeners = {}; }
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    send() {}
    emit(name, data) {
      for (const listener of this.listeners[name] || []) listener({ data: JSON.stringify(data), stopImmediatePropagation() {} });
    }
  }
  const timers = [];
  const batches = [];
  const p = {
    WebSocket: Socket, location: {href:'https://pokeidle.io/'},
    __TAURI_INTERNALS__: {invoke: async (_command, args) => batches.push(args.events)},
    crypto: {randomUUID:()=> 'test'}, setInterval:()=>0,
    setTimeout: callback => { timers.push(callback); return timers.length; },
    performance:{now:()=>0}, URL, queueMicrotask
  };
  p.window=p; p.top=p;
  vm.runInNewContext(fs.readFileSync('rust-migration/src-tauri/src/gameplay_bridge.js','utf8'),p);
  const socket = new p.WebSocket('wss://pokeidle.io/ws');
  socket.emit('open', {});
  socket.emit('message', {t:'campo.init', mobs:[
    {s:7,n:'Suicune',hp:300,mhp:600,x:false,token:'private'}
  ]});
  timers.shift()();
  await new Promise(resolve => setImmediate(resolve));
  const field = batches.flat().find(event => event.t === 'campo.init');
  assert.equal(field.data.mobs[0].s, 7);
  assert.equal(field.data.mobs[0].hp, 300);
  assert.equal(field.data.mobs[0].mhp, 600);
  assert.equal(field.data.mobs[0].n, 'Suicune');
  assert.equal(JSON.stringify(field).includes('private'), false);
});
