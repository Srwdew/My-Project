const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-motion-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-motion-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate("Boolean("+expr+")"))return;await delay(50);}throw Error('Timed out: '+expr+' '+JSON.stringify(await evaluate("({active:document.activeElement?.outerHTML,dialog:document.querySelector('.notification-dialog')?.outerHTML,calls:window.__calls,bell:document.querySelector('.user-header-notification')?.outerHTML})")));};

 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});



 const fixture=function(){
 const native=window.fetch.bind(window);
 localStorage.clear();sessionStorage.clear();localStorage.setItem('spendsense_token','motion-a');
 window.__calls=[];window.__held=[];window.__status=200;window.__budget=1000;window.__expense=250;
 window.__release=()=>window.__held.splice(0).forEach(resolve=>resolve());
 window.alert=()=>{throw Error('Browser alert is forbidden')};
 window.fetch=async(url,options={})=>{
  const u=new URL(url,location.href);
  if(u.origin===location.origin) return native(url,options);
  // Every API request is fulfilled here; nothing reaches a database.
  const route=u.pathname,method=options.method||'GET';window.__calls.push({route,method});
  if(route==='/budget'&&method==='PUT'){
    await new Promise(resolve=>window.__held.push(resolve));
    return new Response(JSON.stringify(window.__status===200?{}:{error:'Synthetic save failure'}),{status:window.__status,headers:{'Content-Type':'application/json'}});
  }
  if(route==='/transactions'&&method==='POST'){
    await new Promise(resolve=>window.__held.push(resolve));
    return new Response(JSON.stringify(window.__status===200?{id:'synthetic-transaction'}:{code:'VALIDATION_ERROR'}),{status:window.__status===200?201:422,headers:{'Content-Type':'application/json'}});
  }
  if(route.startsWith('/notifications/')&&route.endsWith('/read')&&window.__holdRead){
    await new Promise(resolve=>window.__held.push(resolve));
  }
  let data={};
  const month=u.searchParams.get('month')||'2026-10',today='2026-10-12';
  if(route==='/profile')data={userId:'synthetic',email:'motion@example.invalid',displayName:'Motion test',hasAvatar:false};
  else if(route==='/notifications')data={unreadCount:2,items:[
    {id:'anomaly',type:'transaction_anomaly',title:'ตรวจรายการ',message:'รายการสังเคราะห์รอตัดสิน',link:'/transactions/old/anomaly',readAt:null,createdAt:today+'T00:00:00Z'},
    {id:'budget',type:'budget_exceeded',title:'ตรวจงบ',message:'งบเดือนที่แจ้งเตือน',link:'/budget?month=2026-09',readAt:null,createdAt:today+'T00:00:00Z'}
  ]};
  else if(route==='/budget')data={year:2026,month:10,budgetAmount:window.__budget,totalExpense:window.__expense,remaining:window.__budget===null?null:window.__budget-window.__expense,usedPercentage:window.__budget===null?null:window.__expense/window.__budget*100,timeline:{monthState:'current',daysInMonth:31,elapsedDays:12,plannedExpenseToDate:400,actualExpenseToDate:window.__expense,deviation:-150,paceStatus:'below_plan'}};
  else if(route==='/budget/categories')data={year:2026,month:10,items:[]};
  else if(route==='/goals')data={data:[],nextCursor:null};
  else if(route==='/settings')data={legacyGoal:null};
  else if(route==='/goal-funding/opening-balance')data={data:null};
  else if(route==='/notification-settings/budget')data={enabled:true,warningPercent:80,notifyExceeded:true,notifyNearLimit:true,totalBudget:true,categoryBudgets:true};
  else if(route==='/categories')data=[{id:'food',name:'อาหาร',type:'expense'}];
  else if(route==='/anomaly/queue')data={readiness:{asOfDate:today,count:0,inclusiveDays:0,ready:false,enabled:false},items:[],total:0,offset:0,limit:25,pendingEvaluation:0};
  else if(route==='/behavior')data={periods:{current:{startDate:today,endDate:today},previous:{startDate:today,endDate:today}},readiness:{current:{ready:false,expenseCount:0,observedSpanDays:0},previous:{ready:false},comparisonReady:false},findings:[]};
  else if(route==='/dashboard')data={month,asOfDate:today,period:{startDate:month+'-01',calendarEndDate:month+'-31',effectiveEndDate:today,isCurrentMonth:true},summary:{savingRate:{percent:'75.00',reason:null},transactionCount:2,incomeAmount:'1000.00',expenseAmount:'250.00',netCashFlow:'750.00',budgetAmount:'1000.00',budgetRemaining:'750.00',budgetExceeded:false,hasTransactions:true},expenseCategories:[{categoryId:'food',categoryName:'อาหาร',amount:'250.00',percentage:'100.00',transactionCount:1}],daily:[],recentTransactions:{hasMore:false,items:[]},goals:{asOfDate:today,activeCount:0,notStartedCount:0,overdueCount:0,allocatedAmount:'0.00',primaryGoal:null}};
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
};

 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')()'});
 const key=async(name,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,text:name==='Enter'?'\r':undefined});await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code});};
 const click=sel=>evaluate('(()=>{const element=document.querySelector('+JSON.stringify(sel)+');element.focus();element.click();})()');
 const values=()=>evaluate("[...document.querySelectorAll('.budget-kpis .summary-card-value')].map(e=>e.textContent)");
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/budget'});await waitFor("document.querySelectorAll('.budget-kpis .summary-card').length===4");
 assert.deepEqual(await values(),['1,000.00 บาท','250.00 บาท','750.00 บาท','0.00 บาท']);
 const budgetFont=await evaluate("getComputedStyle(document.querySelector('.summary-card-value')).fontSize");
 await evaluate("document.querySelector('.user-header-notification').focus()");await key('Enter',13);
 await waitFor("document.querySelector('.notification-dialog')&&document.querySelectorAll('.notification-item').length===2");
 assert.equal(await evaluate("document.querySelector('.user-header-notification').getAttribute('aria-expanded')"),'true');
 assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'ปิดการแจ้งเตือน');
 await key('Tab',9);assert.equal(await evaluate("document.querySelector('.notification-dialog').contains(document.activeElement)"),true);
 await key('Escape',27);await waitFor("!document.querySelector('.notification-dialog')");
 assert.equal(await evaluate("document.activeElement.classList.contains('user-header-notification')"),true);
 await click('.user-header-notification');await waitFor("document.querySelector('.notification-dialog')");
 await evaluate("document.querySelector('.budget-kpis').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
 await waitFor("!document.querySelector('.notification-dialog')");
 console.log('PASS bell: keyboard open/tab/Escape/focus return and outside click');

 await click('[aria-label="แก้งบประมาณรวม"]');await waitFor("document.querySelector('.budget-dialog').open");
 await click('.budget-dialog [type=submit]');await waitFor("window.__held.length===1");
 assert.equal(await evaluate("document.querySelector('.local-toast-success')===null"),true);
 assert.equal(await evaluate("document.querySelector('.budget-dialog [type=submit]').disabled"),true);
 assert.equal(await evaluate("document.querySelector('.budget-dialog [type=submit]').getAttribute('aria-busy')"),'true');
 await evaluate("window.__release()");await waitFor("document.querySelector('.local-toast-success')");
 assert.equal(await evaluate("document.querySelector('.local-toast-region [role=status]').textContent"),'บันทึกงบประมาณเรียบร้อยแล้ว');
 await evaluate("document.querySelector('.local-toast button').focus()");await key('Escape',27);await waitFor("!document.querySelector('.local-toast')");
 await click('[aria-label="แก้งบประมาณรวม"]');await waitFor("document.querySelector('.budget-dialog').open");
 await evaluate("window.__status=500");await click('.budget-dialog [type=submit]');await waitFor("window.__held.length===1");
 await evaluate("window.__release()");await waitFor("document.querySelector('.budget-dialog [role=alert]')?.textContent.includes('Synthetic save failure')");
 assert.equal(await evaluate("document.querySelector('.local-toast-success')===null"),true);
 await click('[aria-label="ปิดหน้าต่าง"]');
 console.log('PASS API-gated budget success; no success before resolution or after error; accessible dismiss');

 await click('.user-header-notification');await waitFor("document.querySelectorAll('.notification-item').length===2");
 await click('.notification-item');await waitFor("location.pathname==='/anomaly'&&document.querySelector('.anomaly-queue-count')");
 assert.equal(await evaluate("!document.querySelector('.notification-dialog')"),true);
 await evaluate("document.querySelector('a[href=\"/overview\"]').click()");await waitFor("document.querySelector('.dashboard-cards')");
 await click('.user-header-notification');await waitFor("document.querySelectorAll('.notification-item').length===2");
 await click('.notification-list li:nth-child(2) button');await waitFor("location.pathname==='/budget'&&location.search==='?month=2026-09'&&document.querySelector('.budget-kpis')");
 console.log('PASS anomaly notice goes to queue; budget notice preserves target month');

 for(const width of [320,390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,'Budget overflow at '+width);
  await click('.user-header-notification');await waitFor("document.querySelector('.notification-dialog')");
  assert.equal(await evaluate("(()=>{const r=document.querySelector('.notification-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"),true,'popover bounds '+width);
  await delay(200);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'motion-'+width+'.png'),Buffer.from(shot.data,'base64'));
  await key('Escape',27);
 }
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await click('.user-header-notification');await waitFor("document.querySelector('.notification-dialog')");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.notification-dialog')).animationName"),'none');
 await key('Escape',27);
 await evaluate("document.querySelector('a[href=\"/overview\"]').click()");await waitFor("document.querySelector('.dashboard-cards .summary-card')");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.summary-card-value')).fontSize"),budgetFont);
 assert.equal(await evaluate("document.querySelector('.app-content').getAnimations().length"),0);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.summary-card')).animationName"),'none');
 console.log('PASS shared card typography; 320/390/1440 responsive; reduced motion disables card/popover/route animation');

 await evaluate("document.querySelector('a[href=\"/budget\"]').click()");await waitFor("document.querySelector('.budget-kpis')");
 for(const [budget,expense,expected] of [[null,250,['ยังไม่ได้ตั้งงบ','250.00 บาท','—','0.00 บาท']],[100,250,['100.00 บาท','250.00 บาท','150.00 บาท','0.00 บาท']]]){
  await evaluate("window.__budget="+budget+";window.__expense="+expense+";document.querySelector('a[href=\"/overview\"]').click()");
  await waitFor("document.querySelector('.dashboard-cards')");
  await evaluate("document.querySelector('a[href=\"/budget\"]').click()");await waitFor("document.querySelector('.budget-kpis')");
  assert.deepEqual(await values(),expected);
 }
 console.log('PASS no-budget/over-budget values unchanged');
 await send('Page.navigate',{url:origin+'/transactions/add'});await waitFor("document.querySelector('.save-button')&&!document.querySelector('.save-button').disabled");
 await click('.save-button');await waitFor("document.querySelector('.local-toast-error')");
 assert.equal(await evaluate("document.querySelector('.local-toast-region [role=alert]').textContent.length>0"),true);
 await evaluate("document.querySelector('input[name=\"transaction-category\"]').click();var input=document.querySelector('input[inputmode=\"decimal\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'69.00');input.dispatchEvent(new Event('input',{bubbles:true}));");
 await click('.save-button');await waitFor("window.__held.length===1");
 assert.equal(await evaluate("!document.querySelector('.local-toast-success')"),true);
 await evaluate("window.__release()");await waitFor("document.querySelector('.local-toast-success')");
 assert.equal(await evaluate("document.querySelector('.local-toast-region [role=status]').textContent"),'บันทึกธุรกรรมสำเร็จ');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.local-toast')).animationName"),'none');
 console.log('PASS transaction validation error toast and success only after confirmed creation');

 await click('.local-toast button');
 await evaluate("document.querySelector('input[name=\"transaction-category\"]').click();var input=document.querySelector('input[inputmode=\"decimal\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'69.00');input.dispatchEvent(new Event('input',{bubbles:true}));");
 await click('.save-button');await waitFor("window.__held.length===1");
 assert.equal(await evaluate("!document.querySelector('.local-toast-success')"),true,'Old success cleared before next save');
 await evaluate("localStorage.setItem('spendsense_token','motion-b');window.dispatchEvent(new Event('spendsense-session'));window.__release()");
 await delay(150);
 assert.equal(await evaluate("!document.querySelector('.local-toast')"),true);
 console.log('PASS late save result cannot display toast in another session');
 await evaluate("document.querySelector('a[href=\"/overview\"]').click()");await waitFor("document.querySelector('.dashboard-cards')");
 await click('.user-header-notification');await waitFor("document.querySelectorAll('.notification-item').length===2");
 await evaluate("window.__holdRead=true");await click('.notification-item');await waitFor("window.__held.length===1");
 await evaluate("localStorage.setItem('spendsense_token','motion-c');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('.user-header-notification')?.getAttribute('aria-expanded')==='false'");
 await evaluate("window.__release()");await delay(100);
 assert.equal(await evaluate("location.pathname"),'/overview');
 assert.equal(await evaluate("!document.querySelector('.notification-dialog')"),true);
 console.log('PASS delayed notification read cannot navigate another session');

 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await evaluate("document.querySelector('a[href=\"/budget\"]').click()");await waitFor("document.querySelector('.budget-kpis')");
 assert.equal(await evaluate("document.querySelector('.budget-time-card')===null&&!document.body.textContent.includes('การใช้จ่ายเทียบแผนตามเวลา')"),true);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.budget-page')).animationName"),'spendsense-page-enter');
 await evaluate("document.querySelector('.budget-month-picker').focus()");await key('Enter',13);
 await waitFor("document.querySelector('.react-datepicker__month-text')");
 await click('.react-datepicker__month-text');
 await waitFor("location.search.includes('month=2026-01')&&!document.querySelector('.react-datepicker__month-text')");
 await waitFor("document.activeElement.classList.contains('budget-month-picker')");
 for(const width of [320,390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await click('.budget-month-picker');await waitFor("document.querySelector('.react-datepicker')");
  await delay(200);
  assert.equal(await evaluate("(()=>{const r=document.querySelector('.react-datepicker').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"),true);
  await key('Escape',27);await waitFor("!document.querySelector('.react-datepicker')");
  await click('[aria-label="แก้งบประมาณรวม"]');await waitFor("document.querySelector('.budget-dialog').open");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.budget-dialog[open]')).animationName"),'spendsense-popup-enter');
  await delay(220);
  assert.equal(await evaluate("document.querySelector('.budget-dialog[open]').contains(document.activeElement)"),true);
  assert.equal(await evaluate("(()=>{const r=document.querySelector('.budget-dialog[open]').getBoundingClientRect();return r.left>=15&&r.top>=15&&r.right<=innerWidth-15&&r.bottom<=innerHeight-15})()"),true);
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'budget-popup-'+width+'.png'),Buffer.from(shot.data,'base64'));
  await key('Escape',27);await waitFor("!document.querySelector('.budget-dialog').open");
 }
 await evaluate("[...document.querySelectorAll('.budget-toolbar-actions button')].find(b=>b.textContent.includes('ตั้งค่า')).click()");
 await waitFor("document.querySelector('#budget-notice-title')");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('#budget-notice-title').closest('dialog')).animationName"),'spendsense-popup-enter');
 await key('Escape',27);await waitFor("!document.querySelector('#budget-notice-title')");
 await evaluate("document.querySelector('a[href=\"/goals\"]').click()");await waitFor("document.querySelector('.goals-funding-note')");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.goals-page')).animationName"),'spendsense-page-enter');
 for(const selector of ['.goals-header .goals-primary','.goals-funding-note button']){
  await click(selector);await waitFor("document.querySelector('.goals-dialog[open] form')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.goals-dialog')).animationName"),'spendsense-popup-enter');
  await delay(220);
  assert.equal(await evaluate("document.querySelector('.goals-dialog').contains(document.activeElement)"),true);
  await key('Escape',27);await waitFor("!document.querySelector('.goals-dialog').open");
 }
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await click('.goals-funding-note button');await waitFor("document.querySelector('.goals-dialog[open] form')");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.goals-dialog')).animationName"),'none');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.goals-dialog'),'::backdrop').animationName"),'none');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.goals-page')).animationName"),'none');
 await key('Escape',27);
 console.log('PASS removed timeline, shared month picker/keyboard/month routing, Budget settings/create and Goals create/opening popup motion, focus, responsive and reduced motion');
 console.log('Synthetic browser/API regression only; no application/UAT database accessed.');

 }finally{if(socket)socket.close();browser.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
