// Tests for the shared case core. Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core/case-core.js");

const STATES = Object.keys(C.D);
const ids = list => list.map(q => q.id).sort();
const decisions = (st, cid) => Object.fromEntries(C.requests(st, cid).map(q => [q.id, C.truthFor(q, st).d]));
const agentErrors = (st, cid) => C.requests(st, cid).filter(q => C.scriptedAgent(q, st).d !== C.truthFor(q, st).d).map(q => q.id).sort();

test("canonical numbers match the course's published Texas example", () => {
  const ev = C.evidence("Texas");
  assert.equal(ev.p1.sub, "Binders"); assert.equal(ev.c1, 45);
  assert.equal(Math.round(ev.p1.s), 9043); assert.equal(Math.round(ev.a1.as), 24867);
  assert.equal(Math.round(ev.p1.p), -14705); assert.equal(Math.round(ev.a1.ap), 1120);
  assert.equal(ev.p2.sub, "Appliances"); assert.equal(ev.c2, 20);
  assert.equal(Math.round(ev.monthly), 480);
});

test("the demonstration case is fixed", () => {
  assert.equal(C.caseIdFor("Example analyst", "Texas"), "TX-0");
  assert.equal(C.caseIdFor("", "Ohio"), "OH-0");
  assert.equal(C.requests("Texas", "TX-0")[0].id, "q1", "variant 0 keeps the original order");
});

for (const st of STATES) {
  const ab = C.STATE_ABBR[st];
  const base = `${ab}-0`;
  for (let v = 0; v <= C.VARIANTS; v++) {
    const cid = `${ab}-${v}`;
    test(`${st} variant ${v}: same requests, same policy answers, same agent errors`, () => {
      const list = C.requests(st, cid);
      assert.equal(list.length, 11);
      assert.deepEqual(ids(list), ids(C.requests(st, base)));
      assert.deepEqual(decisions(st, cid), decisions(st, base), "policy answer for every request is unchanged");
      assert.deepEqual(agentErrors(st, cid), agentErrors(st, base), "the practice agent makes the same mistakes");
      for (const t of ["a1", "a2", "a3", "a4"]) assert.ok(list.find(q => q.id === t), `trap ${t} present`);
      const pol = C.policy(st).map(p => p.sub);
      assert.ok(!pol.includes(list.find(q => q.id === "a2").sub), "misspelled name never matches a policy row exactly");
      assert.deepEqual(C.requests(st, cid), list, "reproducible from the case ID");
    });
  }
}

test("every trap is a real agent error in every state and variant", () => {
  for (const st of STATES) for (let v = 0; v <= C.VARIANTS; v++) {
    const cid = C.STATE_ABBR[st] + "-" + v, qs = C.requests(st, cid);
    for (const id of ["a1", "a2", "a4"]) { const q = qs.find(x => x.id === id); assert.notEqual(C.scriptedAgent(q, st).d, C.truthFor(q, st).d, `${st} ${cid} ${id}: agent should be wrong`); }
    const a3 = qs.find(x => x.id === "a3"); assert.equal(C.truthFor(a3, st).d, "approve", `${st} ${cid} a3 is at the cap`);
  }
});

test("student case IDs are stable and recorded per name and state", () => {
  const a = C.caseIdFor("Avery Brooks", "Ohio"), b = C.caseIdFor("  avery  BROOKS ", "Ohio");
  assert.equal(a, b);
  assert.match(a, /^OH-[1-5]$/);
  const seen = new Set(); for (const n of ["Ann Lee", "Bo Diaz", "Cy Ford", "Di Gale", "Ed Hart", "Flo Ives", "Gus Jay", "Hal Kerr"]) seen.add(C.caseIdFor(n, "Ohio"));
  assert.ok(seen.size >= 3, "names spread across variants");
});

function perfectState(st, name) {
  const ev = C.evidence(st), cid = C.caseIdFor(name, st), qs = C.requests(st, cid);
  const parts = C.drillParts(st), drill = parts.findIndex(p => p.ok === false && !p.dup);
  const memo = `${st} total sales were ${Math.round(ev.tot[0]).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}. Capping ${ev.p1.sub} at ${ev.c1}% and ${ev.p2.sub} at ${ev.c2}% adds about $${Math.round(ev.monthly)} a month against the $${ev.target.toLocaleString("en-US")} target. ` + "We should pilot the caps first and plan other actions to close the gap with the sales team over the coming quarter. ".repeat(3);
  return { name, section: "001", state: st, caseId: cid, practice: false,
    rec: { pick: "true", entry: String(Math.round(ev.tot[0])), verified: true, skipped: false },
    fc: { pred: C.predBucket(ev.fc.meet), mase: "0.7", typ: String(Math.round(ev.fc.typ)), q4: "x".repeat(40) },
    wi: { picks: [ev.p1.sub, ev.p2.sub], guess: { [ev.p1.sub]: String(ev.c1), [ev.p2.sub]: String(ev.c2) }, checked: {}, q7: "y".repeat(40) },
    gd: { agent: "scripted", proposals: Object.fromEntries(qs.map(q => [q.id, C.scriptedAgent(q, st)])), final: Object.fromEntries(qs.map(q => [q.id, { d: C.truthFor(q, st).d }])) },
    memo: { drill, text: memo }, reflect: "I overruled the agent.", done: {}, submittedAt: null };
}

test("a perfect case earns every objective point", () => {
  for (const st of STATES.filter(s => s !== "Texas")) {
    const S = perfectState(st, "Jordan Kim"), r = C.scoreCase(S);
    assert.equal(r.objective.pts, r.objective.max, `${st}: ${JSON.stringify(r.items)}`);
    assert.equal(Object.values(r.mistakes).filter(Boolean).length, 0, `${st} has no mistakes`);
  }
});

test("common mistakes are detected", () => {
  const S = perfectState("Ohio", "Avery Brooks"), ev = C.evidence("Ohio");
  S.rec.pick = "lie";
  S.wi.guess[ev.p1.sub] = "60";
  S.gd.final.a1 = { d: "approve" }; S.gd.final.a2 = { d: "counter" }; S.gd.final.a4 = { d: "approve" };
  S.memo.drill = 1;
  S.memo.text += ` That adds $${Math.round(ev.gain / 12).toLocaleString("en-US")} a month.`;
  const m = C.scoreCase(S).mistakes;
  assert.ok(m.wrongExport && m.capError && m.vpTrap && m.nameTrap && m.injection && m.missedDrill && m.memo12);
  assert.ok(!m.edgeCase);
});

test("verification code changes when an answer is edited", () => {
  const S = perfectState("New York", "Maya Ortiz"), a = C.codeFor(S);
  S.wi.guess.Tables = "30";
  assert.notEqual(C.codeFor(S), a);
});

test("export round-trips through JSON and keeps the code", () => {
  const S = perfectState("California", "Sam Torres"), x = JSON.parse(JSON.stringify(C.exportCase(S)));
  assert.deepEqual(C.validateExport(x), []);
  assert.equal(C.codeFor(C.stateFromExport(x)), x.code);
  assert.equal(C.scoreCase(C.stateFromExport(x)).objective.pts, C.scoreCase(S).objective.pts);
});
