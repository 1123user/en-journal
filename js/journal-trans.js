/* 翻译 · 每日一句（英语一 Part C 真题）
 *
 * 官方评分口径：每句 2 分，一般拆 4 个评分小节，每节 0.5 分。
 * 流程：看英文 → 自己在输入框写译文 → 「对照评分」亮出参考译文 + 4 个采分点，
 * 按官方表格逐节自评（译出核心意思 = 0.5），整句明显扭曲原文最多 1 分。
 * 数据 data/trans-pool-a.js / trans-pool-b.js（2010-2023+2025，共 75 句，2024 原卷缺）。
 * 作答存 kb:transDaily:v1，不写进记录本 days（复盘只统计客观题）。
 */
(function () {
  "use strict";

  var KEY = "kb:transDaily:v1";
  var POOL = [];          /* 按年份+题号排平的句池 */

  function flatten() {
    var by = (window.TRPOOL && window.TRPOOL.by) || {};
    var years = Object.keys(by).sort();
    years.forEach(function (y) {
      var arr = (by[y] || []).slice().sort(function (a, b) { return a.n - b.n; });
      arr.forEach(function (it) {
        it.id = y + "-" + it.n;
        it.year = y;
        POOL.push(it);
      });
    });
  }

  function store() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function save(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function todayStr() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function dayIdx() {
    return Math.floor(Date.now() / 86400000);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function panel() { return document.getElementById("trPanel"); }

  /* 今日句：按日期轮转，同一天固定；做过可「换一句」往后顺延到下一个未做过的 */
  function pick() {
    if (!POOL.length) return null;
    var all = store(), t = todayStr();
    var rec = all[t] || {};
    var start = dayIdx() % POOL.length;
    var cur = rec.cur != null ? rec.cur : start;
    var it = POOL[cur % POOL.length];
    if (rec[it.id]) {
      for (var k = 1; k < POOL.length; k++) {
        var cand = POOL[(cur + k) % POOL.length];
        if (!rec[cand.id]) { cur = (cur + k) % POOL.length; it = cand; break; }
      }
    }
    return { it: it, idx: cur };
  }

  function stats() {
    var all = store(), n = 0, sum = 0;
    Object.keys(all).forEach(function (d) {
      var r = all[d];
      if (r && r.score != null) { n++; sum += r.score; }
    });
    return { n: n, avg: n ? (sum / n) : 0 };
  }

  function scoreOf(rec) {
    var u = rec.units || [0, 0, 0, 0];
    var s = 0;
    for (var i = 0; i < 4; i++) s += u[i] ? 0.5 : 0;
    if (!rec.fluent) s = Math.max(0, s - 0.5);
    return Math.round(s * 10) / 10;
  }

  function fmt(v) { return (Math.round(v * 10) / 10).toFixed(1); }

  function render() {
    var el = panel();
    if (!el) return;
    if (!POOL.length) { el.hidden = true; return; }
    var pk = pick();
    if (!pk) { el.hidden = true; return; }
    var it = pk.it, idx = pk.idx;
    CUR = it;
    var all = store(), t = todayStr();
    var rec = all[t] && all[t].id === it.id ? all[t] : null;
    var st = stats();

    var h = '<div class="cz-hd"><b>每日一句 · 翻译评分</b>' +
      '<span>英语一 Part C · ' + esc(it.year) + ' 年真题第 ' + esc(it.n) + ' 句 · 官方口径每句 2 分拆 4 节</span>' +
      '<em>' + (rec ? '<b class="tr-sc">' + fmt(rec.score) + '</b>/2 · 已评' : (st.n ? '已练 ' + st.n + ' 句 · 均 ' + fmt(st.avg) : '今天还没译')) + '</em>' +
      '</div>';

    h += '<div class="cz-item tr-now" id="trNow">';
    h += '<p class="cz-ctx tr-en">' + esc(it.en) + '</p>';

    /* 我的译文 */
    var myTxt = rec ? (rec.txt || "") : "";
    h += '<textarea class="tr-input" id="trInput" rows="3" placeholder="把整句写在这里（先别看参考译文）">' + esc(myTxt) + '</textarea>';
    h += '<div class="tr-acts">' +
      '<button type="button" class="btn primary tr-btn" id="trReveal">' + (rec ? "重看评分" : "对照官方口径评分") + '</button>' +
      '<button type="button" class="btn tr-btn2" id="trSkip" title="换一句今天没做过的">换一句</button>' +
      '</div>';

    /* 评分区（点开才显示） */
    var open = !!rec;
    h += '<div class="tr-judge" id="trJudge"' + (open ? '' : ' hidden') + '>';
    if (open) {
      h += '<div class="tr-ref"><b>参考译文</b>' + esc(it.ref) + '</div>';
      h += '<div class="tr-rule">' + esc((window.TRPOOL && window.TRPOOL.rules && window.TRPOOL.rules[2]) || "") + '</div>';
      h += '<div class="tr-units">';
      it.u.forEach(function (un, i) {
        var hit = rec.units && rec.units[i];
        h += '<button type="button" class="tr-unit' + (hit ? " hit" : "") + '" data-u="' + i + '">' +
          '<i>' + (hit ? "✓ 0.5" : "✗ 0") + '</i>' +
          '<code>' + esc(un[0]) + '</code>' +
          '<span>' + esc(un[1]) + '</span></button>';
      });
      h += '</div>';
      h += '<label class="tr-fluent"><input type="checkbox" id="trFluent"' + (rec.fluent ? " checked" : "") + '> 整句通顺、不扭曲原文（不勾 −0.5，扭曲原文最多给 1 分）</label>';
      h += '<div class="tr-score">本句得分 <b>' + fmt(rec.score) + '</b> / 2</div>';
      h += '<div class="tr-tip">💡 ' + esc(it.tip || "") + '</div>';
    } else {
      h += '<div class="tr-hint">译完再点上面的按钮：亮出参考译文和 4 个采分点，按官方表格逐节自评。</div>';
    }
    h += '</div>';

    h += '</div>';
    el.innerHTML = h;
    el.hidden = false;

    /* 面板内事件 */
    var input = el.querySelector("#trInput");
    var judge = el.querySelector("#trJudge");
    var reveal = el.querySelector("#trReveal");
    var skip = el.querySelector("#trSkip");

    if (reveal) reveal.addEventListener("click", function () {
      var all2 = store(), r = all2[t];
      if (!r || r.id !== it.id) {
        /* 第一次评分：先落一条空记录把句子定住 */
        all2[t] = { id: it.id, year: it.year, n: it.n, idx: idx, units: [0, 0, 0, 0], fluent: true, txt: input ? input.value.trim() : "", score: 0, at: Date.now() };
        save(all2);
        render();
        return;
      }
      if (judge) judge.hidden = !judge.hidden;
      if (!judge.hidden && input) input.value = r.txt || "";
    });

    /* 译文输入：失焦即存（评分后改译文也保留） */
    if (input && !input.dataset.trWired) {
      input.dataset.trWired = "1";
      var persistTxt = function () {
        var all2 = store(), r = all2[todayStr()];
        if (r && CUR && r.id === CUR.id) { r.txt = input.value.trim(); save(all2); }
      };
      input.addEventListener("change", persistTxt);
      input.addEventListener("blur", persistTxt);
    }

    if (skip) skip.addEventListener("click", function () {
      var all2 = store();
      if (all2[t] && all2[t].id) { delete all2[t]; save(all2); }
      /* 往后顺延一句；换过的话记下 cur，同天固定 */
      var start2 = dayIdx() % POOL.length;
      var prev = all2[t] && all2[t].cur != null ? all2[t].cur : start2;
      var next = (prev + 1) % POOL.length;
      all2[t] = { cur: next };
      save(all2);
      render();
    });
  }

  /* 当前展示的句（点击处理用），render() 里更新 */
  var CUR = null;

  function bindPanel() {
    var el = panel();
    if (!el || el.dataset.trBound) return;
    el.dataset.trBound = "1";

    el.addEventListener("click", function (e) {
      var ub = e.target.closest ? e.target.closest(".tr-unit") : null;
      if (!ub || !CUR) return;
      var t = todayStr();
      var all2 = store(), r = all2[t];
      if (!r || r.id !== CUR.id) return;
      var ui = parseInt(ub.getAttribute("data-u"), 10) || 0;
      r.units = r.units || [0, 0, 0, 0];
      r.units[ui] = r.units[ui] ? 0 : 1;
      r.score = scoreOf(r);
      save(all2);
      render();
    });
  }

  function boot() {
    flatten();
    bindPanel();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.JOURNAL_TRANS = { render: render, pool: function () { return POOL; } };
})();
