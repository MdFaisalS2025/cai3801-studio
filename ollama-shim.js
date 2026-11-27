/* Ollama connector for the local site.
   If the page is not inside claude.ai (no window.claude), every AI feature runs on the Llama
   model in Ollama on this computer. Same shape as Claude's sample: fn(input, opts) -> {text},
   fn.json(input, opts) -> value. If Ollama is not running, use("sample") returns null and the
   pages fall back to their built-in examples. */
(function () {
  if (window.claude && window.claude.use) return;
  var BASE = "http://localhost:11434";
  var state = { model: null, models: [] };
  var ready = (async function () {
    try {
      var ctl = new AbortController(); var t = setTimeout(function () { ctl.abort(); }, 1800);
      var r = await fetch(BASE + "/api/tags", { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) return null;
      var j = await r.json(); state.models = (j.models || []).map(function (m) { return m.name; });
      var chat = state.models.filter(function (n) { return !/embed/i.test(n); });
      state.model = chat.find(function (n) { return /llama3\.1/i.test(n); }) || chat.find(function (n) { return /llama/i.test(n); }) || chat[0] || null;
      return state.model ? makeSample() : null;
    } catch (e) { return null; }
  })();
  function toMessages(input) {
    return typeof input === "string" ? [{ role: "user", content: input }] : input.map(function (m) { return { role: m.role, content: String(m.content) }; });
  }
  async function chat(input, opts) {
    opts = opts || {};
    var json = !!opts.json, onText = typeof opts.onText === "function" ? opts.onText : null;
    var body = { model: state.model, messages: toMessages(input), stream: !!onText, options: { temperature: json ? 0 : 0.3, num_ctx: 8192 } };
    if (json) body.format = "json";
    var r;
    try { r = await fetch(BASE + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: opts.signal }); }
    catch (e) { throw { code: e && e.name === "AbortError" ? "aborted" : "upstream_error", message: "Local model unreachable" }; }
    if (!r.ok) throw { code: "upstream_error", message: "Local model error " + r.status };
    if (!onText) { var j = await r.json(); var tx = (j.message && j.message.content) || ""; if (!tx.trim()) throw { code: "empty_completion", message: "No text" }; return { text: tx, truncated: false }; }
    var rd = r.body.getReader(), dec = new TextDecoder(), buf = "", text = "";
    for (;;) {
      var step = await rd.read(); if (step.done) break; buf += dec.decode(step.value, { stream: true }); var i;
      while ((i = buf.indexOf("\n")) >= 0) {
        var line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
        var o; try { o = JSON.parse(line); } catch (e) { continue; }
        var d = (o.message && o.message.content) || ""; if (d) { text += d; try { onText({ text: text, delta: d }); } catch (e) {} }
      }
    }
    if (!text.trim()) throw { code: "empty_completion", message: "No text" };
    return { text: text, truncated: false };
  }
  function looseJSON(t) {
    try { return JSON.parse(t); } catch (e) {}
    var m = /```(?:json)?\s*([\s\S]*?)```/.exec(t); if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
    var a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    throw { code: "invalid_json", message: "Reply was not JSON", text: t };
  }
  function makeSample() {
    var f = function (input, opts) { return chat(input, opts); };
    f.json = async function (input, opts) { var r = await chat(input, Object.assign({}, opts || {}, { json: true, onText: null })); return looseJSON(r.text); };
    f.provider = "ollama"; f.model = state.model;
    return f;
  }
  window.OLLAMA = { base: BASE, ready: ready, state: state };
  window.claude = { use: async function (name) { return name === "sample" ? await ready : null; } };
})();
