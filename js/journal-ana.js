/* 英语刷题记录本 · 分析页
   ── 与题库答案比对 → 对错；叠加 DIFF 难度系数 → 加权得分率 / 送分题漏失
   ── 错题可归因，错因聚合成「下一步练什么」
*/
(function () {
  "use strict";
  var N = window.JOURNAL;
  if (!N) return;
  var esc = N.esc, pct = N.pct, fn2 = N.fn2, bandCls = N.bandCls;

  function $(id) { return document.getElementById(id); }

  function collect() {
    var J = N.J(), out = [];
    Object.keys(J.days).forEach(function (date) {
      Object.keys(J.days[date]).forEach(function (key) {
        var rec = J.days[date][key];
        var p = key.split("|");
        var s = N.paperSec(p[0], p[1]);
        if (!s) return;
        var rows = [];
        s.items.forEach(function (it) {
          var mine = (rec.ans || {})[it.n] || "";
          var std = it.answer || "";
          if (!mine || !std) return;
          var d = N.diffOf(p[0], p[1], it.n) || { p: .5, band: "中", tcn: "未分类" };
          rows.push({
            date: date, key: key, secLabel: s.label, year: p[0], sec: p[1], part: s.part,
            n: it.n, stem: it.stem, options: it.options || [], mine: mine, std: std, ok: mine === std,
            p: d.p, band: d.band, tcn: d.tcn,
            cause: (rec.causes || {})[it.n] || "",
            mis: (rec.mis || {})[it.n] || null
          });
        });
        out.push({
          date: date, key: key, year: p[0], sec: p[1], rec: rec, s: s,
          ds: N.diffSec(p[0], p[1]) || {}, rows: rows
        });
      });
    });
    out.sort(function (a, b) {
      return a.date === b.date ? (a.key < b.key ? 1 : -1) : (a.date < b.date ? 1 : -1);
    });
    return out;
  }

  function statOf(rows) {
    if (!rows.length) return null;
    var ok = 0, sp = 0, sw = 0;
    rows.forEach(function (r) { sp += r.p; if (r.ok) { ok++; sw += r.p; } });
    return { n: rows.length, ok: ok, rate: ok / rows.length, expected: sp / rows.length, weighted: sp ? sw / sp : 0 };
  }

  /* ══════ 两层视角：today＝今日这一篇 / all＝累计总览 ══════ */
  var SCOPE_KEY = "journal.anaScope";
  var scope = "today";
  try { scope = localStorage.getItem(SCOPE_KEY) || "today"; } catch (e) {}

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  /* 今天的记录优先（多篇取最近改动那篇），今天没记就退回当前选中的那一篇 */
  function pickOne(all) {
    var t = todayStr();
    var todays = all.filter(function (x) { return x.date === t && x.rows.length; });
    if (todays.length) {
      todays.sort(function (a, b) { return (b.rec.t || 0) - (a.rec.t || 0); });
      return todays[0];
    }
    var c = N.cur();
    for (var i = 0; i < all.length; i++) {
      if (all[i].date === c.date && all[i].year === c.year && all[i].sec === c.sec) return all[i];
    }
    var todayAny = all.filter(function (x) { return x.date === t; });
    return todayAny[0] || all[0] || null;
  }

  function card(t, v, unit, f, cls) {
    return '<div class="card"><div class="t">' + t + '</div><div class="v ' + (cls || "") + '">' +
      v + (unit ? "<small>" + unit + "</small>" : "") + "</div>" +
      (f ? '<div class="f">' + f + "</div>" : "") + "</div>";
  }

  /* ── 指标卡 ── */
  function renderCards(all, allRows, st) {
    var box = $("anaCards");
    if (!st) { box.innerHTML = ""; return; }
    var used = all.filter(function (x) { return x.rec.usedMin > 0; });
    var avgUsed = used.length ? used.reduce(function (a, x) { return a + x.rec.usedMin; }, 0) / used.length : 0;
    var gap = (st.weighted - st.expected) * 100;
    box.innerHTML =
      card("已记录", all.length, "篇", allRows.length + " 题已填") +
      card("答对率", pct(st.rate), "", st.ok + "/" + st.n) +
      card("难度加权得分率", pct(st.weighted), "", "难题做对更值钱", st.weighted >= .6 ? "up" : "down") +
      card("期望得分率", pct(st.expected), "", "按逐题系数折算") +
      card("超常/失常", (gap >= 0 ? "+" : "") + gap.toFixed(1), "pt",
           gap >= 0 ? "高于系数预期" : "低于系数预期", gap >= 0 ? "up" : "down") +
      card("平均每篇用时", avgUsed ? avgUsed.toFixed(0) : "—", avgUsed ? "分" : "", used.length + " 篇有计时");
  }

  /* ── 错题池：按系数降序（送分题错最亏） ── */
  function renderWrong(allRows) {
    var wrong = allRows.filter(function (r) { return !r.ok; });
    var box = $("anaWrong");
    if (!wrong.length) {
      box.innerHTML = allRows.length
        ? '<div class="empty">已填的 ' + allRows.length + " 题全对。等有错题，这里会按「送分题优先」排队。</div>"
        : '<div class="empty">还没有可分析的记录：先在「记录」里把某一篇的选项填上。</div>';
      return;
    }
    wrong.sort(function (a, b) { return b.p - a.p; });
    box.innerHTML = wrong.map(function (r, i) {
      var tag = r.p >= .65 ? "送分题" : r.p >= .50 ? "中档题" : r.p >= .38 ? "偏难题" : "难题";
      var opts = '<option value="">选错因…</option>' + N.CAUSES.map(function (c) {
        return '<option value="' + c.k + '"' + (r.cause === c.k ? " selected" : "") + ">" + c.n + "</option>";
      }).join("");
      return '<div class="wq" data-i="' + i + '">' +
        '<div class="wq-hd">' +
        '<span class="wq-id">' + r.date.slice(5) + " · " + r.year + " " + esc(r.secLabel) + " · 第 " + r.n + " 题</span>" +
        '<span class="q-band b-' + bandCls(r.band) + '">' + r.band + " " + fn2(r.p) + " · " + tag + "</span>" +
        '<span class="q-t">' + esc(r.tcn) + "</span></div>" +
        (r.stem ? '<p class="wq-stem">' + esc(r.stem) + "</p>" : "") +
        '<div class="wq-ans"><span>我选 <b class="bad">' + esc(r.mine) + "</b></span>" +
        "<span>正确 <b class=\"ok\">" + esc(r.std) + "</b></span>" +
        '<select class="wq-sel" data-i="' + i + '">' + opts + "</select></div>" +
        (r.cause && N.ACTIONS[r.cause] ? '<div class="wq-tip"><b>下一步：</b>' + esc(N.ACTIONS[r.cause]) + "</div>" : "") +
        "</div>";
    }).join("");
    box._wrong = wrong;
  }

  /* ── 按篇 ── */
  function renderSecs(all) {
    var box = $("anaSecs");
    var rows = all.filter(function (x) { return x.rows.length; });
    if (!rows.length) { box.innerHTML = '<div class="empty">暂无</div>'; return; }
    var h = '<div class="row head"><span>篇</span><span class="num">系数</span><span class="num">我的</span>' +
      '<span class="num hide-s">期望</span><span class="num hide-s">偏差</span><span class="num hide-s">用时</span><span></span></div>';
    rows.forEach(function (x) {
      var st = statOf(x.rows);
      var gap = (st.weighted - st.expected) * 100;
      var cls = gap >= 3 ? "g" : gap <= -3 ? "r" : "o";
      h += '<div class="row">' +
        '<span class="nm">' + x.year + " " + esc(x.s.label) + "</span>" +
        '<span class="num">' + fn2(x.ds.p || 0) + "</span>" +
        '<span class="num">' + st.ok + "/" + st.n + "</span>" +
        '<span class="num hide-s mut">' + pct(st.expected) + "</span>" +
        '<span class="num hide-s ' + (gap >= 0 ? "" : "mut") + '">' + (gap >= 0 ? "+" : "") + gap.toFixed(0) + "</span>" +
        '<span class="num hide-s mut">' + (x.rec.usedMin || "—") + "</span>" +
        '<span class="pie"><i class="' + cls + '" style="width:' + Math.round(st.weighted * 100) + '%"></i></span>' +
        "</div>";
    });
    box.innerHTML = h;
  }

  /* ── 用时 ── */
  function renderTime(all) {
    var box = $("anaTime");
    var g = {};
    all.forEach(function (x) {
      if (!x.rec.usedMin || !x.rows.length) return;
      var p = x.s.part;
      (g[p] || (g[p] = [])).push(x.rec.usedMin);
    });
    var keys = Object.keys(g);
    if (!keys.length) { box.innerHTML = '<div class="empty">填了「本篇用时」才有统计</div>'; return; }
    var max = 1;
    keys.forEach(function (k) { var a = g[k].reduce(function (s, v) { return s + v; }, 0) / g[k].length; if (a > max) max = a; });
    box.innerHTML = keys.map(function (k) {
      var arr = g[k], avg = arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
      var lim = N.LIMIT[k] || 18, over = avg > lim;
      return '<div class="trow"><span>' + (N.PART_CN[k] || k) + " ×" + arr.length + "</span>" +
        '<span class="tb"><i class="' + (over ? "over" : "") + '" style="width:' + Math.round(avg / max * 100) + '%"></i>' +
        '<u style="left:' + Math.round(lim / max * 100) + '%"></u></span>' +
        '<span class="tv">' + avg.toFixed(0) + " 分 / 限 " + lim + "</span></div>";
    }).join("") + '<div class="footnote" style="margin-top:8px">竖线＝限时；超过限时的平均用时标红</div>';
  }

  /* ── 错因 ── */
  function renderCause(rows, boxId) {
    var box = $(boxId || "anaCause");
    if (!box) return;
    var cnt = {}, total = 0;
    rows.forEach(function (r) {
      if (r.ok || !r.cause) return;
      cnt[r.cause] = (cnt[r.cause] || 0) + 1;
      total++;
    });
    var ks = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    if (!ks.length) {
      box.innerHTML = '<div class="empty">' + (boxId === "oneCause"
        ? "这篇的错题还没归因。上面「逐题对照」里，错的题下面选一个原因。"
        : "错题还没归因。上面「该优先补的题」每条右侧选一个原因。") + "</div>";
      return;
    }
    var max = cnt[ks[0]];
    box.innerHTML = '<div class="cause">' + ks.map(function (k) {
      var c = N.CAUSE_MAP[k] || { n: k };
      return '<div class="crow"><span>' + esc(c.n) + '</span><span class="cb"><i style="width:' +
        Math.round(cnt[k] / max * 100) + '%"></i></span><span class="cv">' + cnt[k] + "</span></div>" +
        (N.ACTIONS[k] ? '<div class="wq-tip" style="margin:-3px 0 6px 121px">' + esc(N.ACTIONS[k]) + "</div>" : "");
    }).join("") + "</div>";
  }

  /* ── 趋势 ── */
  function renderTrend(all) {
    var box = $("anaTrend");
    var byDay = {};
    all.forEach(function (x) {
      var st = statOf(x.rows);
      if (!st) return;
      var d = byDay[x.date] || (byDay[x.date] = { w: 0, n: 0 });
      d.w += st.weighted * st.n;
      d.n += st.n;
    });
    var ds = Object.keys(byDay).sort();
    if (!ds.length) { box.innerHTML = '<div class="empty">暂无</div>'; return; }
    box.innerHTML = ds.map(function (d) {
      var v = byDay[d].w / byDay[d].n;
      return '<div class="bar"><i style="height:' + Math.max(3, Math.round(v * 92)) + '%" title="' +
        pct(v) + '"></i><span>' + d.slice(5) + "</span></div>";
    }).join("");
  }

  /* ══════ 层级一：今日这一篇 ══════ */
  function causeSelect(r) {
    var opts = '<option value="">选错因…</option>' + N.CAUSES.map(function (c) {
      return '<option value="' + c.k + '"' + (r.cause === c.k ? " selected" : "") + ">" + c.n + "</option>";
    }).join("");
    return '<select class="wq-sel" data-date="' + r.date + '" data-key="' + esc(r.key) +
      '" data-n="' + r.n + '">' + opts + "</select>";
  }

  function renderOneCards(x, st) {
    var total = x.s.items.length, filled = x.rows.length;
    var lim = N.LIMIT[x.s.part] || 18, used = x.rec.usedMin;
    var gap = (st.weighted - st.expected) * 100;
    return '<div class="cards">' +
      card("本篇答对", st.ok + "/" + st.n, "", "答对率 " + pct(st.rate)) +
      card("难度加权得分率", pct(st.weighted), "", "难题做对更值钱", st.weighted >= .6 ? "up" : "down") +
      card("系数期望", pct(st.expected), "", "按逐题系数折算") +
      card("超常/失常", (gap >= 0 ? "+" : "") + gap.toFixed(1), "pt",
        gap >= 0 ? "高于系数预期" : "低于系数预期", gap >= 0 ? "up" : "down") +
      card("用时", used != null ? used : "—", used != null ? "分" : "",
        used == null ? "没填用时" : used > lim ? "超限时 " + (used - lim) + " 分" : "限时 " + lim + " 分内",
        used != null && used > lim ? "down" : "") +
      card("完成度", filled + "/" + total, "题",
        filled < total ? "还有 " + (total - filled) + " 题没填" : "已填满") +
      "</div>";
  }

  function renderOneQs(x) {
    var byN = {};
    x.rows.forEach(function (r) { byN[r.n] = r; });
    var h = '<div class="oqlist"><div class="oq head"><span>题</span><span>题型</span>' +
      '<span class="num">系数</span><span class="num">我选</span><span class="num">正确</span>' +
      '<span class="num">判</span></div>';
    x.s.items.forEach(function (it) {
      var r = byN[it.n];
      var d = N.diffOf(x.year, x.sec, it.n) || { p: .5, band: "中", tcn: "未分类" };
      h += '<div class="oq ' + (r ? (r.ok ? "ok" : "no") : "skip") + '">' +
        '<span class="oq-n">' + it.n + "</span>" +
        '<span class="oq-t">' + esc(d.tcn || "") + "</span>" +
        '<span class="oq-p num">' + d.band + " " + fn2(d.p) + "</span>" +
        '<span class="oq-a num">' + (r ? esc(r.mine) : "—") + "</span>" +
        '<span class="oq-s num">' + (r ? esc(r.std) : "—") + "</span>" +
        '<span class="oq-r num">' + (r ? (r.ok ? "✓" : "✗") : "") + "</span></div>";
      if (r && !r.ok) {
        h += '<div class="oq-cause">' + causeSelect(r) +
          (r.cause && N.ACTIONS[r.cause] ? '<span class="wq-tip" style="margin:0"><b>下一步：</b>' +
            esc(N.ACTIONS[r.cause]) + "</span>" : "") + "</div>";
        /* 理解复盘：写在题目正下方，紧贴这道题 */
        if (window.JOURNAL_WHY) h += window.JOURNAL_WHY.item(r);
      }
    });
    return h + "</div>";
  }

  function renderVs(x, st, all, stAll) {
    var gap = (st.weighted - st.expected) * 100;
    var mine = all.filter(function (o) { return o.rows.length; });
    var d2 = stAll ? (st.weighted - stAll.weighted) * 100 : null;
    var rank = 0;
    mine.forEach(function (o) {
      var s2 = statOf(o.rows);
      if (s2 && s2.weighted > st.weighted) rank++;
    });
    var easy = x.rows.filter(function (r) { return r.p >= .65; });
    var easyBad = easy.filter(function (r) { return !r.ok; }).length;
    var hard = x.rows.filter(function (r) { return r.p < .38; });
    var hardOk = hard.filter(function (r) { return r.ok; }).length;

    function row(k, v, cls) {
      return '<div class="vsrow"><span class="k">' + k + '</span><span class="v ' + (cls || "") + '">' + v + "</span></div>";
    }
    var h = '<div class="vs">' +
      row("vs 系数预期", (gap >= 0 ? "+" : "") + gap.toFixed(1) + "pt", gap >= 0 ? "up" : "down") +
      (d2 != null ? row("vs 我的累计平均（" + pct(stAll.weighted) + "）",
        (d2 >= 0 ? "+" : "") + d2.toFixed(1) + "pt", d2 >= 0 ? "up" : "down") : "") +
      row("在已记录的 " + mine.length + " 篇里", "第 " + (rank + 1) + " 高") +
      row("送分题（系数≥0.65）", easy.length + " 题，错 " + easyBad, easyBad ? "down" : "up") +
      row("难题（系数<0.38）", hard.length + " 题，做对 " + hardOk,
        hard.length && hardOk === hard.length ? "up" : "") +
      '<div class="note">' + (
        gap >= 3 ? "这篇整体高于系数预期：难题也敢下手，继续保持。" :
        gap <= -3 ? "低于系数预期：先看上面标 ✗ 里系数≥0.5 的题，那是不该丢的分。" :
        "与系数预期基本吻合：这篇难度和你现在的水平是对齐的。"
      ) + (d2 != null && d2 >= 3 ? " 也高于你自己的平均，是这段时间里最好的一篇。" :
           d2 != null && d2 <= -3 ? " 明显低于你自己的平均，回看当时是不是走神或时间不够。" : "") +
      "</div></div>";
    return h;
  }

  function renderOne(x, all, stAll) {
    var box = $("anaOne"), who = $("anaWho");
    if (!who) return;
    if (!x) {
      who.textContent = "";
      box.innerHTML = '<div class="pane"><div class="empty">还没有任何记录：先去「记录」把今天那一篇的选项填上，这里就出单篇复盘。</div></div>';
      return;
    }
    var total = x.s.items.length;
    var tbtn = $("anaScope") && $("anaScope").querySelector('button[data-scope="today"]');
    if (tbtn) tbtn.textContent = x.date === todayStr() ? "今日这一篇" : "最近这一篇";
    who.innerHTML = "<b>" + x.date.slice(5) + " · " + x.year + " " + esc(x.s.label) + "</b> · 已填 " +
      x.rows.length + "/" + total;
    if (!x.rows.length) {
      box.innerHTML = '<div class="pane"><div class="pane-hd"><b>' + x.year + " " + esc(x.s.label) +
        '</b><span class="sub">' + x.date + " · 共 " + total + " 题</span></div>" +
        '<div class="empty">这一篇还没填答案。录完点「保存本篇」，这里就会出逐题对照和错因。</div></div>';
      return;
    }
    var st = statOf(x.rows);
    box.innerHTML = renderOneCards(x, st) +
      '<div class="pane"><div class="pane-hd"><b>逐题对照</b>' +
      '<span class="sub">系数＝该题全体考生平均得分率；错题可直接选错因</span></div>' +
      renderOneQs(x) + "</div>" +
      '<div class="grid2">' +
      '<div class="pane"><div class="pane-hd"><b>本篇错因</b><span class="sub">选了原因的错题</span></div>' +
      '<div id="oneCause"></div></div>' +
      '<div class="pane"><div class="pane-hd"><b>和自己比</b><span class="sub">本篇 vs 系数 vs 你的累计</span></div>' +
      renderVs(x, st, all, stAll) + "</div></div>";
    renderCause(x.rows, "oneCause");
  }

  function applyScope() {
    var tabs = $("anaScope");
    if (tabs) {
      tabs.querySelectorAll("button[data-scope]").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-scope") === scope);
      });
    }
    if ($("anaOne")) $("anaOne").hidden = scope !== "today";
    if ($("anaAll")) $("anaAll").hidden = scope !== "all";
  }

  /* ── 口径说明 ── */
  function renderMethod() {
    var D = N.DIFF;
    var o = D.official || {};
    $("anaMethod").innerHTML =
      "<p>逐题系数 <code>p</code>＝该题全体考生的平均得分率（0–1，越大越易）。分档：≥0.65 易、0.50–0.65 中、0.38–0.50 偏难、&lt;0.38 难。</p>" +
      "<p>官方（教育部教育考试院《考试分析》）只公布到题型层级，参考区间：全卷 " +
      (o["全卷"] ? o["全卷"].join("–") : "0.48–0.56") + "，阅读 A " +
      (o["阅读A"] ? o["阅读A"].join("–") : "0.50–0.56") + "，完型 " +
      (o["完型"] ? o["完型"].join("–") : "0.42–0.52") + "。逐题值不公开，所以本页逐题系数由四因子模型给出：" +
      "<code>题型先验 + 年份修正 + 定位锚点强度 + 否定/选项长度</code>，标注为「模型值」。</p>" +
      "<p>拿到黄皮书/考研真相公布的逐题正确率后，写进 <code>data/diff_overrides.json</code>，重跑 " +
      "<code>python3 tools/build_diff.py</code>，该题会变成「官方/实测」。</p>" +
      "<p>「难度加权得分率」= Σ(系数 × 对错) / Σ系数，做对难题比做对易题得分更高；「期望得分率」= 已填题系数均值，两者差值就是你相对全体考生的超常/失常。</p>";
  }

  function refresh() {
    var all = collect();
    var allRows = [];
    all.forEach(function (x) { x.rows.forEach(function (r) { allRows.push(r); }); });
    var st = statOf(allRows);

    /* 总览 */
    renderCards(all, allRows, st);
    renderWrong(allRows);
    renderSecs(all);
    renderTime(all);
    renderCause(allRows, "anaCause");
    if (window.JOURNAL_WHY) {
      window.JOURNAL_WHY.renderStats(allRows);
      window.JOURNAL_WHY.renderArchive(allRows);
    }
    renderTrend(all);
    renderMethod();

    /* 今日这一篇 */
    renderOne(pickOne(all), all, st);
    applyScope();
  }

  function init() {
    if (window.JOURNAL_WHY) window.JOURNAL_WHY.bind($("vAna"));
    var tabs = $("viewTabs");
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]");
      if (!b) return;
      var v = b.getAttribute("data-v");
      tabs.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("vEntry").hidden = v !== "entry";
      $("vAna").hidden = v !== "ana";
      if (v === "ana") refresh();
      location.hash = v === "ana" ? "ana" : "";
    });

    /* 记录页改动后，若正停在分析页就跟着刷新（合并连点） */
    var pending = 0;
    document.addEventListener("journal:render", function () {
      if ($("vAna").hidden) return;
      clearTimeout(pending);
      pending = setTimeout(refresh, 40);
    });

    /* 层级切换：今日这一篇 / 累计总览 */
    var sc = $("anaScope");
    if (sc) {
      sc.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-scope]");
        if (!b) return;
        scope = b.getAttribute("data-scope");
        try { localStorage.setItem(SCOPE_KEY, scope); } catch (err) {}
        applyScope();
      });
    }

    /* 单篇：错题归因 */
    var oneBox = $("anaOne");
    if (oneBox) {
      oneBox.addEventListener("change", function (e) {
        var sel = e.target.closest("select.wq-sel[data-n]");
        if (!sel) return;
        var J = N.J();
        var rec = J.days[sel.getAttribute("data-date")] &&
          J.days[sel.getAttribute("data-date")][sel.getAttribute("data-key")];
        if (!rec) return;
        if (!rec.causes) rec.causes = {};
        var n = sel.getAttribute("data-n");
        if (sel.value) rec.causes[n] = sel.value;
        else delete rec.causes[n];
        N.touch(rec);
        N.commit();
        refresh();
      });
    }

    /* 错因选择 */
    $("anaWrong").addEventListener("change", function (e) {
      var sel = e.target.closest("select[data-i]");
      if (!sel) return;
      var wrong = this._wrong || [];
      var r = wrong[+sel.getAttribute("data-i")];
      if (!r) return;
      var J = N.J();
      var rec = J.days[r.date] && J.days[r.date][r.key];
      if (!rec) return;
      if (!rec.causes) rec.causes = {};
      if (sel.value) rec.causes[r.n] = sel.value;
      else delete rec.causes[r.n];
      N.touch(rec);
      N.commit();
      refresh();
    });

    if (location.hash === "#ana") {
      tabs.querySelectorAll("button").forEach(function (x) {
        x.classList.toggle("on", x.getAttribute("data-v") === "ana");
      });
      $("vEntry").hidden = true;
      $("vAna").hidden = false;
      refresh();
    }
  }

  window.JOURNAL_ANA = { init: init, refresh: refresh, collect: collect, statOf: statOf };
})();
