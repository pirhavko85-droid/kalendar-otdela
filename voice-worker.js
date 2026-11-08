// Runs only after the operator explicitly requests the model download.
let transcriber;
self.onmessage=async({data})=>{
 try{
  if(data.type==='load'){
   const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
   env.allowLocalModels=false;
   env.backends.onnx.wasm.numThreads=1;
   transcriber=await pipeline('automatic-speech-recognition','onnx-community/whisper-tiny',{
    device:'wasm',dtype:'q8',progress_callback:p=>{
     if(p.status==='progress')self.postMessage({type:'progress',progress:Math.round(p.progress||0)});
    }
   });
   self.postMessage({type:'ready'});
  }else if(data.type==='transcribe'){
   if(!transcriber)throw new Error('Model not ready');
   const out=await transcriber(data.audio,{language:'russian',task:'transcribe',chunk_length_s:30,stride_length_s:5});
   self.postMessage({type:'text',text:out.text||''});
  }
 }catch(_){self.postMessage({type:'error',message:'Не удалось загрузить модель или распознать запись. Проверьте интернет и попробуйте снова. Можно заполнить текст вручную.'})}
};
