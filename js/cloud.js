/* 记录本 · 后端适配层 + GitHub 云同步（不依赖电脑）
   ────────────────────────────────────────────────────────────
   本地（127.0.0.1 / x.local / 192.168.x.x）→ 走 tools/serve.py 的 /__journal /__progress
   公网（GitHub Pages）→ 走仓库里的 data/sync.json，手机直连 GitHub，电脑关着也能同步

   sync.json 结构：
   { v:1, t:<毫秒>, days:{<日期>:{<年>|<篇>:记录}}, prog:{"ky:ans:2024":"{}", …} }

   写入需要 GitHub 凭据（GitHub 的硬性要求）：手机上扫一次「配对码」即可，
   配对码只存本机 localStorage，不写进公开仓库。
*/
(function () {
  "use strict";

  var DEF = { o: "1123user", r: "en-journal", p: "data/sync.json", b: "main" };
  var LS_CFG = "kb:cloud:cfg", LS_TOK = "kb:cloud:tok", LS_AT = "kb:cloud:at";
  var AP = "ky:ans:", TP = "ky:time:", META = "ky:syncat";
  var API = "https://api.github.com";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function jp(s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  function loads(v) {
    if (v && typeof v === "object") return v;
    if (typeof v === "string") return jp(v, {});
    return {};
  }
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64d(s) {
    try { return decodeURIComponent(escape(atob(String(s || "").replace(/\s+/g, "")))); }
    catch (e) { return ""; }
  }
  function getJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw 0;
      return r.json();
    });
  }
  function postJSON(url, body) {
    return fetch(url, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  }

  /* ── 判定：这台设备用的是本地服务还是云端 ── */
  var host = String(location.hostname || "");
  var isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(host) ||
    /\.local$/i.test(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

  /* ── 配置（配对码 / localStorage） ── */
  var cfg = readCfg();
  function readCfg() {
    var c = jp(lsGet(LS_CFG), null) || {};
    var tok = lsGet(LS_TOK) || "";
    return { o: c.o || DEF.o, r: c.r || DEF.r, p: c.p || DEF.p, b: c.b || DEF.b, tok: tok };
  }

  function parsePair(text) {
    var s = String(text || "").trim();
    if (!s) return null;
    var m = /[#&]c=([^&]+)/.exec(s);
    if (m) { try { s = decodeURIComponent(m[1]); } catch (e) { s = m[1]; } }
    if (s.indexOf("en1:") === 0) s = s.slice(4);
    var o = jp(b64d(s), null);
    if (!o || !o.o || !o.r) return null;
    return o;
  }

  /* 打开带 #c=… 的链接（扫码）→ 就地存下配置，然后把地址栏里的凭据抹掉 */
  (function eatHash() {
    var m = /[#&]c=([^&]+)/.exec(String(location.hash || ""));
    if (!m) return;
    var o = parsePair(decodeURIComponent(m[1]));
    if (o) {
      lsSet(LS_CFG, JSON.stringify({ o: o.o, r: o.r, p: o.p || DEF.p, b: o.b || DEF.b }));
      if (o.t) lsSet(LS_TOK, o.t);
      cfg = readCfg();
    }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  })();

  var mode = isLocal ? "local" : "cloud";
  var writable = function () { return !!cfg.tok; };

  /* ── GitHub Contents API ── */
  var cache = { at: 0, data: null, sha: null };
  function ghHeaders() {
    var h = { "Accept": "application/vnd.github+json" };
    if (cfg.tok) h["Authorization"] = "Bearer " + cfg.tok;
    return h;
  }
  function remoteGet(force) {
    if (!force && cache.data && Date.now() - cache.at < 4000) return Promise.resolve(cache.data);
    var url = API + "/repos/" + cfg.o + "/" + cfg.r + "/contents/" + cfg.p +
      "?ref=" + cfg.b + "&t=" + Date.now();
    return fetch(url, { headers: ghHeaders(), cache: "no-store" }).then(function (r) {
      if (r.status === 404) {
        cache.sha = null;
        cache.data = { v: 1, t: 0, days: {}, prog: {} };
        cache.at = Date.now();
        return cache.data;
      }
      if (!r.ok) throw new Error("gh " + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.content) {
        var d = jp(b64d(j.content), { v: 1, t: 0, days: {}, prog: {} });
        if (!d || typeof d !== "object") d = { v: 1, t: 0, days: {}, prog: {} };
        d.days = d.days || {};
        d.prog = d.prog || {};
        cache.sha = j.sha;
        cache.data = d;
      }
      cache.at = Date.now();
      return cache.data;
    });
  }
  function remotePut(data, tries) {
    tries = tries || 0;
    var body = {
      message: "sync " + new Date().toISOString().slice(0, 19).replace("T", " ") + " · " + (data.t || 0),
      content: b64e(JSON.stringify(data)),
      branch: cfg.b
    };
    if (cache.sha) body.sha = cache.sha;
    return fetch(API + "/repos/" + cfg.o + "/" + cfg.r + "/contents/" + cfg.p, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Accept": "application/vnd.github+json" ,
                 "Authorization": "Bearer " + cfg.tok },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.status === 409 || r.status === 422) {
        if (tries >= 2) throw new Error("冲突");
        return remoteGet(true).then(function (cur) {
          return remotePut(mergeSync(cur, data), tries + 1);
        });
      }
      if (!r.ok) throw new Error("put " + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.content && j.content.sha) cache.sha = j.content.sha;
      cache.data = data; cache.at = Date.now();
      return j;
    });
  }

  /* ── 合并规则 ── */
  function mergeDays(a, b) {
    var out = {};
    Object.keys(a || {}).forEach(function (d) {
      out[d] = {};
      Object.keys(a[d] || {}).forEach(function (k) { out[d][k] = a[d][k]; });
    });
    Object.keys(b || {}).forEach(function (d) {
      var A = out[d] || (out[d] = {});
      Object.keys(b[d] || {}).forEach(function (k) {
        var x = A[k], y = b[d][k];
        if (!y) return;
        if (!x || (y.t || 0) >= (x.t || 0)) A[k] = y;
      });
    });
    return out;
  }

  /* 主站作答（ky:ans）合并：每题按 ky:syncat 里的时间戳取新的 */
  function mergeProg(A, B) {
    A = A || {}; B = B || {};
    var mA = loads(A[META]), mB = loads(B[META]);
    var meta = {};
    Object.keys(mA).forEach(function (k) { meta[k] = mA[k] || 0; });
    Object.keys(mB).forEach(function (k) { if ((mB[k] || 0) > (meta[k] || 0)) meta[k] = mB[k]; });

    var out = {};
    Object.keys(A).forEach(function (k) { out[k] = A[k]; });

    var years = {};
    Object.keys(A).concat(Object.keys(B)).forEach(function (k) {
      if (k.indexOf(AP) === 0) years[k.slice(AP.length)] = 1;
    });
    Object.keys(years).forEach(function (y) {
      var a = loads(A[AP + y]), b = loads(B[AP + y]);
      var m = {}, qs = {};
      Object.keys(a).forEach(function (q) { qs[q] = 1; });
      Object.keys(b).forEach(function (q) { qs[q] = 1; });
      Object.keys(qs).forEach(function (q) {
        var ta = mA[y + "|" + q] || 0, tb = mB[y + "|" + q] || 0;
        var v = tb > ta ? b[q] : a[q];
        if ((v == null || v === "") && (tb > ta ? a[q] : b[q]) != null) v = tb > ta ? a[q] : b[q];
        if (v != null && v !== "") m[q] = v;
      });
      if (Object.keys(m).length) out[AP + y] = JSON.stringify(m);
    });

    Object.keys(A).concat(Object.keys(B)).forEach(function (k) {
      if (k.indexOf(TP) !== 0) return;
      var a = loads(A[k]), b = loads(B[k]), m = {};
      Object.keys(b).forEach(function (s) { m[s] = b[s]; });
      Object.keys(a).forEach(function (s) { if (!(m[s] || {}).t0) m[s] = a[s]; });
      out[k] = JSON.stringify(m);
    });

    if (Object.keys(meta).length) out[META] = JSON.stringify(meta);
    return out;
  }

  /* 记录本的选项 → 主站作答（和电脑端 serve.py 的口径一致） */
  function journalToProg(days, prog) {
    prog = prog || {};
    var meta = loads(prog[META]);
    Object.keys(days || {}).forEach(function (d) {
      Object.keys(days[d] || {}).forEach(function (key) {
        var rec = days[d][key];
        var p = String(key).split("|"), y = p[0], sec = p[1];
        if (!y || !sec || !rec || !rec.ans) return;
        var ak = AP + y, cur = loads(prog[ak]), ts = rec.t || 0, dirty = false;
        Object.keys(rec.ans).forEach(function (q) {
          var a = rec.ans[q];
          if (!a) return;
          a = String(a).toUpperCase();
          if (cur[q] === a) return;
          var mk = y + "|" + q;
          if ((meta[mk] || 0) > ts) return;      /* 主站那题写得更晚，别盖回去 */
          cur[q] = a; meta[mk] = ts; dirty = true;
        });
        if (dirty) prog[ak] = JSON.stringify(cur);
        if (rec.usedMin && ts) {
          var tm = loads(prog[TP + y]);
          if (!(tm[sec] || {}).t0) {
            tm[sec] = { t0: ts - rec.usedMin * 60000, t1: ts };
            prog[TP + y] = JSON.stringify(tm);
          }
        }
      });
    });
    prog[META] = JSON.stringify(meta);
    return prog;
  }

  function mergeSync(remote, patch) {
    var out = {
      v: 1,
      t: Date.now(),
      days: mergeDays(remote.days, patch.days || {}),
      prog: mergeProg(patch.prog || {}, remote.prog || {})
    };
    if (patch.days) out.prog = journalToProg(mergeDays(remote.days, patch.days), out.prog);
    return out;
  }

  /* 云端只留作答/计时/时间戳；单词本、标记这些本机杂项不进仓库（文件小，轮询才便宜） */
  function trimProg(p) {
    var out = {}, keep = [AP, TP, "ky:ansat:", META];
    Object.keys(p || {}).forEach(function (k) {
      for (var i = 0; i < keep.length; i++) {
        if (k.indexOf(keep[i]) === 0) { out[k] = p[k]; return; }
      }
    });
    return out;
  }

  function stable(o) {
    if (o == null || typeof o !== "object") return JSON.stringify(o);
    if (Object.prototype.toString.call(o) === "[object Array]") {
      return "[" + o.map(stable).join(",") + "]";
    }
    return "{" + Object.keys(o).sort().map(function (k) {
      return JSON.stringify(k) + ":" + stable(o[k]);
    }).join(",") + "}";
  }

  /* ── 写入串行化（合并 1.5 秒内的多次改动，避免刷出一堆 commit） ── */
  var chain = Promise.resolve(), busy = false, queued = null;
  function push(patch) {
    queued = queued || {};
    if (patch.days) queued.days = mergeDays(queued.days || {}, patch.days);
    if (patch.prog) queued.prog = mergeProg(queued.prog || {}, trimProg(patch.prog));
    if (busy) return chain;
    busy = true;
    chain = new Promise(function (res) { setTimeout(res, 1500); }).then(function run() {
      var p = queued; queued = null;
      return remoteGet(true).then(function (cur) {
        var next = mergeSync(cur, p || {});
        if (stable(next.days) === stable(cur.days || {}) && stable(next.prog) === stable(cur.prog || {})) return null;
        next.prog = trimProg(next.prog);
        return remotePut(next);
      }).then(function (r) {
        lsSet(LS_AT, String(Date.now()));
        if (queued) { busy = false; return push({}); }
        busy = false;
        return r;
      }, function (e) {
        busy = false;
        throw e;
      });
    });
    return chain;
  }

  /* ── 拉取并落到页面（记录本 days） ── */
  var lastSeen = 0;
  function applyRemote(s) {
    var N = window.JOURNAL;
    if (!N || !s) return 0;
    var J = N.J(), n = 0;
    var days = s.days || {};
    Object.keys(days).forEach(function (d) {
      var A = J.days[d] || (J.days[d] = {});
      Object.keys(days[d] || {}).forEach(function (k) {
        var y = days[d][k];
        if (!y) return;
        if (!A[k] || (y.t || 0) > (A[k].t || 0)) { A[k] = y; n++; }
      });
    });
    if (n) {
      try { localStorage.setItem(N.LS_KEY || "kb:journal:v1", JSON.stringify(J)); } catch (e) {}
      N.renderEntry();
    }
    return n;
  }

  function mark(txt, cls) {
    if (window.JOURNAL && window.JOURNAL.markSync) window.JOURNAL.markSync(txt, cls);
    var el = document.getElementById("syncState");
    if (el) el.title = txt;
  }

  /* ── 对外：后端适配层 ── */
  var BACK = {
    mode: mode,
    writable: writable,
    cfg: function () { return cfg; },
    pull: function () { return remoteGet(true); },
    push: push,
    applyRemote: applyRemote,
    mergeDays: mergeDays,
    mergeProg: mergeProg,
    journalToProg: journalToProg
  };

  if (mode === "local") {
    BACK.journalGet = function () { return getJSON("/__journal"); };
    BACK.journalPost = function (J) { return postJSON("/__journal", J); };
    BACK.progressGet = function () { return getJSON("/__progress"); };
    BACK.progressPost = function (o) { return postJSON("/__progress", o); };
    BACK.rev = function () { return getJSON("/__rev"); };
    BACK.plan = function () { return getJSON("/__plan"); };
  } else {
    BACK.journalGet = function () { return remoteGet().then(function (s) { return { days: s.days || {} }; }); };
    BACK.journalPost = function (J) { return push({ days: (J && J.days) || {} }); };
    BACK.progressGet = function () { return remoteGet().then(function (s) { return s.prog || {}; }); };
    BACK.progressPost = function (o) { return push({ prog: o || {} }); };
    BACK.rev = function () { return remoteGet().then(function (s) { return { p: s.t || 0, j: s.t || 0 }; }); };
    BACK.plan = function () {
      return getJSON("data/plan.json").catch(function () { return { ok: false, err: "云端没有计划文件" }; });
    };
  }
  window.BACK = BACK;

  /* ── 自动同步 ── */
  function tick(force) {
    if (mode !== "cloud") return;
    remoteGet(!!force).then(function (s) {
      if (!s) return;
      if (force || (s.t || 0) > lastSeen) {
        lastSeen = s.t || 0;
        var n = applyRemote(s);
        if (n) mark("云同步 · 拉入 " + n + " 篇", "ok");
        else if (!writable()) mark("云同步 · 只读", "warn");
        else mark("云同步 · 已连", "ok");
      }
    }).catch(function () {
      mark(writable() ? "云同步 · 连不上" : "云端只读 · 点状态配对", "warn");
    });
  }

  function askPair() {
    if (writable() && !confirm("已配对。要重新粘贴配对码吗？")) return;
    var txt = prompt("粘贴配对码（电脑上「记录本 → 手机配对」里点「复制配对码」，或直接扫那边的二维码）");
    if (!txt) return;
    var o = parsePair(txt);
    if (!o) { alert("配对码认不出来，重试一次"); return; }
    lsSet(LS_CFG, JSON.stringify({ o: o.o, r: o.r, p: o.p || DEF.p, b: o.b || DEF.b }));
    if (o.t) lsSet(LS_TOK, o.t);
    location.reload();
  }

  /* 没配对：底部常驻一条提示，别再让人以为「记的都在云端」 */
  function banner() {
    if (writable() || document.getElementById("cloudBanner")) return;
    var d = document.createElement("div");
    d.id = "cloudBanner";
    d.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#b45309;color:#fff;" +
      "font:13px/1.5 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;padding:10px 14px;" +
      "display:flex;gap:10px;align-items:center;box-shadow:0 -2px 10px rgba(0,0,0,.25)";
    d.innerHTML = '<span style="flex:1">未配对：现在只存在这台手机，电脑上看不到。' +
      '点右边配对后才会自动同步。</span>' +
      '<button id="cloudPairBtn" type="button" style="background:#fff;color:#b45309;border:0;' +
      'border-radius:8px;padding:6px 12px;font-weight:600;font-size:13px">配对</button>';
    document.body.appendChild(d);
    var b = d.querySelector("#cloudPairBtn");
    if (b) b.addEventListener("click", askPair);
  }

  function bindPair() {
    var el = document.getElementById("syncState");
    if (!el || mode !== "cloud") return;
    el.style.cursor = "pointer";
    el.addEventListener("click", askPair);
  }

  /* 本地有、云端没有的记录 → 补推一次（上次可能没配对 / 断网 / 页面被关掉） */
  function backfill() {
    var N = window.JOURNAL;
    if (!N || !writable()) return;
    var days = (N.J() && N.J().days) || {};
    if (!Object.keys(days).length) return;
    remoteGet(true).then(function (s) {
      var merged = mergeDays(s.days || {}, days);
      if (stable(merged) !== stable(s.days || {})) return push({ days: days });
    }).catch(function () {});
  }

  function boot() {
    if (mode !== "cloud") return;
    bindPair();
    if (!writable()) { mark("未配对 · 点这里", "warn"); banner(); }
    tick(true);
    setTimeout(backfill, 2500);
    setInterval(function () { tick(false); }, 15000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") { tick(true); backfill(); }
    });
    window.addEventListener("focus", function () { tick(true); backfill(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 0);

  window.CLOUD = {
    mode: mode, writable: writable, cfg: function () { return cfg; },
    pull: function () { return remoteGet(true); },
    push: push, mark: mark, parsePair: parsePair,
    pairLink: function (tok) {
      var o = { o: cfg.o, r: cfg.r, p: cfg.p, b: cfg.b };
      if (tok) o.t = tok;
      return "en1:" + b64e(JSON.stringify(o));
    }
  };
})();
