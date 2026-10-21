const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));let origin,server,vite,prisma;
(async()=>{

 const db=new URL(process.env.DATABASE_URL||'http://invalid').pathname.slice(1);
 if(!db.startsWith('spendsense_goals_test_ocr_hardening_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('Isolated OCR hardening database required');
 prisma=require('../src/lib/prisma.ts').prisma;
 const app=require('../src/index.ts').app;
 const jwt=require('jsonwebtoken'),crypto=require('crypto'),net=require('net');
 const users=await Promise.all(['A','B'].map(label=>prisma.user.create({data:{email:crypto.randomUUID()+'@example.invalid',passwordHash:'synthetic-unused',setupCompletedAt:new Date(),profile:{create:{displayName:'OCR Test '+label}}}})));
 const tokens=users.map(u=>jwt.sign({userId:u.id,email:u.email,authVersion:0},process.env.JWT_SECRET));
 const category=await prisma.category.create({data:{name:'OCR Hardening '+crypto.randomUUID(),type:'expense'}});
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const apiOrigin='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(apiOrigin+'/health')).status,200);
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const frontPort=reservation.address().port;await new Promise(r=>reservation.close(r));
 origin='http://127.0.0.1:'+frontPort;
 vite=cp.spawn(process.execPath,[path.resolve(__dirname,'../../frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(frontPort),'--strictPort'],{cwd:path.resolve(__dirname,'../../frontend'),env:{...process.env,VITE_API_URL:apiOrigin},windowsHide:true,stdio:'ignore'});
 let ready=false;for(let n=0;n<200;n++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await delay(100);}if(!ready)throw Error('Isolated frontend did not start');
 console.log('Real acceptance uses isolated frontend/backend; database guard passed');

 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};

 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});


 function fixture(token){
  if(!sessionStorage.getItem('ocr-real-started')){localStorage.setItem('spendsense_token',token);sessionStorage.setItem('ocr-real-started','1');}
  window.__documentId=crypto.randomUUID();window.__alerts=[];window.__confirmResult=true;
  window.alert=m=>window.__alerts.push(m);window.confirm=m=>{window.__lastConfirmation=m;return window.__confirmResult;};
 }
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')('+JSON.stringify(tokens[0])+')'});
 const network=[],posts=[];let interceptError=null,timeoutSent=false,committedBeforeTimeout=false;
 socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.method==='Network.requestWillBeSent')network.push(msg.params.request.url);
  if(msg.method==='Fetch.requestPaused'){
   const e=msg.params;
   (async()=>{
    if(e.request.method!=='POST'){await send('Fetch.continueRequest',{requestId:e.requestId});return;}
    const key=Object.entries(e.request.headers).find(([k])=>k.toLowerCase()==='idempotency-key')?.[1];
    posts.push({key,body:e.request.postData,status:e.responseStatusCode});
    if(!timeoutSent&&e.responseStatusCode===201){
     timeoutSent=true;assert.equal(await prisma.transaction.count({where:{userId:users[0].id}}),1);
     const receipt=await prisma.transactionCreateRequest.findUnique({where:{userId_idempotencyKey:{userId:users[0].id,idempotencyKey:key}}});assert.ok(receipt);
     committedBeforeTimeout=true;await send('Fetch.failRequest',{requestId:e.requestId,errorReason:'TimedOut'});
    }else await send('Fetch.continueRequest',{requestId:e.requestId});
   })().catch(async error=>{interceptError=error;await send('Fetch.failRequest',{requestId:e.requestId,errorReason:'Failed'}).catch(()=>{});});
  }
 });
 await send('Network.enable');
 await send('Fetch.enable',{patterns:[{urlPattern:apiOrigin+'/transactions',requestStage:'Response'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 const readyForm=()=>waitFor("document.querySelector('.save-button')&&!document.querySelector('.save-button').disabled");
 await send('Page.navigate',{url:origin+'/transactions/add'});await readyForm();
 assert.equal(network.filter(u=>u.includes('/ocr/')||u.includes('tesseract')).length,0,'No OCR engine/assets on initial page load');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.camera-upload')).display"),'flex');
 assert.equal(await evaluate("document.querySelector('.camera-upload input').getAttribute('capture')"),'environment');
 async function chooseImage(){
  const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1500,600);ctx.fillStyle='black';ctx.font='48px Arial';
  ['Date 2024-02-29','Time 12:03','Amount 42.70','Recipient: RELOAD TEST'].forEach((s,i)=>ctx.fillText(s,40,80+i*115));
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));const dt=new DataTransfer();dt.items.add(new File([blob],'synthetic-camera.jpg',{type:'image/jpeg'}));const e=document.querySelector('.camera-upload input');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}));
 }
 await evaluate('('+chooseImage.toString()+')()');
 for(let n=0;n<1200;n++){if(await evaluate("document.querySelector('[data-ocr-complete]')!==null"))break;if(n===1199)throw Error('Real OCR timed out');await delay(100);}
 assert.equal(posts.length,0);assert.equal(await prisma.transaction.count({where:{userId:users[0].id}}),0);
 assert.ok(network.some(u=>u.includes('/ocr/worker.min.js')));
 // Clear OCR fields now populate directly; only final save sends a request.
 const fill=async(selector,value)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await fill('input[inputmode=decimal]','00042.7');
 await evaluate("document.querySelector('input[value="+JSON.stringify(category.id)+"]').click()");
 await evaluate("document.querySelector('.save-button').click()");
 await waitFor("document.querySelector('.pending-transaction')&&!document.querySelector('.save-button').disabled");
 if(interceptError)throw interceptError;
 assert.equal(committedBeforeTimeout,true);assert.equal(posts.length,1);
 const original={...posts[0]};assert.equal(JSON.parse(original.body).amount,'42.70');assert.equal(JSON.parse(original.body).transactionTimeConfirmed,false);
 const stored=await evaluate("JSON.parse(sessionStorage.getItem('spendsense.pending-transaction.v1'))");
 assert.equal(stored.key,original.key);assert.equal(stored.body,original.body);
 assert.deepEqual(Object.keys(stored).sort(),['body','createdAt','key','owner','version']);
 const reload=async()=>{
  const old=await evaluate('window.__documentId');await send('Page.reload',{ignoreCache:true});
  await waitFor("window.__documentId&&window.__documentId!=="+JSON.stringify(old)+"&&document.querySelector('.save-button')&&!document.querySelector('.save-button').disabled");
 };
 await reload();
 assert.equal(posts.length,1,'Reload never auto-submits');
 assert.equal(await evaluate("document.querySelector('.pending-transaction h2')!==null"),true);
 assert.equal(await evaluate("document.querySelector('.transaction-draft').disabled"),true);
 assert.equal(await evaluate("document.querySelector('.receipt-preview img')===null"),true,'Image was not persisted');
 assert.equal(await prisma.transaction.count({where:{userId:users[0].id}}),1);
 await fill('input[inputmode=decimal]','999.99'); // Even a synthetic attempt to mutate disabled inputs cannot alter the stored request.
 await evaluate("document.querySelector('.save-button').focus()");
 assert.equal(await evaluate("document.activeElement.classList.contains('save-button')"),true);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await waitFor("!sessionStorage.getItem('spendsense.pending-transaction.v1')&&document.querySelector('input[inputmode=decimal]').value===''");
 assert.equal(posts.length,2);assert.equal(posts[1].key,original.key);assert.equal(posts[1].body,original.body);
 assert.equal(await prisma.transaction.count({where:{userId:users[0].id}}),1);
 const row=await prisma.transaction.findFirstOrThrow({where:{userId:users[0].id}});
 assert.equal(row.amount.toFixed(2),'42.70');assert.equal(row.transactionTimeConfirmed,false);assert.equal(row.transactionDate.toISOString().slice(0,10),'2024-02-29');
 await reload();assert.equal(posts.length,2);assert.equal(await evaluate("document.querySelector('.pending-transaction')===null"),true);
 console.log('PASS real OCR + API/DB: commit -> network timeout -> reload -> explicit retry, byte-identical body/key, exactly 1 Transaction');

 async function putPending(request){
  const mod=await import('/src/lib/pendingTransaction.ts');
  await mod.storePendingTransaction(localStorage.getItem('spendsense_token'),request,()=>true);
 }
 const queue=async request=>evaluate('('+putPending.toString()+')('+JSON.stringify(request)+')');
 // Deliberately simulate a stale/tampered client key to exercise the existing real 409 contract.
 const conflict={key:original.key,body:original.body.replace('"42.70"','"42.71"'),createdAt:new Date().toISOString()};
 await queue(conflict);await reload();await evaluate("document.querySelector('.save-button').click()");
 await waitFor("!sessionStorage.getItem('spendsense.pending-transaction.v1')&&!document.querySelector('.save-button').disabled");
 assert.equal(posts.at(-1).status,409);assert.equal(await prisma.transaction.count({where:{userId:users[0].id}}),1);
 const badBody=JSON.stringify({...JSON.parse(original.body),categoryId:crypto.randomUUID()});
 await queue({key:crypto.randomUUID(),body:badBody,createdAt:new Date().toISOString()});await reload();await evaluate("document.querySelector('.save-button').click()");
 await waitFor("!sessionStorage.getItem('spendsense.pending-transaction.v1')&&!document.querySelector('.save-button').disabled");
 assert.equal(posts.at(-1).status,404);
 console.log('PASS real API definitive 409/404 clear journal without a new Transaction');

 const pendingFixture={key:crypto.randomUUID(),body:original.body,createdAt:new Date().toISOString()};
 await queue(pendingFixture);await reload();
 await evaluate("window.__confirmResult=false;document.querySelector('.pending-transaction button').click()");
 assert.ok(await evaluate("sessionStorage.getItem('spendsense.pending-transaction.v1')"));
 await evaluate("window.__confirmResult=true;document.querySelector('.pending-transaction button').click()");
 assert.equal(await evaluate("sessionStorage.getItem('spendsense.pending-transaction.v1')"),null);
 assert.ok((await evaluate("window.__lastConfirmation")).includes('ไม่ยกเลิกธุรกรรม'));
 assert.equal(await prisma.transaction.count({where:{userId:users[0].id}}),1);
 assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
 console.log('PASS cancel warns that server writes are not reversed; keyboard/mobile has no overflow');

 await queue({...pendingFixture,key:crypto.randomUUID()});
 await send('Page.navigate',{url:origin+'/settings'});
 await waitFor("location.pathname==='/settings'&&document.readyState==='complete'");
 await evaluate("(async()=>{const auth=await import('/src/auth.ts');auth.removeToken();})()");
 assert.equal(await evaluate("sessionStorage.getItem('spendsense.pending-transaction.v1')"),null);
 await evaluate("(async()=>{const auth=await import('/src/auth.ts');auth.saveToken("+JSON.stringify(tokens[0])+");})()");
 await send('Page.navigate',{url:origin+'/transactions/add'});await readyForm();
 await queue({...pendingFixture,key:crypto.randomUUID()});
 await evaluate("(async()=>{const auth=await import('/src/auth.ts');auth.saveToken("+JSON.stringify(tokens[1])+");})()");
 await readyForm();
 assert.equal(await evaluate("sessionStorage.getItem('spendsense.pending-transaction.v1')"),null);
 const foreign=await fetch(apiOrigin+'/transactions?limit=1',{headers:{Authorization:'Bearer '+tokens[1]}});assert.deepEqual(await foreign.json(),[]);
 assert.equal(await prisma.transaction.count({where:{userId:users[1].id}}),0);
 console.log('PASS logout away from form and account switch clear pending; second account sees no transactions');
 const external=network.filter(u=>/^https?:/.test(u)&&!u.startsWith(origin+'/')&&!u.startsWith(apiOrigin+'/'));
 assert.deepEqual(external,[],'No application/external OCR requests');
 if(interceptError)throw interceptError;
 await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(screenshotDir,'ocr-hardening-mobile.png'),Buffer.from(r.data,'base64')));
 console.log('PASS all requests limited to isolated frontend/backend; screenshots contain synthetic fixtures only');
 }finally{if(socket)socket.close();browser.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{
 if(vite)vite.kill();
 if(server)await new Promise(r=>server.close(r));
 if(prisma)await prisma.$disconnect();
});
