/* 英语刷题记录本 ↔ 刷题站（index.html）双向同步
   两边共用服务端两份落盘文件，记录本一提交，服务端就会把作答并进主站进度：
     data/journal.json   记录本（按日期 × 年 × 篇，只记「我选了哪个」）
     data/progress.json  主站快照（ky:ans:<年> / ky:time:<年> / ky:syncat）
   所以换设备、换地址（127.0.0.1 / xxx.local / 手机主屏幕图标）都能互通，
   不再依赖两边 localStorage 同源。页面上每 12 秒轮询 /__rev，有变化就自动对齐。
*/
(function () {
  "use strict";
  var N = window.JOURNAL;
  if (!N) return;

  var AP = "ky:ans:", TP = "ky:time:", AT = "ky:ansat:", META = "ky:syncat";
  var RECENT = 7 * 864e5;          /* 自动拉取只看最近 7 天的计时 */
  var POLL = 12e3;                 /* 轮询间隔 */
  var busy = null;                 /* 正在同步时不重复发起 */

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dstr(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function jget(k) { try { var v = lsGet(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function lsKeys(pre) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(pre) === 0) out.push(k);
      }
    } catch (e) {}
    return out;
  }
  function jstr(v) { try { return JSON.stringify(v); } catch (e) { return "{}"; } }

  /* 后端路由：电脑上走本地服务，手机上（GitHub Pages）走云仓库，接口一一对应 */
  function BK() { return window.BACK || null; }
  function getJSON(url) {
    var b = BK();
    if (b) {
      if (url === "/__progress") return b.progressGet();
      if (url === "/__journal") return b.journalGet();
      if (url === "/__rev") return b.rev();
    }
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw 0;
      return r.json();
    });
  }
  function postJSON(url, body) {
    var b = BK();
    if (b && url === "/__progress") return b.progressPost(body);
    if (b && url === "/__journal") return b.journalPost(body);
    return fetch(url, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  }
  function isCloud() { var b = BK(); return !!(b && b.mode === "cloud"); }

  /* ── 找这一篇已有的记录（不管记在哪一天），没有才按日期新建 ── */
  function findRec(year, sec) {
    var J = N.J(), best = null, bestT = -1;
    Object.keys(J.days).forEach(function (date) {
      var r = J.days[date][year + "|" + sec];
      if (r && (r.t || 0) > bestT) { bestT = r.t || 0; best = r; }
    });
    return best;
  }

  /* ── 主站 → 记录本 ──
     mode = "recent"：只认最近 7 天有计时的篇（自动同步用）
     mode = "all"   ：全都拉（手动按钮用） */
  function pull(mode, prog) {
    var apply = function (snap) {
      var date0 = N.cur().date;
      var added = 0, secs = 0, names = [], years = {};

      Object.keys(snap || {}).forEach(function (k) {
        if (k.indexOf(AP) === 0) years[k.slice(AP.length)] = 1;
      });

      Object.keys(years).sort(function (a, b) { return b - a; }).forEach(function (y) {
        var ans = typeof snap[AP + y] === "string" ? jget(AP + y) : (snap[AP + y] || {});
        var times = typeof snap[TP + y] === "string" ? jget(TP + y) : (snap[TP + y] || {});
        var atmap = typeof snap[AT + y] === "string" ? jget(AT + y) : (snap[AT + y] || {});
        ans = ans || {}; times = times || {}; atmap = atmap || {};

        N.secKeysOf(y).forEach(function (sec) {
          var s = N.paperSec(y, sec);
          if (!s) return;
          var picked = {}, cnt = 0;
          s.items.forEach(function (it) {
            var a = ans[it.n];
            if (a) { picked[it.n] = String(a).toUpperCase(); cnt++; }
          });
          if (!cnt) return;

          var t = times[sec] || {};
          var date = date0;
          if (t.t0) {
            date = dstr(t.t0);
            if (mode === "recent" && Date.now() - t.t0 > RECENT) return;
          } else if (mode === "recent") {
            return;                      /* 没计时又走自动同步：不硬塞历史 */
          }

          var rec = findRec(y, sec);
          var add = 0;
          if (!rec) {
            rec = N.ensureRec(date, y, sec);
          }
          s.items.forEach(function (it) {
            var a = picked[it.n];
            if (!a) return;
            var has = rec.ans[it.n];
            if (has === a) return;
            if (!has) { rec.ans[it.n] = a; add++; return; }
            /* 两边都记了但不一样：主站那题写得更晚才改过来 */
            if ((atmap[it.n] || 0) > (rec.t || 0)) { rec.ans[it.n] = a; add++; }
          });
          if (!add) return;

          if (t.t0 && t.t1 && rec.usedMin == null) {
            var m = Math.round((t.t1 - t.t0) / 60000);
            if (m > 0 && m <= 240) rec.usedMin = m;
          }
          N.touch(rec);
          added += add; secs++;
          if (names.length < 3) names.push(y + " " + s.label);
        });
      });

      if (added) { N.commit(); N.renderEntry(); }
      return { n: added, secs: secs, names: names };
    };

    /* 题库按年懒加载：先把快照里涉及的年份取回来，否则 paperSec 是空的、会漏同步 */
    function ensureYearsOf(snap) {
      var ys = [];
      Object.keys(snap || {}).forEach(function (k) {
        if (k.indexOf(AP) === 0) ys.push(k.slice(AP.length));
      });
      if (!ys.length) return Promise.resolve();
      if (N.ensureYear) return Promise.all(ys.map(function (y) { return N.ensureYear(y); }));
      return Promise.resolve();
    }

    if (prog) return ensureYearsOf(prog).then(function () { return apply(prog); });
    return getJSON("/__progress").then(function (snap) {
      return ensureYearsOf(snap).then(function () { return apply(snap); });
    });
  }

  /* ── 记录本 → 主站 ──
     逐题并入（记录本优先，主站那题写得更晚则让主站），再整包回写一次，
     保证同一浏览器里的主站标签页、以及别的设备都能马上看到。 */
  function push() {
    return getJSON("/__progress").then(function (snap) {
      var prog = snap || {};
      var J = N.J(), meta = {}, touched = {}, total = 0;

      Object.keys(prog).forEach(function (k) {
        if (k.indexOf(META) === 0) meta = prog[k] || {};
      });
      if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }

      Object.keys(J.days).forEach(function (date) {
        Object.keys(J.days[date]).forEach(function (key) {
          var p = key.split("|"), y = p[0], sec = p[1];
          var s = N.paperSec(y, sec);
          if (!s) return;
          var rec = J.days[date][key];
          var ans = typeof prog[AP + y] === "string" ? jget(AP + y) : (prog[AP + y] || {});
          ans = ans || {};
          var ch = 0;
          s.items.forEach(function (it) {
            var m = (rec.ans || {})[it.n];
            if (!m) return;
            var mk = y + "|" + it.n;
            if (ans[it.n] === m) return;
            if ((meta[mk] || 0) > (rec.t || 0)) return;   /* 主站后来改过 */
            ans[it.n] = m;
            meta[mk] = rec.t || Date.now();
            ch++;
          });
          if (ch) {
            prog[AP + y] = jstr(ans);
            touched[y] = (touched[y] || 0) + ch;
            total += ch;
          }
          /* 用时随手补成 ky:time，主站计时条也能显示 */
          if (rec.usedMin && (rec.t || 0)) {
            var tk = TP + y;
            var tm = typeof prog[tk] === "string" ? jget(tk) : (prog[tk] || {});
            tm = tm || {};
            if (!(tm[sec] || {}).t0) {
              tm[sec] = { t0: rec.t - rec.usedMin * 60000, t1: rec.t };
              prog[tk] = jstr(tm);
              total++;
            }
          }
        });
      });

      if (!total) return { n: 0, years: [] };
      prog[META] = jstr(meta);

      /* 本地也补齐，同源的主站标签页能立刻读到 */
      Object.keys(touched).forEach(function (y) {
        lsSet(AP + y, prog[AP + y]);
        if (prog[TP + y]) lsSet(TP + y, prog[TP + y]);
      });
      lsSet(META, prog[META]);

      return pushSnapshot(prog).then(function () {
        return { n: total, years: Object.keys(touched) };
      });
    }).catch(function () { return { n: 0, years: [] }; });
  }

  /* 主站进度快照整包回写（合并过服务端，不会把别的设备的记录抹掉） */
  function pushSnapshot(prog) {
    var o = {};
    if (prog) {
      Object.keys(prog).forEach(function (k) { o[k] = prog[k]; });
    }
    lsKeys("ky:").forEach(function (k) {
      if (o[k] == null) o[k] = lsGet(k);
    });
    return postJSON("/__progress", o).catch(function () {});
  }

  function note(txt) {
    var el = document.getElementById("syncNote");
    if (el) el.textContent = txt;
  }
  function stamp() { return new Date().toLocaleTimeString().slice(0, 5); }

  /* 浏览器清过缓存时，先把服务端的进度快照补回本地（只补缺，不覆盖本地更新的） */
  function hydrateFromCloud() {
    return getJSON("/__progress").then(function (o) {
      var n = 0;
      Object.keys(o || {}).forEach(function (k) {
        if (k.indexOf("ky:") !== 0 || lsGet(k) != null) return;
        if (typeof o[k] !== "string") return;
        if (lsSet(k, o[k])) n++;
      });
      return n;
    }).catch(function () { return 0; });
  }

  /* 别的设备改了记录本：把服务端那份并进来（同一条记录按 t 取新的） */
  function reloadJournal() {
    return getJSON("/__journal").then(function (srv) {
      if (!srv || !srv.days) return 0;
      var J = N.J(), n = 0;
      Object.keys(srv.days).forEach(function (date) {
        var a = J.days[date] || (J.days[date] = {});
        var b = srv.days[date];
        Object.keys(b).forEach(function (k) {
          if (!a[k] || (b[k].t || 0) > (a[k].t || 0)) { a[k] = b[k]; n++; }
        });
      });
      if (n) {
        /* 本地也写一份，刷新页面不丢 */
        try { localStorage.setItem(N.LS_KEY || "kb:journal:v1", JSON.stringify(J)); } catch (e) {}
        N.renderEntry();
      }
      return n;
    }).catch(function () { return 0; });
  }

  /* ── 轮询：谁变了就同步谁 ── */
  var rev = { p: 0, j: 0 };
  function syncOnce(force) {
    if (busy) return busy;
    busy = getJSON("/__rev").then(function (r) {
      var pChanged = force || r.p !== rev.p;
      var jChanged = force || r.j !== rev.j;
      /* 先记下版本再干活：中途失败下一轮还能补 */
      rev.p = r.p; rev.j = r.j;
      var out = { n: 0, j: 0 };
      var chain = Promise.resolve();
      if (jChanged) {
        chain = chain.then(function () {
          return reloadJournal().then(function (n) { out.j = n; });
        });
      }
      if (pChanged) {
        chain = chain.then(function () {
          return pull("recent").then(function (x) { out.n = x.n; });
        });
      }
      return chain.then(function () { return out; });
    }).catch(function () { return null; });
    return busy.then(function (x) { busy = null; return x; },
                     function () { busy = null; return null; });
  }

  function init() {
    var pullBtn = document.getElementById("btnPull");
    var pushBtn = document.getElementById("btnPush");

    if (pullBtn) pullBtn.addEventListener("click", function () {
      hydrateFromCloud().then(function () {
        return pull("all");
      }).then(function (r) {
        N.toast(r.n ? "从刷题站拉入 " + r.n + " 题（" + r.secs + " 篇）" : "刷题站这边没有新的作答");
        note(r.n ? "上次同步 " + stamp() + " · 拉入 " + r.n + " 题" : "无需同步");
        if (r.n) N.markSync("已同步", "ok");
      });
    });

    if (pushBtn) pushBtn.addEventListener("click", function () {
      push().then(function (r) {
        N.toast(r.n ? "已推送 " + r.n + " 题到刷题站" : "记录本这边没有新作答");
        note(r.n ? "上次同步 " + stamp() + " · 推送 " + r.n + " 题" : "无需同步");
      });
    });

    /* 记录本一改就自动推给主站（服务端会合并，不用再点按钮） */
    var pushTimer = null;
    var skipAuto = false;
    document.addEventListener("journal:render", function () {
      if (skipAuto) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () {
        push().then(function (r) {
          if (r.n) note("已同步 " + r.n + " 题到刷题站 · " + stamp());
        });
      }, 900);
    });

    hydrateFromCloud().then(function (restored) {
      return pull("recent").then(function (r) {
        if (r.n) {
          N.toast("已从刷题站同步 " + r.n + " 题：" + r.names.join("、"));
          note("自动同步 " + r.n + " 题（最近 7 天）");
        } else if (restored) {
          note("已从服务端补回 " + restored + " 项主站记录");
        } else {
          note("主站作答会自动同步进来");
        }
      });
    }).then(function () {
      return getJSON("/__rev").then(function (r) { rev.p = r.p; rev.j = r.j; });
    }).catch(function () {}).then(function () {
      setInterval(function () { syncOnce(false); }, POLL);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") syncOnce(true);
      });
      window.addEventListener("focus", function () { syncOnce(true); });
    });

    window.JOURNAL_SYNC = {
      pull: pull, push: push, pushSnapshot: pushSnapshot,
      hydrate: hydrateFromCloud, reload: reloadJournal, syncOnce: syncOnce
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
