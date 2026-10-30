
import type { Worker, Page, Line } from 'tesseract.js';
import { isSevenElevenHeader, parseReceipt, type ReceiptResult } from '../utils/receiptParser';
type Diagnostic=(pass:string,text:string,parsed:ReceiptResult)=>void;
type Box={x:number;y:number;width:number;height:number};
const DATE_CONFIDENCE=95, TIME_CONFIDENCE=80; // conservative engineering gates, not calibrated accuracy claims
function lines(page:Page):Line[]{return page.blocks?.flatMap(b=>b.paragraphs.flatMap(p=>p.lines))??[];}
function paperBox(source:HTMLCanvasElement):Box {
  const c=document.createElement('canvas');c.width=Math.min(320,source.width);c.height=Math.round(source.height*c.width/source.width);
  const ctx=c.getContext('2d')!;ctx.drawImage(source,0,0,c.width,c.height);
  const d=ctx.getImageData(0,0,c.width,c.height).data,n=c.width*c.height,lum=new Uint8Array(n);
  for(let i=0;i<n;i++)lum[i]=Math.round(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2]);
  const sorted=Array.from(lum).sort((a,b)=>a-b),threshold=(sorted[Math.floor(n*.2)]+sorted[Math.floor(n*.85)])/2;
  const white=(i:number)=>lum[i]>=threshold&&Math.max(d[i*4],d[i*4+1],d[i*4+2])-Math.min(d[i*4],d[i*4+1],d[i*4+2])<=40;
  const seen=new Uint8Array(n),queue=new Int32Array(n);
  let best:{count:number;minX:number;maxX:number;minY:number;maxY:number}|null=null;
  for(let i=0;i<n;i++){
    if(seen[i]||!white(i))continue;
    let head=0,tail=1,minX=c.width,maxX=0,minY=c.height,maxY=0;queue[0]=i;seen[i]=1;
    while(head<tail){
      const k=queue[head++],x=k%c.width,y=Math.floor(k/c.width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const j of [x>0?k-1:-1,x<c.width-1?k+1:-1,y>0?k-c.width:-1,y<c.height-1?k+c.width:-1])
        if(j>=0&&!seen[j]&&white(j)){seen[j]=1;queue[tail++]=j;}
    }
    if(!best||tail>best.count)best={count:tail,minX,maxX,minY,maxY};
  }
  const full={x:0,y:0,width:source.width,height:source.height};
  if(!best||best.count<n*.15||(best.maxX-best.minX)>.9*c.width)return full;
  const columns=new Int32Array(c.width);
  for(let i=0;i<n;i++)if(white(i))columns[i%c.width]++;
  const peak=Math.max(...columns),selected=[...columns.keys()].filter(i=>columns[i]>=peak*.45);
  if(selected.length){best.minX=Math.max(best.minX,selected[0]);best.maxX=Math.min(best.maxX,selected[selected.length-1]);}
  const scale=source.width/c.width,pad=5;
  const x=Math.max(0,best.minX-pad)*scale,y=Math.max(0,best.minY-pad)*scale;
  return {x,y,width:Math.min(source.width-x,(best.maxX+pad+1)*scale-x),height:Math.min(source.height-y,(best.maxY+pad+1)*scale-y)};
}
function crop(source:HTMLCanvasElement,box:Box,maxWidth=1800) {
  const c=document.createElement('canvas'),scale=Math.min(3,maxWidth/box.width,Math.sqrt(20_000_000/(box.width*box.height)));
  c.width=Math.max(1,Math.floor(box.width*scale));c.height=Math.max(1,Math.floor(box.height*scale));
  c.getContext('2d')!.drawImage(source,box.x,box.y,box.width,box.height,0,0,c.width,c.height);return c;
}
export function gateTemplateDateTime(result:ReceiptResult,reference:Page) {
  const words=lines(reference).flatMap(l=>l.words);
  const date=words.filter(w=>/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(w.text));
  const time=words.filter(w=>/^\d{1,2}:\d{2}$/.test(w.text));
  for(const [field,candidates,min,issue] of [
    ['transactionDate',date,DATE_CONFIDENCE,'date'],['transactionTime',time,TIME_CONFIDENCE,'time']
  ] as const){
    if(!candidates.length||candidates.some(w=>w.confidence<min)||new Set(candidates.map(w=>w.text)).size!==1){
      result.fields[field]=null;
      result.issues=result.issues.filter(v=>!v.startsWith(issue+'_'));
      result.issues.push(issue+'_uncertain');
    }
  }
}
/** Upscaled, contrast-stretched copy of one text line: thermal-print digits (7/1, 4/14) separate better. */
function sharpenLine(source:HTMLCanvasElement,box:Box) {
  const scale=Math.min(4,Math.max(1,72/box.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(box.width*scale));c.height=Math.max(1,Math.round(box.height*scale));
  const ctx=c.getContext('2d')!;ctx.imageSmoothingQuality='high';
  ctx.filter='grayscale(1)';ctx.drawImage(source,box.x,box.y,box.width,box.height,0,0,c.width,c.height);ctx.filter='none';
  const img=ctx.getImageData(0,0,c.width,c.height),d=img.data,hist=new Array<number>(256).fill(0);
  for(let i=0;i<d.length;i+=4)hist[d[i]]++;
  const total=d.length/4;let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
  let sumB=0,wB=0,best=0,threshold=128;
  for(let t=0;t<256;t++){
    wB+=hist[t];if(!wB)continue;const wF=total-wB;if(!wF)break;
    sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF,between=wB*wF*(mB-mF)**2;
    if(between>best){best=between;threshold=t;}
  }
  // Contrast stretch around the Otsu threshold; a hard black/white cut erased faint digits in tests.
  for(let i=0;i<d.length;i+=4){const v=Math.max(0,Math.min(255,(d[i]-threshold)*2.2+160));d[i]=d[i+1]=d[i+2]=v;}
  ctx.putImageData(img,0,0);return c;
}
/**
 * Re-read only the Sub Total / discount / Total lines from sharpened crops and
 * rebuild them as "label value". Labels come from the first pass; digits from the re-read.
 */
async function rereadSummaryDigits(worker:Worker,body:HTMLCanvasElement,page:Page,canvases:HTMLCanvasElement[],check:()=>void){
  const targets=lines(page).filter(l=>/sub\s*tota?l?|^\W{0,3}\w{0,2}\s*tota?l?\b|ส่?วน\s*[ลอจต][ดตจ]|discount/i.test(l.text));
  if(!targets.some(l=>/tota?l?/i.test(l.text)&&!/sub/i.test(l.text)))return null;
  await worker.setParameters({tessedit_pageseg_mode:'7' as never});
  try{
    const out:string[]=[];
    for(const l of targets){
      const h=l.bbox.y1-l.bbox.y0,pad=Math.max(4,h*.25);
      const y=Math.max(0,l.bbox.y0-pad),box={x:0,y,width:body.width,height:Math.min(body.height-y,h+pad*2)};
      const c=sharpenLine(body,box);canvases.push(c);
      check();const text=(await worker.recognize(c)).data.text;check();
      const value=[...text.matchAll(/\d{1,3}(?:,\d{3})*\.\d{2}/g)].at(-1)?.[0];
      if(!value)return null;
      const label=/sub/i.test(l.text)?'Sub Total':/tota?l?/i.test(l.text)?'Total':'ส่วนลด';
      const count=label==='Total'?text.match(/\(?(\d{1,3})\)?\s+\d/)?.[1]:undefined;
      out.push(label+(count?' ('+count+')':'')+' '+value);
    }
    return out.join('\n');
  }finally{await worker.setParameters({tessedit_pageseg_mode:'6' as never});}
}
/** Pixel locations come from the detected paper and OCR lines, not sample coordinates. */
export async function readSevenElevenRegions(worker:Worker,source:HTMLCanvasElement,initial:Page,
  check:()=>void,diagnostic?:Diagnostic):Promise<ReceiptResult|null>{
  const canvases:HTMLCanvasElement[]=[];
  const recognize=async(c:HTMLCanvasElement,pass:string)=>{
    check();const page=(await worker.recognize(c,{}, {text:true,blocks:true})).data;check();
    if(import.meta.env.DEV)diagnostic?.(pass,page.text,parseReceipt(page.text));return page;
  };
  try{
    const paper=crop(source,paperBox(source));canvases.push(paper);
    await worker.setParameters({tessedit_pageseg_mode:'6' as never});
    const layout=await recognize(paper,'template-layout');
    // Find a candidate only near the top. Confirmation below still needs BOTH tokens.
    const header=lines(layout).find(l=>/CP\s+ALL/i.test(l.text)&&l.bbox.y0<paper.height*.35);
    if(!header)return null;
    const pad=Math.max(10,(header.bbox.y1-header.bbox.y0)*.3);
    const top=Math.max(0,header.bbox.y0-pad),height=Math.min(paper.height-top,header.bbox.y1-header.bbox.y0+2*pad);
    const headerCanvas=crop(paper,{x:0,y:top,width:paper.width,height});canvases.push(headerCanvas);
    await worker.reinitialize('eng');check();await worker.setParameters({tessedit_pageseg_mode:'7' as never});
    const headerPage=await recognize(headerCanvas,'template-header');
    if(!isSevenElevenHeader(headerPage.text)&&!isSevenElevenHeader(layout.text)&&!isSevenElevenHeader(initial.text))return null;
    const headerText=isSevenElevenHeader(headerPage.text)?headerPage.text:isSevenElevenHeader(layout.text)?layout.text.split('\n').slice(0,3).join('\n'):initial.text.split('\n').slice(0,3).join('\n');
    const amountLine=lines(layout).find(l=>/Total|ยอด|Cash|Change|เงินสด|เงินทอน/i.test(l.text)&&l.bbox.y0>header.bbox.y1);
    const ref=lines(layout).find(l=>(/R[^\s]*\d{5,}/i.test(l.text)||(amountLine&&l.bbox.y0>amountLine.bbox.y1))&&/\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}/.test(l.text)&&l.bbox.y0>header.bbox.y1);
    if(!ref){
      const safe=parseReceipt(headerText+'\n'+lines(layout).filter(l=>l.bbox.y0>header.bbox.y1).map(l=>l.text).join('\n'));
      gateTemplateDateTime(safe,layout);return safe;
    }
    const refPad=Math.max(10,(ref.bbox.y1-ref.bbox.y0)*.25),refTop=Math.max(0,ref.bbox.y0-refPad);
    const refCanvas=crop(paper,{x:0,y:refTop,width:paper.width,height:Math.min(paper.height-refTop,ref.bbox.y1-ref.bbox.y0+refPad*2)});
    canvases.push(refCanvas);
    const reference=await recognize(refCanvas,'template-reference');
    const bodyTop=header.bbox.y1+pad;
    const body=crop(paper,{x:0,y:bodyTop,width:paper.width,height:Math.max(1,ref.bbox.y0-bodyTop-refPad)});
    canvases.push(body);
    await worker.reinitialize('tha+eng');check();await worker.setParameters({tessedit_pageseg_mode:'6' as never});
    const bodyPage=await recognize(body,'template-amounts');
    const timestamp=reference.text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}/)?.[0]??'';
    const combined=headerText+'\n'+bodyPage.text+'\n'+timestamp;
    let result=parseReceipt(combined);
    if(!result.fields.amount){
      const repaired=await rereadSummaryDigits(worker,body,bodyPage,canvases,check);
      if(repaired){
        const retry=parseReceipt(headerText+'\n'+repaired+'\n'+timestamp);
        if(import.meta.env.DEV)diagnostic?.('template-digit-reread',repaired,retry);
        // Only the amount comes from the re-read; it still has to pass the parser's arithmetic gate.
        if(retry.fields.amount){
          result={...result,fields:{...result.fields,amount:retry.fields.amount},amountCandidates:retry.amountCandidates,
            issues:result.issues.filter(v=>!v.startsWith('amount_'))};
        }
      }
    }
    // Preserve layout evidence of discounts; a failed regional read must not erase it.
    const layoutBeforeReference=lines(layout).filter(l=>l.bbox.y1<=ref.bbox.y1).map(l=>l.text).join('\n');
    if(!result.fields.amount&&!/ยอดสุทธิ/.test(bodyPage.text)&&/ส่วนลด|discount|Sub\s*Total/i.test(layoutBeforeReference)){
      result.fields.amount=null;result.amountCandidates=[];result.issues.push('amount_requires_review');
    }
    gateTemplateDateTime(result,reference);
    if(import.meta.env.DEV)diagnostic?.('template-combined',combined,parseReceipt(combined));
    return result;
  }finally{for(const c of canvases){c.width=0;c.height=0;}}
}
