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
  test(`${file}: kickChannelsFromSnapshot merges official partners, accumulated points and telemetry`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('const KICK_OFFICIAL_PARTNERS =');
    const end = html.indexOf('async function handleKickGameTelemetry', start) !== -1
      ? html.indexOf('async function handleKickGameTelemetry', start)
      : html.indexOf('function handleKickGameTelemetry', start);
    assert.ok(start > 0 && end > start);
    const context = vm.createContext({});
    vm.runInContext(html.slice(start, end), context);

    // Empty input returns empty array
    assert.equal(context.kickChannelsFromSnapshot(null).length, 0);

    // Snapshot with points accumulated on offline streamer and one live streamer
    const snapshot = {
      pontosPorCanal: {
        souonailo: 1200,
        custom_offline_streamer: 550
      },
      lives: [
        { login: 'biscoitao', viewers: 42 }
      ],
      oficiais: [
        { login: 'biscoitao', aoVivo: true, ativo: true },
        { login: 'souonailo', aoVivo: false, ativo: true },
        { login: 'disabled_streamer', aoVivo: true, ativo: false }
      ],
      offline: [
        { login: 'matta', aoVivo: false, ativo: true }
      ]
    };

    const channels = context.kickChannelsFromSnapshot(snapshot);
    const byLogin = new Map(channels.map(c => [c.login, c]));

    const expectedPartners = [
      'biscoitao', 'surskity', 'clovaobengalol', 'luccatv', 'matta',
      'souonailo', 'pokeidle', 'faasii', 'febatista', 'fiaspogames', 'lukao', 'vitor_p'
    ];
    for (const partner of expectedPartners) {
      assert.ok(byLogin.has(partner), `missing partner: ${partner}`);
    }

    // Custom streamer with accumulated points must be present even when offline
    assert.ok(byLogin.has('custom_offline_streamer'), 'custom offline streamer with points must be present');
    assert.equal(byLogin.get('custom_offline_streamer').aoVivo, false);
    assert.equal(byLogin.get('custom_offline_streamer').ativo, true);

    // Live streamer must have aoVivo: true
    assert.equal(byLogin.get('biscoitao').aoVivo, true);
    assert.equal(byLogin.get('biscoitao').espectadores, 42);

    // Offline partner must have aoVivo: false
    assert.equal(byLogin.get('souonailo').aoVivo, false);

    // Disabled streamer must have ativo: false
    assert.equal(byLogin.get('disabled_streamer').ativo, false);

    // Separation of concerns:
    // 1. Points query channels: all candidate channels (online + offline + custom points channels)
    const pointLogins = channels.map(c => c.login);
    assert.ok(pointLogins.includes('custom_offline_streamer'), 'offline channel with points must be queried for balance/redeem');
    assert.ok(pointLogins.includes('souonailo'), 'offline partner must be queried for balance/redeem');
    assert.ok(pointLogins.includes('biscoitao'));

    // 2. Live websocket channels: strictly aoVivo === true && ativo !== false
    const liveLogins = channels.filter(c => c.aoVivo === true && c.ativo !== false).map(c => c.login);
    assert.ok(liveLogins.includes('biscoitao'));
    assert.ok(!liveLogins.includes('custom_offline_streamer'), 'offline channel must not connect to live websocket');
    assert.ok(!liveLogins.includes('souonailo'), 'offline partner must not connect to live websocket');
    assert.ok(!liveLogins.includes('disabled_streamer'), 'disabled channel must not connect to live websocket');
  });
}
