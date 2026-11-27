/* =================== App Builder: build a small analytics app by prompting a code agent ===================
   Modelled on Stanford's Probability for AI, where students build apps with a code agent and must explain
   their reasoning. The agent only gets the function name and the data. The rules behind the tests must come
   from the student's prompt, so a vague prompt fails the tests and a clear one passes. Each prompt is a
   version; every version is kept. Apps run in a sandboxed frame with no access to the page or the network. */
const PROJECTS=[
 {id:"discount",week:12,title:"Discount checker",tool:"Week 12 · guardrails",
  brief:"A sales rep picks a sub-category and types a requested discount. The app says Approve or Escalate, using the class policy caps, and shows why.",
  fn:"decide",sig:"decide(subCategory, discountPct)",ret:'"approve" or "escalate"',
  data:{caps:{Binders:45,Appliances:20,Chairs:20,Phones:30,Tables:15,Storage:25}},
  tests:[[["Binders",30],"approve","A request under the cap"],[["Binders",45],"approve","Exactly at the cap. Did your prompt say what happens at the cap?"],[["Binders",46],"escalate","Just over the cap"],[["Tables",16],"escalate","Over a small cap"],[["Rugs",10],"escalate","A sub-category that isn't in the policy. Did your prompt say what to do with unknown ones?"],[["Chairs",-5],"escalate","A negative discount. Did your prompt cover bad input?"]]},
 {id:"forecast",week:8,title:"Forecast range card",tool:"Week 8 · forecasting",
  brief:"Shows the monthly sales and next month's forecast as a range, not a single number. Point forecast: the average of the last 3 months. Range: plus or minus the largest month-to-month change in the series. The low end never goes below 0.",
  fn:"forecast",sig:"forecast(sales)",ret:"{point, low, high} (numbers)",
  data:{months:["Jan","Feb","Mar","Apr","May","Jun"],texas:[82000,91000,78000,96000,88000,94000]},
  tests:[[[[82000,91000,78000,96000,88000,94000]],{point:92667,low:74667,high:110667},"The Texas series"],[[[100,100,100]],{point:100,low:100,high:100},"Flat sales: no change, so no spread"],[[[10,50,20]],{point:26.67,low:0,high:66.67},"A big swing: the low end can't go below 0"]]},
 {id:"caption",week:7,title:"Caption number checker",tool:"Week 7 · captions",
  brief:"Paste a chart caption. The app finds every number in it and marks whether that number appears in the data table, so made-up numbers stand out.",
  fn:"checkCaption",sig:"checkCaption(text)",ret:"an array of {value, found}, one per number, in order",
  data:{table:[{category:"Furniture",sales:741718,profit:18854,margin:2.5},{category:"Technology",sales:836154,profit:145848,margin:17.4}]},
  tests:[[["Technology earned $145,848 profit on $836,154 sales."],[{value:145848,found:true},{value:836154,found:true}],"Numbers with $ and commas"],[["Furniture's margin is only 12%."],[{value:12,found:false}],"A number that isn't in the table"],[["Technology's margin was 17.4%."],[{value:17.4,found:true}],"A decimal percentage"],[["Sales are up this year."],[],"No numbers at all"]]},
 {id:"reconcile",week:5,title:"Revenue reconciler",tool:"Week 5 · reconcile",
  brief:"Enter revenue from two systems. The app shows the difference in dollars and percent, and says Match if they are within 1%, otherwise Investigate.",
  fn:"reconcile",sig:"reconcile(a, b)",ret:'{diff, pct, status} where status is "match" or "investigate"',
  data:{example:{tableau:2297201,sheet:2261536}},
  tests:[[[2297201,2261536],{diff:35665,pct:1.58,status:"investigate"},"The class example"],[[1000,995],{diff:5,pct:0.5,status:"match"},"Within 1%"],[[990,1000],{diff:-10,pct:-1,status:"match"},"Exactly 1% below. Did your prompt say if 1% counts as a match?"],[[500,0],{status:"investigate"},"Second total is zero. Did your prompt cover dividing by zero?"]]}];
const PJ=Object.fromEntries(PROJECTS.map(p=>[p.id,p]));
/* worked examples, used when no AI model is connected (and as "see one way to do it" after passing) */
const EXAMPLES={
 discount:`<!doctype html><html><body style="font-family:system-ui;padding:16px"><h3>Discount checker</h3><label>Sub-category <select id="s"></select></label> <label>Discount % <input id="d" type="number" value="30" style="width:70px"></label> <button id="go">Check</button><p id="out"></p><script>
const CAPS={Binders:45,Appliances:20,Chairs:20,Phones:30,Tables:15,Storage:25};
function decide(sub,pct){if(!(sub in CAPS))return "escalate";if(typeof pct!=="number"||isNaN(pct)||pct<0)return "escalate";return pct<=CAPS[sub]?"approve":"escalate";}
const s=document.getElementById("s");Object.keys(CAPS).forEach(k=>s.add(new Option(k,k)));
document.getElementById("go").onclick=()=>{const sub=s.value,p=parseFloat(document.getElementById("d").value);const r=decide(sub,p);document.getElementById("out").textContent=(r==="approve"?"Approve: ":"Escalate: ")+p+"% vs a "+CAPS[sub]+"% cap for "+sub+".";};
<\/script></body></html>`,
 forecast:`<!doctype html><html><body style="font-family:system-ui;padding:16px"><h3>Texas: next month</h3><div id="o"></div><script>
function forecast(s){const n=s.length,last=s.slice(-3);const point=last.reduce((a,b)=>a+b,0)/last.length;let spread=0;for(let i=1;i<n;i++)spread=Math.max(spread,Math.abs(s[i]-s[i-1]));return {point:Math.round(point*100)/100,low:Math.max(0,Math.round((point-spread)*100)/100),high:Math.round((point+spread)*100)/100};}
const f=forecast([82000,91000,78000,96000,88000,94000]);document.getElementById("o").textContent="Likely $"+Math.round(f.low).toLocaleString()+" to $"+Math.round(f.high).toLocaleString()+" (center $"+Math.round(f.point).toLocaleString()+")";
<\/script></body></html>`,
 caption:`<!doctype html><html><body style="font-family:system-ui;padding:16px"><h3>Caption checker</h3><textarea id="t" rows="3" style="width:100%">Technology earned $145,848 profit.</textarea><button id="go">Check</button><ul id="o"></ul><script>
const KNOWN=[741718,18854,2.5,836154,145848,17.4];
function checkCaption(text){return (String(text).match(/\\d[\\d,]*(\\.\\d+)?/g)||[]).map(x=>{const v=parseFloat(x.replace(/,/g,""));return {value:v,found:KNOWN.includes(v)};});}
document.getElementById("go").onclick=()=>{document.getElementById("o").innerHTML="";checkCaption(document.getElementById("t").value).forEach(r=>{const li=document.createElement("li");li.textContent=r.value+(r.found?" is in the data":" is NOT in the data");document.getElementById("o").appendChild(li);});};
<\/script></body></html>`,
 reconcile:`<!doctype html><html><body style="font-family:system-ui;padding:16px"><h3>Reconcile</h3><input id="a" value="2297201"> vs <input id="b" value="2261536"> <button id="go">Compare</button><p id="o"></p><script>
function reconcile(a,b){const diff=a-b;if(!b)return {diff,pct:null,status:"investigate"};const pct=Math.round(diff/b*10000)/100;return {diff,pct,status:Math.abs(pct)<=1?"match":"investigate"};}
document.getElementById("go").onclick=()=>{const r=reconcile(+document.getElementById("a").value,+document.getElementById("b").value);document.getElementById("o").textContent=(r.status==="match"?"Match":"Investigate")+": difference "+r.diff+" ("+r.pct+"%)";};
<\/script></body></html>`};
const HARNESS=`<script>(function(){function close(a,b){if(typeof b==="number")return typeof a==="number"&&Math.abs(a-b)<=Math.max(0.6,Math.abs(b)*0.002);if(typeof b==="string")return String(a).trim().toLowerCase()===b;if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&b.every(function(x,i){return close(a[i],x);});if(b&&typeof b==="object")return !!a&&typeof a==="object"&&Object.keys(b).every(function(k){return close(a[k],b[k]);});return a===b;}
var errs=[];window.addEventListener("error",function(e){errs.push(String(e.message||e));});
window.addEventListener("message",function(e){var m=e.data;if(!m||m.type!=="runTests")return;var f=window[m.fn];var out=m.tests.map(function(t){if(typeof f!=="function")return {ok:false,got:"no function named "+m.fn};try{var g=f.apply(null,JSON.parse(JSON.stringify(t[0])));return {ok:close(g,t[1]),got:JSON.stringify(g)};}catch(x){return {ok:false,got:"error: "+x.message};}});parent.postMessage({type:"testResults",results:out,errors:errs},"*");});})();<\/script>`;
function withHarness(html){return /<\/body>/i.test(html)?html.replace(/<\/body>/i,HARNESS+"</body>"):html+HARNESS;}
function extractHTML(t){const m=/```(?:html)?\s*([\s\S]*?)```/i.exec(t);let h=m?m[1]:t;const a=h.search(/<!doctype|<html/i);if(a<0)return null;h=h.slice(a);const b=h.search(/<\/html>/i);return b>0?h.slice(0,b+7):h;}
function B(){const b=ST.build||(ST.build={cur:"discount"});PROJECTS.forEach(p=>{b[p.id]=b[p.id]||{versions:[],sel:-1,explain:["",""],done:false};});return b;}
const AGENT_RULES=`You are a code agent that builds small single-file web apps for a business analytics course.
Output ONE complete HTML document inside a \`\`\`html code block. Plain HTML, CSS and JavaScript only. No external libraries, no network calls, no localStorage.
Keep it under 120 lines. Use a clean, simple layout.
The app MUST define the required function as a top-level "function NAME(...)" in a normal <script> tag (not a module), and the page's UI must use it.
Follow the student's instructions exactly. Where the student didn't say how to handle a case, make a reasonable choice and don't add extra rules.
After the code block, write one sentence saying what you built.`;
function agentMessages(p,v,prompt){const contract=`REQUIRED FUNCTION: ${p.sig}, returns ${p.ret}.\nDATA (use exactly): ${JSON.stringify(p.data)}`;
  if(!v)return [{role:"user",content:`${AGENT_RULES}\n\n${contract}\n\nSTUDENT'S REQUEST:\n${prompt}`}];
  return [{role:"user",content:`${AGENT_RULES}\n\n${contract}\n\nCURRENT APP:\n\`\`\`html\n${v.code}\n\`\`\`\n\nSTUDENT'S CHANGE REQUEST:\n${prompt}\n\nReturn the full updated HTML document.`}];}
let buildBusy=false;
function vBuild(){const b=B(),p=PJ[b.cur],S=b[p.id],v=S.versions[S.sel]||S.versions[S.versions.length-1],first=!S.versions.length;
  const draft=(b.draft||{})[p.id]||"";const prevPrompt=v?v.prompt:null;const live=pscore(draft,prevPrompt?{}:null);
  return `<div class="page"><h2>App Builder</h2><p class="soft lede">Describe an app. The AI writes it. The tests tell you what your prompt missed.</p>
  <div class="tabs" role="tablist">${PROJECTS.map(x=>{const s=b[x.id],last=s.versions[s.versions.length-1];return `<button role="tab" aria-selected="${x.id===p.id}" data-bproj="${x.id}">${esc(x.title)} <span class="soft small">${s.done?"✓":last?last.pass+"/"+x.tests.length:""}</span></button>`;}).join("")}</div>
  <div class="grid2"><section class="card"><div class="hd"><h3>${esc(p.title)}</h3><span class="pill g">${esc(p.tool)}</span></div><p>${esc(p.brief)}</p>
    <p class="small"><b>Your app must have:</b> <code>${esc(p.sig)}</code> returning ${esc(p.ret)}.</p>
    <details><summary class="small">Data the agent gets</summary><pre class="code">${esc(JSON.stringify(p.data,null,1))}</pre></details>
    <h3 style="margin-top:6px">Tests</h3><div class="tw"><table class="t"><tr><th>Input</th><th>Expected</th>${v?"<th></th>":""}</tr>${p.tests.map((t,i)=>{const r=v&&v.results?v.results[i]:null;return `<tr><td class="small"><code>${esc(p.fn)}(${esc(t[0].map(x=>JSON.stringify(x)).join(", "))})</code><div class="tiny soft">${esc(t[2].split(".")[0])}</div></td><td class="small"><code>${esc(JSON.stringify(t[1]))}</code></td>${v?`<td class="small">${r?(r.ok?'<b class="ok">✓</b>':`<b class="bad">✗</b><div class="tiny soft">got ${esc(String(r.got).slice(0,60))}</div>`):""}</td>`:""}</tr>`;}).join("")}</table></div></section>
   <section class="card"><h3>${first?"1. Describe your app":"Ask for a change"}</h3>
    <p class="small soft">${first?"Say what it does, who uses it, what data to use, how it should look, and the rules for tricky cases.":"Say exactly what to fix. The AI keeps the rest."}</p>
    <textarea id="bprompt" aria-label="Your prompt to the code agent" placeholder="${first?"Build an app for a sales rep that…":"The test for … failed. Change it so…"}">${esc(draft)}</textarea>
    <div id="blive">${chipsFor(live)}</div>
    <div class="row"><button class="btn" id="bgo" ${buildBusy?"disabled":""}>${buildBusy?"Building…":first?"Build it":"Update the app"}</button>${!sampleOK?`<button class="btn alt" data-bexample="${p.id}">See an example build</button>`:""}<span class="small soft" id="bstat" aria-live="polite">${sampleOK?"Runs on "+esc(AI.label):"No AI model here: you can still load an example and run the tests."}</span></div>
    ${v&&v.fails&&v.fails.length&&!buildBusy?`<div class="note small"><b>What to add to your next prompt:</b><ul>${v.fails.slice(0,3).map(f=>`<li>${esc(f)}</li>`).join("")}</ul></div>`:""}</section></div>
  ${v?`<section class="card"><div class="hd"><h3>Your app · version ${S.versions.indexOf(v)+1}</h3><span class="${v.pass===p.tests.length?"ok":"warn"}"><b>${v.pass==null?"…":v.pass}/${p.tests.length} tests pass</b></span></div>
   <iframe id="bframe" class="bframe" sandbox="allow-scripts allow-forms" title="Your app preview"></iframe>
   <div class="row"><span class="small soft">Versions:</span>${S.versions.map((x,i)=>`<button class="chip vchip ${x===v?"on":""}" data-bver="${i}" title="${esc(x.prompt.slice(0,120))}">v${i+1} · ${x.pass==null?"?":x.pass}/${p.tests.length}</button>`).join("")}</div>
   <details><summary class="small">Prompt for this version</summary><div class="work">${esc(v.prompt)}</div></details>
   <details><summary class="small">See the code (${v.code.split("\n").length} lines)</summary><pre class="code">${esc(v.code)}</pre></details></section>`:""}
  ${v&&v.pass===p.tests.length?`<section class="card"><h3>${S.done?"Explained ✓":"Last step: explain your app"}</h3><p class="small soft">In your own words. Your TA reads these. This is how you show you're growing alongside the AI, not just using it.</p>
   <label class="small"><b>How does your app decide?</b><textarea id="bex0">${esc(S.explain[0])}</textarea></label>
   <label class="small"><b>What input could still break it, and how would you test that?</b><textarea id="bex1">${esc(S.explain[1])}</textarea></label>
   <div class="row"><button class="btn" data-bexplain="${p.id}">${S.done?"Update":"Save (+60 XP)"}</button></div></section>`:""}
  </div>`;}
function bindBuild(){const ta=$("#bprompt");if(!ta)return;const b=B(),p=PJ[b.cur],S=b[p.id];
  ta.oninput=()=>{(b.draft=b.draft||{})[p.id]=ta.value;save();const v=S.versions[S.versions.length-1];$("#blive").innerHTML=chipsFor(pscore(ta.value,v?{}:null));};
  $("#bgo").onclick=()=>buildApp(ta.value.trim());
  const fr=$("#bframe");if(fr){const v=S.versions[S.sel]||S.versions[S.versions.length-1];runApp(fr,p,v);}}
function runApp(fr,p,v){let got=false;const onMsg=e=>{if(e.source!==fr.contentWindow||!e.data||e.data.type!=="testResults")return;got=true;window.removeEventListener("message",onMsg);
    const res=e.data.results;const pass=res.filter(r=>r.ok).length;const changed=v.pass!==pass;v.results=res;v.pass=pass;
    const bug=res.filter(r=>!r.ok&&/null|NaN|undefined|error|no function/.test(String(r.got)));
    v.fails=(bug.length?[`Some results are empty or broken (${String(bug[0].got).slice(0,50)}). That's a bug in the AI's code, not a missing rule. Ask it to fix that exact problem, and paste what you saw.`]:[]).concat(p.tests.map((t,i)=>res[i]&&!res[i].ok&&!bug.includes(res[i])?t[2]:null).filter(Boolean).map(x=>x.includes(".")?x.split(". ").slice(1).join(". ")||x:x+": check your rules for this case."));
    if(changed){save();if(pass===p.tests.length)toast("All tests pass. Now explain your app.");render();}};
  window.addEventListener("message",onMsg);
  fr.onload=()=>{try{fr.contentWindow.postMessage({type:"runTests",fn:p.fn,tests:p.tests},"*");}catch(e){}setTimeout(()=>{if(!got){window.removeEventListener("message",onMsg);if(v.pass==null){v.pass=0;v.results=p.tests.map(()=>({ok:false,got:"the app didn't respond (script error?)"}));v.fails=["The app has a script error. Ask the agent to fix the error, or rebuild with a simpler prompt."];save();render();}}},3500);};
  fr.srcdoc=withHarness(v.code);}
async function buildApp(prompt){const b=B(),p=PJ[b.cur],S=b[p.id];if(buildBusy)return;if(prompt.length<12){toast("Write a fuller prompt first");return;}
  if(!sampleOK){toast("No AI model connected. Load the example instead.");return;}
  const v=S.versions[S.versions.length-1];buildBusy=true;logPrompt("builder",prompt,{key:p.id});render();const st=()=>$("#bstat");
  try{const sm=await getSample();let lines=0;const r=await sm(agentMessages(p,v,prompt),{modelTier:"default",cache:false,onText:({text})=>{const n=text.split("\n").length;if(n!==lines){lines=n;const s=st();if(s)s.textContent=`Writing code… ${n} lines`;}}});
    const code=extractHTML(String(r.text||""));if(!code)throw {code:"no_html"};
    S.versions.push({prompt,code,at:Date.now(),pass:null});S.sel=S.versions.length-1;(b.draft||{})[p.id]="";logEvent("practiced","builder-"+p.id,p.week,{version:S.versions.length});}
  catch(e){toast(e&&e.code==="no_html"?"The AI didn't return a full app. Try again, or say 'one HTML file'.":"The AI didn't answer. Try again.");}
  buildBusy=false;save();render();}
document.addEventListener("click",e=>{
  const bp=e.target.closest("[data-bproj]");if(bp){B().cur=bp.dataset.bproj;save();render();return;}
  const bv=e.target.closest("[data-bver]");if(bv){const b=B();b[b.cur].sel=+bv.dataset.bver;save();render();return;}
  const bx=e.target.closest("[data-bexample]");if(bx){const b=B(),id=bx.dataset.bexample,S=b[id];S.versions.push({prompt:"(Worked example from the course team)",code:EXAMPLES[id],at:Date.now(),pass:null,example:true});S.sel=S.versions.length-1;save();render();return;}
  const be=e.target.closest("[data-bexplain]");if(be){const S=B()[be.dataset.bexplain];const a=$("#bex0").value.trim(),c=$("#bex1").value.trim();if(a.split(/\s+/).length<8||c.split(/\s+/).length<6){toast("Write a little more for each answer");return;}
    S.explain=[a,c];if(!S.done){S.done=true;ST.bonus=(ST.bonus||0)+60;logEvent("completed","builder-"+be.dataset.bexplain,PJ[be.dataset.bexplain].week);toast("+60 XP · app explained");}else toast("Saved");save();render();return;}
});
