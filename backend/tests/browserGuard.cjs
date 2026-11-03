// Run directly, a harness can reach whatever listens on port 4000 through the Vite /api proxy, and can read a stale dist.
if (process.env.SPENDSENSE_TEST_RUN !== '1') throw Error('Browser tests must run through: npm run test:browser (see backend/tests/README.md)');

// ProtectedRoute needs role and showSetup from /auth/me. Harness mocks drift from that contract, so every page gets it
// here: a successful or missing mock answer is completed, a deliberate error status (401, 503) passes through.
const completeAuthMe = `(()=>{
  const missing={role:'USER',showSetup:false,id:'browser-fixture',setupCompletedAt:'2026-10-01T00:00:00.000Z'};
  const reply=body=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  const wrap=inner=>async function(url,options){
    let path='';try{path=new URL(url&&url.url||url,location.href).pathname;}catch{}
    if(!/\\/auth\\/me$/.test(path))return inner.call(this,url,options);
    let response=null;try{response=await inner.call(this,url,options);}catch(e){if(e&&e.name==='AbortError')throw e;}
    if(!response||response.status===404)return reply(missing);
    if(!response.ok)return response;
    const body=await response.clone().json().catch(()=>({}));
    return typeof body.role==='string'&&typeof body.showSetup==='boolean'?response:reply({...missing,...body,role:body.role||'USER',showSetup:typeof body.showSetup==='boolean'?body.showSetup:!body.setupCompletedAt&&'setupCompletedAt' in body});
  };
  // Mocks capture window.fetch before replacing it; each wrapper closes over its own inner, so chained mocks cannot loop.
  let current=window.fetch.bind(window);
  Object.defineProperty(window,'fetch',{configurable:true,get:()=>current,set:value=>{current=wrap(value);}});
})()`;

const OWN_ID = 900001;
class GuardedWebSocket extends WebSocket {
  constructor(...args) {
    super(...args);
    // Registered before the harness can add its open handler, so this script runs before the harness's own mocks.
    this.addEventListener('open', () => this.send(JSON.stringify({ id: OWN_ID, method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: completeAuthMe } })));
  }
  get onmessage() { return this.harnessOnMessage ?? null; }
  set onmessage(handler) {
    this.harnessOnMessage = handler;
    // Harness handlers throw on a reply id they did not send.
    super.onmessage = handler && (event => { if (JSON.parse(event.data).id !== OWN_ID) handler(event); });
  }
}
globalThis.WebSocket = GuardedWebSocket;
