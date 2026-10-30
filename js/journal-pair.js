/* 手机配对：把「公网版记录本 + 配对码」做成二维码 / 主屏描述文件
   手机上打开 GitHub Pages 版（https://1123user.github.io/en-journal/journal.html），
   不再走局域网，电脑关着也能同步。配对码含本机云端凭据，只落在手机本地。 */
(function () {
  "use strict";

  var btn = document.getElementById("btnPair");
  if (!btn) return;

  /* 云端版自己不需要这个入口 */
  if (window.BACK && window.BACK.mode === "cloud") { btn.style.display = "none"; return; }

  var sheet = document.getElementById("pairSheet");
  var qrBox = document.getElementById("pairQr");
  var urlBox = document.getElementById("pairUrl");
  var clip = document.getElementById("pairClip");
  var SITE = "https://1123user.github.io/en-journal/journal.html";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function open() {
    sheet.hidden = false;
    document.body.classList.add("sheet-on");
    qrBox.innerHTML = '<span class="sheet-tip">正在取配对码…</span>';
    urlBox.innerHTML = "";

    fetch("/__cloud", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (o) {
        if (!o.link) {
          qrBox.innerHTML = '<span class="sheet-tip">没有云端凭据（~/.en-journal/cloud.json），先跑一次 tools/serve.py。</span>';
          return;
        }
        var url = SITE + "#c=" + encodeURIComponent(o.link);
        qrBox.innerHTML = '<img alt="扫码配对" src="/__qr?u=' + encodeURIComponent(url) + '">' +
          '<span>手机相机扫一下：打开公网版并自动配对</span>';
        var img = qrBox.querySelector("img");
        img.addEventListener("error", function () {
          qrBox.innerHTML = '<span class="sheet-tip">二维码生成失败，改用下面的描述文件装。</span>';
        });
        urlBox.innerHTML = '<div class="urow"><span class="un">公网地址</span>' +
          '<code class="uu">' + esc(SITE) + '</code></div>';
        if (clip) {
          clip.href = "/__webclip?u=" + encodeURIComponent(url);
          clip.hidden = false;
        }
        var cp = document.getElementById("pairCopy");
        if (cp) {
          cp.hidden = false;
          cp.onclick = function () {
            var done = function () {
              cp.textContent = "已复制，去手机粘贴";
              setTimeout(function () { cp.textContent = "复制配对码（发给手机粘贴）"; }, 2000);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(o.link).then(done, function () {
                window.prompt("手动复制这串，发到手机：", o.link);
              });
            } else {
              window.prompt("手动复制这串，发到手机：", o.link);
            }
          };
        }
        if (o.msg) urlBox.innerHTML += '<p class="sheet-tip">云端同步：' + esc(o.msg) + "</p>";
      })
      .catch(function () {
        qrBox.innerHTML = '<span class="sheet-tip">读不到 /__cloud（服务端旧版本？重启一下 8123 服务）。</span>';
      });
  }

  function close() { sheet.hidden = true; document.body.classList.remove("sheet-on"); }

  btn.addEventListener("click", open);
  sheet.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-close") || e.target === sheet) close();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
})();
