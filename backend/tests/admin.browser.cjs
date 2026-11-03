require('./browserGuard.cjs');
// Real Chrome + API doubles. Does not write production data.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
const mock=()=>{
 const native=window.fetch.bind(window),parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),today=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-'),current=today.slice(0,7);window.__current=current;window.__requests=[];window.__events=[];window.__gates=[];window.__release=()=>{const gates=window.__gates.splice(0);gates.forEach(g=>g());};
 window.fetch=async(url,options={})=>{
  if(!String(url).startsWith('http://localhost:4000'))return native(url,options);
  const u=new URL(url),route=u.pathname,session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','')||'session-a';window.__requests.push(u.pathname+u.search);let data={},record=null;
  if(route.startsWith('/admin/')){
   if(window.__holdAdmin&&session==='session-a')await new Promise(r=>window.__gates.push(r));
   if(session==='member'||window.__denied)return new Response('{}',{status:403});
   if(window.__adminFail)return new Response('{}',{status:503});
   if(route==='/admin/summary')data={asOfDate:today,totalMembers:3,newMembers:1,startedMembers:2,basicReadyMembers:1};
   else {const second=u.searchParams.has('cursor'),empty=u.searchParams.get('q')==='missing';data={asOfDate:today,items:empty?[]:[{id:second?'member-2':'member-1',displayName:session+(second?' second':' first'),email:'synthetic@example.invalid',createdAt:'2026-01-01T00:00:00Z',lastLoginAt:null,transactionCount:30,basicReadiness:true}],nextCursor:second?null:'cursor-test',hasMore:!second&&!empty};}
  } else if(route==='/auth/login'){
   data={token:window.__loginUser?'member':'session-admin',user:{id:'test',email:'test@example.invalid',role:window.__loginUser?'USER':'ADMIN'},showSetup:!window.__loginUser};
  } else if(route==='/dashboard'){
   const month=u.searchParams.get('month')||current;
   record={id:window.__events.length+1,month,session,aborted:options.signal?.aborted??false,held:false,jsonConsumed:false};window.__events.push(record);options.signal?.addEventListener('abort',()=>{record.aborted=true;},{once:true});
   if(window.__holdMonth&&month!==current||window.__holdSession&&session==='session-a'){record.held=true;await new Promise(r=>window.__gates.push(r));record.released=true;}
   if(window.__fail){window.__fail=false;return new Response('{}',{status:503});}
   const next=new Date(month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const end=new Date(next-86400000).toISOString().slice(0,10);
   data={month,asOfDate:today,period:{startDate:month+'-01',calendarEndDate:end,effectiveEndDate:month===current?today:end,isCurrentMonth:month===current},summary:{transactionCount:2,incomeAmount:'9007199254740993.07',expenseAmount:'20.00',netCashFlow:'9007199254740973.07',budgetAmount:'10.00',budgetRemaining:'-10.00',budgetExceeded:true,hasTransactions:true},expenseCategories:[{categoryId:'food',categoryName:'หมวดยาว '.repeat(30),amount:'20.00',percentage:'100.00',transactionCount:1}],daily:[{date:month+'-01',transactionCount:2,incomeAmount:'9007199254740993.07',expenseAmount:'20.00'}],recentTransactions:{hasMore:false,items:[{id:'tx',date:month+'-01',type:'expense',amount:'20.00',categoryName:'อาหาร',description:'รายการ'}]},goals:{asOfDate:today,activeCount:1,notStartedCount:2,overdueCount:3,allocatedAmount:'0.08',primaryGoal:{id:'g',name:session+' '+month+' '+'เป้าหมายยาว '.repeat(15),archivedAt:null,calculatedStatus:'active',targetAmount:'1.00',savedAmount:'0.08',remainingAmount:'0.92',progressPercent:'8.00',progressBarPercent:'8.00'}}};
   if(window.__empty){data.summary={...data.summary,transactionCount:0,incomeAmount:'0.00',expenseAmount:'0.00',netCashFlow:'0.00',budgetAmount:null,budgetRemaining:null,budgetExceeded:false,hasTransactions:false};data.daily=[];data.expenseCategories=[];data.recentTransactions.items=[];}
  } else if(route==='/profile')data={userId:session,email:session+'@example.invalid',displayName:session,hasAvatar:false};
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
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mock.toString()+')()'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/admin'});await waitFor("Boolean(document.querySelector('.admin-summary'))");

 assert.equal(await evaluate("document.querySelectorAll('.admin-summary article').length"),4);
 assert.ok(await evaluate("document.querySelector('.admin-table').textContent.includes('ยังไม่มีข้อมูล')"));
 await evaluate("document.querySelector('nav[aria-label=แบ่งหน้าสมาชิก] button:last-child').click()");
 await waitFor("document.querySelector('.admin-table')?.textContent.includes('second')");
 await evaluate("document.querySelector('nav[aria-label=แบ่งหน้าสมาชิก] button:first-child').click()");
 await waitFor("document.querySelector('.admin-table')?.textContent.includes('first')");
 const setValue=(selector,value)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await setValue('.admin-page input','missing');await evaluate("document.querySelector('.admin-page form').requestSubmit()");
 await waitFor("document.querySelector('.admin-page').textContent.includes('ไม่พบสมาชิก')");
 await setValue('.admin-page input','');await evaluate("document.querySelector('.admin-page form').requestSubmit()");
 await waitFor("Boolean(document.querySelector('.admin-table'))");
 await evaluate("window.__adminFail=true;window.dispatchEvent(new Event('focus'))");
 await waitFor("Boolean(document.querySelector('.admin-page [role=alert]'))");
 await evaluate("window.__adminFail=false;document.querySelector('.admin-page [role=alert] button').click()");
 await waitFor("Boolean(document.querySelector('.admin-table'))");
 console.log('PASS admin summary, pagination, search empty, null login, error/retry');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 await evaluate("document.querySelector('.admin-table').focus()");assert.ok(await evaluate("document.activeElement.classList.contains('admin-table')"));
 await evaluate("window.__holdAdmin=true;window.dispatchEvent(new Event('focus'))");
 await waitFor("window.__gates.length>=2");
 assert.ok(await evaluate("document.querySelector('.admin-page').textContent.includes('กำลังโหลด')"));
 await evaluate("localStorage.setItem('spendsense_token','member');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('.admin-page').textContent.includes('403')");
 await evaluate("window.__holdAdmin=false;window.__release();new Promise(r=>setTimeout(r,50))");
 assert.equal(await evaluate("Boolean(document.querySelector('.admin-table'))"),false);
 await evaluate("localStorage.setItem('spendsense_token','session-admin');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("Boolean(document.querySelector('.admin-summary'))");
 await evaluate("window.__denied=true;window.dispatchEvent(new Event('focus'))");
 await waitFor("document.querySelector('.admin-page').textContent.includes('403')");
 assert.equal(await evaluate("Boolean(document.querySelector('.admin-table'))"),false);
 console.log('PASS 390px/keyboard, stale response cannot cross account, revoked role 403');
 await evaluate("window.__denied=false;document.querySelector('.admin-page header button').click()");
 await waitFor("location.pathname==='/login'");
 await setValue('input[type=email]','test@example.invalid');await setValue('input[type=password]','synthetic-password');
 await evaluate("document.querySelector('form').requestSubmit()");
 await waitFor("location.pathname==='/admin'&&Boolean(document.querySelector('.admin-summary'))");
 await evaluate("window.__loginUser=true;document.querySelector('.admin-page header button').click()");
 await waitFor("location.pathname==='/login'");
 await setValue('input[type=email]','test@example.invalid');await setValue('input[type=password]','synthetic-password');
 await evaluate("document.querySelector('form').requestSubmit()");
 await waitFor("location.pathname==='/overview'");
 console.log('PASS existing login ADMIN -> admin (ignores Setup), USER -> overview');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();console.log('API doubles only; not User Acceptance.');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
