/* =================== AI connector: local Llama first, then Claude, then scripted =================== */
/* Local: Ollama on this computer (http://localhost:11434). Works when the Studio is opened from the local site.
   claude.ai pages cannot reach localhost, so there the Studio falls back to Claude. Nothing leaves the laptop on the local path. */
const OLLAMA="http://localhost:11434";
const AI={provider:null,model:null,label:"",models:[],sample:null};
function pickLocalModel(names){const want=(ST.settings&&ST.settings.localModel)||"";if(want&&names.includes(want))return want;return names.find(n=>/llama3\.1|llama3|llama/i.test(n))||names[0]||null;}
async function detectAI(){
  if(window.CAI_BOOT){const k=getKey();if(k){AI.provider="gemini";AI.model=getModelPref()||"gemini-2.5-flash-lite";AI.label="Your Gemini key ("+AI.model+")";return;}
    if(window.CAI_BOOT.ai){AI.provider="server";AI.label="Course AI";}else{AI.provider=null;AI.label="";}return;}
  try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),1800);
    const r=await fetch(OLLAMA+"/api/tags",{signal:ctl.signal});clearTimeout(t);
    if(r.ok){const j=await r.json();AI.models=(j.models||[]).map(m=>m.name).filter(n=>!/embed|bge|minilm|e5-/i.test(n));const m=pickLocalModel(AI.models);
      if(m){AI.provider="ollama";AI.model=m;AI.label=m.replace(/:.*/,"").replace(/^llama3\.1$/,"Llama 3.1")+" on this laptop";return;}}}catch(e){}
  try{const s=window.claude&&window.claude.use?await window.claude.use("sample"):null;if(s){AI.provider="claude";AI.sample=s;AI.label="Claude";return;}}catch(e){}
  AI.provider=null;AI.label="";}
const toMessages=input=>typeof input==="string"?[{role:"user",content:input}]:input.map(m=>({role:m.role,content:String(m.content)}));
async function ollamaChat(input,opts){const json=!!opts.json,onText=typeof opts.onText==="function"?opts.onText:null;
  const body={model:AI.model,messages:toMessages(input),stream:!!onText,options:{temperature:json?0:0.4,num_ctx:8192}};if(json)body.format="json";
  let r;try{r=await fetch(OLLAMA+"/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:opts.signal});}
  catch(e){throw {code:"upstream_error",message:"Local model unreachable"};}
  if(!r.ok)throw {code:"upstream_error",message:"Local model error "+r.status};
  if(!onText){const j=await r.json();const text=(j.message&&j.message.content)||"";if(!text.trim())throw {code:"empty_completion",message:"No text"};return {text,truncated:false};}
  const rd=r.body.getReader(),dec=new TextDecoder();let buf="",text="";
  for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
    while((i=buf.indexOf("\n"))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line)continue;let j;try{j=JSON.parse(line);}catch(e){continue;}
      const d=(j.message&&j.message.content)||"";if(d){text+=d;try{onText({text,delta:d});}catch(e){}}}}
  if(!text.trim())throw {code:"empty_completion",message:"No text"};return {text,truncated:false};}
function parseLooseJSON(t){try{return JSON.parse(t);}catch(e){}const m=/```(?:json)?\s*([\s\S]*?)```/.exec(t);if(m){try{return JSON.parse(m[1]);}catch(e){}}
  const a=t.search(/[\[{]/),b=Math.max(t.lastIndexOf("}"),t.lastIndexOf("]"));if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1));}catch(e){}}throw {code:"invalid_json",message:"Reply was not JSON",text:t};}
/* One function with the same shape the pages already use: fn(input, opts) -> {text}; fn.json(input, opts) -> value */
/* Bring your own key: each person's free Gemini API key, kept only in their own browser.
   Calls go straight from this page to Google; the course server never sees or stores the key.
   Week 3 of the course already has students make a key (Reading 3.1, the API key guide). */
const GEM="https://generativelanguage.googleapis.com/v1beta";
const keySlot=()=>"cai-gemini-key:"+((window.CAI_BOOT&&window.CAI_BOOT.user&&window.CAI_BOOT.user.id)||"demo");
const modelSlot=()=>"cai-gemini-model:"+((window.CAI_BOOT&&window.CAI_BOOT.user&&window.CAI_BOOT.user.id)||"demo");
function getKey(){try{return sessionStorage.getItem(keySlot())||localStorage.getItem(keySlot())||"";}catch(e){return "";}}
function keyRemembered(){try{return !!localStorage.getItem(keySlot());}catch(e){return false;}}
function setKey(k,remember){try{sessionStorage.removeItem(keySlot());localStorage.removeItem(keySlot());if(k)(remember?localStorage:sessionStorage).setItem(keySlot(),k);}catch(e){}}
function getModelPref(){try{return localStorage.getItem(modelSlot())||"";}catch(e){return "";}}
function setModelPref(m){try{if(m)localStorage.setItem(modelSlot(),m);else localStorage.removeItem(modelSlot());}catch(e){}}
function gemError(status,j){const msg=(j&&j.error&&j.error.message)||"";
  if(status===429)return {code:"rate_limited",message:"Your free Gemini limit is used up for now. It resets daily at midnight Pacific time."};
  if(status===400&&/api key/i.test(msg)||status===401||status===403)return {code:"bad_key",message:"Google didn't accept that key. Check it on the AI key page."};
  return {code:"upstream_error",message:msg||("Gemini error "+status)};}
async function geminiModels(key){let r;try{r=await fetch(GEM+"/models?pageSize=200",{headers:{"x-goog-api-key":key}});}catch(e){throw {code:"upstream_error",message:"Couldn't reach Google. Check your connection."};}
  const j=await r.json().catch(()=>({}));if(!r.ok)throw gemError(r.status,j);
  return (j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>String(m.name).replace(/^models\//,"")).filter(n=>/^gemini/.test(n)&&!/(image|tts|live|audio|embedding|vision|learnlm)/.test(n));}
function pickGemini(names){const pref=getModelPref();if(pref&&names.includes(pref))return pref;
  const order=[/^gemini-2\.5-flash-lite$/,/^gemini-[\d.]+-flash-lite$/,/^gemini-2\.5-flash$/,/^gemini-[\d.]+-flash$/,/flash-lite/,/flash/];
  for(const re of order){const m=names.find(n=>re.test(n)&&!/(preview|exp)/.test(n))||names.find(n=>re.test(n));if(m)return m;}return names[0]||null;}
async function geminiChat(input,opts){opts=opts||{};const key=getKey();if(!key)throw {code:"no_key",message:"Add your free Gemini key on the AI key page."};
  const msgs=toMessages(input);const body={contents:msgs.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),generationConfig:{temperature:opts.json?0:0.4}};
  if(opts.json)body.generationConfig.responseMimeType="application/json";
  let r;try{r=await fetch(`${GEM}/models/${encodeURIComponent(AI.model||"gemini-2.5-flash-lite")}:generateContent`,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":key},body:JSON.stringify(body),signal:opts.signal});}
  catch(e){throw {code:"upstream_error",message:"Couldn't reach Gemini. Check your connection."};}
  const j=await r.json().catch(()=>({}));if(!r.ok)throw gemError(r.status,j);
  const c=j.candidates&&j.candidates[0];const text=((c&&c.content&&c.content.parts)||[]).map(p=>p.text||"").join("");
  if(!text.trim())throw {code:"empty_completion",message:j.promptFeedback&&j.promptFeedback.blockReason?"Gemini declined this request.":"Gemini sent an empty reply."};
  if(typeof opts.onText==="function"){try{opts.onText({text,delta:text});}catch(e){}}
  return {text,truncated:c&&c.finishReason==="MAX_TOKENS"};}
/* Re-check which AI to use, e.g. after someone adds or removes their key. */
async function reconnectAI(){await detectAI();sampleOK=!!AI.provider;
  if((AI.provider==="gemini"||AI.provider==="server"||AI.provider==="ollama")){const shim=makeAI();window.claude={use:async n=>n==="sample"?shim:null};}
  else if(window.CAI_BOOT)window.claude={use:async()=>null};
  /* The open reading pane and lab pick up the new key without a reload. */
  document.querySelectorAll("iframe").forEach(f=>{try{const w=f.contentWindow;if(w&&typeof w.initAI==="function")w.initAI();}catch(e){}});
  if(ST.persona)render();return AI;}

/* Classroom server: the model and its key stay on the server; this page only sends the messages. */
async function serverChat(input,opts){opts=opts||{};let r;
  try{r=await fetch("/api/c/ai",{method:"POST",headers:{"content-type":"application/json","x-cai-csrf":"1"},body:JSON.stringify({messages:toMessages(input),json:!!opts.json}),signal:opts.signal});}
  catch(e){throw {code:"upstream_error",message:"AI unreachable"};}
  const j=await r.json().catch(()=>({}));if(!r.ok)throw {code:j.error||"upstream_error",message:j.message||"AI error"};
  const text=String(j.text||"");if(typeof opts.onText==="function"&&text){try{opts.onText({text,delta:text});}catch(e){}}
  if(opts.json)return j.json!=null?j.json:parseLooseJSON(text);if(!text.trim())throw {code:"empty_completion",message:"No text"};return {text,truncated:false};}
function makeAI(){if(AI.provider==="claude")return AI.sample;
  if(AI.provider==="gemini"){const f=(input,opts)=>geminiChat(input,Object.assign({},opts||{},{json:false}));f.json=async(input,opts)=>parseLooseJSON((await geminiChat(input,Object.assign({},opts||{},{json:true,onText:null}))).text);return f;}
  if(AI.provider==="server"){const f=(input,opts)=>serverChat(input,Object.assign({},opts||{},{json:false}));f.json=(input,opts)=>serverChat(input,Object.assign({},opts||{},{json:true,onText:null}));return f;}if(AI.provider!=="ollama")return null;
  const f=(input,opts)=>ollamaChat(input,opts||{});f.json=async(input,opts)=>{const r=await ollamaChat(input,Object.assign({},opts||{},{json:true,onText:null}));return parseLooseJSON(r.text);};return f;}
const aiReady=detectAI().then(()=>{
  /* Let the embedded lab and companion use the same model: give them a window.claude-shaped hook when only the local model is present. */
  if((AI.provider==="ollama"||AI.provider==="server"||AI.provider==="gemini")&&!(window.claude&&window.claude.use)){const shim=makeAI();window.claude={use:async n=>n==="sample"?shim:null};}
  return AI;});
