require('./browserGuard.cjs');
// Real browser + explicitly selected isolated acceptance server. No API mocks.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
if(!process.env.CATEGORY_ACCEPTANCE_RUNTIME)throw Error('Explicit acceptance runtime required');
const meta=JSON.parse(fs.readFileSync(process.env.CATEGORY_ACCEPTANCE_RUNTIME,'utf8'));
if(!meta.db.startsWith('spendsense_goals_test_categories_acceptance_')||meta.api!=='http://127.0.0.1:4004'||meta.frontend!=='http://127.0.0.1:5180')throw Error('Acceptance-only runtime required');
const origin=meta.frontend,delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-dashboard-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('DOM condition timed out');};


 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
 const native=window.fetch.bind(window);window.__created=[];window.__calls=[];
 window.fetch=async(url,options={})=>{
 const u=new URL(url,location.href);
 if(u.origin!==location.origin&&u.origin!==${JSON.stringify(meta.api)})throw Error('Unexpected API origin');
 const r=await native(url,options);window.__calls.push({path:u.pathname,status:r.status});
 if(u.pathname==='/transactions'&&options.method==='POST'&&r.ok)window.__created.push(await r.clone().json());
 return r;
 };
 })();`});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const go=async p=>send('Page.navigate',{url:origin+p});
 const fill=async(selector,value)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 const login=async account=>{await go('/login');await waitFor("document.querySelector('#email')!==null");await fill('#email',account.email);await fill('#password',account.password);await evaluate("document.querySelector('.login-submit').click()");await waitFor("location.pathname==='/overview'");};
 const logout=async()=>{await waitFor("document.querySelector('.sidebar-logout')!==null");await evaluate("document.querySelector('.sidebar-logout').click()");await waitFor("location.pathname==='/login'");};
 const categories=()=>evaluate("[...document.querySelectorAll('.category-option-content>span')].map(e=>e.textContent)");
 await login(meta.legacy);await go('/transactions/add');
 await waitFor("document.querySelector('.category-options')!==null && window.__calls.some(c=>c.path==='/categories'&&c.status===200)");
 assert.deepEqual(await categories(),[]);
 console.log('PASS real browser: existing account has no categories before signup');
 await logout();await go('/register');await waitFor("document.querySelector('#register-email')!==null");
 await fill('#register-email',meta.fresh.email);await fill('#register-password',meta.fresh.password);await fill('#register-confirm-password',meta.fresh.password);
 await evaluate("document.querySelector('.register-submit').click()");
 await waitFor("location.pathname==='/login'");
 await login(meta.fresh);
 const expense=['อาหารและเครื่องดื่ม','การเดินทาง','ช็อปปิ้ง','ความบันเทิง','สุขภาพ','การศึกษา','อื่นๆ'];
 const income=['เงินเดือน','รายรับอื่น ๆ'];
 async function checkCategories(){
 await go('/transactions/add');await waitFor("document.querySelectorAll('.category-option').length===7");
 assert.deepEqual(await categories(),expense);
 await evaluate("document.querySelector('.income-button').click()");
 await waitFor("document.querySelectorAll('.category-option').length===2");
 assert.deepEqual((await categories()).sort(),[...income].sort());
 }
 await checkCategories();console.log('PASS signup -> login -> seven expense and two income categories');
 async function add(type,name,amount,description){
 await go('/transactions/add');await waitFor("document.querySelectorAll('.category-option').length===7");
 if(type==='income'){await evaluate("document.querySelector('.income-button').click()");await waitFor("document.querySelectorAll('.category-option').length===2");}
 await evaluate("[...document.querySelectorAll('.category-option')].find(e=>e.textContent.includes("+JSON.stringify(name)+")).querySelector('input').click()");
 await fill('input[placeholder="0.00"]',amount);await fill('input[placeholder="เช่น ค่าอาหารกลางวัน"]',description);
 await evaluate("document.querySelector('.save-button').click()");
 await waitFor("window.__created.length===1");
 await send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
 return evaluate("window.__created[0]");
 }
 // Dismiss the real success alert as it appears, without replacing application dialogs.
 const originalMessage=socket.onmessage;
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});originalMessage(e);};
 const ex=await add('expense',expense[0],'100.07','Acceptance new expense');
 const inc=await add('income','เงินเดือน','1000.01','Acceptance new income');
 await go('/transactions');await waitFor("document.body.textContent.includes('Acceptance new expense')&&document.body.textContent.includes('Acceptance new income')");
 await go('/transactions');await waitFor("document.body.textContent.includes('Acceptance new expense')&&document.body.textContent.includes('Acceptance new income')");
 console.log('PASS new account: expense 100.07 and income 1000.01 persist and appear after refresh');
 await logout();await login(meta.legacy);await checkCategories();
 const old=await add('expense','อื่นๆ','0.08','Acceptance legacy expense');
 await go('/transactions');await waitFor("document.body.textContent.includes('Acceptance legacy expense')");
 assert.equal(await evaluate("document.body.textContent.includes('Acceptance new expense')||document.body.textContent.includes('Acceptance new income')"),false);
 const forbidden=await evaluate("fetch("+JSON.stringify(meta.api+'/transactions/'+ex.id)+",{headers:{Authorization:'Bearer '+localStorage.getItem('spendsense_token')}}).then(r=>r.status)");
 assert.equal(forbidden,404);
 console.log('PASS existing account: shared defaults usable, own expense visible, other account data inaccessible');
 await logout();await login(meta.fresh);await go('/transactions');
 await waitFor("document.body.textContent.includes('Acceptance new income')");
 assert.equal(await evaluate("document.body.textContent.includes('Acceptance legacy expense')"),false);
 for(const width of [1440,390]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 fs.writeFileSync(path.join(meta.privateDir,'history-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 }
 fs.writeFileSync(path.join(meta.privateDir,'browser-result.json'),JSON.stringify({passed:true,userAcceptance:false,transactionIds:[ex.id,inc.id,old.id],date:ex.transactionDate,expected:{newExpense:'100.07',newIncome:'1000.01',legacyExpense:'0.08'}}));
 console.log('PASS session switch and refresh preserve account isolation');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();}
})().catch(e=>{console.error('Browser acceptance failed:',e.message);process.exitCode=1;});
