// Real Chrome, API doubles only; no application database calls.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
const mock=()=>{
 const native=window.fetch.bind(window);window.__calls=[];window.__reviews={};window.__receipts={};
 window.fetch=async(url,options={})=>{
  if(!['http://localhost:4000','http://127.0.0.1:4088'].includes(new URL(url,location.href).origin))return native(url,options);
  const route=new URL(url).pathname,session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','');window.__calls.push({route,body:options.body});let value={};
  if(route==='/profile')value={userId:session,email:session+'@example.invalid',displayName:session,hasAvatar:false};
  else if(route==='/categories')value=[{id:'cat',name:'ทดสอบ',type:'expense'}];
  else if(route==='/settings'){if(options.method==='PUT')window.__saved=JSON.parse(options.body);value={userId:session,email:'test@example.invalid',displayName:session,income:null,paydayDay:null,primaryGoalId:null,goals:[],budgetMonth:'2026-09',budgetAmount:null,notifications:{notifyNearLimit:false,notifyExceeded:false,notifyAnomaly:window.__saved?.notifyAnomaly??false}};}
  else if(route==='/notifications')value={items:[{id:window.__noticeId||'notice',type:'transaction_anomaly',title:'รายการที่ควรตรวจสอบ',message:'ข้อมูลจำลองสำหรับ UI',readAt:null,createdAt:'2026-09-23T00:00:00Z'}],unreadCount:1};
  else if(route==='/notifications/anomaly/reconcile')value={processed:10,evaluated:10,hasMore:true,nextCursor:'next-id',asOfDate:'2026-09-23'};
    else if(route.includes('/reviews')){
   const id=route.split('/')[3],rows=window.__reviews[id]??[],body=options.body?JSON.parse(options.body):null;
   if(options.method==='POST'){
    const key=new Headers(options.headers).get('Idempotency-Key');
    if(window.__receipts[key])value=window.__receipts[key];
    else{
     if(body.expectedReviewSequence!==(rows[0]?.sequence??0))return new Response('{}',{status:409});
     const row={id:crypto.randomUUID(),revision:body.revision,action:body.action,sequence:(rows[0]?.sequence??0)+1,reviewedAt:new Date().toISOString()};rows.unshift(row);window.__reviews[id]=rows;value={review:row};window.__receipts[key]=value;
     if(window.__loseResponse){window.__loseResponse=false;throw Error('Synthetic lost response after commit');}
    }
   }else{const cursor=Number(new URL(url).searchParams.get('cursor')||2147483647),items=rows.filter(r=>r.sequence<cursor).slice(0,2);value={reviewState:rows[0]?.action??'unreviewed',reviewSequence:rows[0]?.sequence??0,reviewHistory:{items,hasMore:rows.filter(r=>r.sequence<cursor).length>2,nextCursor:items.at(-1)?.sequence??null}};}
  }
  else if(route.endsWith('/anomaly')){
   if(window.__slow&&session==='session-a')await new Promise(r=>setTimeout(r,700));
   if(window.__fail){return new Response('{}',{status:503});}
   const evaluation=revision=>({id:'evaluation-'+revision,revision,ruleVersion:'synthetic-ui',evaluatedAt:'2026-09-23T00:00:00Z',outcome:'flagged',snapshot:{transaction:{amount:revision===1?'250.00':'300.00',categoryName:session+' ชื่อหมวดยาว'.repeat(20),date:'2026-09-01',time:null,timeConfirmed:false},window:{startDate:'2026-03-05',endExclusive:'2026-09-01'},baseline:{n:30,days:30,span:29,median:'100',mad:'0',q1:'100',q3:'100',timeN:0,timeDays:0,timeSpan:0,bucketCount:0,nearbyCount:0},rules:{amountMin:30,amountDays:10,amountSpan:28,timeMin:60,timeDays:20,timeSpan:42,timeCoverage:'0.8',zThreshold:'3.5',iqrMultiplier:'3',minimumDifference:'100',medianDifferenceRatio:'0.5',rareFrequency:'0.05'},assessment:{amount:{status:'flagged',reasonCode:'amount_zero_dispersion'},time:{status:'not_evaluated',reasonCode:'time_not_confirmed'}}}});
   value={currentRevision:2,amountBaselineEligible:window.__reviews['evaluation-2']?.[0]?.action==='confirmed_normal',amountBaselineReasons:[],timeBaselineEligible:false,timeBaselineReasons:['time_not_confirmed'],sourceState:'modified',pending:false,notificationSnapshot:evaluation(1),latestEvaluation:evaluation(2),latestAppliesToCurrent:false,transactionLink:null};
  }
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 };localStorage.setItem('spendsense_token','session-a');
};

const extend=()=>{
 const base=window.fetch;window.__mode='distinct';window.__held=false;window.__denied=false;window.__extra=[];
 window.fetch=async(url,options={})=>{
  const u=new URL(url,location.href),route=u.pathname;
  if(u.origin!==location.origin&&!['http://localhost:4000','http://127.0.0.1:4088'].includes(u.origin))throw Error('External request blocked in test');
  if(route.endsWith('/anomaly')&&!route.includes('/reconcile')){
   const session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','');
   if(window.__denied)return new Response('{}',{status:404});
   if(window.__error)return new Response('{}',{status:503});
   const response=await base(url,options),d=await response.json();
   d.latestAppliesToCurrent=true;d.transactionLink='/transactions/11111111-1111-4111-8111-111111111111/edit';
   if(window.__mode==='same')d.latestEvaluation=d.notificationSnapshot;
   if(window.__amountReason){for(const e of [d.notificationSnapshot,d.latestEvaluation])if(e)e.snapshot.assessment.amount={status:window.__amountReason==='amount_modified_z'?'flagged':'not_evaluated',reasonCode:window.__amountReason};}
   if(window.__mode==='empty'||window.__mode==='pending'){d.notificationSnapshot=null;d.latestEvaluation=null;d.pending=window.__mode==='pending';d.latestAppliesToCurrent=false;}
   if(window.__mode==='pending-old'){d.pending=true;d.latestAppliesToCurrent=false;d.currentRevision=3;}
   if(window.__mode==='insufficient'){d.notificationSnapshot=null;d.latestEvaluation.outcome='not_evaluated';d.latestEvaluation.snapshot.assessment.amount={status:'not_evaluated',reasonCode:'amount_insufficient_history'};}
   if(window.__mode==='nonflagged'){d.notificationSnapshot=null;d.latestEvaluation.outcome='not_flagged';d.latestEvaluation.snapshot.assessment.amount.status='not_flagged';}
   if(window.__mode==='mixed'){d.notificationSnapshot=null;d.latestEvaluation.outcome='not_evaluated';d.latestEvaluation.snapshot.assessment.amount={status:'not_evaluated',reasonCode:'amount_zero_iqr_nonconstant'};}
   if(window.__mode==='deleted'){d.currentRevision=null;d.sourceState='deleted';d.transactionLink=null;d.latestAppliesToCurrent=false;}
   if(window.__hold&&session==='session-a'){window.__held=true;await new Promise(r=>window.__release=r);}
   return new Response(JSON.stringify(d),{headers:{'Content-Type':'application/json'}});
  }
  if(route==='/transactions/11111111-1111-4111-8111-111111111111')return new Response(JSON.stringify({amount:'125.00',description:'Synthetic source',transactionDate:'2026-09-20',type:'expense',category:{name:'Synthetic category'}}));
  return base(url,options);
 };
};

(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-anomaly-detail-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-dashboard-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}console.log('TIMEOUT_STATE',await evaluate("JSON.stringify({active:document.activeElement?.outerHTML,choices:[...document.querySelectorAll('.anomaly-comparison button')].map(b=>({pressed:b.getAttribute('aria-pressed'),text:b.textContent})),review:document.querySelector('.anomaly-review')?.textContent,calls:window.__calls.slice(-5)})"));throw Error('Timed out: '+expr);};

 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mock.toString()+')();('+extend.toString()+')();'});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const notice='/notifications/22222222-2222-4222-8222-222222222222/anomaly',transaction='/transactions/11111111-1111-4111-8111-111111111111/anomaly';
 await send('Page.navigate',{url:origin+notice});
 const panel='.anomaly-page .anomaly-review';
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('revision 1')");
 assert.equal(await evaluate("document.querySelectorAll('.anomaly-page .anomaly-review').length"),1);
 assert.equal(await evaluate("window.__calls.filter(c=>c.route.includes('/reviews')&&c.body).length"),0);
 assert.equal(await evaluate("window.__calls.some(c=>c.route.endsWith('/read'))"),false);
 assert.equal(await evaluate("document.querySelectorAll('.anomaly-method').length"),1);
 assert.equal(await evaluate("document.querySelector('.anomaly-method').open"),false);
 assert.equal(await evaluate("document.querySelector('.anomaly-method').textContent.includes('Z =')"),false);
 console.log('PASS direct notification URL: read-only, viewed revision 1, no irrelevant formula');
 await evaluate("document.querySelectorAll('.anomaly-comparison button')[1].focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('revision 2') && document.querySelector('"+panel+" button')?.disabled===false");
 await evaluate("document.querySelector('"+panel+" button').click()");
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('ยืนยันว่าปกติ')");
 assert.equal(await evaluate("window.__reviews['evaluation-1']"),undefined);
 assert.equal(await evaluate("window.__reviews['evaluation-2'].length"),1);
 await evaluate("window.__loseResponse=true;document.querySelectorAll('"+panel+" button')[1].click()");
 await waitFor("document.querySelector('"+panel+" [role=alert]')!==null");
 await evaluate("document.querySelectorAll('"+panel+" button')[1].click()");
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('ยืนยันว่ามีปัญหา')");
 assert.equal(await evaluate("window.__reviews['evaluation-2'].length"),2);
 await evaluate("document.querySelector('"+panel+" button').click()");
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('ยืนยันว่าปกติ')");
 await evaluate("document.querySelector('"+panel+" details').open=true;[...document.querySelectorAll('"+panel+" button')].find(b=>b.textContent==='โหลดประวัติเพิ่ม').click()");
 await waitFor("document.querySelectorAll('"+panel+" li').length===3");
 await evaluate("window.__reviews['evaluation-2'].unshift({id:'external',sequence:4,revision:2,action:'confirmed_problem',reviewedAt:new Date().toISOString()});document.querySelectorAll('"+panel+" button')[1].click()");
 await waitFor("document.querySelector('"+panel+" [role=alert]')?.textContent.includes('ขัดแย้ง')");
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('ยืนยันว่ามีปัญหา')");
 console.log('PASS keyboard revision selection, scoped review, lost response replay, history and 409');
 await evaluate("window.__reviews['evaluation-1']=[{id:'old-review',sequence:1,revision:1,action:'confirmed_normal',reviewedAt:'2026-09-22T00:00:00Z'}];document.querySelectorAll('.anomaly-comparison button')[0].click()");
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('revision 1: ยืนยันว่าปกติ') && document.querySelector('"+panel+" button')?.disabled===false");
 await evaluate("document.querySelector('"+panel+" details').open=true");
 assert.equal(await evaluate("document.querySelectorAll('"+panel+" li').length"),1);
 assert.ok(await evaluate("document.querySelector('"+panel+" li').textContent.includes('ยืนยันว่าปกติ')"));
 assert.ok(await evaluate("document.querySelector('"+panel+" button').textContent.includes('revision 1')"));
 await evaluate("document.querySelectorAll('.anomaly-comparison button')[1].click()");
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('revision 2: ยืนยันว่ามีปัญหา') && document.querySelector('"+panel+" button')?.disabled===false");
 assert.equal(await evaluate("document.querySelectorAll('"+panel+" li').length"),2);
 assert.equal(await evaluate("window.__reviews['evaluation-1'].length"),1);
 console.log('PASS switching back restores revision-specific state and history');
 const refresh=async(mode)=>{await evaluate("window.__mode="+JSON.stringify(mode)+";document.querySelector('.anomaly-current button').click()");await waitFor("document.querySelector('.anomaly-current')!==null");};
 await refresh('same');assert.equal(await evaluate("document.querySelectorAll('.anomaly-comparison button').length"),0);assert.equal(await evaluate("document.querySelectorAll('.anomaly-viewed').length"),1);
 await refresh('pending-old');assert.ok(await evaluate("document.querySelector('.anomaly-current').textContent.includes('รอประเมิน')"));assert.ok(await evaluate("document.querySelector('.anomaly-revision').textContent.includes('เดิม')"));
 for(const [mode,label] of [['insufficient','ข้อมูลไม่พอ'],['nonflagged','ไม่พบสัญญาณ'],['mixed','ยังประเมินไม่ได้'],['deleted','รายการต้นทางถูกลบแล้ว']]){
  await refresh(mode);assert.equal(await evaluate("document.querySelector('.anomaly-current>strong').textContent"),label);
  if(mode==='mixed')assert.equal(await evaluate("document.querySelector('.anomaly-method').textContent.includes('Z =')"),false);
 }
 assert.equal(await evaluate("document.querySelector('.anomaly-current a')===null"),true);
 console.log('PASS deduplication, pending old result, insufficient, not flagged, mixed dispersion and deleted snapshot');
 for(const width of [1440,768,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
  await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  if(width!==768)fs.writeFileSync(path.join(screenshotDir,'anomaly-detail-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 }
 await evaluate("window.__denied=true;document.querySelector('.anomaly-current button').click()");
 await waitFor("document.querySelector('.anomaly-page [role=alert]')?.textContent.includes('สิทธิ์')");
 assert.equal(await evaluate("document.querySelector('.anomaly-viewed')===null"),true);
 await evaluate("window.__denied=false;document.querySelector('.anomaly-page [role=alert] button').click()");
 await waitFor("document.querySelector('.anomaly-viewed')!==null");
 await evaluate("window.__mode='distinct';window.__hold=true;document.querySelector('.anomaly-current button').click()");
 await waitFor("window.__held");
 await evaluate("localStorage.setItem('spendsense_token','session-b');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('.anomaly-viewed')?.textContent.includes('session-b')");
 await evaluate("window.__release()");
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 assert.equal(await evaluate("document.querySelector('.anomaly-viewed').textContent.includes('session-a')"),false);
 console.log('PASS mobile long text, denied ownership clears view, stale session response ignored');
 await send('Page.navigate',{url:origin+transaction});
 await waitFor("document.querySelector('"+panel+" h5')?.textContent.includes('revision 2') && document.querySelector('"+panel+" button')?.disabled===false");
 await refresh('empty');assert.equal(await evaluate("document.querySelector('.anomaly-current>strong').textContent"),'ยังไม่ตรวจ');
 assert.ok(await evaluate("document.querySelector('.anomaly-page').textContent.includes('125.00')"));
 assert.equal(await evaluate("document.querySelectorAll('"+panel+"').length"),0);
 await refresh('pending');assert.equal(await evaluate("document.querySelector('.anomaly-current>strong').textContent"),'รอประเมิน');
 console.log('PASS direct transaction URL, unevaluated source data, no review without evaluation');

 await send('Page.navigate',{url:origin+'/settings'});
 await waitFor("Boolean(document.querySelector('#settings-name'))");
 await evaluate("window.__mode='same';window.__noticeId='22222222-2222-4222-8222-222222222222';document.querySelector('.user-header-notification').click()");
 await waitFor("document.querySelector('.notification-item')!==null");
 await evaluate("document.querySelector('.notification-item').click()");
 await waitFor("document.querySelector('.anomaly-details')!==null");
 await evaluate("document.querySelector('.anomaly-details').open=true");
 await waitFor("document.querySelector('.notification-dialog .anomaly-details .anomaly-review')!==null");
 assert.equal(await evaluate("document.querySelectorAll('.notification-dialog .anomaly-details .anomaly-review').length"),1);
 assert.equal(await evaluate("document.querySelector('.notification-dialog .anomaly-detail-page-link').textContent"),"เปิดหน้ารายละเอียด");
 assert.equal(await evaluate("document.querySelectorAll('.notification-dialog a[href=\"/notifications/22222222-2222-4222-8222-222222222222/anomaly\"]').length"),1);
 await evaluate("document.querySelector('.notification-dialog .anomaly-detail-page-link').click()");
 await waitFor("document.querySelector('.anomaly-page .anomaly-viewed')!==null");
 assert.equal(await evaluate("location.pathname"),notice);
 assert.equal(await evaluate("window.__calls.filter(c=>c.route.includes('/reviews')&&c.body).length"),0);
 console.log('PASS NotificationBell read -> dedicated detail navigation creates no review');

 for(const reason of ['amount_insufficient_history','amount_zero_iqr_nonconstant','future_unknown_reason','amount_modified_z']){
  await send('Page.navigate',{url:origin+'/settings'});
  await waitFor("Boolean(document.querySelector('#settings-name'))");
  await evaluate("window.__mode='same';window.__amountReason="+JSON.stringify(reason)+";document.querySelector('.user-header-notification').click()");
  await waitFor("document.querySelector('.notification-item')!==null");
  await evaluate("document.querySelector('.notification-item').click()");
  await waitFor("document.querySelector('.notification-dialog .anomaly-review')!==null");
  await evaluate("document.querySelector('.anomaly-details').open=true");
  const formulas=await evaluate("[...document.querySelectorAll('.notification-dialog .anomaly-formula')].map(p=>p.textContent)");
  if(reason==='amount_modified_z')assert.deepEqual(formulas,['Z = 0.6745 × (X − median) / MAD; Z > 3.5 และ X − median > max(100 บาท, 0.5 × median)']);
  else{assert.deepEqual(formulas,[]);assert.equal(await evaluate("/modified Z|Z =|Z >/.test(document.querySelector('.notification-dialog .anomaly-details').textContent)"),false);}
 }
 console.log('PASS inline amount formulas: insufficient, mixed and unknown hidden; modified Z exact');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
