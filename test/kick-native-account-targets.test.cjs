const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('four accounts retain twelve distinct live targets each',async()=>{
 const html=fs.readFileSync('rust-migration/ui/index.html','utf8');
 const start=html.indexOf('async function handleKickGameTelemetry('),end=html.indexOf('window.handleKickGameTelemetry =',start);
 const calls=[];
 const context={kickConfigReady:true,kickCachedGameData:[],kickBonusConfig:{accounts:Array.from({length:4},()=>({linkedUsername:''}))},kickChannelsFromSnapshot:k=>k?.oficiais||[],kickBonusOverlay:null,window:{pokeAPI:{kickSetPointChannels:channels=>{calls.push({type:'points',channels});return Promise.resolve()},kickSyncLives:lives=>{calls.push({type:'lives',lives});return Promise.resolve()}}}};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);
 for(let account=0;account<4;account++)await context.handleKickGameTelemetry(account,{oficiais:[...Array.from({length:12},(_,i)=>({login:`account${account}channel${i}`,aoVivo:true,ativo:true})),{login:`offline${account}`,aoVivo:false,ativo:true},{login:`disabled${account}`,aoVivo:true,ativo:false}]});
 const lives=calls.filter(c=>c.type==='lives').at(-1).lives;
 assert.equal(lives.length,4);assert.equal(new Set(lives.flat()).size,48);
 for(let account=0;account<4;account++){assert.equal(lives[account].length,12);assert.ok(lives[account].every(slug=>slug.startsWith(`account${account}channel`)));}
 const points=calls.filter(c=>c.type==='points').at(-1).channels;
 for(let account=0;account<4;account++)assert.ok(points[account].includes(`offline${account}`));
});

for (const file of ['index.html', 'rust-migration/ui/index.html']) {
  test(`${file}: Kick only includes game-authorized partners; history cannot add accounts`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('function kickChannelsFromSnapshot(');
    const end = html.indexOf('async function handleKickGameTelemetry', start) !== -1
      ? html.indexOf('async function handleKickGameTelemetry', start)
      : html.indexOf('function handleKickGameTelemetry', start);
    assert.ok(start > 0 && end > start);
    const context = vm.createContext({});
    vm.runInContext(html.slice(start, end), context);

    // Empty input returns empty array
    assert.equal(context.kickChannelsFromSnapshot(null).length, 0);

    // Historical points, online telemetry and an old hardcoded list cannot add partners.
    const snapshot = {
      pontosPorCanal: {
        souonailo: 1200,
        custom_offline_streamer: 550
      },
      lives: [
        { login: 'biscoitao', viewers: 42 },
        { login: 'not_partner', viewers: 100 }
      ],
      oficiais: [
        { login: 'biscoitao', aoVivo: true, ativo: true },
        { login: 'souonailo', aoVivo: false, ativo: true },
        { login: 'matta', aoVivo: false, ativo: true },
        { login: 'missing_authorization', aoVivo: true },
        { login: 'disabled_streamer', aoVivo: true, ativo: false }
      ],
      offline: [
        { login: 'matta', aoVivo: false, ativo: true }
      ]
    };

    const channels = context.kickChannelsFromSnapshot(snapshot);
    const byLogin = new Map(channels.map(c => [c.login, c]));

    assert.equal(channels.length, 5);
    for (const partner of ['biscoitao','souonailo','matta']) assert.ok(byLogin.has(partner));
    for (const outsider of ['custom_offline_streamer','not_partner','surskity']) {
      assert.ok(!byLogin.has(outsider), `${outsider} must not be queried as a partner`);
    }
    assert.equal(byLogin.get('disabled_streamer').ativo, false);
    assert.equal(byLogin.get('missing_authorization').ativo, false);

    // Live streamer must have aoVivo: true
    assert.equal(byLogin.get('biscoitao').aoVivo, true);
    assert.equal(byLogin.get('biscoitao').espectadores, 42);

    // Offline partner must have aoVivo: false
    assert.equal(byLogin.get('souonailo').aoVivo, false);

    // Separation of concerns:
    // 1. Points query includes offline authorized partners.
    const pointLogins = channels.filter(c => c.ativo).map(c => c.login);
    assert.ok(!pointLogins.includes('custom_offline_streamer'));
    assert.ok(!pointLogins.includes('disabled_streamer'));
    assert.ok(!pointLogins.includes('missing_authorization'));
    assert.ok(pointLogins.includes('souonailo'), 'offline partner must be queried for balance/redeem');
    assert.ok(pointLogins.includes('biscoitao'));

    // 2. Live websocket channels: only live authorized partners.
    const liveLogins = channels.filter(c => c.aoVivo === true && c.ativo === true).map(c => c.login);
    assert.ok(liveLogins.includes('biscoitao'));
    assert.ok(!liveLogins.includes('custom_offline_streamer'), 'offline channel must not connect to live websocket');
    assert.ok(!liveLogins.includes('souonailo'), 'offline partner must not connect to live websocket');
    assert.ok(!liveLogins.includes('disabled_streamer'), 'disabled channel must not connect to live websocket');
  });
}
