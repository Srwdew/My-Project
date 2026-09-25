// Real Chrome, API doubles only; no application database calls.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
const mock=()=>{
 const native=window.fetch.bind(window);window.__calls=[];window.__reviews={};window.__receipts={};
 window.fetch=async(url,options={})=>{
  if(!String(url).startsWith('http://localhost:4000'))return native(url,options);
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
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-settings-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{for(let i=0;i<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));i++)await delay(100);const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mock.toString()+')()'});await send('Page.navigate',{url:origin+'/settings'});await waitFor("Boolean(document.querySelector('#settings-name'))");
 await evaluate("document.querySelector('.user-header-notification').click()");await waitFor("Boolean(document.querySelector('.notification-item'))");await evaluate("document.querySelector('.notification-item').click()");await waitFor("document.querySelectorAll('.anomaly-review').length===2&&[...document.querySelectorAll('.anomaly-review h5')].every(e=>e.textContent.includes('ยังไม่ได้ตรวจสอบ'))");
 await evaluate("document.querySelector('.anomaly-details').open=true");assert.equal(await evaluate("window.__calls.filter(c=>c.route.includes('/reviews')&&c.body).length"),0);console.log('PASS readAt does not submit a review; old and latest revision controls separate');
 const current="[...document.querySelectorAll('.anomaly-review')].find(e=>e.getAttribute('aria-label')==='ผลยืนยัน revision 2')";
 await evaluate(current+".querySelector('button').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await waitFor(current+"?.querySelector('h5').textContent.includes('ยืนยันว่าปกติ')");assert.equal(await evaluate("window.__reviews['evaluation-2'].length"),1);assert.equal(await evaluate("window.__reviews['evaluation-1']"),undefined);assert.ok(await evaluate("document.querySelector('.anomaly-details').textContent.includes('ใช้เป็นประวัติจำนวนเงิน: ได้')"));assert.ok(await evaluate("document.querySelector('.anomaly-details').textContent.includes('ใช้เป็นประวัติเวลา: ไม่ได้')"));console.log('PASS keyboard normal affects only reviewed revision and amount eligibility');
 await evaluate("window.__loseResponse=true;"+current+".querySelectorAll('button')[1].click()");await waitFor(current+"?.textContent.includes('บันทึกไม่สำเร็จ')");const before=await evaluate("Object.keys(window.__receipts).length");
 await evaluate(current+".querySelectorAll('button')[1].click();"+current+".querySelectorAll('button')[1].click()");await waitFor(current+"?.querySelector('h5').textContent.includes('ยืนยันว่ามีปัญหา')");assert.equal(await evaluate("Object.keys(window.__receipts).length"),before);assert.equal(await evaluate("window.__reviews['evaluation-2'].length"),2);console.log('PASS lost response retry reuses key and rapid duplicate submit does not append');
 await evaluate(current+".querySelector('button').click()");await waitFor(current+"?.querySelector('h5').textContent.includes('ยืนยันว่าปกติ')");await evaluate(current+".querySelector('details').open=true");await evaluate("[...("+current+").querySelectorAll('button')].find(b=>b.textContent==='โหลดประวัติเพิ่ม').click()");await waitFor(current+"?.querySelectorAll('li').length===3");console.log('PASS change of mind retains append-only history and pagination');
 await evaluate("window.__reviews['evaluation-2'].unshift({id:'external',sequence:4,revision:2,action:'confirmed_problem',reviewedAt:new Date().toISOString()});"+current+".querySelectorAll('button')[1].click()");await waitFor(current+"?.textContent.includes('มีข้อมูลใหม่หรือคำขอขัดแย้ง')");await waitFor(current+"?.querySelector('h5').textContent.includes('ยืนยันว่ามีปัญหา')");console.log('PASS concurrent 409 reloads state and preserves conflict explanation');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate("document.querySelector('.notification-dialog').scrollWidth<=document.querySelector('.notification-dialog').clientWidth+1"),true);assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);console.log('PASS review controls and long explanations fit mobile');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();console.log('Review browser tests use API mocks only.');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});