// Tests for the bulk grader. Run: node --test tests/grader.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const C = require("../core/case-core.js");
const G = require("../grader/grade.js");

function perfect(st, name) {
  const ev = C.evidence(st), cid = C.caseIdFor(name, st), qs = C.requests(st, cid);
  const parts = C.drillParts(st), drill = parts.findIndex(p => p.ok === false && !p.dup);
  const memo = `${st} total sales were ${Math.round(ev.tot[0]).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}. Capping ${ev.p1.sub} at ${ev.c1}% and ${ev.p2.sub} at ${ev.c2}% adds about $${Math.round(ev.monthly)} a month against the $${ev.target.toLocaleString("en-US")} target. ` + `${name} recommends a pilot. `.repeat(8);
  return { name, section: "001", letter: name.split(" ").pop()[0], state: st, caseId: cid, practice: false,
    rec: { pick: "true", entry: String(Math.round(ev.tot[0])), verified: true, skipped: false },
    fc: { pred: C.predBucket(ev.fc.meet), mase: "0.7", typ: String(Math.round(ev.fc.typ)), q4: "It only extends past patterns." },
    wi: { picks: [ev.p1.sub, ev.p2.sub], guess: { [ev.p1.sub]: String(ev.c1), [ev.p2.sub]: String(ev.c2) }, checked: {}, q7: "Customers may buy less." },
    gd: { agent: "scripted", proposals: Object.fromEntries(qs.map(q => [q.id, C.scriptedAgent(q, st)])), final: Object.fromEntries(qs.map(q => [q.id, { d: C.truthFor(q, st).d }])) },
    memo: { drill, text: memo }, reflect: `${name} overruled the agent twice.`, done: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, submittedAt: null };
}
const caseHtml = x => `<!doctype html><html><title>Discount Desk ${x.code}</title><h1>Memo</h1><script type="application/json" id="dd-case">${JSON.stringify(x).replace(/</g, "\\u003c")}</script></html>`;

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-grader-"));
  const sub = path.join(dir, "submissions"); fs.mkdirSync(sub);
  const w = (n, c) => fs.writeFileSync(path.join(sub, n), c);
  // 1 a complete, honest submission
  const a = C.exportCase(perfect("Ohio", "Avery Brooks"));
  w("brooksavery_1001_5001_DiscountDesk_Ohio_Avery_Brooks.html", caseHtml(a));
  w("brooksavery_1001_5002_Lab3.twbx", "x"); w("brooksavery_1001_5003_Answers.docx", "x");
  // 2 an edited file: cap changed in the data block after export, late, JSON only
  const b = C.exportCase(perfect("New York", "Maya Ortiz")); b.answers.wi.guess.Tables = "30"; b.score = 999;
  w("ortizmaya_LATE_1002_5004_DiscountDesk_NewYork_Maya_Ortiz.json", JSON.stringify(b));
  // 3 hostile HTML: script that would write a file, an onerror image, and no data block
  const marker = path.join(dir, "pwned.txt").replace(/\\/g, "/");
  w("evanseve_1003_5005_case.html", `<html><script>require("fs").writeFileSync("${marker}","x")</script><img src=x onerror="alert(1)"><p>hi</p></html>`);
  // 4 a copied memo and wrong traps, with a hostile name and a formula in the memo
  const d = perfect("Pennsylvania", "Leo <b>Grant</b>");
  d.memo.text = perfect("Ohio", "Avery Brooks").memo.text; d.gd.final.a1 = { d: "approve" }; d.gd.final.a4 = { d: "approve" }; d.rec.pick = "lie"; d.reflect = "=HYPERLINK(\"http://x\")";
  const dx = C.exportCase(d); w("grantleo_1004_5006_DiscountDesk.html", caseHtml(dx));
  // roster with one student who submitted nothing
  const roster = path.join(dir, "grades.csv");
  fs.writeFileSync(roster, "Student,ID,SIS User ID,SIS Login ID,Section,Discount Desk (1)\n    Points Possible,,,,,100\n\"Brooks, Avery\",1001,,,001,\n\"Ortiz, Maya\",1002,,,001,\n\"Evans, Eve\",1003,,,001,\n\"Grant, Leo\",1004,,,001,\n\"Quinn, Sam\",1005,,,903,\n");
  return { dir, sub, roster, marker };
}

test("Canvas file names are parsed, including LATE", () => {
  assert.deepEqual(G.parseCanvasName("ortizmaya_LATE_1002_5004_File_Name.json"), { key: "ortizmaya", late: true, userId: "1002", submissionId: "5004", original: "File_Name.json" });
  assert.equal(G.parseCanvasName("random.html").userId, null);
});

test("bulk grading: scores, flags, roster and outputs", () => {
  const f = fixture();
  const res = G.gradeFolder(f.sub, { roster: f.roster });
  const by = id => res.results.find(r => r.userId === id);

  const a = by("1001");
  assert.equal(a.objective.pts, a.objective.max, JSON.stringify(a.items));
  assert.equal(a.codeCheck, "matches answers");
  assert.ok(!a.flags.some(x => /twbx|Word|code/.test(x)), a.flags.join("; "));

  const b = by("1002");
  assert.equal(b.codeCheck, "DOESN'T MATCH", "editing the data block is detected");
  assert.equal(b.items.cap1.pts + b.items.cap2.pts, 7, "edited cap is scored as written, from trusted data");
  assert.ok(b.flags.some(x => /late/.test(x)) && b.flags.some(x => /twbx/.test(x)));

  const e = by("1003");
  assert.equal(e.objective, null);
  assert.ok(e.flags.some(x => /no Discount Desk data block/.test(x)));
  assert.ok(!fs.existsSync(f.marker), "uploaded HTML was never executed");

  const d = by("1004");
  assert.ok(d.mistakes.vpTrap && d.mistakes.injection && d.mistakes.wrongExport);
  assert.ok(d.flags.some(x => /memo is identical to/.test(x)));
  assert.ok(a.flags.some(x => /memo is identical to/.test(x)));

  assert.deepEqual(res.missing.map(m => m.id), ["1005"]);

  const out = path.join(f.dir, "out");
  const ins = G.writeOutputs(res, out);
  const review = fs.readFileSync(path.join(out, "review.html"), "utf8");
  assert.ok(!/<script/i.test(review), "review sheet has no scripts");
  assert.ok(!review.includes("<b>Grant</b>") && review.includes("&lt;b&gt;Grant&lt;/b&gt;"), "student text is escaped");
  assert.ok(review.includes("Content-Security-Policy"));
  const grades = fs.readFileSync(path.join(out, "grades.csv"), "utf8");
  assert.ok(grades.includes("'=HYPERLINK") || !grades.includes("=HYPERLINK"), "no formula injection in the CSV");
  assert.ok(/Quinn, Sam.*no submission/.test(grades));
  const vp = ins.rows.find(r => r.k === "vpTrap");
  assert.equal(vp.den, 3); assert.equal(vp.n, 1);
  assert.equal(ins.missing, 1); assert.equal(ins.noData, 1);
  const counts = fs.readFileSync(path.join(out, "class-counts.csv"), "utf8");
  assert.ok(counts.includes("Out of"));
});

test("reads a Canvas .zip directly", () => {
  const f = fixture();
  // minimal stored (uncompressed) zip
  const entries = fs.readdirSync(f.sub).map(n => ({ n: Buffer.from(n), d: fs.readFileSync(path.join(f.sub, n)) }));
  const locals = [], central = []; let off = 0;
  for (const e of entries) {
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(e.d.length, 18); h.writeUInt32LE(e.d.length, 22); h.writeUInt16LE(e.n.length, 26);
    locals.push(h, e.n, e.d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(e.d.length, 20); c.writeUInt32LE(e.d.length, 24); c.writeUInt16LE(e.n.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, e.n); off += 30 + e.n.length + e.d.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const zip = path.join(f.dir, "submissions.zip"); fs.writeFileSync(zip, Buffer.concat([...locals, cd, end]));
  const res = G.gradeFolder(zip, {});
  assert.equal(res.results.length, 4);
  assert.equal(res.results.find(r => r.userId === "1001").objective.pts, 69);
});

test("CSV cells that look like formulas are neutralised", () => {
  assert.equal(G.csvCell("=1+1"), "'=1+1");
  assert.equal(G.csvCell("-5"), "'-5");
  assert.equal(G.csvCell('a "b", c'), '"a ""b"", c"');
});

test("malformed case files are flagged, not fatal", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-bad-"));
  const bad = { schema: C.SCHEMA, core: C.CORE_VERSION, student: { name: "Bo Diaz" }, state: "Ohio", caseId: "OH-1", code: "DD-0000-0000",
    answers: { gd: { final: { a1: null, a2: 5 }, proposals: [] }, wi: { picks: "Binders" }, memo: { drill: "3", text: {} } }, progress: { done: "x" } };
  fs.writeFileSync(path.join(dir, "diazbo_2001_7001_case.json"), JSON.stringify(bad));
  fs.writeFileSync(path.join(dir, "leeann_2002_7002_case.json"), "{not json");
  const res = G.gradeFolder(dir, {});
  assert.equal(res.results.length, 2);
  const bo = res.results.find(r => r.userId === "2001");
  assert.ok(bo.objective && bo.objective.pts >= 0);
  assert.ok(bo.flags.some(f => /doesn't match the answers/.test(f)));
});
