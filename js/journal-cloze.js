/* 完形填空 · 每日三空
 *
 * 为什么不是「每日一句」：340 道完形真题里 49.4% 是逻辑关系题，
 * 只给孤零零一句，四个选项讲得通，练了反而学坏。
 * 所以每题都带 上一句 + 本句 + 下一句，数据由 tools/make_cloze_daily.py 生成。
 *
 * 只跟宋逸轩一位老师（六种逻辑关系），题错了就指回对应那一集。
 * 作答单独存 kb:clozeDaily:v1，**不写进记录本的 days**——
 * 记录本的复盘只统计 text1~text4，掺进完形会把正确率算花。
 */
(function () {
  "use strict";

  var KEY = "kb:clozeDaily:v1";
  var SRC = "data/cloze_daily.json";
  var LETTERS = ["A", "B", "C", "D"];

  var DAYS = null;      /* 题库排期 */
  var today = null;     /* 当前显示的这一天 */

  function store() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function save(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function ymd(d) {
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* 上下文：只画本题这一个空，别人的空直接抹掉。
     以前留成〔8〕〔9〕，一整段全是空号，看着就不知道自己在做哪个（2026-11-01 反馈） */
  function ctxHtml(text) {
    var h = esc(text);
    h = h.replace(/____/g, '<b class="cz-blank">　　</b>');
    h = h.replace(/〔\s*\d{1,2}\s*〕/g, "");
    h = h.replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g, "");
    h = h.replace(/[ \t]{2,}/g, " ");
    return h;
  }

  /* 选项释义：答完才显示，答前不剧透。
     词库的释义是词典义（同一词会列好几个），太长就把尾巴截掉，别把按钮撑成一堵墙 */
  function defOf(w) {
    var D = window.CLOZE_WORDS || {};
    var t = D[String(w == null ? "" : w).toLowerCase().trim()] || "";
    if (t.length > 26) t = t.slice(0, 25).replace(/[；;、，,\s]+$/, "") + "…";
    return t;
  }

  function panel() { return document.getElementById("czPanel"); }

  function dayData() {
    if (!DAYS || !DAYS.length) return null;
    var t = ymd(new Date());
    for (var i = 0; i < DAYS.length; i++) {
      if (DAYS[i].date === t) return DAYS[i];
    }
    /* 今天没排到（比如排期已过）就给最近一个未做完的，别空着 */
    var done = store();
    for (var j = DAYS.length - 1; j >= 0; j--) {
      var d = DAYS[j];
      if (d.date > t) continue;
      var rec = done[d.date] || {};
      if (Object.keys(rec).length < d.items.length) return d;
    }
    return DAYS[DAYS.length - 1];
  }

  function render() {
    var el = panel();
    if (!el) return;
    if (!DAYS || !DAYS.length) { el.hidden = true; return; }
    today = dayData();
    if (!today) { el.hidden = true; return; }

    var done = store()[today.date] || {};
    var got = 0, wrong = 0;
    today.items.forEach(function (it) {
      var my = done[it.id];
      if (my) { got++; if (my !== it.answer) wrong++; }
    });

    var h = '<div class="cz-hd"><b>每日三空</b>' +
      '<span>' + today.date.slice(5).replace("-", "/") + ' · 逻辑 2 + 语义 1，每题都带前后句</span>' +
      (got ? '<em class="' + (wrong ? "bad" : "ok") + '">已答 ' + got + "/" + today.items.length +
        (wrong ? " · 错 " + wrong : " · 全对") + '</em>' : '<em>还没做</em>') +
      '</div>';

    h += '<div class="cz-body">';
    today.items.forEach(function (it, i) {
      var my = done[it.id] || "";
      var isRight = my && my === it.answer;
      h += '<div class="cz-item' + (my ? (isRight ? " ok" : " bad") : "") + '">';
      h += '<div class="cz-q"><span class="cz-n">' + (i + 1) + '</span>' +
        '<span class="cz-tag">' + esc(it.tcn) + '</span>' +
        '<span class="cz-src">' + esc(it.y) + ' 完形 第 ' + esc(it.n) + ' 空</span>' +
        (it.p != null ? '<span class="cz-p">预测正确率 ' + Math.round(it.p * 100) + '%</span>' : '') +
        '</div>';
      h += '<p class="cz-ctx">' + ctxHtml(it.ctx) + '</p>';
      h += '<div class="cz-opts">';
      for (var k = 0; k < 4; k++) {
        var L = LETTERS[k], w = (it.options || [])[k] || "";
        var cls = "cz-opt";
        if (my) {
          cls += " locked";
          if (L === it.answer) cls += " right";
          if (L === my && my !== it.answer) cls += " mine-wrong";
        }
        var def = my ? defOf(w) : "";
        h += '<button type="button" class="' + cls + '" data-id="' + esc(it.id) + '" data-k="' + L + '">' +
          '<i>' + L + '</i>' + esc(w) +
          (def ? '<em class="cz-def">' + esc(def) + '</em>' : '') + '</button>';
      }
      h += '</div>';
      if (my) {
        h += '<p class="cz-fb">' + (isRight
          ? '✓ 对。'
          : '✗ 你选 ' + esc(my) + '，答案是 <b>' + esc(it.answer) + '</b>。') +
          (it.hit && !isRight ? '这题是' + esc(it.tcn) + ' → 回看「' + esc(it.hit) + '」' : '') +
          '</p>';
      }
      h += '</div>';
    });
    h += '</div>';
    el.innerHTML = h;
    el.hidden = false;
  }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest(".cz-opt") : null;
    if (!b) return;
    if (b.classList.contains("locked")) return;
    var id = b.getAttribute("data-id");
    var k = b.getAttribute("data-k");
    if (!id || !k || !today) return;
    var all = store();
    var rec = all[today.date] || (all[today.date] = {});
    if (rec[id]) return;
    rec[id] = k;
    save(all);
    render();
  }

  function boot() {
    var el = panel();
    if (!el) return;
    el.addEventListener("click", onClick);
    fetch(SRC, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (o) {
        if (!o || !o.days || !o.days.length) { el.hidden = true; return; }
        DAYS = o.days;
        render();
      })
      .catch(function () { el.hidden = true; });
  }

  /* 记录本会在数据同步后重绘，这里跟着刷一次统计 */
  window.JOURNAL_CLOZE = { render: render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
