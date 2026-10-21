// Run explicitly after npm ci. Downloads code/models only; never sends user images/text.
// Versioned model URLs + SHA256 manifest prevent silently replacing installed assets.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'public','ocr');
(async()=>{
 fs.mkdirSync(path.join(dest,'core'),{recursive:true});fs.mkdirSync(path.join(dest,'lang'),{recursive:true});
 fs.copyFileSync(path.join(root,'node_modules/tesseract.js/dist/worker.min.js'),path.join(dest,'worker.min.js'));
 const core=path.join(root,'node_modules/tesseract.js-core');
 for(const f of fs.readdirSync(core))if(/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.(?:js|wasm|wasm\.js)$/.test(f))fs.copyFileSync(path.join(core,f),path.join(dest,'core',f));
 const manifestPath=path.join(__dirname,'ocr-models.json');
 const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath)):{};
 for(const lang of ['tha','eng']){
  const url='https://cdn.jsdelivr.net/npm/@tesseract.js-data/'+lang+'@1.0.0/4.0.0_best_int/'+lang+'.traineddata.gz';
  const target=path.join(dest,'lang',lang+'.traineddata.gz');
  const bytes=fs.existsSync(target)?fs.readFileSync(target):Buffer.from(await(await fetch(url)).arrayBuffer());
  if(bytes[0]!==31||bytes[1]!==139)throw Error('Invalid model archive');
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(manifest[lang]&&manifest[lang].sha256!==hash)throw Error('Model checksum mismatch');
  manifest[lang]={url,sha256:hash};fs.writeFileSync(target,bytes);
 }
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 for(const pkg of ['tesseract.js','tesseract.js-core'])fs.copyFileSync(path.join(root,'node_modules',pkg,pkg==='tesseract.js'?'LICENSE.md':'LICENSE'),path.join(dest,'LICENSE-'+pkg+'.txt'));
 console.log('Local OCR assets prepared (tha/eng); no runtime CDN required');
})().catch(()=>{console.error('OCR asset setup failed');process.exitCode=1;});
