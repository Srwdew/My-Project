// Real Chrome + API doubles. Does not write production data.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
const mock=()=>{
 const native=window.fetch.bind(window),parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),today=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-'),current=today.slice(0,7);window.__current=current;window.__requests=[];window.__events=[];window.__gates=[];window.__release=()=>{const gates=window.__gates.splice(0);gates.forEach(g=>g());};
 window.fetch=async(url,options={})=>{
  if(!String(url).startsWith('http://localhost:4000'))return native(url,options);
  const u=new URL(url),route=u.pathname,session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','')||'session-a';window.__requests.push(u.pathname+u.search);window.__methods=window.__methods||[];window.__methods.push({method:options.method||'GET',path:u.pathname});let data={},record=null;
  if(route==='/dashboard'){
   const month=u.searchParams.get('month')||current;
   record={id:window.__events.length+1,month,session,aborted:options.signal?.aborted??false,held:false,jsonConsumed:false};window.__events.push(record);options.signal?.addEventListener('abort',()=>{record.aborted=true;},{once:true});
   if(window.__holdMonth&&month!==current||window.__holdSession&&session==='session-a'){record.held=true;await new Promise(r=>window.__gates.push(r));record.released=true;}
   if(window.__fail){window.__fail=false;return new Response('{}',{status:503});}
   const next=new Date(month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const end=new Date(next-86400000).toISOString().slice(0,10);
   data={month,asOfDate:today,period:{startDate:month+'-01',calendarEndDate:end,effectiveEndDate:month===current?today:end,isCurrentMonth:month===current},summary:{savingRate:{percent:'80.00',reason:null},transactionCount:2,incomeAmount:'9007199254740993.07',expenseAmount:'20.00',netCashFlow:'9007199254740973.07',budgetAmount:'10.00',budgetRemaining:'-10.00',budgetExceeded:true,hasTransactions:true},expenseCategories:[{categoryId:'food',categoryName:'หมวดยาว '.repeat(30),amount:'20.00',percentage:'100.00',transactionCount:1}],daily:[{date:month+'-01',transactionCount:2,incomeAmount:'9007199254740993.07',expenseAmount:'20.00'}],recentTransactions:{hasMore:false,items:[{id:'tx',date:month+'-01',type:'expense',amount:'20.00',categoryName:'อาหาร',description:'รายการ'}]},goals:{asOfDate:today,activeCount:1,notStartedCount:2,overdueCount:3,allocatedAmount:'0.08',primaryGoal:{id:'g',name:session+' '+month+' '+'เป้าหมายยาว '.repeat(15),archivedAt:null,calculatedStatus:'active',targetAmount:'1.00',savedAmount:'0.08',remainingAmount:'0.92',progressPercent:'8.00',progressBarPercent:'8.00'}}};
   if(window.__empty){data.summary={...data.summary,savingRate:{percent:null,reason:'no_transactions'},transactionCount:0,incomeAmount:'0.00',expenseAmount:'0.00',netCashFlow:'0.00',budgetAmount:null,budgetRemaining:null,budgetExceeded:false,hasTransactions:false};data.daily=[];data.expenseCategories=[];data.recentTransactions.items=[];}
  } else if(route==='/anomaly/queue'||route==='/behavior'){
   if(window.__insightHold&&session==='session-a')await new Promise(r=>window.__gates.push(r));
   if(window.__insightFail)return new Response('{}',{status:503});
   if(route==='/anomaly/queue')data={total:session==='session-b'?0:3,pendingEvaluation:2};
   else data={periods:{current:{startDate:'2026-09-01',endDate:'2026-09-30'},previous:{startDate:'2026-08-02',endDate:'2026-08-31'}},readiness:{current:{ready:!window.__unready,expenseCount:window.__unready?2:30,observedSpanDays:window.__unready?1:30},previous:{ready:!window.__unready},comparisonReady:!window.__unready},findings:window.__noFinding?[]:[{ruleId:'test',title:'Actual finding '+session,recommendation:'Evidence-backed test recommendation'}]};
  } else if(route==='/goals'){
   if(window.__goalFail)return new Response('{}',{status:503});
   data={data:[{id:'g',name:'Goal '+session,targetAmount:'100.00',targetDate:null,plannedMonthlyAmount:null,categoryKey:'other',archivedAt:null,savedAmount:'0.00',remainingAmount:'100.00',overfundedAmount:'0.00',progressPercent:'0.00',progressBarPercent:'0.00',monthsRemaining:null,requiredMonthlyAmount:null,calculatedStatus:'not_started',warnings:[],feasibility:{status:window.__goalStatus||'no_target_date',requiredMonthlyAmount:null,cashFlow:{period:{month:'2026-09',startDate:'2026-09-01',endDate:'2026-09-30'},incomeAmount:'100.00',expenseAmount:'20.00',netCashFlow:'80.00',transactionCount:2}}}],nextCursor:null};
  } else if(route==='/settings')data={legacyGoal:null};
  else if(route==='/profile')data={userId:session,email:session+'@example.invalid',displayName:session,hasAvatar:false};
  else if(route==='/notifications')data={items:[],unreadCount:0};
  else if(route==='/categories')data=[{id:'food',name:'อาหาร',type:'expense'}];
  else if(route==='/transactions')data=[{id:'tx',userId:session,categoryId:'food',category:{id:'food',name:'อาหาร',type:'expense'},type:'expense',amount:'0.08',transactionDate:(u.searchParams.get('month')||'2024-02')+'-01T00:00:00Z',transactionTime:null,createdAt:today+'T00:00:00Z',updatedAt:today+'T00:00:00Z',description:'History '+session}];
  const response=new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});if(record){const json=response.json.bind(response);response.json=async()=>{const value=await json();record.jsonConsumed=true;return value;};}return response;
 };localStorage.setItem('spendsense_token','session-a');
};
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-dashboard-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{for(let i=0;i<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));i++)await delay(100);const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mock.toString()+')()'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/overview'});await waitFor("Boolean(document.querySelector('.dashboard-cards'))");

 await waitFor("document.querySelector('[data-testid=overview-anomaly]')?.textContent.includes('3 รายการรอตัดสิน')");
 await waitFor("document.querySelector('[data-testid=overview-behavior]')?.textContent.includes('Actual finding session-a')");
 assert.ok(await evaluate("document.querySelector('.dashboard-saving-rate').textContent.includes('80.00%')"));
 assert.ok(await evaluate("window.__requests.includes('/anomaly/queue?filter=waiting&limit=1')&&window.__requests.includes('/behavior')"));
 assert.equal(await evaluate("document.querySelector('[data-testid=overview-anomaly] a').getAttribute('href')"),'/anomaly?filter=waiting');
 console.log('PASS real API contract URLs, queue transaction count, evidence finding, Saving Rate');
 await evaluate("window.__unready=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('[data-testid=overview-behavior]')?.textContent.includes('ข้อมูลยังไม่พร้อม')");
 assert.ok(await evaluate("!document.querySelector('[data-testid=overview-behavior]').textContent.includes('Actual finding')"));
 await evaluate("window.__unready=false;window.__noFinding=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('[data-testid=overview-behavior]')?.textContent.includes('ยังไม่มีข้อค้นพบ')");
 console.log('PASS readiness suppresses findings and ready/no-finding is explicit');
 await evaluate("window.__insightFail=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelectorAll('[data-testid^=overview-] [role=alert]').length===2");
 await evaluate("window.__insightFail=false;document.querySelector('[data-testid=overview-anomaly] button').click();document.querySelector('[data-testid=overview-behavior] button').click()");
 await waitFor("document.querySelector('[data-testid=overview-anomaly]')?.textContent.includes('3 รายการรอตัดสิน')");
 await evaluate("window.__noFinding=false;window.__insightHold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("window.__gates.length>=2");
 assert.ok(await evaluate("document.querySelector('[data-testid=overview-anomaly] [role=status]')!==null"));
 await evaluate("localStorage.setItem('spendsense_token','session-b');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('[data-testid=overview-behavior]')?.textContent.includes('Actual finding session-b')");
 await evaluate("window.__insightHold=false;window.__release();new Promise(r=>setTimeout(r,100))");
 assert.ok(await evaluate("!document.querySelector('[data-testid=overview-behavior]').textContent.includes('session-a')"));
 await waitFor("document.querySelector('[data-testid=overview-anomaly]')?.textContent.includes('ไม่มีรายการที่รอคำตัดสิน')");
 console.log('PASS independent retry/loading and late response cannot cross session');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"));
 await evaluate("document.querySelector('[data-testid=overview-anomaly] a').focus()");
 assert.ok(await evaluate("document.activeElement.getAttribute('href')==='/anomaly?filter=waiting'"));
 await evaluate("document.querySelector('.dashboard-goals-panel a[href=\"/goals\"]')?.click() || document.querySelector('a[href=\"/goals\"]').click()");
 await waitFor("document.querySelector('[data-testid=goal-feasibility]')?.textContent.includes('ต้องกำหนดวันเป้าหมาย')");
 for(const [status,text] of [['no_transactions','ไม่มีธุรกรรม'],['no_income','ไม่มีรายรับ'],['non_positive_cash_flow','ไม่มีเงินเหลือสุทธิ'],['exceeds_observed_cash_flow','สูงกว่า'],['within_observed_cash_flow','ไม่เกิน']]){
  await evaluate("window.__goalStatus="+JSON.stringify(status)+";window.dispatchEvent(new Event('spendsense-data-changed'))");
  await waitFor("document.querySelector('[data-testid=goal-feasibility]')?.textContent.includes("+JSON.stringify(text)+")");
 }
 await evaluate("window.__goalFail=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("Boolean(document.querySelector('.goals-error'))");
 await evaluate("window.__goalFail=false;document.querySelector('.goals-error button').click()");
 await waitFor("Boolean(document.querySelector('[data-testid=goal-feasibility]'))");
 assert.ok(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"));
 assert.ok(await evaluate("window.__methods.every(r=>r.method==='GET'||(r.method==='POST'&&r.path==='/notifications/reconcile'))"));
 console.log('PASS Goals states/retry, 390px, keyboard link and GET-only insights/goals (no ledger writes); existing notification reconciliation excluded');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();console.log('Synthetic API doubles; not user acceptance. Browser profile retained in temp.');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
