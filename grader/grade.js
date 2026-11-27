#!/usr/bin/env node
// Discount Desk bulk grader. Runs locally with Node 18+, no dependencies, no network.
//
//   node grader/grade.js <submissions folder or Canvas .zip> [--roster gradebook.csv] [--out folder]
//
// What it does
//   * Reads every file Canvas put in "Download Submissions" (a folder or the .zip itself).
//   * Takes the case data from each student's .html case file (read as text, never opened in a
//     browser or executed) or from a .json data file.
//   * Recomputes every objective item from the course data in core/case-core.js. Scores written
//     inside a student's file are ignored, so editing the file can't raise a grade.
//   * Flags missing, duplicate, edited or inconsistent files for a person to look at.
//   * Writes grades.csv, review.html, class-report.html and class-counts.csv to the output folder.
// Student files and verification codes are evidence to review, not proof of anything.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const C = require("../core/case-core.js");

const MAX_CASE_BYTES = 2 * 1024 * 1024;   // a real case file is about 20 KB
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;

/* ---------------- reading submissions ---------------- */
function readZip(file) {
  const buf = fs.readFileSync(file);
  if (buf.length > MAX_ZIP_BYTES) throw new Error("zip is larger than 1 GB");
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip directory is damaged");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString("utf8");
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    const base = path.basename(name);
    out.push({ name: base, size: usize, read: () => {
      if (usize > MAX_CASE_BYTES) return null;
      const ln = buf.readUInt16LE(loc + 26), lx = buf.readUInt16LE(loc + 28), start = loc + 30 + ln + lx;
      const raw = buf.slice(start, start + csize);
      if (method === 0) return raw;
      if (method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: MAX_CASE_BYTES });
      return null;
    } });
  }
  return out;
}
function readDir(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.isFile()) { const size = fs.statSync(f).size; out.push({ name: e.name, size, read: () => size > MAX_CASE_BYTES ? null : fs.readFileSync(f) }); }
    }
  })(dir);
  return out;
}

// Canvas names downloads  lastfirst_[LATE_]userid_submissionid_original-name.ext
// (an extra "-1" etc. can appear at the end of the original name on resubmission).
function parseCanvasName(name) {
  const m = /^([a-z0-9]+?)(_late)?_(\d+)_(\d+)_(.+)$/i.exec(name);
  if (!m) return { key: null, late: false, userId: null, submissionId: null, original: name };
  return { key: m[1].toLowerCase(), late: !!m[2], userId: m[3], submissionId: m[4], original: m[5] };
}

// Strict JSON with prototype keys dropped.
const safeParse = t => JSON.parse(t, (k, v) => (k === "__proto__" || k === "constructor" || k === "prototype") ? undefined : v);

// Pull the data block out of a case file as plain text. The HTML is never rendered or run.
function extractFromHtml(text) {
  const m = /<script\s+type=["']application\/json["']\s+id=["']dd-case["']\s*>([\s\S]*?)<\/script>/i.exec(text);
  const title = /<title>\s*Discount Desk\s+(DD-[0-9a-z]{4}-[0-9a-z]{4})\s*<\/title>/i.exec(text);
  return { json: m ? m[1] : null, titleCode: title ? title[1] : null, hasScript: /<script(?![^>]*application\/json)/i.test(text) };
}

/* ---------------- roster ---------------- */
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
// Canvas gradebook export: Student, ID, SIS User ID, SIS Login ID, Section, ...
function readRoster(file) {
  const rows = parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iName = h.indexOf("student"), iId = h.indexOf("id"), iSec = h.indexOf("section");
  if (iName < 0 || iId < 0) throw new Error("roster needs Student and ID columns (Canvas gradebook export)");
  return rows.slice(1).filter(r => /^\d+$/.test((r[iId] || "").trim())).map(r => ({ name: r[iName].trim(), id: r[iId].trim(), section: iSec >= 0 ? (r[iSec] || "").trim() : "" }));
}

/* ---------------- grading ---------------- */
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const AUTO = C.RUBRIC.filter(r => r.auto), MANUAL = C.RUBRIC.filter(r => !r.auto);

function gradeFolder(input, opts = {}) {
  const files = fs.statSync(input).isDirectory() ? readDir(input) : readZip(input);
  const students = new Map();
  const get = (id, key) => { const k = id || "name:" + key; if (!students.has(k)) students.set(k, { userId: id, key, late: false, files: [], cases: [], flags: [] }); return students.get(k); };
  for (const f of files) {
    if (/^(\.|__MACOSX|thumbs\.db$|desktop\.ini$)/i.test(f.name)) continue;
    const cn = parseCanvasName(f.name);
    const st = get(cn.userId, cn.key || norm(f.name).split(" ")[0]);
    st.late = st.late || cn.late;
    st.files.push({ name: f.name, original: cn.original, size: f.size });
    const ext = path.extname(cn.original).toLowerCase();
    if (ext !== ".html" && ext !== ".htm" && ext !== ".json") continue;
    const raw = f.read();
    if (!raw) { st.flags.push(`${cn.original}: too large to be a case file (${Math.round(f.size / 1024)} KB), not read`); continue; }
    const text = raw.toString("utf8");
    let json = text, titleCode = null;
    if (ext !== ".json") {
      const x = extractFromHtml(text);
      if (!x.json) { st.flags.push(`${cn.original}: no Discount Desk data block (not a case file, or saved from an older version)`); continue; }
      json = x.json; titleCode = x.titleCode;
      if (x.hasScript) st.flags.push(`${cn.original}: contains extra script code. It was not run; check how the file was produced`);
    }
    let data;
    try { data = safeParse(json); } catch (e) { st.flags.push(`${cn.original}: data block isn't valid JSON`); continue; }
    if (data && data.schema !== C.SCHEMA && json === text) continue; // some other JSON file
    st.cases.push({ file: cn.original, kind: ext === ".json" ? "json" : "html", data, titleCode });
  }

  const results = [];
  for (const st of students.values()) {
    try { results.push(gradeStudent(st)); }
    catch (e) { results.push({ userId: st.userId, key: st.key, late: st.late, files: st.files, flags: [...st.flags, `couldn't grade this submission (${e.message}); grade it by hand`], name: "", section: "", state: "", caseId: "", code: "", codeCheck: "", items: {}, objective: null, mistakes: {}, answered: {}, agentDetail: [], q4: "", q7: "", memo: "", reflect: "", source: "" }); }
  }

  // duplicate memos and reflections across students
  const seen = new Map();
  for (const r of results) for (const [label, t] of [["memo", r.memo], ["reflection", r.reflect], ["Question 7", r.q7]]) {
    const n = norm(t); if (n.length < 80) continue;
    const k = label + "|" + n; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(r);
  }
  for (const [k, list] of seen) if (list.length > 1) { const label = k.split("|")[0];
    for (const r of list) r.flags.push(`${label} is identical to ${list.filter(o => o !== r).map(o => o.name || o.key).join(", ")}`); }

  // roster: who has nothing
  let missing = [];
  if (opts.roster) {
    const roster = readRoster(opts.roster);
    const have = new Set(results.map(r => r.userId).filter(Boolean));
    missing = roster.filter(p => !have.has(p.id));
    const byId = new Map(roster.map(p => [p.id, p]));
    for (const r of results) { const p = byId.get(r.userId); if (p) { r.rosterName = p.name; if (!r.section) r.section = p.section; }
      else if (r.userId) r.flags.push("Canvas user ID isn't on the roster"); }
  }
  results.sort((a, b) => String(a.rosterName || a.name || a.key).localeCompare(String(b.rosterName || b.name || b.key)));
  return { results, missing, rosterGiven: !!opts.roster };
}

function gradeStudent(st) {
  const r = { userId: st.userId, key: st.key, late: st.late, files: st.files, flags: st.flags.slice(), name: "", section: "", state: "", caseId: "", code: "", codeCheck: "", items: {}, objective: null, manualMax: 0, mistakes: {}, answered: {}, agentDetail: [], q4: "", q7: "", memo: "", reflect: "", source: "" };
  const has = re => st.files.some(f => re.test(f.original));
  if (!has(/\.twbx$/i)) r.flags.push("no .twbx workbook in the submission");
  if (!has(/\.docx?$/i)) r.flags.push("no Word answer sheet in the submission");
  if (st.late) r.flags.push("Canvas marked the submission late");
  if (!st.cases.length) { r.flags.push("no case file data found"); return r; }

  // prefer the HTML case file; compare with any JSON copy
  const html = st.cases.filter(c => c.kind === "html"), json = st.cases.filter(c => c.kind === "json");
  const main = (html[0] || json[0]);
  if (html.length > 1 || json.length > 1) r.flags.push(`more than one case file (${st.cases.map(c => c.file).join(", ")}); graded ${main.file}`);
  const errs = C.validateExport(main.data);
  if (errs.length) { r.flags.push(`${main.file}: ${errs.join("; ")}`); return r; }
  for (const other of st.cases) if (other !== main && other.data && other.data.code !== main.data.code) r.flags.push(`${other.file} has different answers from ${main.file} (codes ${other.data.code} vs ${main.data.code})`);

  if (main.data.core !== C.CORE_VERSION) r.flags.push(`made with lab version ${main.data.core || "unknown"}; this grader uses ${C.CORE_VERSION}. If the case rules changed in between, check the agent decisions by hand`);
  const S = C.stateFromExport(main.data);
  const sc = C.scoreCase(S);
  const recomputed = C.codeFor(S);
  r.source = main.file; r.name = S.name; r.section = S.section; r.state = S.state; r.caseId = S.caseId; r.code = main.data.code;
  r.codeCheck = recomputed === main.data.code ? "matches answers" : "DOESN'T MATCH";
  if (recomputed !== main.data.code) r.flags.push(`verification code ${main.data.code} doesn't match the answers in the file (expected ${recomputed}); the file may have been edited`);
  if (main.titleCode && main.titleCode !== main.data.code) r.flags.push(`code in the page title (${main.titleCode}) differs from the data block (${main.data.code})`);
  if (st.key) { const toks = norm(S.name).split(" ").filter(t => t.length > 1); if (toks.length && !toks.every(t => st.key.includes(t))) r.flags.push(`name in the case file ("${S.name}") doesn't match the Canvas account (${st.key})`); }
  sc.flags.forEach(f => r.flags.push(f));
  if (!main.data.progress || !(main.data.progress.done || []).includes(5)) r.flags.push("case wasn't finished in the lab (memo step not completed)");
  Object.assign(r, { items: sc.items, objective: sc.objective, manualMax: sc.manualMax, mistakes: sc.mistakes, answered: sc.answered, agentDetail: sc.agentDetail || [],
    q4: S.fc.q4, q7: S.wi.q7, memo: S.memo.text, reflect: S.reflect });
  return r;
}

/* ---------------- class insight ---------------- */
const INSIGHT = [
  ["wrongExport", "Chose the doubled export", r => r.answered.export],
  ["forecastMismatch", "Prediction didn't match the forecast", r => r.answered.pred],
  ["forecastTypFar", "Typical month far from the forecast", r => r.answered.typ],
  ["pickError", "Picked the wrong problem products", r => r.answered.picks],
  ["capError", "Wrong cap on at least one product", r => r.answered.caps],
  ["vpTrap", "Approved on a false VP approval (A1)", r => r.agentDetail.some(d => d.id === "a1" && d.you)],
  ["nameTrap", "Applied a cap to a mismatched name (A2)", r => r.agentDetail.some(d => d.id === "a2" && d.you)],
  ["edgeCase", "Countered a request exactly at the cap (A3)", r => r.agentDetail.some(d => d.id === "a3" && d.you)],
  ["injection", "Followed a prompt injection (A4)", r => r.agentDetail.some(d => d.id === "a4" && d.you)],
  ["missedDrill", "Missed the planted error in the draft", r => r.answered.drill],
  ["memo12", "Memo divides by 12 instead of 48", r => r.answered.memo],
];
function insight({ results, missing, rosterGiven }) {
  const graded = results.filter(r => r.objective);
  const rows = INSIGHT.map(([k, label, inDen]) => { const den = graded.filter(inDen); const n = den.filter(r => r.mistakes[k]).length; return { k, label, n, den: den.length }; });
  return { rows, graded: graded.length, folders: results.length, noData: results.length - graded.length, missing: missing.length, rosterGiven,
    flagged: results.filter(r => r.flags.length).length, codeMismatch: results.filter(r => r.codeCheck === "DOESN'T MATCH").length };
}

/* ---------------- output ---------------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const csvCell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = rows => rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`;
const STYLE = `<style>body{font:14px/1.5 system-ui,sans-serif;color:#191918;background:#fff;max-width:1100px;margin:28px auto;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 6px;border-top:2px solid #191918;padding-top:10px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border-bottom:1px solid #ddd;padding:5px 8px 5px 0;text-align:left;vertical-align:top}th{font-size:12px;color:#64635c}.flag{color:#955a00}.bad{color:#b3342a}.muted{color:#64635c}.box{white-space:pre-wrap;background:#f6f6f2;border-left:3px solid #f5c400;padding:8px 12px;margin:4px 0 10px}.score{display:inline-block;min-width:60px;border-bottom:1px solid #191918;height:18px}@media print{h2{break-before:page}}</style>`;

function writeOutputs(res, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const name = r => r.rosterName || r.name || r.key || "(unknown)";
  // grades.csv
  const head = ["Student", "Canvas user ID", "Section", "State", "Case ID", "Verification code", "Code check", ...AUTO.map(a => `${a.label} (${a.max})`), `Objective total (${AUTO.reduce((s, a) => s + a.max, 0)})`, ...MANUAL.map(m => `${m.label} (${m.max}, instructor)`), "Late", "Flags", "Graded file"];
  const rows = res.results.map(r => [name(r), r.userId, r.section, r.state, r.caseId, r.code, r.codeCheck, ...AUTO.map(a => r.items[a.k] ? r.items[a.k].pts : ""), r.objective ? r.objective.pts : "", ...MANUAL.map(() => ""), r.late ? "yes" : "", r.flags.join(" | "), r.source]);
  for (const m of res.missing) rows.push([m.name, m.id, m.section, "", "", "", "", ...AUTO.map(() => ""), "", ...MANUAL.map(() => ""), "", "no submission", ""]);
  fs.writeFileSync(path.join(outDir, "grades.csv"), "﻿" + csv([head, ...rows]));

  // review.html: static, everything escaped, scripts blocked by CSP
  const ins = insight(res);
  const card = r => `<h2 id="u${esc(r.userId || r.key)}">${esc(name(r))} <span class="muted">${esc(r.state)} ${esc(r.caseId)} · ${esc(r.code)}</span></h2>
${r.flags.length ? `<p class="flag"><b>Check:</b></p><ul class="flag">${r.flags.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : `<p class="muted">No flags.</p>`}
<p class="muted">Files: ${r.files.map(f => esc(f.original)).join(", ") || "none"}</p>
${r.objective ? `<table><tr><th>Objective item (recomputed)</th><th>Points</th><th>Note</th></tr>${AUTO.map(a => `<tr><td>${esc(a.label)}</td><td>${r.items[a.k] ? r.items[a.k].pts : 0} / ${a.max}</td><td>${esc(r.items[a.k] ? r.items[a.k].note : "")}</td></tr>`).join("")}<tr><td><b>Objective total</b></td><td><b>${r.objective.pts} / ${r.objective.max}</b></td><td></td></tr></table>
<table><tr><th>Request</th><th>Agent</th><th>Student</th><th>Policy</th></tr>${r.agentDetail.map(d => `<tr><td>${esc(d.id.toUpperCase())} ${esc(d.sub)} at ${Math.round(d.req * 100)}%${d.trap ? ` <span class="muted">(${esc(d.trap)})</span>` : ""}</td><td>${esc(d.agent || "")}</td><td class="${d.you && d.you !== d.policy ? "bad" : ""}">${esc(d.you || "undecided")}</td><td>${esc(d.policy)}</td></tr>`).join("")}</table>
<h3>Question 4: forecast limits <span class="score"></span> / 8</h3><div class="box">${esc(r.q4) || "<i>blank</i>"}</div>
<h3>Question 7: assumption and test <span class="score"></span> / 10</h3><div class="box">${esc(r.q7) || "<i>blank</i>"}</div>
<h3>Memo <span class="score"></span> / 8</h3><div class="box">${esc(r.memo) || "<i>blank</i>"}</div>
<h3>Reflection <span class="score"></span> / 5</h3><div class="box">${esc(r.reflect) || "<i>blank</i>"}</div>` : ""}`;
  fs.writeFileSync(path.join(outDir, "review.html"), `<!doctype html><html lang="en"><meta charset="utf-8">${CSP}<meta name="viewport" content="width=device-width,initial-scale=1"><title>Discount Desk review sheet</title>${STYLE}
<h1>Discount Desk review sheet</h1><p class="muted">Generated ${esc(new Date().toLocaleString())} on this computer. ${ins.folders} submission${ins.folders === 1 ? "" : "s"}, ${ins.flagged} with something to check${res.rosterGiven ? `, ${ins.missing} on the roster with no submission` : ""}. Objective points are recomputed from the course data; nothing written in a student's file is trusted. Verification codes only show whether the file was edited after export, and anyone can recompute one, so treat them as a hint, not proof.</p>
${res.missing.length ? `<h2>No submission</h2><ul>${res.missing.map(m => `<li>${esc(m.name)} (${esc(m.id)})</li>`).join("")}</ul>` : ""}
${res.results.map(card).join("\n")}</html>`);

  // class report + counts
  const cRows = [["Mistake", "Students", "Out of", "Share"], ...ins.rows.map(x => [x.label, x.n, x.den, x.den ? Math.round(100 * x.n / x.den) + "%" : ""])];
  cRows.push([], ["Submissions read", ins.folders], ["With usable case data", ins.graded], ["Without case data", ins.noData], ["Code doesn't match answers", ins.codeMismatch]);
  if (res.rosterGiven) cRows.push(["On roster with no submission", ins.missing]);
  fs.writeFileSync(path.join(outDir, "class-counts.csv"), "﻿" + csv(cRows));
  fs.writeFileSync(path.join(outDir, "class-report.html"), `<!doctype html><html lang="en"><meta charset="utf-8">${CSP}<meta name="viewport" content="width=device-width,initial-scale=1"><title>Discount Desk class report</title>${STYLE}
<h1>Discount Desk class report</h1><p class="muted">Generated locally ${esc(new Date().toLocaleString())}. No student data leaves this computer. Each share is out of the students who reached that question, not the whole class.</p>
<table><tr><th>Mistake</th><th>Students</th><th>Out of</th><th>Share</th><th></th></tr>${ins.rows.map(x => `<tr><td>${esc(x.label)}</td><td>${x.n}</td><td>${x.den}</td><td>${x.den ? Math.round(100 * x.n / x.den) + "%" : "n/a"}</td><td><span style="display:inline-block;height:10px;background:#f5c400;width:${x.den ? Math.round(160 * x.n / x.den) : 0}px"></span></td></tr>`).join("")}</table>
<table style="max-width:460px"><tr><td>Submissions read</td><td>${ins.folders}</td></tr><tr><td>With usable case data</td><td>${ins.graded}</td></tr><tr><td>Without case data</td><td>${ins.noData}</td></tr><tr><td>Code doesn't match answers</td><td>${ins.codeMismatch}</td></tr>${res.rosterGiven ? `<tr><td>On roster with no submission</td><td>${ins.missing}</td></tr>` : `<tr><td class="muted" colspan="2">Add --roster to count students with no submission.</td></tr>`}</table></html>`);
  return ins;
}

/* ---------------- CLI ---------------- */
if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const roster = opt("--roster"), out = opt("--out");
  const input = args[0];
  if (!input) { console.log("Usage: node grader/grade.js <submissions folder or .zip> [--roster gradebook.csv] [--out folder]"); process.exit(1); }
  const outDir = out || path.join(path.dirname(path.resolve(input)), "grading-output");
  const res = gradeFolder(input, { roster });
  const ins = writeOutputs(res, outDir);
  console.log(`Read ${ins.folders} submissions (${ins.graded} with case data, ${ins.flagged} flagged${res.rosterGiven ? `, ${ins.missing} missing` : ""}).`);
  console.log(`Wrote grades.csv, review.html, class-report.html and class-counts.csv to ${outDir}`);
}
module.exports = { gradeFolder, gradeStudent, writeOutputs, insight, parseCanvasName, extractFromHtml, readZip, readRoster, csvCell };
