// Copies tutor-engine.js into companion.html between the TUTOR markers.
const fs = require("fs"), path = require("path");
const f = path.join(__dirname, "companion.html");
const html = fs.readFileSync(f, "utf8");
const a = html.indexOf("/* TUTOR-ENGINE:START */"), b = html.indexOf("/* TUTOR-ENGINE:END */");
if (a < 0 || b < a) throw new Error("tutor markers missing in companion.html");
const eng = fs.readFileSync(path.join(__dirname, "tutor-engine.js"), "utf8");
if (/<\/script/i.test(eng)) throw new Error("tutor-engine.js must not contain a closing script tag");
fs.writeFileSync(f, html.slice(0, a) + "/* TUTOR-ENGINE:START */\n" + eng + "\n" + html.slice(b));
console.log("tutor synced into companion.html");
