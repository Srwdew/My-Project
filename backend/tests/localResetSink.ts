import http from 'node:http';
import type { ResetMail } from '../src/lib/passwordResetMail';
// Local in-memory sink. Inbox is only accessible to this process, not via HTTP.
export async function startLocalResetSink() {
  const messages:ResetMail[]=[];
  let fail=false;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'||req.url!=='/messages'){res.writeHead(404);res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){res.writeHead(413);res.end();return;}}
    if(fail||messages.length>=100){res.writeHead(503);res.end();return;}
    try {
      const value=JSON.parse(body);
      if(typeof value.to!=='string'||typeof value.resetUrl!=='string'||value.expiresInMinutes!==15)throw Error();
      messages.push(value);res.writeHead(202);res.end();
    }catch{res.writeHead(400);res.end();}
  });
  server.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const address=server.address();if(!address||typeof address==='string')throw Error('Sink start failed');
  return {messages,url:'http://127.0.0.1:'+address.port+'/messages',
    setFailure:(value:boolean)=>{fail=value;},
    close:()=>new Promise<void>(r=>server.close(()=>r()))};
}
