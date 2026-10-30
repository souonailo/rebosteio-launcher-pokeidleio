// Isolated native API fixture. Never opens a game connection or reads real accounts.
require('./tauri-preload.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const vm = require('node:vm');
const visualStorage = new Map();
window.__sniperVisualSet = data => Object.entries(data).forEach(([key, value]) => visualStorage.set('pio-auto-sniper-v1:' + key, JSON.stringify(value)));
window.__sniperVisualGet = key => JSON.parse(visualStorage.get('pio-auto-sniper-v1:' + key) || 'null');
const visualWindow = {
  postMessage() {},
  PIOSniperStorage: {
    get: async keys => Object.fromEntries(keys.map(key => [key, window.__sniperVisualGet(key)])),
    set: async data => window.__sniperVisualSet(data)
  }
};
const visualContext = vm.createContext({window: visualWindow, console, localStorage: {
  getItem: key => visualStorage.get(key) ?? null,
  setItem: (key, value) => visualStorage.set(key, String(value))
}});
window.__evalSniperVisual = script => vm.runInContext(script, visualContext, {timeout: 1000});
window.__sniperState = {version: 1, accounts: Array.from({length: 4}, (_, index) => ({
  index, configured: false, enabled: false, rules: [], config: {}, logs: []
}))};
const baseInvoke = window.__TAURI__.core.invoke;
window.__TAURI__.core.invoke = async (name, args = {}) => {
  if (!name.startsWith('sniper_')) return baseInvoke(name, args);
  window.__nativeCalls.push({name, args: clone(args)});
  if (window.__sniperFailure === name) throw new Error('Falha simulada de persistência');
  if (name === 'sniper_save') {
    for (const index of args.indices) {
      const account = window.__sniperState.accounts[index];
      const previous = new Map(account.rules.map(rule => [rule.id, rule.totalBought || 0]));
      Object.assign(account, clone(args.settings), {configured: true});
      account.rules.forEach(rule => { rule.totalBought = previous.get(rule.id) || 0; });
    }
  }
  if (name === 'sniper_clear_history') window.__sniperState.accounts[args.index].logs = [];
  if (name === 'sniper_ingest') {
    const account = window.__sniperState.accounts[args.index];
    const seen = new Set(account.logs.map(log => log.id));
    account.logs = [...(args.logs || []).filter(log => !seen.has(log.id)), ...account.logs].slice(0, 500);
    for (const progress of args.progress || []) {
      const rule = account.rules.find(rule => rule.id === progress.id);
      if (rule) rule.totalBought = Math.max(rule.totalBought || 0, progress.totalBought);
    }
  }
  return clone(window.__sniperState);
};
