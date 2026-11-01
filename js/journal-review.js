/* 每日阅读复盘 · 次日归类
   Day 1 做两篇 → Day 2 打开记录本，这里把前一天所有错题按五类题型归类，
   给出「哪类错得最多」，并直接推阿超（陈志超）B 站里对应题型的技巧讲解。

   口径与 tools/review_engine.py 完全一致（同一套 QTYPES/QTYPE_VIDEO），
   这样电脑本地算、手机拉静态 JSON、小满读 /__review 三方结果不会打架。
   数据来源只用前端已加载的：window.JOURNAL.J().days + paperSec() + DIFF.items[].t/tcn */
(function () {
  "use strict";

  var N = window.JOURNAL;
  if (!N) return;

  var GROUP = {
    detail: { cn: "细节理解题", grp: "detail" },
    infer: { cn: "推理判断题", grp: "infer" },
    main: { cn: "主旨大意题", grp: "main" },
    title: { cn: "主旨大意题", grp: "main" },
    word: { cn: "词义猜测题", grp: "word" },
    attitude: { cn: "观点态度题", grp: "attitude" },
    example: { cn: "例证/目的题", grp: "example" }
  };
  var ORDER = ["detail", "infer", "main", "word", "attitude", "example"];
  var CAUSE_CN = {};
  N.CAUSES.forEach(function (c) { CAUSE_CN[c.k] = c.n; });

  var VM = null;                    /* data/qtype_video.json */
  var state = { day: "", data: null, open: {}, loading: false };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return N.esc(s); }
  function md(d) { return String(d || "").slice(5).replace("-", "/"); }

  /* ── 视频映射表：只有 2KB，公网版也放一份（publish_pages 会同步过去） ── */
  function loadVM() {
    if (VM) return Promise.resolve(VM);
    var urls = ["data/qtype_video.json", "/data/qtype_video.json"];
    var i = 0;
    function next() {
      if (i >= urls.length) { VM = { types: {}, general: {}, causeMap: {} }; return Promise.resolve(VM); }
      var u = urls[i++];
      return fetch(u, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (o) { VM = o || {}; return VM; })
        .catch(next);
    }
    return next();
  }

  function typeOf(year, sec, n) {
    var d = N.diffOf(year, sec, n);
    if (!d || !d.t) return { k: "", cn: (d && d.tcn) || "未标注", grp: "other" };
    var g = GROUP[d.t];
    return { k: d.t, cn: (g && g.cn) || d.tcn || d.t, grp: g ? g.grp : "other" };
  }

  /* ── 一天的数据 ── */
  function analyze(day) {
    var J = N.J();
    var secs = (J.days && J.days[day]) || {};
    var papers = [], wrong = [], by = {}, hasCloze = 0;
    Object.keys(secs).forEach(function (key) {
      var rec = secs[key];
      if (!rec) return;
      var p = key.split("|"), year = p[0], sec = p[1];
      var s = N.paperSec(year, sec);
      if (!s) return;
      var ans = rec.ans || {}, causes = rec.causes || {};

      /* 完型 / 新题型：只记个数，不进五类阅读题型 */
      if (sec !== "text1" && sec !== "text2" && sec !== "text3" && sec !== "text4") {
        if (sec === "cloze") {
          s.items.forEach(function (it) { if ((ans[it.n] || "").length) hasCloze++; });
        }
        return;
      }
      var total = 0, answered = 0, nwrong = 0;
      s.items.forEach(function (it) {
        total++;
        var mine = (ans[it.n] || "").toUpperCase();
        if (!mine) return;
        answered++;
        var std = String(it.answer || "").toUpperCase();
        var t = typeOf(year, sec, it.n);
        var g = by[t.grp] || (by[t.grp] = { k: t.grp, cn: t.cn, total: 0, wrong: 0 });
        g.total++;
        if (mine === std) return;
        g.wrong++; nwrong++;
        var dm = N.diffOf(year, sec, it.n) || {};
        wrong.push({
          date: day, key: key, year: year, sec: sec, label: s.label, n: it.n,
          cn: t.cn, grp: t.grp, mine: mine, answer: std,
          band: dm.band || "", p: dm.p || 0,
          causeCn: CAUSE_CN[causes[it.n]] || "",
          cause: causes[it.n] || ""
        });
      });
      papers.push({
        key: key, year: year, sec: sec, label: s.label,
        total: total, answered: answered, wrong: nwrong, usedMin: rec.usedMin
      });
    });

    /* p = 预测正确率，越低越难；难的那几道排前面最该重做 */
    wrong.sort(function (a, b) { return (a.p || 1) - (b.p || 1) || (a.key < b.key ? -1 : 1); });

    var types = ORDER.map(function (k) {
      if (by[k]) return by[k];
      var cn = k;
      for (var t in GROUP) { if (GROUP[t].grp === k) { cn = GROUP[t].cn; break; } }
      return { k: k, cn: cn, total: 0, wrong: 0 };
    });
    var q = 0, w = 0;
    papers.forEach(function (p) { q += p.answered; w += p.wrong; });

    return {
      date: day, papers: papers, wrong: wrong, byType: types,
      questions: q, wrongCount: w,
      rate: q ? (q - w) / q : null,
      cloze: hasCloze
    };
  }

  /* ── 有记录的日期（近 8 个） ── */
  function days() {
    var J = N.J(), out = [];
    Object.keys(J.days || {}).forEach(function (d) {
      var k = Object.keys(J.days[d] || {});
      if (k.length) out.push(d);
    });
    out.sort();
    out.reverse();
    return out.slice(0, 8);
  }
  function todayStr() {
    var d = new Date(), p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  /* 默认口径：最近一个有记录的「过去」日期；今天做的不算，留到明天复盘 */
  function defaultDay() {
    var t = todayStr(), ds = days();
    for (var i = 0; i < ds.length; i++) if (ds[i] < t) return ds[i];
    return ds[0] || "";
  }

  /* ── 渲染 ── */
  function renderStrip(d) {
    var bar = $("rvBar");
    if (!bar) return;
    if (!d || !d.questions) { bar.hidden = true; return; }
    var weak = d.byType.filter(function (v) { return v.wrong > 0; })
      .sort(function (a, b) { return b.wrong - a.wrong; })[0];
    bar.innerHTML =
      '<span class="rvs-k">复盘</span>' +
      '<span class="rvs-t">' + md(d.date) + " · " + d.papers.length + " 篇 " + d.questions +
      " 题 · 错 " + d.wrongCount + " 题</span>" +
      (weak ? '<span class="rvs-w">最弱：' + esc(weak.cn) + "（" + weak.wrong + " 错）</span>" : "") +
      '<span class="rvs-go">看题型归类与技巧视频 ›</span>';
    bar.hidden = false;
  }

  function renderPanel() {
    var panel = $("rvPanel");
    if (!panel) return;
    var ds = days();
    var d = state.data;

    var chips = ds.map(function (x) {
      return '<button type="button" class="rvday' + (x === state.day ? " on" : "") +
        '" data-d="' + x + '">' + md(x) + (x === todayStr() ? "（今天）" : "") + "</button>";
    }).join("");

    if (!d || !d.questions) {
      panel.innerHTML =
        '<div class="pane-hd"><b>阅读复盘</b><span class="sub">次日归类前一天错题</span></div>' +
        '<div class="rv-days">' + chips + "</div>" +
        '<p class="rv-empty">' + (ds.length
          ? "这一天还没有阅读作答记录（只记了完型/新题型不算）。做完两篇，第二天再回来看。"
          : "记录本里还没有作答。先在「记录」页做两篇阅读。") + "</p>";
      return;
    }

    /* 汇总 */
    var sum = '<div class="rv-num"><b>' + d.papers.length + "</b><span>篇</span></div>" +
      '<div class="rv-num"><b>' + d.questions + "</b><span>题</span></div>" +
      '<div class="rv-num bad"><b>' + d.wrongCount + "</b><span>错</span></div>" +
      '<div class="rv-num"><b>' + (d.rate == null ? "—" : Math.round(d.rate * 100) + "%") + "</b><span>正确率</span></div>" +
      '<div class="rv-met' + (d.papers.length >= 2 ? " ok" : "") + '">' +
      (d.papers.length >= 2 ? "✓ 每日两篇达标" : "今天只做了 " + d.papers.length + " 篇（目标 2 篇）") + "</div>";

    /* 题型横条 */
    var maxW = 1;
    d.byType.forEach(function (v) { if (v.wrong > maxW) maxW = v.wrong; });
    var types = d.byType.map(function (v) {
      var w = Math.round((v.wrong / maxW) * 100);
      return '<div class="rvt' + (v.wrong ? " bad" : (v.total ? " ok" : " dull")) + '">' +
        '<span class="rvt-n">' + esc(v.cn) + "</span>" +
        '<span class="rvt-bar"><i style="width:' + (v.total ? Math.max(w, 4) : 0) + '%"></i></span>' +
        '<span class="rvt-m">' + (v.total ? v.wrong + " 错 / " + v.total + " 题" : "未考到") + "</span></div>";
    }).join("");

    /* 错题清单 */
    var wrong = d.wrong.map(function (w, i) {
      return '<button type="button" class="rvw" data-i="' + i + '" title="点一下跳到这一篇">' +
        '<span class="rvw-tag">' + esc(w.cn) + "</span>" +
        '<span class="rvw-q">' + w.year + " " + esc(w.label) + " · 第 " + w.n + " 题</span>" +
        '<span class="rvw-a">我 ' + esc(w.mine) + ' <i>→</i> 答 ' + esc(w.answer) + "</span>" +
        (w.causeCn ? '<span class="rvw-c">' + esc(w.causeCn) + "</span>" : "") +
        (w.band ? '<span class="rvw-b">' + esc(w.band) + "</span>" : "") +
        "</button>";
    }).join("");

    /* 技巧视频：按错得最多的题型给 */
    var vmTypes = (VM && VM.types) || {};
    var push = d.byType.filter(function (v) { return v.wrong > 0; })
      .sort(function (a, b) { return b.wrong - a.wrong || b.total - a.total; })
      .slice(0, 3);
    var gen = (VM && VM.general) || {};
    if (!push.length && gen.videos) {
      push = [{ k: "general", cn: gen.cn || "通用复盘", wrong: 0, total: d.questions }];
    }
    var videos = push.map(function (v, i) {
      var info = (v.k === "general" ? gen : vmTypes[v.k]) || {};
      var vs = (info.videos || gen.videos || []).map(function (x, j) {
        var id = v.k + ":" + j;
        return '<button type="button" class="rvv' + (state.open[id] ? " on" : "") +
          '" data-v="' + id + '" data-bv="' + x.bv + '" data-p="' + (x.p || 1) + '">' +
          '<span class="rvv-p">P' + (x.p || 1) + '</span>' + esc(x.title) + "</button>" +
          '<div class="rvv-box" data-box="' + id + '"></div>';
      }).join("");
      return '<div class="rvp">' +
        '<div class="rvp-hd"><span class="rvp-k">' + esc(v.cn) + "</span>" +
        '<span class="rvp-m">' + (v.wrong ? "错 " + v.wrong + " / " + v.total + " 题" : "整篇复盘") + "</span></div>" +
        (info.why ? '<p class="rvp-why">' + esc(info.why) + "</p>" : "") +
        '<div class="rvp-vs">' + vs + "</div></div>";
    }).join("");

    panel.innerHTML =
      '<div class="pane-hd"><b>阅读复盘</b><span class="sub">次日归类前一天错题 · 带着方法回头复盘</span></div>' +
      '<div class="rv-days">' + chips + "</div>" +
      '<div class="rv-sum">' + sum + "</div>" +
      (d.cloze ? '<p class="rv-tip">这一天还做完了 ' + d.cloze + " 道完型，完型不在五类阅读题型里，单独看「分析 › 累计」。</p>" : "") +
      '<div class="rv-sec"><div class="rv-sh">题型分布<span>错得最多的排最上面</span></div>' + types + "</div>" +
      '<div class="rv-sec"><div class="rv-sh">错题逐题过<span>越难的排越前（按预测正确率升序），先重做上面这几道</span></div>' +
      (wrong || '<p class="rv-empty">这一天没有错题。</p>') + "</div>" +
      '<div class="rv-sec"><div class="rv-sh">该补的技巧视频<span>阿超（陈志超）· 点开直接播</span></div>' +
      (videos || '<p class="rv-empty">没有需要补的题型。</p>') + "</div>";

    bindPanel();
  }

  function bindPanel() {
    var panel = $("rvPanel");
    if (!panel) return;

    panel.querySelectorAll(".rvday").forEach(function (b) {
      b.addEventListener("click", function () {
        state.day = b.getAttribute("data-d");
        state.open = {};
        refresh();
      });
    });

    panel.querySelectorAll(".rvw").forEach(function (b) {
      b.addEventListener("click", function () {
        var w = state.data.wrong[+b.getAttribute("data-i")];
        if (!w) return;
        var cur = N.cur();
        cur.date = w.date; cur.year = w.year; cur.sec = w.sec;
        if (N.ensureYear) N.ensureYear(cur.year).then(function () { N.renderEntry(); });
        else N.renderEntry();
        var tab = document.querySelector('#viewTabs button[data-v="entry"]');
        if (tab) tab.click();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    panel.querySelectorAll(".rvv").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-v");
        var box = panel.querySelector('[data-box="' + id + '"]');
        if (!box) return;
        if (state.open[id]) {
          state.open[id] = false;
          b.classList.remove("on");
          box.innerHTML = "";
          return;
        }
        state.open[id] = true;
        b.classList.add("on");
        var bv = b.getAttribute("data-bv"), p = b.getAttribute("data-p") || 1;
        box.innerHTML = '<div class="ac-video"><iframe scrolling="no" frameborder="0" allowfullscreen ' +
          'src="https://player.bilibili.com/player.html?isOutside=true&bvid=' + bv + "&p=" + p +
          '&autoplay=0&danmaku=0&high_quality=1"></iframe>' +
          '<div class="vfoot"><a target="_blank" rel="noopener" href="https://www.bilibili.com/video/' +
          bv + "?p=" + p + '">在 B 站打开（可看弹幕/评论）</a></div></div>';
      });
    });
  }

  function refresh() {
    if (state.loading) return;
    var days0 = days();
    if (!days0.length) {
      state.day = "";
      state.data = analyze("");
      renderStrip(null);
      renderPanel();
      return;
    }
    if (!state.day || days0.indexOf(state.day) < 0) state.day = defaultDay();

    state.loading = true;
    loadVM().then(function () {
      /* 记录本的历史记录可能跨多年，题库是按年懒加载的，先补齐再算 */
      var years = [];
      Object.keys(N.J().days || {}).forEach(function (dd) {
        Object.keys(N.J().days[dd] || {}).forEach(function (k) {
          var y = String(k).split("|")[0];
          if (years.indexOf(y) < 0) years.push(y);
        });
      });
      Promise.all(years.map(function (y) { return N.ensureYear(y); })).then(function () {
        state.loading = false;
        state.data = analyze(state.day);
        renderStrip(state.data);
        renderPanel();
      });
    });
  }

  /* 记录页那条提示：点一下切到分析页 */
  document.addEventListener("click", function (e) {
    var bar = e.target.closest && e.target.closest("#rvBar");
    if (!bar) return;
    var tab = document.querySelector('#viewTabs button[data-v="ana"]');
    if (tab) tab.click();
    var p = $("rvPanel");
    if (p) p.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* 记录本一有改动就重算（连点合并） */
  var t = 0;
  document.addEventListener("journal:render", function () {
    clearTimeout(t);
    t = setTimeout(refresh, 60);
  });

  window.JOURNAL_REVIEW = {
    refresh: refresh,
    day: function () { return state.day; },
    data: function () { return state.data; },
    dayAnalysis: function (d) { return analyze(d || state.day); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh);
  else setTimeout(refresh, 0);
})();
