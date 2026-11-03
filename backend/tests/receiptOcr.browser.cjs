require('./browserGuard.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5187';
(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};

 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});

 function fixture(){
  localStorage.setItem('spendsense_token','ocr-account');
  const native=window.fetch.bind(window);window.__posts=[];window.__receipts={};window.__alerts=[];
  const NativeWorker=window.Worker;window.__workerStops=0;window.__workerStarts=0;window.__ocrProgress=[];window.__heldOcr=[];window.__holdOcr=false;window.Worker=class extends NativeWorker{constructor(url,options){if(new URL(url,location.href).origin!==location.origin)throw Error('External worker forbidden');super(url,options);window.__workerStarts++;this.addEventListener('message',e=>{if(e.data?.data?.status==='recognizing text')window.__ocrProgress.push(Math.round(e.data.data.progress*100));if(window.__holdOcr&&e.data?.action==='recognize'&&e.data?.status==='resolve'){e.stopImmediatePropagation();const data=e.data;window.__heldOcr.push(()=>this.dispatchEvent(new MessageEvent('message',{data})));return;}if(e.data?.data?.text)window.__lastOcrText=e.data.data.text;});}terminate(){window.__workerStops++;return super.terminate();}};
  window.alert=m=>window.__alerts.push(m);window.confirm=()=>true;
  window.fetch=async(url,options={})=>{
   const u=new URL(url,location.href);
   if(u.origin===location.origin)return native(url,options);
   if(u.origin!=='http://localhost:4000')throw Error('External request forbidden');
   const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
   if(u.pathname==='/categories')return json([{id:'expense-a',name:'อาหารและเครื่องดื่ม',type:'expense'}]);
   if(u.pathname==='/profile')return json({displayName:'OCR acceptance',email:'ocr@example.invalid',hasAvatar:false});
   if(u.pathname==='/notifications')return json({items:[],unreadCount:0});
   if(u.pathname.endsWith('/reconcile'))return json({});
   if(u.pathname==='/transactions'){
    const key=new Headers(options.headers).get('Idempotency-Key');const body=JSON.parse(options.body);
    window.__posts.push({key,body});window.__receipts[key]??={id:'created-'+Object.keys(window.__receipts).length,...body};
    if(window.__loseResponse){window.__loseResponse=false;throw Error('Simulated lost response after commit');}
    return json(window.__receipts[key],201);
   }
   throw Error('Unexpected API '+u.pathname);
  };
 }
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')()'});
 await send('Network.enable');const external=[];socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent'){const u=m.params.request.url;if(/^https?:/.test(u)&&!u.startsWith(origin)&&!u.startsWith('http://localhost:4000'))external.push(u);}});
 await send('Page.navigate',{url:origin+'/transactions/add'});
 await waitFor("document.querySelector('.receipt-actions input')!==null");



 // Private photographs are supplied at runtime and held only in memory.
 if(process.env.OCR_TEMPLATE_SAMPLE_PATHS){
  const paths=JSON.parse(process.env.OCR_TEMPLATE_SAMPLE_PATHS);assert.equal(paths.length,4);
  const expected=[{amount:null,transactionDate:null,transactionTime:'18:08',description:'7-Eleven'},
   {amount:null,transactionDate:'2014-03-05',transactionTime:'08:08',description:'7-Eleven'},
   {amount:'155.00',transactionDate:null,transactionTime:'16:12',description:'7-Eleven'},
   {amount:null,transactionDate:null,transactionTime:'18:03',description:null}];
  for(const [i,file] of paths.entries()){
   const encoded=fs.readFileSync(file).toString('base64'),started=Date.now();
   await evaluate("(()=>{const b=Uint8Array.from(atob("+JSON.stringify(encoded)+"),c=>c.charCodeAt(0));const d=new DataTransfer();d.items.add(new File([b],'private.jpg',{type:'image/jpeg'}));const e=document.querySelector('.receipt-actions input');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
   for(let n=0;n<1800;n++){if(await evaluate("document.querySelector('[data-ocr-complete]')!==null"))break;await delay(100);}
   const audit=await evaluate("(async()=>{const p=await import('/src/utils/receiptParser.ts');const d=document.querySelector('.date-picker-wrapper input').value.split('/');return {version:p.RECEIPT_PARSER_VERSION,final:{fields:{transactionDate:d.length===3?d[2]+'-'+d[1]+'-'+d[0]:null,transactionTime:document.querySelector('input[type=time]').value||null,amount:document.querySelector('input[inputmode=decimal]').value||null,description:document.querySelector('input[placeholder^=เช่น]').value||null}}};})()");
   assert.equal(audit.version,'seven-eleven-regions-v4');
   assert.deepEqual(audit.final.fields,expected[i]);
   assert.equal(await evaluate("window.__posts.length"),0);
    assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),expected[i].amount??'');
   assert.equal(await evaluate("window.__posts.length"),0);
   console.log('PASS private template image '+(i+1)+': raw/parser/UI agreement, safe fields, no POST; '+(Date.now()-started)+' ms');
   await send('Page.navigate',{url:origin+'/transactions/add'});await waitFor("document.querySelector('.receipt-actions input')!==null");
  }
 }else console.log('SKIP four private template images: set OCR_TEMPLATE_SAMPLE_PATHS');


 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 // Hold actual worker completion messages to exercise UI races deterministically.
 const fresh=async()=>{await send('Page.navigate',{url:origin+'/transactions/add'});await waitFor("document.querySelector('.receipt-actions input')!==null&&!document.querySelector('.save-button').disabled");};
 const makeUiImages=async()=>evaluate("(async()=>{window.__uiFiles=[];for(const amount of ['101.00','202.00']){const c=document.createElement('canvas');c.width=1400;c.height=700;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='48px Arial';['Date 2024-02-29','Time 12:03','Amount '+amount,'Merchant: EXAMPLE SHOP'].forEach((s,i)=>x.fillText(s,50,90+i*130));const b=await new Promise(r=>c.toBlob(r));window.__uiFiles.push(new File([b],'synthetic-'+amount+'.png',{type:'image/png'}));}window.__shownProgress=[];new MutationObserver(()=>{const p=document.querySelector('.preview-header progress');if(p?.hasAttribute('value'))window.__shownProgress.push(Number(p.value));}).observe(document.body,{subtree:true,attributes:true,childList:true});})()");
 const chooseUi=async(i)=>evaluate("(()=>{const d=new DataTransfer();d.items.add(window.__uiFiles["+i+"]);const e=document.querySelector('.receipt-actions input');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 const waitFinal=async()=>{for(let n=0;n<1200;n++){if(await evaluate("document.querySelector('[data-ocr-complete]')!==null"))return;await delay(100);}throw Error('OCR UI timed out');};
 const release=async()=>evaluate("(()=>{window.__holdOcr=false;const held=window.__heldOcr.splice(0);held.forEach(f=>f());})()");
 await fresh();await makeUiImages();await evaluate("window.__holdOcr=true");await chooseUi(0);
 for(let n=0;n<1200;n++){if(await evaluate("window.__heldOcr.length>0"))break;await delay(100);}
 assert.ok(await evaluate("window.__heldOcr.length>0"));
 assert.equal(await evaluate("document.querySelector('.preview-header .receipt-ocr progress')!==null"),true);
 assert.equal(await evaluate("document.querySelector('.left-column .receipt-ocr')===null"),true);
 assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('นำค่าที่อ่านได้ไปกรอก'))"),false);
 assert.equal(await evaluate("window.__shownProgress.length>0&&window.__shownProgress.every(v=>window.__ocrProgress.includes(v))"),true,'Every displayed percentage came from worker progress');
 assert.equal(await evaluate("document.querySelector('.receipt-ocr [role=status]').textContent"),'กำลังสแกน 100%');
 await evaluate("(()=>{for(const [selector,value]of [['input[inputmode=decimal]','77.77'],['input[type=time]','10:11'],['input[placeholder^=เช่น]','MANUAL SHOP'],['.date-picker-wrapper input','20/02/2024']]){const e=document.querySelector(selector);e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();}const p=document.querySelector('.field select');p.value='card';p.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await release();await waitFinal();
 assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'77.77');
 assert.equal(await evaluate("document.querySelector('input[type=time]').value"),'10:11');
 assert.equal(await evaluate("document.querySelector('.date-picker-wrapper input').value"),'20/02/2024');
 assert.equal(await evaluate("document.querySelector('.field select').value"),'card');
 assert.equal(await evaluate("document.querySelector('input[placeholder^=เช่น]').value"),'MANUAL SHOP');
 assert.equal(await evaluate("window.__posts.length"),0);
 await evaluate("(()=>{const e=document.querySelector('input[inputmode=decimal]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));const d=new DataTransfer();d.items.add(window.__uiFiles[0]);const input=document.querySelector('.receipt-actions input');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await waitFor("document.querySelector('[data-ocr-complete]')===null");await waitFinal();
 assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'','Explicit empty edit survives reselect');
 assert.equal(await evaluate("document.querySelector('input[type=time]').value"),'10:11');
 console.log('PASS reselect preserves explicit empty and edited fields');
 assert.equal(await evaluate("document.querySelector('.receipt-ocr details')===null&&document.querySelector('.receipt-ocr button')===null"),true);
 assert.equal(await evaluate("document.querySelector('.preview-header .success-badge').textContent"),'สแกนสำเร็จ');
 assert.equal(await evaluate("(()=>{const h=document.querySelector('.preview-header').getBoundingClientRect(),b=document.querySelector('.success-badge').getBoundingClientRect();return Math.abs(h.right-b.right)<2&&Math.abs(h.top-b.top)<2;})()"),true);
 console.log('PASS preview placement, real progress, all manually edited fields protected, no apply button/POST');

 await fresh();await makeUiImages();await evaluate("window.__holdOcr=true");await chooseUi(0);
 for(let n=0;n<1200;n++){if(await evaluate("window.__heldOcr.length>0"))break;await delay(100);}
 assert.ok(await evaluate("window.__heldOcr.length>0"));
 await evaluate("window.__holdOcr=false");await chooseUi(1);await release();await waitFinal();
 assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'202.00');
 assert.equal(await evaluate("document.querySelector('.detected-list').textContent.includes('202.00')"),true);
 assert.equal(await evaluate("document.querySelector('input[type=time]').value"),'12:03');
 assert.equal(await evaluate("document.querySelector('.receipt-ocr progress')"),null);
 assert.equal(await evaluate("document.querySelector('.preview-image')!==null"),true);
 await evaluate("document.querySelector('.preview-card').scrollIntoView({block:'start'})");
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'ocr-direct-fill-desktop.png'),Buffer.from(shot.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),true);
 await evaluate("document.querySelector('.preview-card').scrollIntoView({block:'start'})");
 const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'ocr-direct-fill-mobile.png'),Buffer.from(mobile.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 console.log('PASS image replacement rejects old result, direct fill updates summary, desktop/mobile preview');

 await fresh();await makeUiImages();await evaluate("window.__holdOcr=true");await chooseUi(0);
 for(let n=0;n<1200;n++){if(await evaluate("window.__heldOcr.length>0"))break;await delay(100);}
 assert.ok(await evaluate("window.__heldOcr.length>0"));
 await evaluate("localStorage.setItem('spendsense_token','different-user');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('.receipt-ocr')===null");await release();
 await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'');
 assert.equal(await evaluate("window.__posts.length"),0);
 console.log('PASS session switch during OCR rejects delayed result');
 await fresh();

 // Synthetic redacted document images exercise the actual OCR -> apply -> save flow.
 for(const kind of ['retail','bank']){
  await evaluate("(async()=>{const kind="+JSON.stringify(kind)+";const c=document.createElement('canvas');c.width=1700;c.height=1000;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='48px Tahoma';const lines=kind==='retail'?['CP ALL,7-Eleven','ใบเสร็จรับเงิน','05/10/65 18:08','ยอดรวม 100.00','ส่วนลด 31.00','ยอดสุทธิ 1 ชิ้น 69.00','เงินสด 100.00','เงินทอน 31.00']:['Bangkok Bank','Transaction successful','25 Mar 25, 13:13','From','EXAMPLE SENDER','To','EXAMPLE RECIPIENT','Amount 400,000.00 THB','Fee 0.00 THB'];lines.forEach((s,i)=>x.fillText(s,50,80+i*100));const blob=await new Promise(r=>c.toBlob(r,kind==='retail'?'image/webp':'image/png',1));const d=new DataTransfer();d.items.add(new File([blob],'synthetic.'+(kind==='retail'?'webp':'png'),{type:blob.type}));const e=document.querySelector('.receipt-actions input');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  for(let n=0;n<1200;n++){if(await evaluate("document.querySelector('[data-ocr-complete]')!==null"))break;await delay(100);}
  assert.equal(await evaluate("document.querySelector('.field select').value"),kind==='retail'?'cash':'transfer');
  assert.equal(await evaluate("document.querySelector('.field select').value"),kind==='retail'?'cash':'transfer','Clear suggestions populate the form');
  assert.equal(await evaluate("window.__posts.length"),0);
  assert.equal(await evaluate("document.querySelector('.field select').value"),kind==='retail'?'cash':'transfer');
  assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),kind==='retail'?'69.00':'400000.00');
  // Low-confidence OCR dates stay blank; simulate the user's explicit correction.
  if(kind==='retail'){
   const value=await evaluate("document.querySelector('.date-picker-wrapper input').value");
   if(!value)await evaluate("(()=>{const e=document.querySelector('.date-picker-wrapper input');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'05/10/2022');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur();})()");
  }
  // User can override the suggestion. Only final confirmation sends a transaction.
  await evaluate("(()=>{const s=document.querySelector('.field select');s.value='card';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('input[name=transaction-category]').click();})()");
  assert.equal(await evaluate("window.__posts.length"),0);
  await evaluate("document.querySelector('.footer-actions button:last-child').click()");
  await waitFor("window.__posts.length===1");
  const body=await evaluate("window.__posts[0].body");
  assert.equal(body.paymentMethod,'card');assert.equal(body.transactionTimeConfirmed,false);
  assert.equal(body.transactionDate,kind==='retail'?'2022-10-05':'2025-03-25');
  await send('Page.navigate',{url:origin+'/transactions/add'});
  await waitFor("document.querySelector('.receipt-actions input')!==null");
 }
 console.log('PASS synthetic WebP retail and PNG bank: cash/transfer suggestions, source-aware Buddhist date, direct fill without POST, user override persisted');
 if(process.env.OCR_RETAIL_SAMPLE_PATH){
  // Optional private local input: never copied, screenshotted or logged.
  const retail=fs.readFileSync(process.env.OCR_RETAIL_SAMPLE_PATH).toString('base64');
  const loaded=await evaluate("(async()=>{const p=await import('/src/utils/receiptParser.ts');return {version:p.RECEIPT_PARSER_VERSION,amount:p.parseReceipt('ยอดสุทธิ 1 ชิ้น 69.00').fields.amount};})()");
  assert.deepEqual(loaded,{version:'seven-eleven-regions-v4',amount:'69.00'});
  await evaluate("(()=>{const e=document.querySelector('input[inputmode=decimal]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'99.99');e.dispatchEvent(new Event('input',{bubbles:true}));const b=Uint8Array.from(atob("+JSON.stringify(retail)+"),c=>c.charCodeAt(0));const d=new DataTransfer();d.items.add(new File([b],'local-retail.jpg',{type:'image/jpeg'}));const input=document.querySelector('.receipt-actions input');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const waitRetail=async()=>{for(let n=0;n<1200;n++){if(await evaluate("document.querySelector('[data-ocr-complete]')!==null"))return;await delay(100);}throw Error('Real retail OCR timed out');};
  await waitRetail();
  const audit=await evaluate("(async()=>{const {readReceipt}=await import('/src/lib/receiptOcr.ts');const b=Uint8Array.from(atob("+JSON.stringify(retail)+"),c=>c.charCodeAt(0));return {final:await readReceipt(new File([b],'private.jpg',{type:'image/jpeg'}),()=>{}).promise,amount:document.querySelector('input[inputmode=decimal]').value,posts:window.__posts.length};})()");

  assert.equal(audit.final.fields.amount,null,'Unreadable label must never guess net amount');
  assert.equal(audit.final.fields.transactionTime,'18:08','Contrast fallback recovers explicit time on local photo');
  assert.equal(audit.final.fields.transactionDate,null,'Short numeric date remains unresolved');
  assert.equal(audit.amount,'99.99','OCR does not replace a manual draft');
  assert.equal(audit.posts,0);
  assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'99.99');
  await evaluate("(()=>{const e=document.querySelector('input[inputmode=decimal]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'77.77');e.dispatchEvent(new Event('input',{bubbles:true}));const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob("+JSON.stringify(retail)+"),c=>c.charCodeAt(0))],'private.jpg',{type:'image/jpeg'}));const input=document.querySelector('.receipt-actions input');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor("document.querySelector('[data-ocr-complete]')===null");
  await waitRetail();
  assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'77.77');

  assert.equal(await evaluate("window.__posts.length"),0);
  console.log('PASS local real retail image: loaded parser version, raw -> exact parser result -> blank OCR amount; manual draft retained; reread preserves manual edit; no POST');
  await send('Page.navigate',{url:origin+'/transactions/add'});
  await waitFor("document.querySelector('.receipt-actions input')!==null");
 }else console.log('SKIP private real retail image: set OCR_RETAIL_SAMPLE_PATH');
 if(process.env.OCR_SAMPLE_PATH){
 const b64=fs.readFileSync(process.env.OCR_SAMPLE_PATH).toString('base64');
 const sample=await evaluate("(async()=>{const b=Uint8Array.from(atob("+JSON.stringify(b64)+"),c=>c.charCodeAt(0));const {readReceipt}=await import('/src/lib/receiptOcr.ts');return readReceipt(new File([b],'sample.jpg',{type:'image/jpeg'}),()=>{}).promise;})()");
 console.log('Sample image parsed; checking expected fields (no raw OCR logged)');
 assert.equal(sample.fields.transactionDate,'2025-03-25');assert.equal(sample.fields.amount,'400000.00');assert.equal(sample.fields.transactionTime,'13:13');
 }

 async function templateVariants(){
  const {readReceipt}=await import('/src/lib/receiptOcr.ts');const results=[];
  for(const degraded of [false,true]){
   const c=document.createElement('canvas');c.width=1300;c.height=1500;const x=c.getContext('2d');
   x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.save();
   if(degraded){x.translate(20,0);x.rotate(.012);x.filter='blur(.5px)';}
   x.fillStyle='black';x.font='40px Arial';
   ['CP ALL,7-Eleven','Receipt','ITEM QTY PRICE','Notebook 1 155.00','Total (1) 155.00','Cash/Change 200.00 45.00','R#0000000001 09/04/59 16:12','Promotion','Total 999.00','Expires 25/04/59'].forEach((v,i)=>x.fillText(v,50,100+i*110));
   x.restore();const blob=await new Promise(r=>c.toBlob(r));results.push(await readReceipt(new File([blob],'synthetic.png',{type:'image/png'}),()=>{}).promise);
  }return results;
 }
 for(const result of await evaluate('('+templateVariants.toString()+')()')){
  assert.equal(result.fields.amount,'155.00');assert.equal(result.fields.description,'7-Eleven');assert.equal(result.suggestedPaymentMethod,'cash');
  assert.ok([null,'2016-04-09'].includes(result.fields.transactionDate));assert.ok([null,'16:12'].includes(result.fields.transactionTime));
 }
 console.log('PASS English CP ALL template, tilted/blurred image, Total quantity, footer promotion excluded');

 async function receiptLayouts(){
  const {readReceipt}=await import('/src/lib/receiptOcr.ts');
  const cases=[];
  for(const variant of ['english','bilingual','tilted-blur']){
   const c=document.createElement('canvas');c.width=1200;c.height=1500;const x=c.getContext('2d');
   x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.save();
   if(variant==='tilted-blur'){x.translate(25,5);x.rotate(0.012);x.filter='blur(0.5px)';}
   x.fillStyle='black';x.font='36px Tahoma';
   const lines=['EXAMPLE MARKET','Merchant: Example Market','Receipt # 1042','Date 2025-03-25 13:13','--------------------------------','ITEM             QTY       PRICE','Notebook          2         80.00','Pen               1         20.00','SUBTOTAL                    100.00','VAT                           7.00',variant==='bilingual'?'ยอดรวม 107.00':'TOTAL DUE $107.00','AMOUNT PAID                 200.00','CHANGE                       93.00','Thank you for your purchase'];
   lines.forEach((s,i)=>x.fillText(s,65,90+i*85));x.restore();
   const b=await new Promise(r=>c.toBlob(r,'image/png'));const passes=[];
   const result=await readReceipt(new File([b],variant+'.png',{type:'image/png'}),()=>{},(pass,text)=>passes.push({pass,text})).promise;
   cases.push({variant,result,passes});
  }
  return cases;
 }
 const layouts=await evaluate('('+receiptLayouts.toString()+')()');
 for(const {variant,result,passes}of layouts){
  assert.ok(passes.length,'Development diagnostics captured');
  const raw=passes[0].text;
  console.log('Synthetic '+variant+' raw OCR:',raw); // Synthetic fixture only, never production/user text.
  assert.match(raw,/107[.,]00/);
  assert.equal(result.fields.amount,'107.00');
  assert.equal(result.fields.transactionDate,'2025-03-25');
  assert.equal(result.fields.transactionTime,'13:13');
 }
 for(const asset of ['/ocr/worker.min.js','/ocr/lang/eng.traineddata.gz','/ocr/lang/tha.traineddata.gz']){
  const r=await fetch(origin+asset);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>1000);
 }
 console.log('PASS realistic English/bilingual/tilted-blur receipts; local English/Thai assets; engine and parser checked separately');


 await evaluate("(async()=>{const c=document.createElement('canvas');c.width=1400;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1400,600);x.fillStyle='black';x.font='48px Arial';['Merchant: Example Market','03/04/2025 13:13','TOTAL 107.00','BALANCE DUE 57.00'].forEach((s,i)=>x.fillText(s,40,80+i*120));const b=await new Promise(r=>c.toBlob(r,'image/png'));const d=new DataTransfer();d.items.add(new File([b],'ambiguous.png',{type:'image/png'}));const input=document.querySelector('.receipt-actions input');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()");
 for(let n=0;n<1200;n++){if(await evaluate("document.querySelector('[data-ocr-complete]')!==null"))break;await delay(100);}
 assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'');
 assert.equal(await evaluate("document.querySelector('.date-picker-wrapper input').value"),'');
 assert.equal(await evaluate("document.querySelector('.receipt-ocr select')"),null);
 assert.equal(await evaluate("window.__posts.length"),0);
 console.log('PASS ambiguous totals/date stay blank; no automatic POST');
  async function syntheticBankScreenshot(){
  const {readReceipt}=await import('/src/lib/receiptOcr.ts');const c=document.createElement('canvas');c.width=1200;c.height=1700;const x=c.getContext('2d');x.fillStyle='#243b43';x.fillRect(0,0,1200,1700);x.fillStyle='white';x.font='36px Tahoma';x.fillText('9:41',45,60);x.fillRect(30,170,1140,1300);x.fillStyle='black';x.font='44px Tahoma';
  ['K PLUS โอนเงินสำเร็จ','26 ม.ค. 65 05:10 น.','ผู้โอน: ตัวอย่าง ก','บัญชี xxx-x-xxxx-x','ผู้รับเงิน: ร้านตัวอย่าง','เลขที่รายการ: 1234567890123','จำนวน:','888.00 บาท','ค่าธรรมเนียม: 0.00 บาท'].forEach((s,i)=>x.fillText(s,65,270+i*120));
  x.fillStyle='white';x.fillText('ยอดเงินคงเหลือ: 83,888.00 บาท',50,1570);
  const b=await new Promise(r=>c.toBlob(r,'image/png'));return readReceipt(new File([b],'synthetic-bank.png',{type:'image/png'}),()=>{}).promise;
 }
 const bank=await evaluate('('+syntheticBankScreenshot.toString()+')()');
 assert.equal(bank.suggestedPaymentMethod,'transfer');assert.equal(bank.fields.amount,'888.00');assert.equal(bank.fields.transactionDate,'2022-01-26');assert.equal(bank.fields.transactionTime,'05:10');
 console.log('PASS synthetic Thai bank screenshot: short Buddhist year, phone clock ignored, balance/fee excluded');

 async function imageChecks(){
  const {validateReceipt,readReceipt}=await import('/src/lib/receiptOcr.ts');
  const c=document.createElement('canvas');c.width=1500;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='48px Arial';
  ['Date 2024-02-29','Time 12:03','Amount 123.45','Recipient: TEST SHOP'].forEach((s,i)=>x.fillText(s,50,90+i*115));
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));window.__image=new File([blob],'receipt.png',{type:'image/png'});
  const jpg=await new Promise(r=>c.toBlob(r,'image/jpeg'));await validateReceipt(new File([jpg],'valid.jpg',{type:'image/jpeg'}));
  const failures=[];
  const webp=await new Promise(r=>c.toBlob(r,'image/webp',1));await validateReceipt(new File([webp],'valid.webp',{type:'image/webp'}));
  for(const f of [new File([blob],'spoof.webp',{type:'image/webp'}),new File([new Uint8Array([82,73,70,70,24,0,0,0,87,69,66,80])],'corrupt.webp',{type:'image/webp'})]){try{await validateReceipt(f);failures.push(false);}catch{failures.push(true);}}
  const oversized=new Uint8Array(30);oversized.set([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88]);oversized[24]=255;oversized[25]=255;oversized[27]=255;oversized[28]=255;try{await validateReceipt(new File([oversized],'huge.webp',{type:'image/webp'}));failures.push(false);}catch{failures.push(true);}
  for(const f of [new File([await blob.arrayBuffer()],'fake.jpg',{type:'image/jpeg'}),new File([new Uint8Array([137,80,78,71,13,10,26,10])],'broken.png',{type:'image/png'}),new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'})]){
   try{await validateReceipt(f);failures.push(false);}catch{failures.push(true);}
  }
  const huge=new Uint8Array(32);huge.set([137,80,78,71,13,10,26,10]);const view=new DataView(huge.buffer);view.setUint32(16,10000);view.setUint32(20,10000);
  try{await validateReceipt(new File([huge],'pixels.png',{type:'image/png'}));failures.push(false);}catch{failures.push(true);}
  return {failures,parsed:await readReceipt(window.__image,()=>{}).promise};
 }
 const result=await evaluate('('+imageChecks.toString()+')()');
 assert.ok(result.failures.every(Boolean));assert.deepEqual(result.parsed.fields,{transactionDate:'2024-02-29',transactionTime:'12:03',amount:'123.45',description:'TEST SHOP'});
 console.log('PASS real local Tesseract OCR, MIME/signature/decode/size/pixel validation');

 async function thaiImageCheck(){
  const {readReceipt}=await import('/src/lib/receiptOcr.ts');
  const c=document.createElement('canvas');c.width=1700;c.height=700;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1700,700);x.fillStyle='black';x.font='56px Tahoma';
  ['วันที่ 29/02/2567','เวลา 12:03','จำนวนเงิน 123.45','ผู้รับเงิน: ร้านทดสอบ'].forEach((s,i)=>x.fillText(s,50,110+i*140));
  const b=await new Promise(r=>c.toBlob(r,'image/png'));return readReceipt(new File([b],'thai.png',{type:'image/png'}),()=>{}).promise;
 }
 const thai=await evaluate('('+thaiImageCheck.toString()+')()');
 assert.equal(thai.fields.transactionDate,'2024-02-29');assert.equal(thai.fields.transactionTime,'12:03');assert.equal(thai.fields.amount,'123.45');
 console.log('PASS real Thai synthetic slip date/time/amount; recipient:',thai.fields.description??'not found (manual entry)');

 await evaluate("(()=>{const d=new DataTransfer();d.items.add(window.__image);const e=document.querySelector('.receipt-actions input');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 const waitOcr=async()=>{for(let n=0;n<1200;n++){if(await evaluate("document.querySelector('[data-ocr-complete]')!==null"))return;await delay(100);}throw Error('OCR result timed out');};
 await evaluate("(()=>{const e=document.querySelector('input[inputmode=decimal]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'99.99');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await waitOcr();assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'99.99');assert.equal(await evaluate("window.__posts.length"),0);
 assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'99.99');
 assert.equal(await evaluate("document.querySelector('input[type=time]').value"),'12:03');
 assert.equal(await evaluate("document.body.textContent.includes('สแกนสำเร็จ')"),true);
 const fill=async(selector,value)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await fill('input[inputmode=decimal]','321.07');
 await evaluate("document.querySelector('input[name=transaction-category]').click()");
 await evaluate("window.__loseResponse=true;document.querySelector('.footer-actions button:last-child').click()");
 await waitFor("window.__posts.length===1&&!document.querySelector('.footer-actions button:last-child').disabled");
 assert.equal(await evaluate("window.__posts[0].body.amount"),'321.07');assert.equal(await evaluate("window.__posts[0].body.transactionTimeConfirmed"),false);
 await evaluate("document.querySelector('.footer-actions button:last-child').click()");
 await waitFor("window.__posts.length===2&&document.querySelector('.receipt-ocr')===null");
 assert.equal(await evaluate("window.__posts[0].key===window.__posts[1].key"),true);
 assert.equal(await evaluate("Object.keys(window.__receipts).length"),1);
 console.log('PASS no POST until confirmation; user edits retained; timeout replay uses same key');
 async function partialImage(){
  const c=document.createElement('canvas');c.width=500;c.height=150;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,500,150);x.fillStyle='black';x.font='40px Arial';x.fillText('Unreadable receipt',10,80);
  const b=await new Promise(r=>c.toBlob(r));const d=new DataTransfer();d.items.add(new File([b],'partial.png',{type:'image/png'}));const e=document.querySelector('.receipt-actions input');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));
 }
 await evaluate('('+partialImage.toString()+')()');await waitOcr();
 assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'');
 assert.equal(await evaluate("document.querySelector('.date-picker-wrapper input').value"),'');
 assert.equal(await evaluate("window.__posts.length"),2);
 await fill('input[inputmode=decimal]','0.08');await evaluate("document.querySelector('input[inputmode=decimal]').focus()");
 assert.equal(await evaluate("document.activeElement.getAttribute('inputmode')"),'decimal');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),true);
 await evaluate("localStorage.setItem('spendsense_token','second-account');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('.receipt-ocr')===null&&!document.querySelector('.save-button').disabled");assert.equal(await evaluate("document.querySelector('input[inputmode=decimal]').value"),'');

 const stops=await evaluate('window.__workerStops'),starts=await evaluate('window.__workerStarts');
 await evaluate("(()=>{const d=new DataTransfer();d.items.add(new File([window.__image],'cancel.png',{type:'image/png'}));const e=document.querySelector('.receipt-actions input');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await waitFor("document.querySelector('.receipt-ocr')!==null");
 await waitFor("window.__workerStarts>"+starts);
 await evaluate("document.querySelector('.receipt-ocr button').click()");
 await waitFor("document.querySelector('.receipt-ocr').textContent.includes('ยกเลิกแล้ว')");
 await waitFor('window.__workerStops>'+stops);
 assert.equal(await evaluate('window.__posts.length'),2);
 console.log('PASS worker cancellation; OCR does not overwrite edited fields automatically');


 // Plain manual form uses the same retry protocol, without an OCR image.
 await evaluate("document.querySelector('.footer-actions .cancel-button').click()");
 await fill('input[inputmode=decimal]','0.08');
 await evaluate("document.querySelector('input[name=transaction-category]').click();window.__loseResponse=true;document.querySelector('.footer-actions button:last-child').click();document.querySelector('.footer-actions button:last-child').click()");
 await waitFor("window.__posts.length===3&&!document.querySelector('.footer-actions button:last-child').disabled");
 await evaluate("document.querySelector('.footer-actions button:last-child').click()");
 await waitFor("window.__posts.length===4&&document.querySelector('input[inputmode=decimal]').value===''");
 assert.equal(await evaluate('window.__posts[2].key===window.__posts[3].key'),true);
 assert.deepEqual(await evaluate('window.__posts[2].body'),await evaluate('window.__posts[3].body'));
 console.log('PASS manual form retry and rapid double-click share one request');

 assert.equal(external.length,0,'No external OCR network request');
 console.log('PASS incomplete OCR/manual editing, session clearing, keyboard/mobile, no external network');
 }finally{if(socket)socket.close();browser.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
