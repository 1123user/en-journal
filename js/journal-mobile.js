/* 手机端接入：把「同一 Wi-Fi 下的地址」直接摆出来，扫码或复制即开
   服务器 /__net 给局域网 IP，/__qr 给二维码 PNG（没有 qrcode 库时不显示码，只给地址） */
(function () {
  "use strict";

  /* 云端版（GitHub Pages）：不依赖电脑，也就没有「局域网地址 / 描述文件」这回事 */
  if (window.BACK && window.BACK.mode === "cloud") {
    var pb0 = document.getElementById("btnPhone");
    if (pb0) pb0.style.display = "none";
    var hs0 = document.getElementById("hsBox");
    if (hs0) hs0.style.display = "none";
    var back0 = document.querySelector('a.link[href="index.html"]');
    if (back0) back0.style.display = "none";
    return;
  }

  var btn = document.getElementById("btnPhone");
  var sheet = document.getElementById("phoneSheet");
  if (!btn || !sheet) return;

  var urlsEl = document.getElementById("urlList");
  var qrEl = document.getElementById("qrBox");
  var tipEl = document.getElementById("sheetTip");
  var isPhone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  /* 装到主屏幕：手机上给一键（描述文件），桌面上只给说明 */
  var hsBox = document.getElementById("hsBox");
  var hsHd = document.getElementById("hsHd");
  var hsTip = document.getElementById("hsTip");
  var btnWc = document.getElementById("btnWebclip");
  var btnWcLocal = document.getElementById("btnWebclipLocal");
  var hsWarn = document.getElementById("hsWarn");
  var hsMdns = document.getElementById("hsMdns");
  var hsTest = document.getElementById("hsTest");
  var ipsKey = "journal.lastIps";
  var installed = navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function copy(txt, el) {
    var done = function () {
      if (el) { var o = el.textContent; el.textContent = "已复制"; setTimeout(function () { el.textContent = o; }, 1200); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {
        if (window.JOURNAL && window.JOURNAL.toast) window.JOURNAL.toast("长按地址手动复制");
      }
      document.body.removeChild(ta);
    }
  }

  function render(o) {
    var port = o.port || location.port || 8123;
    var list = [];
    (o.ips || []).forEach(function (ip) {
      list.push({ u: "http://" + ip + ":" + port + "/journal.html", n: "IP 地址 · 最直接" });
    });
    if (o.host) list.push({ u: "http://" + o.host + ".local:" + port + "/journal.html", n: "Mac 名字 · IP 变了也能用" });

    if (!list.length) {
      urlsEl.innerHTML = '<p class="sheet-tip">没探测到局域网地址，确认电脑已连 Wi-Fi，或手动查「系统设置 → 网络 → IP 地址」。</p>';
      qrEl.innerHTML = "";
      return;
    }

    urlsEl.innerHTML = list.map(function (it, i) {
      return '<div class="urow"><span class="un">' + esc(it.n) + '</span>' +
             '<code class="uu">' + esc(it.u) + '</code>' +
             '<button class="btn ucopy" data-u="' + esc(it.u) + '">复制</button></div>';
    }).join("");
    Array.prototype.forEach.call(urlsEl.querySelectorAll(".ucopy"), function (b) {
      b.addEventListener("click", function () { copy(b.dataset.u, b); });
    });

    qrEl.innerHTML = '<img alt="扫码在手机上打开" src="/__qr?u=' + encodeURIComponent(list[0].u) + '">' +
                     '<span>手机相机 / 微信扫码直接打开</span>';
    var img = qrEl.querySelector("img");
    img.addEventListener("error", function () {
      qrEl.innerHTML = '<span class="sheet-tip">（二维码生成不可用，直接输地址即可）</span>';
    });

    if (tipEl) {
      tipEl.textContent = isLocal
        ? "iPhone：Safari 打开后点「分享 → 添加到主屏幕」，以后点图标全屏打开。"
        : "你已经在局域网里打开这个页面了，点 Safari 的「分享 → 添加到主屏幕」更顺手。";
    }

    if (hsMdns && o.mdns) hsMdns.textContent = o.mdns;
    checkDrift(o);
  }

  /* 电脑地址变了 → 手机上旧图标（地址写死）打开必然白屏，先把话说清楚 */
  function checkDrift(o) {
    if (!hsWarn || isPhone) return;
    var cur = (o.ips || []).slice().sort().join(",");
    if (!cur) return;
    var last = "";
    try { last = localStorage.getItem(ipsKey) || ""; } catch (e) {}
    try { localStorage.setItem(ipsKey, cur); } catch (e) {}
    if (!last || last === cur) return;
    var oldIp = last.split(",")[0], newIp = (o.ips || [])[0] || "?";
    hsWarn.innerHTML = "<b>电脑地址变了</b>（" + esc(oldIp) + " → " + esc(newIp) + "）。" +
      "手机桌面图标的地址是装的那一刻写死的，现在点开只会白屏：把旧图标长按删掉，" +
      "手机扫上面的码重新装一次就好（这次用 Mac 名字，以后换网络都不用管）。";
    hsWarn.hidden = false;
  }

  function open() {
    sheet.hidden = false;
    document.body.classList.add("sheet-on");

    if (isPhone) {                       /* 手机上不用扫码看地址，直接走安装 */
      urlsEl.innerHTML = "";
      qrEl.innerHTML = "";
      if (tipEl) tipEl.textContent = "";
      var h3 = sheet.querySelector("h3");
      if (h3) h3.textContent = installed ? "已经装到主屏幕了" : "装到手机主屏幕";
      var sp = sheet.querySelector(".sheet-p");
      if (sp) {
        sp.textContent = installed
          ? "你现在是从桌面图标打开的。想重装或换地址：先长按桌面图标删掉，再重新装一次。"
          : "装好后从桌面图标直接进，全屏、没有地址栏，和原生 App 一样。";
      }
      /* 主按钮固定用 Mac 名字（服务端默认 host=local）；名字不通时留个 IP 版后路 */
      if (btnWcLocal) {
        btnWcLocal.hidden = false;
        btnWcLocal.textContent = "名字打不开（没给「本地网络」权限）？用 IP 版装一个 —— 换个网络就失效";
        btnWcLocal.setAttribute("href", "/__webclip?host=ip");
      }
      fetch("/__net", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (o) {
          if (hsMdns && o && o.mdns) hsMdns.textContent = o.mdns;
          /* 没在用名字打开时，给个链接现场验证 mDNS 通不通 */
          if (hsTest && o && o.mdns && !/\.local$/i.test(location.hostname)) {
            hsTest.href = "http://" + o.mdns + ":" + (o.port || 8123) + "/journal.html";
            hsTest.hidden = false;
          }
          if (hsWarn && installed && /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)) {
            hsWarn.innerHTML = "<b>当前图标用的是 IP 地址</b>（" + esc(location.hostname) + "）。" +
              "换个 Wi-Fi、或改连手机热点，这个地址就没了，点开就是白屏。" +
              "现在用「Mac 名字」重装一个，以后换网都不用管。";
            hsWarn.hidden = false;
          }
        })
        .catch(function () {});
      return;
    }

    urlsEl.innerHTML = '<p class="sheet-tip">正在探测电脑地址…</p>';
    fetch("/__net", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(render)
      .catch(function () {
        urlsEl.innerHTML = '<p class="sheet-tip">读不到服务端地址（可能没走本地服务）。' +
          '电脑上查「系统设置 → 网络 → Wi-Fi → IP 地址」，手机访问 http://该IP:8123/journal.html</p>';
      });
  }

  function close() { sheet.hidden = true; document.body.classList.remove("sheet-on"); }

  btn.addEventListener("click", open);
  sheet.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-close") || e.target === sheet) close();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  /* 手机上：推送到主站只写本机 localStorage，没有意义，藏掉免得误解 */
  if (isPhone) {
    var pb = document.getElementById("btnPush");
    if (pb) pb.style.display = "none";
    var sb = document.querySelector(".syncbar .sb-t");
    if (sb) sb.innerHTML = "手机录入会立刻存到电脑（data/journal.json），电脑端打开自动合并；主站作答也会同步过来。";
  }

  /* 主屏幕入口：手机上一键装，桌面上只提示去哪点 */
  if (hsBox) {
    if (isPhone) {
      if (hsHd) hsHd.textContent = installed ? "重装到主屏幕" : "装到手机主屏幕";
      if (btnWc) btnWc.setAttribute("href", "/__webclip");
      if (installed && btnWc) btnWc.textContent = "重新下载描述文件";
    } else {
      if (hsHd) hsHd.textContent = "在手机上装到主屏幕";
      if (btnWc) btnWc.style.display = "none";
      if (btnWcLocal) btnWcLocal.style.display = "none";
      if (hsTip) {
        hsTip.textContent = "手机扫码打开上面的地址后，点页面右上角「加到主屏幕」，再点「一键装到主屏幕」。"
          + "图标地址用的是 Mac 名字，电脑换 Wi-Fi 或开热点都不用重装。";
      }
    }
  }
  if (installed) {
    btn.style.display = "none";
  } else if (isPhone) {
    btn.textContent = "加到主屏幕";
    btn.title = "把记录本装到手机主屏幕，点开全屏";
  }
})();
