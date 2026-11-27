// Builds studio.html: the standalone CAI 3801 Studio with the Discount Desk lab (shadow root) and the course companion (frame) inside.
// Usage: node build-studio.js   (run node build-desk.js first, or node build-site.js which runs everything)
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const must = (c, m) => { if (!c) throw new Error("build-studio: " + m); };

const desk = fs.readFileSync(path.join(dir, "discount-desk.html"), "utf8");
const shell = fs.readFileSync(path.join(dir, "studio.src.html"), "utf8");
const comp = fs.readFileSync(path.join(dir, "companion.html"), "utf8");

// --- the lab, scoped to a shadow root (same steps as build-waypoint.js)
const css = desk.split("<style>")[1].split("</style>")[0];
const markup = desk.split("</style>")[1].split("<script>")[0].trim();
let js = desk.split("<script>")[1].split("</script>")[0];
const tokRe = /:root\{[^}]*\}\s*@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{[^}]*\}\}\s*:root\[data-theme="dark"\]\{[^}]*\}\s*/;
const tokens = (css.match(tokRe) || [])[0];
must(tokens, "desk token blocks not found");
const scoped = css.replace(tokRe, "").replace("html,body{height:100%}", "").replace(/body::before\{[^}]*\}/, "").replace(/(^|\n)body\{/, "$1.desk{");
js = js.replace(/document\.querySelectorAll\(/g, "R.querySelectorAll(").replace(/document\.querySelector\(/g, "R.querySelector(").replace(/document\.addEventListener\(/g, "R.addEventListener(");
must(!/document\.(querySelector|addEventListener|getElementById)/.test(js), "desk still queries document");
const keyLine = 'const KEY="discount-desk-v1";';
must(js.includes(keyLine), "storage key line missing");
js = js.replace(keyLine, () => 'const KEY="discount-desk-v1-"+CTX.id;');
const loadLine = 'try{const raw=localStorage.getItem(KEY);if(raw)S=Object.assign(blank(),JSON.parse(raw));}catch(e){}';
must(js.includes(loadLine), "state load line missing");
// In the classroom server the lab loads from and saves to the student's account, not this browser.
js = js.replace(loadLine, () => 'try{const got=CTX.load?CTX.load():null;const raw=got?null:localStorage.getItem(KEY);if(got){const d=blank(),g=JSON.parse(JSON.stringify(got));for(const k of Object.keys(g)){if(d[k]&&typeof d[k]==="object"&&!Array.isArray(d[k])&&g[k]&&typeof g[k]==="object")Object.assign(d[k],g[k]);else d[k]=g[k];}S=d;}else if(raw)S=Object.assign(blank(),JSON.parse(raw));}catch(e){}' + '\nif(CTX.name&&!S.name){S.name=CTX.name;S.section=CTX.section;S.letter=CTX.letter;const c=CTX.letter.charCodeAt(0);S.state=c<=70?"Ohio":c<=76?"Pennsylvania":c<=82?"New York":"California";}');
const saveLine = 'function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}';
must(js.includes(saveLine), "save line missing");
js = js.replace(saveLine, () => 'function save(){if(CTX.save){try{CTX.save(S);}catch(e){}}else{try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}try{CTX.onProgress&&CTX.onProgress(S);}catch(e){}}');
must(!/<\/script/i.test(js), "desk js contains a closing script tag");
const strings = "const DESK_CSS=" + JSON.stringify(scoped).replace(/<\//g, "<\\/") + ";\n" +
  "const DESK_MARKUP=" + JSON.stringify('<div class="desk">' + markup + "</div>").replace(/<\//g, "<\\/") + ";";

// --- practice questions: the first check of each reading, taken from the companion's reviewed content
const ri = comp.indexOf("const R={"), rj = comp.indexOf("\nconst GLOSS_EXTRA");
must(ri > 0 && rj > ri, "companion readings not found");
const R = (0, eval)("(" + comp.slice(ri + 8, rj).trim().replace(/;$/, "") + ")");
const practice = {};
for (const id of Object.keys(R)) { const e = (R[id].ex || [])[0]; if (e) practice[id] = { q: e.q, o: e.o, a: e.a, w: e.w }; }
const practiceStr = "const PRACTICE=" + JSON.stringify(practice).replace(/<\//g, "<\\/") + ";";
const compStr = "const COMP_HTML=" + JSON.stringify(comp).replace(/<\//g, "<\\/") + ";";

const practiceJs = fs.readFileSync(path.join(dir, "studio-practice.js"), "utf8");
const aiJs = fs.readFileSync(path.join(dir, "studio-ai.js"), "utf8");
const promptsJs = fs.readFileSync(path.join(dir, "studio-prompts.js"), "utf8");
const serverJs = fs.readFileSync(path.join(dir, "studio-server.js"), "utf8");
const buildJs = fs.readFileSync(path.join(dir, "studio-build.js"), "utf8");
must(!/<\/script/i.test(promptsJs + buildJs + serverJs), "prompts/build js contains a closing script tag");
must(!/<\/script/i.test(aiJs), "ai js contains a closing script tag");
must(!/<\/script/i.test(practiceJs), "practice js contains a closing script tag");
for (const ph of ["/*__DESK_TOKENS__*/", "/*__DESK_STRINGS__*/", "/*__DESK_JS__*/", "/*__COMP_STRING__*/", "/*__PRACTICE__*/", "/*__PRACTICE_JS__*/", "/*__AI_JS__*/", "/*__PROMPTS_JS__*/", "/*__BUILD_JS__*/", "/*__SERVER_JS__*/"]) must(shell.includes(ph), "placeholder missing " + ph);
// function replacements: inserted code contains $ sequences
const out = shell
  .replace("/*__DESK_TOKENS__*/", () => tokens)
  .replace("/*__DESK_STRINGS__*/", () => strings)
  .replace("/*__DESK_JS__*/", () => js)
  .replace("/*__COMP_STRING__*/", () => compStr)
  .replace("/*__AI_JS__*/", () => aiJs)
  .replace("/*__PROMPTS_JS__*/", () => promptsJs)
  .replace("/*__SERVER_JS__*/", () => serverJs)
  .replace("/*__BUILD_JS__*/", () => buildJs)
  .replace("/*__PRACTICE_JS__*/", () => practiceJs)
  .replace("/*__PRACTICE__*/", () => practiceStr);
must(!out.includes("/*__"), "placeholder left unfilled");
fs.writeFileSync(path.join(dir, "studio.html"), out);
console.log("wrote studio.html", (out.length / 1024).toFixed(1) + " KB");
