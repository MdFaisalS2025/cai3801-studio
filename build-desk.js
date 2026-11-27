// Builds discount-desk.html from desk.src.html by inlining the shared case core (core/case-core.js).
// Usage: node build-desk.js
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const src = fs.readFileSync(path.join(dir, "desk.src.html"), "utf8");
const core = fs.readFileSync(path.join(dir, "core", "case-core.js"), "utf8");
if (!src.includes("/*__CORE__*/")) throw new Error("desk.src.html has no /*__CORE__*/ placeholder");
if (/<\/script/i.test(core)) throw new Error("core must not contain a closing script tag");
const out = src.replace("/*__CORE__*/", core);
fs.writeFileSync(path.join(dir, "discount-desk.html"), out);
console.log("wrote discount-desk.html", (out.length / 1024).toFixed(1) + " KB");
