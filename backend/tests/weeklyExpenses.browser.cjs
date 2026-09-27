// Real Chrome + API doubles. Does not write production data.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
const mock=()=>{
 const native=window.fetch.bind(window),parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),today=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-'),current=today.slice(0,7);window.__current=current;window.__requests=[];window.__events=[];window.__gates=[];window.__release=()=>{const gates=window.__gates.splice(0);gates.forEach(g=>g());};
 window.fetch=async(url,options={})=>{
  if(!String(url).startsWith('http://localhost:4000'))return native(url,options);
  const u=new URL(url),route=u.pathname,session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','')||'session-a';window.__requests.push(u.pathname+u.search);let data={},record=null;

  if(route==='/overview/weekly'){
    const start=u.searchParams.get('startDate'),end=u.searchParams.get('endDate');
    record={held:!!window.__weeklyHold,session,start,jsonConsumed:false,aborted:false};window.__events.push(record);options.signal?.addEventListener('abort',()=>record.aborted=true,{once:true});
    if(record.held)await new Promise(r=>window.__gates.push(r));
    if(window.__weeklyFail){window.__weeklyFail=false;return new Response('{}',{status:503});}
    const amount=session==='session-b'?9:.07;
    data={period:{startDate:start,endDate:end,dayCount:2},totalExpense:amount+.01,transactionCount:2,weeks:[
      {weekNumber:1,startDate:start,endDate:start,totalExpense:amount,transactionCount:1,categories:[{categoryId:'a',name:'Category A',amount,transactionCount:1}]},
      {weekNumber:2,startDate:end,endDate:end,totalExpense:.01,transactionCount:1,categories:[{categoryId:'b',name:'Category B',amount:.01,transactionCount:1}]}
    ]};
    if(window.__weeklyEmpty){data.totalExpense=0;data.transactionCount=0;data.weeks.forEach(w=>{w.totalExpense=0;w.transactionCount=0;w.categories=[];});}
  } else
 if(route==='/dashboard'){
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
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mock.toString()+')()'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/overview'});await waitFor("Boolean(document.querySelector('.dashboard-cards'))");

 await waitFor("Boolean(document.querySelector('.weekly-chart')) && document.querySelector('.weekly-total').textContent.includes('0.08')");
 const month=await evaluate("document.querySelector('.dashboard-month input').value");
 const changedDate=new Date(month+'-01T00:00:00Z');changedDate.setUTCDate(0);const changedStart=changedDate.toISOString().slice(0,10);
 assert.equal(await evaluate("document.querySelectorAll('.weekly-controls').length"),1);
 await evaluate("document.querySelector('.weekly-controls select').value='a';document.querySelector('.weekly-controls select').dispatchEvent(new Event('change',{bubbles:true}))");
 await waitFor("document.querySelector('.weekly-total').textContent.includes('0.07')");
 assert.equal(await evaluate("document.querySelector('.dashboard-month input').value"),month);
 await evaluate("document.querySelector('.weekly-expenses summary').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await waitFor("document.querySelector('.weekly-expenses details').open");
 assert.equal(await evaluate("document.querySelector('.weekly-expenses tbody').rows.length"),2);
 console.log('PASS weekly graph/all-category/category exact cents, keyboard table, monthly dashboard unchanged');
 await evaluate("window.__weeklyEmpty=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("Boolean(document.querySelector('.weekly-empty'))");assert.equal(await evaluate("document.querySelectorAll('.weekly-chart').length"),0);
 await evaluate("window.__weeklyEmpty=false;window.__weeklyFail=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("Boolean(document.querySelector('.weekly-expenses [role=alert] button'))");await evaluate("document.querySelector('.weekly-expenses [role=alert] button').click()");await waitFor("Boolean(document.querySelector('.weekly-chart'))");
 console.log('PASS empty no invented graph; error retry');
 await evaluate("window.__weeklyHold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("window.__events.some(e=>e.held&&!e.jsonConsumed)");
 await evaluate("window.__weeklyHold=false;const input=document.querySelector('.weekly-controls input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'"+changedStart+"');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))");
 await waitFor("window.__requests.some(r=>r.startsWith('/overview/weekly?')&&r.includes('"+changedStart+"'))");
 await evaluate("window.__release()");await waitFor("window.__events.filter(e=>e.held).every(e=>e.jsonConsumed)");await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelector('.weekly-total').textContent.includes('"+changedStart+"')"),true);
 assert.equal(await evaluate("window.__events.filter(e=>e.held).every(e=>e.aborted)"),true);
 await evaluate("window.__weeklyHold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("window.__events.some(e=>e.held&&!e.jsonConsumed)");
 await evaluate("window.__weeklyHold=false;localStorage.setItem('spendsense_token','session-b');window.dispatchEvent(new Event('spendsense-session'))");await waitFor("document.querySelector('.weekly-total')?.textContent.includes('9.01')");
 await evaluate("window.__release()");await waitFor("window.__events.filter(e=>e.held).every(e=>e.jsonConsumed)");await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelector('.weekly-total').textContent.includes('9.01')"),true);
 console.log('PASS stale range/session response cannot overwrite current scope');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),true);
 console.log('PASS mobile graph scroll containment');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();console.log('API-double tests only; Chrome temp profile retained outside repository.');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});