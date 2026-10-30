/* 英语刷题记录本 · 记录页（纯记录，不判对错）
   存储：localStorage 立即写 + 本地服务 /__journal 落盘
   数据：window.PAPERS（题干/选项/答案）、window.DIFF（难度系数）
*/
(function () {
  "use strict";

  var PAPERS = window.PAPERS || {};
  var IDX = window.PAPERS_INDEX || null;      /* 年份索引：只给列表，题库按年懒加载 */
  var DIFF = window.DIFF || { items: {}, sections: {} };
  var YEARS = (IDX && IDX.years && IDX.years.length)
    ? IDX.years.slice()
    : Object.keys(PAPERS).sort(function (a, b) { return b - a; });
  var LS_KEY = "kb:journal:v1";   /* 前缀刻意不用 ky:，免得混进主站 /__progress 快照 */
  var API = "/__journal";
  var LETTERS = "ABCDEFGH";
  var LIMIT = { read: 18, cloze: 15, pb: 12 };
  var PART_CN = { read: "阅读", cloze: "完型", pb: "新题型" };

  var CAUSES = [
    { k: "locate", n: "定位失败" }, { k: "vocab", n: "词/替换不认识" },
    { k: "overreach", n: "推理过度" }, { k: "detail", n: "细节看漏" },
    { k: "attitude", n: "态度判断错" }, { k: "main", n: "主旨跑偏" },
    { k: "option", n: "选项辨析" }, { k: "time", n: "时间不够" },
    { k: "careless", n: "粗心" }, { k: "guess", n: "纯蒙" }
  ];
  var CAUSE_MAP = {};
  CAUSES.forEach(function (c) { CAUSE_MAP[c.k] = c; });
  var ACTIONS = {
    locate: "练「题干实词 → 定位句」：先在原文画出题句，再回选项，不跳步。",
    vocab: "把该题卡住的替换词丢进真题生词本，第二天回看。",
    overreach: "只认同义替换，不推第二层；选项超出原文范围一律排除。",
    detail: "做题时圈出否定/比较/数字/时间，答完扫一遍再交。",
    attitude: "回看段落评价形容词与转折词，态度题先定正负再定强弱。",
    main: "每段首尾句串一次主旨，标题题优先覆盖全文。",
    option: "两个都像时逐词比对：主体、范围、程度、时态哪项被偷换。",
    time: "限时拆段：读 8' → 定位 6' → 检查 4'，超时先标记后回补。",
    careless: "交卷前按题号清点一遍，答案与选项一一对应。",
    guess: "该篇做完后整篇回读，把蒙的题补定位。"
  };

  var J = { v: 1, days: {}, updatedAt: 0 };
  var cur = { date: todayStr(), year: YEARS[0], sec: "text1" };
  var pushTimer = null;

  /* ── 工具 ── */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function fn2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function bandCls(b) { return b === "易" ? "easy" : b === "中" ? "mid" : b === "偏难" ? "hardish" : "hard"; }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.className = "on";
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = ""; }, 1800);
  }
  function markSync(txt, cls) {
    var el = $("syncState");
    if (el) { el.textContent = txt; el.className = "sync " + (cls || ""); }
  }

  /* ── 题库 ── */
  function paperSec(year, sec) {
    var p = PAPERS[String(year)];
    if (!p) return null;
    if (sec.indexOf("text") === 0) {
      var no = parseInt(sec.slice(4), 10);
      var t = (p.texts || []).filter(function (x) { return x.no === no; })[0];
      if (!t) return null;
      return {
        part: "read", label: "Text " + no, limit: LIMIT.read,
        items: t.questions.map(function (q) {
          return { n: q.n, stem: q.stem || "", options: q.options || [], answer: q.answer };
        })
      };
    }
    if (sec === "cloze") {
      var c = p.cloze || {};
      if (!c.questions) return null;
      return {
        part: "cloze", label: "完型", limit: LIMIT.cloze,
        items: c.questions.map(function (q) {
          return { n: q.n, stem: "第 " + q.n + " 空", options: q.options || [], answer: q.answer };
        })
      };
    }
    if (sec === "partB") {
      var b = p.partB || {};
      if (!b.questions) return null;
      return {
        part: "pb", label: "新题型", limit: LIMIT.pb,
        items: b.questions.map(function (q) {
          return { n: q.n, stem: "题 " + q.n + "（A–G 中选，选项见原文页）",
                   options: b.options || [], answer: q.answer, pb: 1 };
        })
      };
    }
    return null;
  }

  /* ── 题库懒加载：整包 1.8MB，热点下要一分钟，改成一年一个分片 ── */
  var loading = {}, loadQ = [], loadingNow = false;
  function ensureYear(y) {
    y = String(y);
    if (PAPERS[y]) return Promise.resolve(true);
    if (loading[y]) return loading[y];
    loading[y] = new Promise(function (res) {
      var s = document.createElement("script");
      s.src = "data/papers/" + y + ".js";
      s.onload = function () { PAPERS = window.PAPERS || PAPERS; res(!!PAPERS[y]); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
    return loading[y];
  }
  function pump() {
    if (loadingNow || !loadQ.length) return;
    loadingNow = true;
    var y = loadQ.shift();
    ensureYear(y).then(function () {
      loadingNow = false;
      if (PAPERS[String(y)]) {
        renderYearSel();
        if (String(cur.year) === String(y)) renderEntry();   /* 正好是当前这一篇：补一次渲染 */
        else renderRecList();                                /* 别的年份：至少把「已记录」补全 */
      }
      pump();
    });
  }
  function preload(years) {
    (years || []).forEach(function (y) {
      y = String(y);
      if (!PAPERS[y] && loadQ.indexOf(y) < 0) loadQ.push(y);
    });
    pump();
  }
  function recordYears() {
    var seen = {};
    Object.keys(J.days).forEach(function (d) {
      Object.keys(J.days[d]).forEach(function (k) { seen[String(k).split("|")[0]] = 1; });
    });
    return Object.keys(seen);
  }

  function secKeysOf(year) {
    var p = PAPERS[String(year)];
    if (!p) return (IDX && IDX.secs && IDX.secs[String(year)]) || [];
    var out = [];
    (p.texts || []).forEach(function (t) { out.push("text" + t.no); });
    if (p.cloze && p.cloze.questions) out.push("cloze");
    if (p.partB && p.partB.questions) out.push("partB");
    return out;
  }
  function diffOf(year, sec, n) { return DIFF.items[year + "|" + sec + "|" + n] || null; }
  function diffSec(year, sec) { return DIFF.sections[year + "|" + sec] || null; }

  /* ── 读写 ── */
  function recOf(date, year, sec) {
    var d = J.days[date];
    return (d && d[year + "|" + sec]) || null;
  }
  function ensureRec(date, year, sec) {
    var d = J.days[date] || (J.days[date] = {});
    var k = year + "|" + sec;
    if (!d[k]) d[k] = { ans: {}, usedMin: null, causes: {}, note: "", t: 0 };
    return d[k];
  }
  function touch(rec) { rec.t = Date.now(); J.updatedAt = Date.now(); }
  function writeLS() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(J)); return true; } catch (e) { return false; }
  }
  function pushServer() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var B = window.BACK;
      var p = (B && B.journalPost)
        ? B.journalPost(J)
        : fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(J) })
            .then(function (r) { if (!r.ok) throw 0; return r.json(); });
      Promise.resolve(p)
        .then(function () { markSync(B && B.mode === "cloud" ? "已存云端" : "已落盘", "ok"); })
        .catch(function () {
          markSync(B && B.mode === "cloud" ? "未配对 · 看页面底部" : "仅本地", "warn");
        });
    }, 600);
  }
  function commit(msg) {
    writeLS();
    pushServer();
    if (msg) toast(msg);
    try { document.dispatchEvent(new CustomEvent("journal:render")); } catch (e) {}
  }
  function mergeDays(src) {
    if (!src || !src.days) return;
    Object.keys(src.days).forEach(function (date) {
      var a = J.days[date] || (J.days[date] = {});
      var b = src.days[date];
      Object.keys(b).forEach(function (k) {
        if (!a[k] || (b[k].t || 0) > (a[k].t || 0)) a[k] = b[k];
      });
    });
  }

  /* ── 渲染：记录页 ── */
  function renderYearSel() {
    $("fYear").innerHTML = YEARS.map(function (y) {
      return '<option value="' + y + '">' + y + " 年</option>";
    }).join("");
    $("fYear").value = cur.year;
  }
  function renderSecTabs() {
    var keys = secKeysOf(cur.year);
    if (keys.indexOf(cur.sec) < 0) cur.sec = keys[0] || "text1";
    $("fSec").innerHTML = keys.map(function (k) {
      var s = diffSec(cur.year, k);
      var nm = k.indexOf("text") === 0 ? "Text " + k.slice(4) : (k === "cloze" ? "完型" : "新题型");
      return '<button data-s="' + k + '"' + (k === cur.sec ? ' class="on"' : "") + ">" + nm +
        (s ? '<span class="df">' + fn2(s.p) + "</span>" : "") + "</button>";
    }).join("");
  }
  function renderHint() {
    var s = diffSec(cur.year, cur.sec);
    var box = $("secHint");
    if (!s) { box.innerHTML = ""; return; }
    var rec = recOf(cur.date, cur.year, cur.sec) || { ans: {} };
    var filled = Object.keys(rec.ans || {}).filter(function (k) { return rec.ans[k]; }).length;
    box.innerHTML =
      '<span class="tag df-' + bandCls(s.band) + '">本篇系数 ' + fn2(s.p) + " · " + s.band + "</span>" +
      '<span class="tag">' + s.n + " 题 · 限时 " + (s.part === "read" ? 18 : s.part === "cloze" ? 15 : 12) + " 分钟</span>" +
      '<span class="tag">已填 ' + filled + "/" + s.n + "</span>" +
      '<span class="ans-hide">不显示答案，也不判对错</span>';
  }
  function renderQuestions() {
    var s = paperSec(cur.year, cur.sec);
    var box = $("qList");
    if (!s) { box.innerHTML = '<div class="empty">这套卷没有这个部分。</div>'; return; }
    var rec = recOf(cur.date, cur.year, cur.sec) || { ans: {} };
    var ans = rec.ans || {};

    box.innerHTML = s.items.map(function (it) {
      var d = diffOf(cur.year, cur.sec, it.n);
      var mine = ans[it.n] || "";
      var h = '<div class="q' + (mine ? " done" : "") + '" data-n="' + it.n + '">';
      h += '<div class="q-hd"><span class="q-n">' + it.n + "</span>";
      if (d) {
        h += '<span class="q-t">' + esc(d.tcn) + "</span>";
        h += '<span class="q-band b-' + bandCls(d.band) + '">' + d.band + " " + fn2(d.p) + "</span>";
        if (d.src === "official") h += '<span class="q-p">官方/实测</span>';
      }
      h += "</div>";
      if (it.stem) h += '<p class="q-stem">' + esc(it.stem) + "</p>";
      if (it.pb) {
        h += '<div class="opts" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr))">';
        for (var i = 0; i < (it.options.length || 7); i++) {
          var K = LETTERS[i];
          h += '<button class="opt' + (mine === K ? " on" : "") + '" data-k="' + K + '" title="' +
            esc(String(it.options[i] || "").slice(0, 140)) + '"><span class="k">' + K + "</span></button>";
        }
        h += "</div>";
      } else {
        h += '<div class="opts">';
        (it.options || []).forEach(function (o, i) {
          var K = LETTERS[i];
          h += '<button class="opt' + (mine === K ? " on" : "") + '" data-k="' + K + '">' +
            '<span class="k">' + K + '</span><span class="txt">' + esc(o) + "</span></button>";
        });
        h += "</div>";
      }
      return h + "</div>";
    }).join("");
  }
  function renderRecList() {
    var rows = [];
    Object.keys(J.days).forEach(function (date) {
      Object.keys(J.days[date]).forEach(function (k) {
        var r = J.days[date][k];
        var p = k.split("|");
        var s = paperSec(p[0], p[1]);
        if (!s) return;
        var filled = 0, letters = "";
        s.items.forEach(function (it) {
          var a = (r.ans || {})[it.n];
          letters += a || "·";
          if (a) filled++;
        });
        rows.push({ date: date, key: k, year: p[0], sec: p[1], rec: r, s: s, filled: filled, letters: letters });
      });
    });
    rows.sort(function (a, b) {
      return a.date === b.date ? (a.key < b.key ? 1 : -1) : (a.date < b.date ? 1 : -1);
    });
    $("recCount").textContent = rows.length + " 篇";
    if (!rows.length) {
      $("recList").innerHTML = '<div class="empty">还没有记录。选好年份和题型，点选项就会记下来。</div>';
      return;
    }
    $("recList").innerHTML = rows.map(function (r, idx) {
      var mini = r.letters.split("").map(function (c) {
        return '<i class="' + (c === "·" ? "" : "f") + '">' + (c === "·" ? "" : c) + "</i>";
      }).join("");
      return '<div class="rec" data-i="' + idx + '">' +
        '<span class="d">' + r.date.slice(5) + "</span>" +
        '<span class="s">' + esc(r.year + " " + r.s.label) + "</span>" +
        '<span class="mini">' + mini + "</span>" +
        '<span class="m">' + r.filled + "/" + r.s.items.length +
        (r.rec.usedMin ? " · " + r.rec.usedMin + " 分钟" : "") + "</span>" +
        '<button class="dlt" data-del="' + idx + '" title="删除这条">×</button>' +
        '<span class="arrow">载入</span></div>';
    }).join("");
    $("recList")._rows = rows;
  }
  function renderEntry() {
    $("fDate").value = cur.date;
    $("fYear").value = cur.year;
    var rec = recOf(cur.date, cur.year, cur.sec);
    $("fUsed").value = (rec && rec.usedMin != null) ? rec.usedMin : "";
    renderSecTabs();
    renderHint();
    renderQuestions();
    renderRecList();
    try { document.dispatchEvent(new CustomEvent("journal:render")); } catch (e) {}
  }

  /* ── 事件 ── */
  function bind() {
    $("fDate").addEventListener("change", function () {
      cur.date = this.value || todayStr();
      renderEntry();
    });
    $("fYear").addEventListener("change", function () {
      cur.year = this.value;
      cur.sec = secKeysOf(cur.year)[0] || "text1";
      renderSecTabs();
      ensureYear(cur.year).then(function () { renderEntry(); });
    });
    $("fSec").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-s]");
      if (!b) return;
      cur.sec = b.getAttribute("data-s");
      renderEntry();
    });
    $("fUsed").addEventListener("input", function () {
      var v = this.value === "" ? null : Math.max(0, Math.min(240, parseInt(this.value, 10) || 0));
      var rec = ensureRec(cur.date, cur.year, cur.sec);
      rec.usedMin = v;
      touch(rec);
      commit();
      renderHint();
    });
    $("qList").addEventListener("click", function (e) {
      var btn = e.target.closest(".opt");
      if (!btn) return;
      var card = btn.closest(".q");
      var n = card.getAttribute("data-n");
      var k = btn.getAttribute("data-k");
      var rec = ensureRec(cur.date, cur.year, cur.sec);
      var on = rec.ans[n] !== k;
      if (on) rec.ans[n] = k; else delete rec.ans[n];
      if (rec.causes && rec.causes[n]) delete rec.causes[n];   // 改过答案，旧错因作废
      touch(rec);
      commit();
      card.classList.toggle("done", !!rec.ans[n]);
      card.querySelectorAll(".opt").forEach(function (o) { o.classList.toggle("on", o === btn && on); });
      renderHint();
      renderRecList();
    });
    $("btnSave").addEventListener("click", function () {
      var rec = recOf(cur.date, cur.year, cur.sec);
      if (!rec || (!Object.keys(rec.ans || {}).length && rec.usedMin == null)) {
        toast("这一篇还没填内容");
        return;
      }
      touch(rec);
      var s = paperSec(cur.year, cur.sec) || {};
      commit("已保存：" + cur.date.slice(5) + " " + cur.year + " " + (s.label || ""));
      renderRecList();
    });
    $("recList").addEventListener("click", function (e) {
      var rows = this._rows || [];
      var del = e.target.closest("[data-del]");
      if (del) {
        e.stopPropagation();
        var r0 = rows[+del.getAttribute("data-del")];
        if (!r0 || !confirm("删除 " + r0.date + " · " + r0.year + " " + r0.s.label + " 这条？")) return;
        delete J.days[r0.date][r0.key];
        if (!Object.keys(J.days[r0.date]).length) delete J.days[r0.date];
        J.updatedAt = Date.now();
        commit("已删除");
        renderEntry();
        return;
      }
      var el = e.target.closest(".rec");
      if (!el) return;
      var row = rows[+el.getAttribute("data-i")];
      if (!row) return;
      cur.date = row.date; cur.year = row.year; cur.sec = row.sec;
      renderEntry();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ── 对外暴露分析模块需要的接口 ── */
  window.JOURNAL = {
    J: function () { return J; },
    cur: function () { return cur; },
    paperSec: paperSec, secKeysOf: secKeysOf, diffOf: diffOf, diffSec: diffSec,
    recOf: recOf, ensureRec: ensureRec, touch: touch, commit: commit,
    ensureYear: ensureYear, preload: preload, recordYears: recordYears, YEARS: YEARS,
    CAUSES: CAUSES, CAUSE_MAP: CAUSE_MAP, ACTIONS: ACTIONS, PART_CN: PART_CN,
    LIMIT: LIMIT, pct: pct, fn2: fn2, esc: esc, bandCls: bandCls, toast: toast,
    markSync: markSync, renderEntry: renderEntry, renderRecList: renderRecList,
    LS_KEY: LS_KEY, API: API,
    DIFF: DIFF
  };

  /* ── 启动 ── */
  function boot() {
    markSync("读取中…");
    try {
      var local = JSON.parse(localStorage.getItem(LS_KEY));
      if (local && local.days) J = local;
    } catch (e) {}
    if (YEARS.length && YEARS.indexOf(String(cur.year)) < 0) cur.year = YEARS[0];
    renderYearSel();
    renderEntry();
    bind();
    preload(recordYears());
    ensureYear(cur.year).then(function () { renderEntry(); });
    if (window.JOURNAL_ANA && window.JOURNAL_ANA.init) window.JOURNAL_ANA.init();
    var B = window.BACK;
    var req = (B && B.journalGet)
      ? B.journalGet()
      : fetch(API, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
    Promise.resolve(req)
      .then(function (srv) {
        mergeDays(srv);
        writeLS();
        markSync(B && B.mode === "cloud" ? (B.writable() ? "云同步" : "云端只读") : "已同步",
                 B && B.mode === "cloud" && !B.writable() ? "warn" : "ok");
        preload(recordYears());        /* 服务端/云端带回的历史记录，年份分片接着下 */
        renderEntry();
        if (window.JOURNAL_ANA && window.JOURNAL_ANA.refresh) window.JOURNAL_ANA.refresh();
      })
      .catch(function () { markSync("本地模式", "warn"); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
