/* 今日该做哪篇：读 /__plan（来自 Scriptable 里那份英语计划 plan-en.json 的 drill 任务），
   打开记录本时自动定位到「哪一年 · 哪一篇」，并把限时/提醒一并摆出来。
   计划里今天没有阅读时只提示「下一篇」，不擅自改写年/篇，避免录错。 */
(function () {
  "use strict";

  var bar = document.getElementById("planBar");
  var N = window.JOURNAL;
  if (!bar || !N) return;

  function ykey(p) { return String(p.year); }

  function canUse(p) {
    return N.secKeysOf(ykey(p)).indexOf(p.sec) >= 0;
  }

  function counts(p) {
    var s = N.paperSec(ykey(p), p.sec);
    var rec = N.recOf(N.cur().date, ykey(p), p.sec);
    var filled = 0;
    if (rec && rec.ans) {
      Object.keys(rec.ans).forEach(function (k) { if (rec.ans[k]) filled++; });
    }
    return { total: s ? s.items.length : 0, filled: filled };
  }

  function apply(p) {
    if (!canUse(p)) {
      N.toast("题库里还没有 " + ykey(p) + " " + p.label);
      return false;
    }
    var cur = N.cur();
    cur.year = ykey(p);
    cur.sec = p.sec;
    if (N.ensureYear) N.ensureYear(cur.year).then(function () { N.renderEntry(); });
    else N.renderEntry();
    return true;
  }

  function md(date) { return date.slice(5).replace("-", "/"); }

  function render(p, located) {
    var c = counts(p);
    var tag, txt, go = "";
    if (p.kind === "today") {
      tag = "今日推荐";
      txt = ykey(p) + " " + p.label;
    } else if (p.kind === "next") {
      tag = "今天不读";
      txt = "下一篇 " + md(p.date) + " · " + ykey(p) + " " + p.label;
      if (!located) go = '<button class="pb-go" type="button">先做这篇</button>';
    } else {
      tag = "计划已结束";
      txt = "最近一次 " + md(p.date) + " · " + ykey(p) + " " + p.label;
      if (!located) go = '<button class="pb-go" type="button">定位</button>';
    }

    var h = '<span class="pb-k">' + tag + "</span>" +
      '<span class="pb-t">' + N.esc(txt) + "</span>";
    if (c.total) {
      h += c.filled >= c.total
        ? '<span class="pb-m ok">已录完 ' + c.filled + "/" + c.total + "</span>"
        : '<span class="pb-m">已填 ' + c.filled + "/" + c.total +
          (p.minutes ? " · 限时 " + p.minutes + " 分钟" : "") + "</span>";
    }
    if (p.note) h += '<span class="pb-note">' + N.esc(p.note) + "</span>";
    bar.innerHTML = h + go;
    bar.hidden = false;

    var btn = bar.querySelector(".pb-go");
    if (btn) btn.addEventListener("click", function () {
      if (apply(p)) render(p, true);
    });
  }

  var lastP = null, lastLocated = false;

  /* 点一下选项就更新「已填 x/5」，但只在用户还在计划那一篇时刷新 */
  document.addEventListener("journal:render", function () {
    if (!lastP) return;
    var cur = N.cur();
    if (cur.year !== ykey(lastP) || cur.sec !== lastP.sec) return;
    render(lastP, lastLocated);
  });

  function fail(msg) {
    /* 计划读不到不影响录入，只在角落提示一句 */
    bar.innerHTML = '<span class="pb-k mute">计划未读到</span><span class="pb-note">' + N.esc(msg) + "</span>";
    bar.hidden = false;
  }

  var planReq = (window.BACK && window.BACK.plan)
    ? window.BACK.plan()
    : fetch("/__plan", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  planReq
    .then(function (p) {
      if (!p || !p.ok) return fail((p && p.err) || "英语计划里没有阅读任务");
      lastP = p;
      lastLocated = p.kind === "today" ? apply(p) : false;
      render(p, lastLocated);
    })
    .catch(function () { fail("读不到服务端计划（可能没走本地服务）"); });
})();
