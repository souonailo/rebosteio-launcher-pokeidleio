const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('saved Twitch credentials reconnect four chats independently of points; stop does not reconnect', () => {
  const sockets = [], timers = [];
  class Socket {
    static CONNECTING = 0; static OPEN = 1;
    constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(value); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const saved = { masterEnabled: true, accounts: Array.from({length:4}, (_, i) => ({username:'viewer'+i,token:'saved-'+i,enabled:true})) };
  const context = { module: {exports:{}}, Buffer, WebSocket: Socket, setTimeout: fn => {timers.push(fn);return timers.length;}, clearTimeout() {},
    require: name => name === 'fs' ? {existsSync:()=>true,readFileSync:()=>Buffer.from(JSON.stringify(saved))} : name === 'electron' ? {app:{getPath:()=>'/fixture'},safeStorage:{isEncryptionAvailable:()=>false}} : require(name) };
  vm.runInNewContext(fs.readFileSync('src/domain/twitch-chat-service.js','utf8'), context);
  const manager = context.module.exports.twitchChatManager;
  manager.loadCreds();
  assert.equal(sockets.length,4);
  sockets.forEach((socket,i) => {
    socket.readyState=1; socket.onopen();
    assert.ok(socket.sent.includes('PASS oauth:saved-'+i));
    socket.onmessage({data:':wrong PRIVMSG #channel :GLHF\r\n'});
    assert.equal(manager.getStatus().accounts[i].status,'connecting');
    socket.onmessage({data:':tmi.twitch.tv 001 viewer'+i+' :Welcome\r\n'});
    assert.equal(manager.getStatus().accounts[i].status,'connected');
  });
  manager.syncLives(['partner']);
  assert.ok(sockets.every(socket=>socket.sent.includes('JOIN #partner')));
  assert.ok(!JSON.stringify(manager.getStatus()).includes('saved-'));
  manager.stopAll();
  assert.equal(timers.length,0);
  assert.ok(manager.getStatus().accounts.every(a=>a.status==='disconnected'));
});
