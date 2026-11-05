'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,session,BrowserWindow}=require('electron');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'pio-twitch-points-')));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const {createTwitchPoints}=require('../src/main/twitch-points');
  let balance=350, blocked=false, mismatch=false, count=0;
  const sent=[];
  for(let i=0;i<4;i++){
    const ses=session.fromPartition('persist:conta'+(i+1));
    await ses.cookies.set({url:'https://www.twitch.tv',name:'auth-token',value:'fixture-'+i});
    ses.protocol.handle('https',async request=>{
      const url=new URL(request.url);count++;
      if(url.hostname==='gql.twitch.tv'){
        assert.equal(request.headers.get('Authorization'),'OAuth fixture-'+i);
        if(blocked)return new Response('',{status:403});
        const payload=await request.json();
        if(payload.query?.includes('currentUser'))return Response.json({data:{currentUser:{id:String(i+1),login:mismatch?'wrong':'viewer'+i}}});
        if(payload.query?.includes('stream'))return Response.json({data:{user:{id:'channel-123',stream:{id:'broadcast-456'}}}});
        assert.ok(payload.query.includes('communityPointsSettings'));
        assert.equal(payload.variables.login,'partner'+i);
        return Response.json({data:{user:{id:'123',channel:{self:{communityPoints:{balance}},communityPointsSettings:{customRewards:[{
          id:'12345678-1234-1234-1234-123456789abc',title:'+15% XP PokeIdle',prompt:'',cost:300,
          isEnabled:true,isPaused:false,isInStock:true,isUserInputRequired:false,pricingType:'POINTS',cooldownExpiresAt:null
        }]}}}}});
      }
      assert.equal(request.headers.get('Authorization'),null,'OAuth must never reach analytics or configuration hosts');
      if(url.hostname==='www.twitch.tv')return new Response('<script src="https://assets.twitch.tv/config/settings.fixture.js"></script>');
      if(url.hostname==='assets.twitch.tv')return new Response('{"spade_url":"https://spade.twitch.tv/track"}');
      assert.equal(url.hostname,'spade.twitch.tv');
      const form=new URLSearchParams(await request.text());
      sent.push(JSON.parse(Buffer.from(form.get('data'),'base64').toString('utf8')));
      return new Response(null,{status:204});
    });
  }
  const manager=createTwitchPoints({prepareSession:async()=>{},getProxy:()=>null,onChange:()=>{}});
  const config={masterEnabled:true,accounts:Array.from({length:4},(_,i)=>({username:'viewer'+i,enabled:true}))};
  manager.configure(config);
  manager.setChannels(Array.from({length:4},(_,i)=>['partner'+i]));
  manager.syncLives(['partner0','partner1','partner2','partner3']);
  for(let i=0;i<4;i++)await manager.refresh(i,true);
  let result=manager.getStatus();
  assert.ok(result.accounts.every((a,i)=>a.status==='authenticated'&&a.balances['partner'+i].points===350));
  assert.ok(result.accounts.every((a,i)=>a.balances['partner'+i].catalogStatus==='verified'&&a.balances['partner'+i].rewards[0].available===true));
  assert.equal(sent.length,4);
  assert.equal(sent[0][0].properties.broadcast_id,'broadcast-456');
  assert.equal(sent[0][0].properties.channel_id,'channel-123');
  assert.equal(result.accounts[0].attempts.partner0.status,'sent');
  assert.equal(result.accounts[0].balances.partner0.earnedPoints,0,'Successful heartbeat does not prove earned points');
  assert.equal(BrowserWindow.getAllWindows().length,0,'Background mode never creates a player');
  assert.ok(!JSON.stringify(result).includes('fixture-'));
  const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
  try{
    clock+=6000;balance=400;await manager.refresh(0,true);
    assert.equal(manager.getStatus().accounts[0].balances.partner0.earnedPoints,50);
    clock+=6000;blocked=true;await manager.refresh(0,true);
    assert.equal(manager.getStatus().accounts[0].status,'blocked');
    assert.equal(manager.getStatus().accounts[0].balances.partner0.status,'stale');
    blocked=false;mismatch=true;clock+=6000;
    const before=sent.length;await manager.refresh(0,true);
    assert.equal(manager.getStatus().accounts[0].status,'account_mismatch');
    assert.equal(sent.length,before,'Wrong identity cannot submit watch events');
    mismatch=false;manager.configure({...config,masterEnabled:false});
    await manager.refresh(0,true);
    assert.equal(sent.length,before,'Manual balance query while disabled cannot submit watch events');
    await assert.rejects(manager.open(0,'../bad'));
    await assert.rejects(manager.refresh(4,true));
  }finally{Date.now=realNow;manager.dispose();}
  const {twitchChatManager:store}=require('../src/domain/twitch-chat-service');
  assert.equal(store.saveCreds({masterEnabled:true,autoClaim:true,autoClaimProtocol:1,claimPriority:'exp',accounts:[
    {username:'viewer0',enabled:true,claimPriority:'catch',gameLinked:true,linkedUsername:'viewer0'},
    {username:'viewer1',enabled:true,claimPriority:'lure',gameLinked:true,linkedUsername:'viewer1'}
  ]}),true);
  const saved=store.loadCreds();
  assert.equal(saved.autoClaim,true);assert.equal(saved.autoClaimProtocol,1);
  assert.equal(saved.accounts[0].claimPriority,'catch');assert.equal(saved.accounts[1].claimPriority,'lure');
  assert.equal(saved.accounts[0].gameLinked,true);assert.equal(saved.accounts[0].linkedUsername,'viewer0');
  assert.equal(saved.accounts.length,4);
  assert.ok(store.accounts.every(account=>account.ws===null),'Persistence never reconnects legacy IRC');
  store.stopAll();
  console.log('PASS: Twitch real Electron transport; four isolated sessions; GQL balance/identity; observed increases; blocked and mismatch states; headless attempts with no player;',count,'local requests');
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
