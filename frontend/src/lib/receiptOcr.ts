import { readSevenElevenRegions } from './receiptRegions';
import type { Worker } from 'tesseract.js';
import { parseReceipt, type ReceiptResult } from '../utils/receiptParser';
export const MAX_RECEIPT_BYTES=5*1024*1024, MAX_RECEIPT_PIXELS=20_000_000;
export async function validateReceipt(file: File) {
  if(!file.size || file.size>MAX_RECEIPT_BYTES)throw Error('ภาพต้องมีขนาดไม่เกิน 5 MiB');
  const b=new Uint8Array(await file.slice(0,32).arrayBuffer());
  const png=[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
  const jpeg=b[0]===255&&b[1]===216&&b[2]===255;
  const ascii=(start:number,end:number)=>String.fromCharCode(...b.slice(start,end));
  const webp=ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
  if(webp&&file.type==='image/webp'){
    const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
    if(b.length<30||view.getUint32(4,true)+8!==file.size)throw Error('ไฟล์ WebP เสียหรือไม่รองรับ');
    const chunk=ascii(12,16);
    let width=0,height=0;
    if(chunk==='VP8X'){width=1+b[24]+(b[25]<<8)+(b[26]<<16);height=1+b[27]+(b[28]<<8)+(b[29]<<16);}
    else if(chunk==='VP8L'&&b[20]===0x2f){const bits=view.getUint32(21,true);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);}
    else if(chunk==='VP8 '&&b[23]===0x9d&&b[24]===0x01&&b[25]===0x2a){width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff;}
    if(!width||!height||width*height>MAX_RECEIPT_PIXELS)throw Error('ไฟล์ WebP เสียหรือภาพเกิน 20 ล้านพิกเซล');
  }
  if(!((file.type==='image/png'&&png)||(file.type==='image/jpeg'&&jpeg)||(file.type==='image/webp'&&webp)))throw Error('รองรับเฉพาะภาพ JPG/PNG/WebP ที่ถูกต้อง');
  if(png && b.length>=24){const view=new DataView(b.buffer);if(view.getUint32(16)*view.getUint32(20)>MAX_RECEIPT_PIXELS)throw Error('ภาพต้องไม่เกิน 20 ล้านพิกเซล');}
  if(jpeg){
    const data=new Uint8Array(await file.arrayBuffer());let offset=2,found=false;
    while(offset+3<data.length){
      if(data[offset++]!==255)break;
      while(data[offset]===255)offset++;
      const marker=data[offset++];if(marker===0xda||marker===0xd9)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      const length=(data[offset]<<8)|data[offset+1];if(length<2||offset+length>data.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){
        const height=(data[offset+3]<<8)|data[offset+4],width=(data[offset+5]<<8)|data[offset+6];
        if(!width||!height||width*height>MAX_RECEIPT_PIXELS)throw Error('ภาพต้องไม่เกิน 20 ล้านพิกเซล');
        found=true;break;
      }
      offset+=length;
    }
    if(!found)throw Error('ไฟล์ JPG เสียหรือไม่รองรับ');
  }
  let image:ImageBitmap;
  try{image=await createImageBitmap(file);}catch{throw Error('เปิดภาพไม่ได้ กรุณาเลือกภาพใหม่หรือกรอกข้อมูลเอง');}
  const valid=image.width>0&&image.height>0&&image.width*image.height<=MAX_RECEIPT_PIXELS;
  image.close();if(!valid)throw Error('ภาพต้องไม่เกิน 20 ล้านพิกเซล');
}
export function readReceipt(file: File, progress: (value: string, percent?:number)=>void, diagnostic?: (pass: string, text: string, parsed: ReceiptResult)=>void) {
  let cancelled=false;
  let worker:Worker|undefined;
  const promise=(async()=>{
    await validateReceipt(file);
    if(cancelled)throw Error('CANCELLED');
    progress('กำลังเตรียมตัวอ่านข้อความ');
    const {createWorker}=await import('tesseract.js');
    if(cancelled)throw Error('CANCELLED');
    worker=await createWorker(['tha','eng'],1,{
      workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',
      workerBlobURL:false,logger:m=>{if(!cancelled)progress(m.status==='recognizing text'?'กำลังอ่านข้อความ '+Math.round(m.progress*100)+'%':'กำลังเตรียมตัวอ่านข้อความ',m.status==='recognizing text'&&Number.isFinite(m.progress)?Math.round(Math.max(0,Math.min(1,m.progress))*100):undefined);}
    });
    if(cancelled){await worker.terminate();throw Error('CANCELLED');}
    try {
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(3,Math.max(1,1600/bitmap.width),Math.sqrt(MAX_RECEIPT_PIXELS/(bitmap.width*bitmap.height)));
      const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
      const context=canvas.getContext('2d');if(!context){bitmap.close();throw Error('Canvas unavailable');}
      context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const result=await worker.recognize(canvas,{}, {text:true,blocks:true});if(cancelled)throw Error('CANCELLED');const parsed=parseReceipt(result.data.text);if(import.meta.env.DEV)diagnostic?.('resized',result.data.text,structuredClone(parsed));
      // Resizing can merge tiny punctuation. Re-read the original only for a
      // missing fields; never override conflicts or repair OCR digits.
      if(['date_not_found','time_not_found','amount_not_found'].some(issue=>parsed.issues.includes(issue)) && scale>1){
        const original=await worker.recognize(file);if(cancelled)throw Error('CANCELLED');
        const fallback=parseReceipt(original.data.text);
        if(!parsed.suggestedPaymentMethod)parsed.suggestedPaymentMethod=fallback.suggestedPaymentMethod;
        if(import.meta.env.DEV)diagnostic?.('original-fallback',original.data.text,structuredClone(fallback));
        for(const [field,issue]of [['transactionDate','date'],['transactionTime','time'],['amount','amount']] as const){
          if(parsed.issues.includes(issue+'_not_found')&&fallback.fields[field]){
            parsed.fields[field]=fallback.fields[field];parsed.issues=parsed.issues.filter(v=>v!==issue+'_not_found');
            if(field==='amount')parsed.amountCandidates=fallback.amountCandidates;
          }
        }
      }

      // One bounded in-memory fallback: the local retail photo experiment
      // recovered explicit time after grayscale/contrast, but not a net label.
      // Keep strict parser semantics; never overwrite conflicts or existing fields.
      if(parsed.issues.includes('time_not_found')||parsed.issues.includes('amount_not_found')){
        if(cancelled)throw Error('CANCELLED');
        const enhanced=document.createElement('canvas');
        enhanced.width=canvas.width;enhanced.height=canvas.height;
        const enhancedContext=enhanced.getContext('2d');
        if(enhancedContext){
          try{
            enhancedContext.filter='grayscale(1) contrast(1.6)';
            enhancedContext.drawImage(canvas,0,0);
            const enhancedText=(await worker.recognize(enhanced)).data.text;
            if(cancelled)throw Error('CANCELLED');
            const fallback=parseReceipt(enhancedText);
            if(!parsed.suggestedPaymentMethod)parsed.suggestedPaymentMethod=fallback.suggestedPaymentMethod;
            if(import.meta.env.DEV)diagnostic?.('contrast-fallback',enhancedText,structuredClone(fallback));
            for(const [field,issue]of [['transactionDate','date'],['transactionTime','time'],['amount','amount'],['description','recipient']] as const){
              if(parsed.issues.includes(issue+'_not_found')&&fallback.fields[field]){
                parsed.fields[field]=fallback.fields[field];
                parsed.issues=parsed.issues.filter(v=>v!==issue+'_not_found');
                if(field==='amount'){
                  parsed.amountCandidates=fallback.amountCandidates;
                  if(fallback.issues.includes('currency_ocr_uncertain')&&!parsed.issues.includes('currency_ocr_uncertain'))parsed.issues.push('currency_ocr_uncertain');
                }
              }
            }
          }finally{enhanced.width=0;enhanced.height=0;}
        }
      }
      const native=await createImageBitmap(file),regionCanvas=document.createElement('canvas');
      regionCanvas.width=native.width;regionCanvas.height=native.height;regionCanvas.getContext('2d')!.drawImage(native,0,0);native.close();
      try{const regional=await readSevenElevenRegions(worker,regionCanvas,result.data,()=>{if(cancelled)throw Error('CANCELLED');},diagnostic);return regional??parsed;}
      finally{regionCanvas.width=0;regionCanvas.height=0;canvas.width=0;canvas.height=0;}}
    finally{await worker.terminate();worker=undefined;}
  })();
  return {promise,cancel:()=>{cancelled=true;if(worker)void worker.terminate();}};
}
/** Detailed read: shrink to ≤1600px JPEG (measured as the smallest size that kept every summary line). */
export async function detailedReadImage(file: File, maxSide=1600): Promise<Blob> {
  await validateReceipt(file);
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const context=canvas.getContext('2d');if(!context){bitmap.close();throw Error('Canvas unavailable');}
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  try{
    const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/jpeg',0.9));
    if(!blob)throw Error('ย่อภาพไม่สำเร็จ');return blob;
  }finally{canvas.width=0;canvas.height=0;}
}
