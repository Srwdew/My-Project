require('./browserGuard.cjs');
// Reuse the original UI regression without modifying its existing local changes.
// All API traffic is synthetic. Optional origin is for the existing local dev server.
const fs=require('fs'),path=require('path'),Module=require('module');
const original=path.join(__dirname,'goalIntention.browser.cjs');
let source=fs.readFileSync(original,'utf8');
const anchor='return json({data:rows,nextCursor:null});';
if(!source.includes(anchor))throw Error('Original fixture changed; review adapter');
source=source.replace(anchor,`return json({data:rows,nextCursor:null,...(window.__includeAssessment?{assessment:{scope:'all_active_goals',plan:{policy:'backend-only-sentinel',status:'shortfall',shortfall:'600.00'},forecastSignal:{reason:'above_reference',amount:'123.45',endDate:'2026-10-19'}}}:{})});`);
source=source.replaceAll('http://localhost:4000',process.env.SETTINGS_API_ORIGIN||'http://localhost:4000');
const check=`
 const priorHTML=await evaluate("document.querySelector('.goals-page').outerHTML");
 const priorCalls=await evaluate("window.__calls.filter(c=>c.path==='/goals'&&c.method==='GET').length");
 await evaluate("window.__includeAssessment=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("window.__calls.filter(c=>c.path==='/goals'&&c.method==='GET').length>"+priorCalls+"&&document.querySelector('.goals-empty,.goal-card')!==null");
 assert.equal(await evaluate("document.querySelector('.goals-page').outerHTML"),priorHTML);
 assert.equal(await evaluate("document.querySelector('.goals-planning')===null"),true);
 assert.equal(await evaluate("window.__calls.some(c=>c.path.startsWith('/goals/plan')||c.path==='/forecast')"),false);
 console.log('PASS additional backend assessment leaves original Goals DOM identical; no new UI or endpoint calls');
`;
source=source.replace(" await send('Browser.close')",check+"\n await send('Browser.close')");
const m=new Module(original,module);m.filename=original;m.paths=Module._nodeModulePaths(path.dirname(original));m._compile(source,original);
