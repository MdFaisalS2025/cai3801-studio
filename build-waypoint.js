// Builds waypoint.html: the Waypoint course shell with the Discount Desk lab embedded in a shadow root.
// Usage: node build-waypoint.js
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const desk = fs.readFileSync(path.join(dir, "discount-desk.html"), "utf8");
const shell = fs.readFileSync(path.join(dir, "waypoint.src.html"), "utf8");

function must(cond, msg) { if (!cond) throw new Error("build: " + msg); }

// --- split the desk file
const css = desk.split("<style>")[1].split("</style>")[0];
const markup = desk.split("</style>")[1].split("<script>")[0].trim();
let js = desk.split("<script>")[1].split("</script>")[0];

// --- tokens move to the document (custom properties inherit into the shadow root)
const tokRe = /:root\{[^}]*\}\s*@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{[^}]*\}\}\s*:root\[data-theme="dark"\]\{[^}]*\}\s*/;
const tokens = (css.match(tokRe) || [])[0];
must(tokens, "desk token blocks not found");
let scoped = css.replace(tokRe, "")
  .replace("html,body{height:100%}", "")
  .replace(/body::before\{[^}]*\}/, "")
  .replace(/(^|\n)body\{/, "$1.desk{");
must(!/(^|\n)body/.test(scoped), "unscoped body rule left in desk css");

// --- point the desk at its shadow root
const before = js;
js = js.replace(/document\.querySelectorAll\(/g, "R.querySelectorAll(")
       .replace(/document\.querySelector\(/g, "R.querySelector(")
       .replace(/document\.addEventListener\(/g, "R.addEventListener(");
must(!/document\.(querySelector|addEventListener|getElementById)/.test(js), "desk still queries document");
must(js !== before, "no document references replaced");

const keyLine = 'const KEY="discount-desk-v1";';
must(js.includes(keyLine), "storage key line missing");
js = js.replace(keyLine, 'const KEY="discount-desk-v1-"+CTX.id;');

const loadLine = 'try{const raw=localStorage.getItem(KEY);if(raw)S=Object.assign(blank(),JSON.parse(raw));}catch(e){}';
must(js.includes(loadLine), "state load line missing");
js = js.replace(loadLine, loadLine + '\nif(CTX.name&&!S.name){S.name=CTX.name;S.section=CTX.section;S.letter=CTX.letter;const c=CTX.letter.charCodeAt(0);S.state=c<=70?"Ohio":c<=76?"Pennsylvania":c<=82?"New York":"California";}');

const saveLine = 'function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}';
must(js.includes(saveLine), "save line missing");
js = js.replace(saveLine, 'function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}try{CTX.onProgress&&CTX.onProgress(S);}catch(e){}}');

// --- assemble
const strings = "const DESK_CSS=" + JSON.stringify(scoped).replace(/<\//g, "<\\/") + ";\n" +
  "const DESK_MARKUP=" + JSON.stringify('<div class="desk">' + markup + "</div>").replace(/<\//g, "<\\/") + ";";
must(!/<\/script/i.test(js), "desk js contains a closing script tag");
const comp = fs.readFileSync(path.join(dir, "companion.html"), "utf8");
const compStr = "const COMP_HTML=" + JSON.stringify(comp).replace(/<\//g, "<\\/") + ";";
must(shell.includes("/*__COMP_STRING__*/"), "companion placeholder missing");
// function replacements: the inserted code contains $ sequences that string replacement would misread
const out = shell
  .replace("/*__DESK_TOKENS__*/", () => tokens)
  .replace("/*__DESK_STRINGS__*/", () => strings)
  .replace("/*__DESK_JS__*/", () => js)
  .replace("/*__COMP_STRING__*/", () => compStr);
must(!out.includes("__DESK_"), "placeholder left unfilled");
fs.writeFileSync(path.join(dir, "waypoint.html"), out);
console.log("wrote waypoint.html", (out.length / 1024).toFixed(1) + " KB");
