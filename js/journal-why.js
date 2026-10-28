/* 英语记录本 · 理解复盘：错题写完「我的理解」→ 定位答案句 → 抽要素 → 逐项对照 → 累计成偏差画像
   不依赖在线模型：定位/切分/要素判定全在本地按规则算，结果可解释
   存 rec.mis[n] = {t:我的理解, g:偏差维度, s:答案句, at:时间} */
(function () {
  "use strict";
  var PAPERS = window.PAPERS || {};

  var LOGIC = [
    { re: /\b(however|nevertheless|nonetheless|but|yet|instead|rather than|on the contrary|in contrast|actually|in fact)\b/i, t: "转折/纠正", cn: /但是|然而|却|反而|不过|可是|相反|实际上|事实上/ },
    { re: /\b(because|since|as a result|therefore|thus|hence|so that|leads? to|results? in|owing to)\b/i, t: "因果/结果", cn: /因为|由于|所以|因此|于是|导致|造成|结果/ },
    { re: /\b(although|though|even if|even though|while|whereas|despite|in spite of)\b/i, t: "让步/对比", cn: /虽然|尽管|即使|哪怕|对比/ },
    { re: /\b(if|unless|provided that|as long as|otherwise)\b/i, t: "条件", cn: /如果|要是|除非|只要|否则/ },
    { re: /\b(also|moreover|furthermore|in addition|besides|what is more)\b/i, t: "递进/并列", cn: /而且|并且|同时|此外|更/ },
    { re: /\b(for example|for instance|such as|namely)\b/i, t: "举例", cn: /比如|例如|举例/ }
  ];
  var SCOPE = [
    { re: /\b(only|merely|solely|nothing but)\b/i, t: "唯一/仅仅", cn: /只|仅|唯一|只有|只不过/ },
    { re: /\b(all|every|entire|whole|always|never|none)\b/i, t: "全部/绝对", cn: /全部|所有|都|一律|从不|总是/ },
    { re: /\b(most|many|much|largely|mainly|primarily|chiefly|mostly|tend to)\b/i, t: "多数/倾向", cn: /大部分|大多数|多数|主要|往往|倾向/ },
    { re: /\b(some|several|few|little|partly|partially|almost|nearly|about|around)\b/i, t: "部分/约数", cn: /一些|部分|少数|几乎|大约|左右/ },
    { re: /\b(the most|the least|the first|the best|the worst)\b/i, t: "极值/排序", cn: /最|第一|首位/ }
  ];
  var ATTP = /\b(support\w*|approv\w*|favorab\w*|positive|optimis\w*|prais\w*|benefit\w*|promis\w*|valuable|encourag\w*|appreciat\w*)\b/i;
  var ATTN = /\b(critic\w*|doubt\w*|skeptic\w*|negative|pessimis\w*|worry|worried|concern\w*|warn\w*|threat\w*|risk\w*|harm\w*|cost\w*|fail\w*|problem\w*|blame|object\w*|oppos\w*|reject\w*)\b/i;
  var ATTM = /\b(ambivalen\w*|cautious|mixed|neutral|objective|balanced)\b/i;
  var ATT_CN = {
    p: /支持|赞同|肯定|认可|赞扬|正面|乐观|有益|有价值|看好|鼓励/,
    n: /反对|批评|质疑|怀疑|否定|负面|悲观|担忧|担心|警告|威胁|风险|有害|失败|问题|指责|拒绝/,
    m: /谨慎|矛盾|中立|客观|两面/
  };
  var REF = /\b(it|they|them|this|these|those|such|the former|the latter|which|its|their)\b/i;
  var REF_CN = /它|他们|她们|它们|这些|那些|这种|前者|后者|该|此|其/;

  var STOP = {};
  ("the a an of in on at to for from by with without about into over under between among during after before " +
    "that this these those it its their his her they them we you i he she is are was were be been being " +
    "do does did have has had will would can could may might must shall should not no nor so as than then " +
    "which who whom whose what when where why how all any both each few more most other some such only own " +
    "same too very just also there here if although though because while whereas however but and or paragraph")
    .split(" ").forEach(function (w) { STOP[w] = 1; });

  var GAPS = [
    { k: "logic", n: "逻辑关系漏读", d: "答案常落在 but/however/although 之后，漏掉转折就把主句当结论了。" },
    { k: "scope", n: "限定/范围忽略", d: "all / only / most / partly 决定选项能不能成立，读快了最容易丢。" },
    { k: "attitude", n: "态度读反或没读出", d: "先定正负再定强弱；评价形容词和引号里的反语都要标出来。" },
    { k: "subject", n: "主体错位", d: "谁做的、对谁做的，主语换了选项看着像其实主客颠倒。" },
    { k: "ref", n: "指代没理清", d: "it / they / this 指代哪一句，往前找最近且语义相容的名词。" },
    { k: "vocab", n: "词义/同义替换", d: "定位句看懂了但选项换了说法，替换词不认得等于没读懂。" },
    { k: "extra", n: "多读了一层", d: "答案句是中性的，你读出了原文没有的评价或范围——选项最爱利用这种「自行加戏」。" },
    { k: "option", n: "选项辨析", d: "两个都像时逐词比主体、范围、程度、时态。" },
    { k: "locate", n: "定位偏了", d: "先确认你讲的那句话真的是题干问的那句。" }
  ];
  var GAP_MAP = {};
  GAPS.forEach(function (g) { GAP_MAP[g.k] = g; });

  /* ══════ 概念维度：答案句带了哪几层意思 → 你在中文里说到没有 ══════
     en = 答案句里的信号词，zh = 你中文里对应的说法；g = 漏了归到哪类偏差 */
  var DIM = [
    { k: "contrast", n: "转折", g: "logic",
      en: /\b(however|nevertheless|nonetheless|but|yet|instead|rather than|on the contrary|in contrast|actually|in fact)\b/i,
      zh: /但是|然而|可是|不过|却|反而|相反|实际上|事实上|而是/,
      why: "转折后面才是作者真正的判断，只读前半句就会选成反面。" },
    { k: "concession", n: "让步", g: "logic",
      en: /\b(although|though|even if|even though|while|whereas|despite|in spite of|admittedly)\b/i,
      zh: /虽然|尽管|即使|哪怕|固然|虽说/,
      why: "让步句只是铺垫，主句才是结论。" },
    { k: "cause", n: "因果", g: "logic",
      en: /\b(because|since|as a result|therefore|thus|hence|so that|leads? to|results? in|owing to|due to|account for)\b/i,
      zh: /因为|由于|所以|因此|于是|导致|造成|结果|归因|源于/,
      why: "因果方向读反，选项的主体和对象就会颠倒。" },
    { k: "condition", n: "条件", g: "logic",
      en: /\b(if|unless|provided that|as long as|otherwise)\b/i,
      zh: /如果|要是|除非|只要|否则/,
      why: "条件句决定结论成立的前提，删掉它选项就绝对化了。" },
    { k: "example", n: "举例", g: "logic",
      en: /\b(for example|for instance|such as|namely)\b/i,
      zh: /比如|例如|举例|譬如/,
      why: "例子是为观点服务的，别把例子本身当观点。" },
    { k: "pos", n: "正面评价", g: "attitude",
      en: /\b(support\w*|approv\w*|favorab\w*|positive|optimis\w*|prais\w*|benefit\w*|promis\w*|valuable|encourag\w*|appreciat\w*|worth\w*|effective|helpful|necessary|essential|success\w*|improve\w*|strengthen|merit)\b/i,
      zh: /支持|赞同|肯定|认可|赞扬|正面|乐观|有益|有价值|看好|鼓励|值得|有效|必要|重要|成功|改善|加强|好处|优点|优势|可行/,
      why: "作者的态度决定选项的正负向。" },
    { k: "neg", n: "负面评价", g: "attitude",
      en: /\b(critic\w*|doubt\w*|skeptic\w*|negative|pessimis\w*|worry|worried|concern\w*|warn\w*|threat\w*|risk\w*|harm\w*|fail\w*|problem\w*|blame|object\w*|oppos\w*|reject\w*|questionable|weakness|drawback|flaw|exaggerat\w*|misleading|ineffective|unlikely)\b/i,
      zh: /批评|质疑|怀疑|否定|负面|悲观|担忧|担心|警告|威胁|风险|有害|失败|问题|指责|反对|拒绝|缺陷|弱点|夸大|言过其实|误导|无效|不现实/,
      why: "贬义词没读出来，就会把批评当成赞同。" },
    { k: "limit", n: "限定/仅仅", g: "scope",
      en: /\b(only|merely|solely|nothing but|rarely|seldom|hardly|few|little)\b/i,
      zh: /只|仅仅|唯一|只有|只不过|很少|几乎不|几乎没/,
      why: "only 这类限定决定选项能不能推得更远。" },
    { k: "all", n: "全部/绝对", g: "scope",
      en: /\b(all|every|entire|whole|always|never|none|completely|totally)\b/i,
      zh: /全部|所有|都|一律|从不|总是|完全|彻底|一概/,
      why: "绝对化表述最容易把范围放大。" },
    { k: "most", n: "多数/倾向", g: "scope",
      en: /\b(most|many|largely|mainly|primarily|chiefly|mostly|tend to)\b/i,
      zh: /大部分|大多数|多数|主要|往往|倾向/,
      why: "most 不等于 all，程度读错就出错。" },
    { k: "part", n: "部分/约数", g: "scope",
      en: /\b(some|several|partly|partially|almost|nearly|about|around)\b/i,
      zh: /一些|部分|少数|几乎|大约|左右/,
      why: "部分成立和全部成立，是两回事。" },
    { k: "up", n: "增加/上升", g: "scope",
      en: /\b(increas\w*|rise|rising|grow\w*|growth|climb\w*|expand\w*|expansion|surge|boost\w*|soar\w*)\b/i,
      zh: /增加|上升|提高|增长|扩大|攀升|加剧/,
      why: "涨还是跌，是这一类题的第一考点。" },
    { k: "down", n: "减少/下降", g: "scope",
      en: /\b(decreas\w*|declin\w*|fall|falling|drop\w*|reduc\w*|shrink\w*|diminish\w*|curb\w*|ease)\b/i,
      zh: /减少|下降|降低|缩小|缓解|削弱|萎缩/,
      why: "涨还是跌，是这一类题的第一考点。" }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function stem(w) {
    w = w.toLowerCase();
    if (w.length > 5 && /(ies|ied)$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(ing|ed|es|s)$/.test(w)) {
      if (/(ss|us|is)$/.test(w)) return w;
      return w.replace(/(ing|ed|es|s)$/, "");
    }
    return w;
  }
  function words(s) { return String(s || "").toLowerCase().match(/[a-z][a-z'’-]{2,}/g) || []; }
  function keys(s) {
    var out = [];
    words(s).forEach(function (w) {
      w = w.replace(/[’']s$/, "");
      if (w.length < 4 || STOP[w]) return;
      var st = stem(w);
      if (st.length < 3 || STOP[st]) return;
      if (out.indexOf(st) < 0) out.push(st);
    });
    return out;
  }

  /* 分段 + 断句（保留段号，供「Paragraph 2」类题干限定） */
  function splitSents(passage) {
    var out = [];
    String(passage || "").split(/\n+/).forEach(function (block, pi) {
      var b = trim(block);
      if (!b) return;
      /* 句末标点 + 空格 + 大写/引号 = 断句；先换成哨兵再 split，避免 split 捕获组错位 */
      var raw = b.replace(/([.!?])["”']?\s+(?=["“A-Z])/g, "$1\u0001").split("\u0001");
      var buf = "";
      raw.forEach(function (seg) {
        buf = trim(buf + " " + seg);
        /* 短碎片（缩写、数字、残句）并到下一句，别当成独立句 */
        if (buf.length < 28 || words(buf).length < 5) return;
        out.push({ t: buf, p: pi });
        buf = "";
      });
      if (buf.length > 0) {
        if (out.length && out[out.length - 1].p === pi) out[out.length - 1].t += " " + buf;
        else if (buf.length > 8) out.push({ t: buf, p: pi });
      }
    });
    return out;
  }

  function passageOf(year, sec) {
    var p = PAPERS[String(year)];
    if (!p) return "";
    if (String(sec).indexOf("text") === 0) {
      var no = parseInt(String(sec).slice(4), 10);
      var t = (p.texts || []).filter(function (x) { return x.no === no; })[0];
      return t ? t.passage : "";
    }
    if (sec === "cloze") return (p.cloze || {}).passage || "";
    if (sec === "partB") return (p.partB || {}).passage || "";
    return "";
  }

  function paraHint(stemStr) {
    var m = String(stemStr || "").match(/paragraph\s*(\d)|para\.?\s*(\d)|第\s*(\d)\s*段/i);
    if (m) return +(m[1] || m[2] || m[3]) - 1;
    var w = String(stemStr || "").toLowerCase().match(/the\s+(first|second|third|fourth)\s+paragraph/);
    if (w) return { first: 0, second: 1, third: 2, fourth: 3 }[w[1]];
    return null;
  }

  function optText(options, letter) {
    var i = "ABCDEFGH".indexOf(letter);
    return (i >= 0 && options && options[i]) ? options[i] : "";
  }

  /* 答案句定位：题干实词 + 正确选项实词，按句打分；相邻句也命中时一并算依据 */
  function locate(passage, stemStr, options, std) {
    var sents = splitSents(passage);
    if (!sents.length) return null;
    var qk = keys(stemStr), ok = keys(optText(options, std));
    var hint = paraHint(stemStr);
    function score(t) {
      var sw = words(t).map(stem), q = 0, o = 0;
      qk.forEach(function (k) { if (sw.some(function (w) { return w === k || w.indexOf(k) === 0; })) q++; });
      ok.forEach(function (k) { if (sw.some(function (w) { return w === k || w.indexOf(k) === 0; })) o++; });
      return { sc: q + 1.4 * o, q: q, o: o };
    }
    var pool = [];
    sents.forEach(function (s, i) { if (hint == null || s.p === hint) pool.push(i); });
    if (!pool.length) pool = sents.map(function (_, i) { return i; });
    var best = null;
    pool.forEach(function (i) {
      var sc = score(sents[i].t);
      if (!best || sc.sc > best.sc) best = { i: i, sc: sc.sc, q: sc.q, o: sc.o };
    });
    if (!best) return null;
    var more = [];
    [best.i - 1, best.i + 1].forEach(function (j) {
      if (j < 0 || j >= sents.length || sents[j].p !== sents[best.i].p) return;
      if (score(sents[j].t).sc >= Math.max(1.2, best.sc * 0.5)) more.push(sents[j].t);
    });
    return {
      text: sents[best.i].t, para: sents[best.i].p + 1, more: more,
      sc: best.sc, sure: (best.q >= 1 && best.o >= 1) || best.sc >= 3, hint: hint != null
    };
  }

  function subject(sent) {
    var s = trim(sent).replace(/^["“'']/, "");
    var m = s.match(/^(?:(?:In|On|At|For|By|With|After|Before|During|According to|As|Unlike)\b[^,]{0,60},\s*)?((?:The|A|An|This|These|Those|Its|Their|His|Her|Many|Most|Some|Such|It|They|He|She)\s+[a-z][^,.;:]{0,40}?)(?=\s+(?:is|are|was|were|has|have|had|does|do|did|can|could|will|would|may|might|must|should|says|said|argues|argued|finds|found|shows|showed|makes|made|leads|led|means|meant|suggests|suggested|tends|helps|became)\b)/i);
    if (m) return trim(m[1]);
    var m2 = s.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/);
    return m2 ? m2[1] : "";
  }

  function extract(sent) {
    var f = { logic: [], scope: [], att: "", ref: false, subj: "" };
    LOGIC.forEach(function (g) { if (g.re.test(sent)) f.logic.push(g.t); });
    SCOPE.forEach(function (g) { if (g.re.test(sent)) f.scope.push(g.t); });
    if (ATTP.test(sent)) f.att = "正";
    else if (ATTN.test(sent)) f.att = "负";
    else if (ATTM.test(sent)) f.att = "中";
    f.ref = REF.test(sent);
    f.subj = subject(sent);
    return f;
  }

  /* ══════ 本地英中词表（懒加载：第一次展开「理解复盘」才拉，平时不拖慢首页） ══════ */
  var DICT = null, DICT_LOADING = 0, DICT_WAIT = [];
  var GENERIC = /^(表示|进行|成为|使得|某种|一种|这个|那个|某个|事情|东西|方面|状态|情况|人们|某人|作为|处于|产生|发生|存在|包括|例如|经常|可能|能够|必须|应该|十分|非常|比较|有些|其他|之间|之后|之前|没有|不是)$/;

  function buildDict() {
    DICT = {};
    var zw = window.ZHWORDS || {};
    Object.keys(zw).forEach(function (k) { DICT[String(k).toLowerCase()] = zw[k]; });
    var vb = (window.VOCAB || {}).w || {};
    Object.keys(vb).forEach(function (k) {
      var v = vb[k];
      if (!DICT[k] && v && v[1]) DICT[String(k).toLowerCase()] = v[1];
    });
    return DICT;
  }
  function loadDict(cb) {
    if (DICT) { cb(); return; }
    DICT_WAIT.push(cb);
    if (DICT_LOADING) return;
    DICT_LOADING = 1;
    var left = 2, done = function () {
      if (--left > 0) return;
      buildDict();
      var q = DICT_WAIT;
      DICT_WAIT = [];
      q.forEach(function (f) { try { f(); } catch (e) {} });
    };
    ["data/zhwords.js", "data/vocab.js"].forEach(function (src) {
      var s = document.createElement("script");
      s.src = src; s.onload = done; s.onerror = done;
      document.head.appendChild(s);
    });
  }
  /* 高频词的常见译法（词典义项不全时兜底，避免把你译对的说成漏译） */
  var SYN = {
    institute: ["设立", "建立", "创立", "制定", "推行"],
    award: ["奖", "奖项", "称号", "荣誉", "授予"],
    argue: ["认为", "主张", "指出", "论证", "争辩", "说"],
    colleague: ["同事", "同行", "同僚"],
    call: ["呼吁", "号召", "要求", "倡议", "呼声"],
    proposal: ["提议", "建议", "提案", "方案"],
    propose: ["提议", "建议", "提出"],
    benefit: ["好处", "益处", "受益", "有利"],
    group: ["一些", "一群", "一批", "团体", "群体"],
    labour: ["工党", "劳动"],
    britain: ["英国", "不列颠"],
    city: ["城市", "都市"],
    economic: ["经济", "经济上"],
    strength: ["实力", "优势", "力量"],
    consolidate: ["巩固", "加强", "整合"],
    tie: ["联系", "纽带", "关系"],
    increase: ["增加", "提高", "增长"],
    likely: ["可能", "很可能"],
    drawback: ["缺点", "弊端", "不足"],
    undermine: ["削弱", "损害", "破坏"],
    boost: ["促进", "推动", "提高", "刺激"],
    curb: ["抑制", "遏制", "限制"],
    prompt: ["促使", "引发", "导致"],
    justify: ["证明", "合理", "辩护"],
    overlook: ["忽视", "忽略", "视而不见"],
    exaggerate: ["夸大", "言过其实"],
    skeptical: ["怀疑", "质疑", "不信任"],
    ambiguous: ["模糊", "含糊", "不明确"],
    inevitable: ["不可避免", "必然"],
    substantial: ["大量", "可观", "实质"],
    deteriorate: ["恶化", "变差"],
    alleviate: ["缓解", "减轻"],
    controversial: ["有争议", "争议"],
    priority: ["优先", "首要"],
    incentive: ["激励", "动力", "诱因"],
    constraint: ["限制", "约束"],
    bureaucracy: ["官僚", "官僚机构"],
    consensus: ["共识", "一致"],
    autonomy: ["自主", "自治"],
    resilience: ["韧性", "恢复力"],
    bring: ["带来", "引起", "迎来", "提出", "使"],
    mark: ["标志", "象征", "纪念"]
  };

  /* 固定搭配：整段当一处理解（bring in the new year 译成「在新年之际」也算对，
     逐词查词典只会把译对的判成漏译） */
  var PHRASE = [
    { en: /\bbring(?:s|ing)?\s+in\s+(?:the\s+)?new\s+year\b/i, head: /^bring/i,
      zh: /新年|迎新|新岁|过年/, w: "bring in the new year", zh0: "迎接新年" },
    { en: /\bmake\s+(?:a\s+)?(?:the\s+)?case\s+for\b/i, head: /^make/i,
      zh: /主张|论证|支持|为.{0,6}说话/, w: "make the case for", zh0: "主张/论证" },
    { en: /\bplay\s+(?:a\s+)?(?:key\s+|big\s+|major\s+)?role\b/i, head: /^play/i,
      zh: /起.{0,4}作用|扮演|角色|关键/, w: "play a role", zh0: "起作用" },
    { en: /\bin\s+the\s+wake\s+of\b/i, head: /^wake/i,
      zh: /之后|随着|紧随|因.{0,4}而/, w: "in the wake of", zh0: "在…之后" },
    { en: /\bat\s+the\s+expense\s+of\b/i, head: /^expense/i,
      zh: /以.{0,6}为代价|牺牲/, w: "at the expense of", zh0: "以…为代价" }
  ];

  function defOf(w) {
    if (!DICT) return "";
    var infl = /(ing|ed|ies|es|s)$/.test(w) && stem(w) !== w;
    /* 屈折形先查原形（词表里偶尔把屈折形的释义挂错，原形更可靠） */
    var cands = infl ? [stem(w), w] : [w, stem(w), w.replace(/e?d$/, ""), w.replace(/es$/, "")];
    for (var i = 0; i < cands.length; i++) if (DICT[cands[i]]) return DICT[cands[i]];
    var sy = SYN[infl ? stem(w) : w];
    return sy ? sy.join("；") : "";
  }
  /* 「v. 建立；设立；制定」→ [建立, 设立, 制定]，再并上人工同义（词典义项常常缺一条） */
  function zhCands(w) {
    var out = [];
    var raw = String(defOf(w) || "")
      .replace(/^[a-z]+\.\s*/i, "").replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, "");
    if (raw) {
      raw.split(/[；;，,、\/]/).forEach(function (x) {
        x = trim(x).replace(/^[a-z]+\.\s*/i, "");
        if (x.length >= 2 && x.length <= 9 && /[\u4e00-\u9fa5]/.test(x) && !GENERIC.test(x)) out.push(x);
      });
    }
    var sy = SYN[stem(w)] || SYN[w];
    if (sy) sy.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    return out.slice(0, 6);
  }
  /* 实词（保留原形供查词典；句中大写的专有名词跳过，人名地名不该算漏译） */
  function contentWords(s) {
    var out = [], re = /[A-Za-z][A-Za-z'’-]{3,}/g, m, first = true;
    while ((m = re.exec(s))) {
      var raw = m[0], w = raw.toLowerCase().replace(/[’']s$/, "");
      var atStart = first || /[.!?"“”]\s*$/.test(String(s).slice(0, m.index));
      first = false;
      if (atStart === false && raw.charAt(0) === raw.charAt(0).toUpperCase()) continue;
      if (w.length < 4 || STOP[w]) continue;
      if (out.indexOf(w) < 0) out.push(w);
    }
    return out;
  }

  /* 中文命中：整词、2 字片段、单字（短词）都算——宁可放过，也不把你译对的判成漏译 */
  function hitCN(cands, t) {
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c.length < 2) continue;
      if (t.indexOf(c) >= 0) return true;
      if (c.length <= 2) {                        /* 两年字词：允许单字命中（小镇↔城镇、奖项↔奖品） */
        if (t.indexOf(c.charAt(0)) >= 0 || t.indexOf(c.charAt(1)) >= 0) return true;
      } else {                                    /* 长词：至少共享一个双字片段 */
        for (var j = 0; j + 2 <= c.length; j++) if (t.indexOf(c.substr(j, 2)) >= 0) return true;
      }
    }
    return false;
  }

  /* ① 漏译检查：定位句的实词，你的中文里有没有对应的说法
     固定搭配先整段判一次；命中后它的中心词就不再单独查，免得把「在新年之际」判成漏译 */
  function checkTranslate(sent, tr) {
    var t = String(tr || ""), hit = [], miss = [], nodict = 0, skip = [];
    PHRASE.forEach(function (p) {
      if (!p.en.test(sent)) return;
      skip.push(p.head);
      if (p.zh.test(t)) hit.push({ w: p.w, zh: [p.zh0], ph: 1 });
    });
    contentWords(sent).forEach(function (w) {
      if (skip.some(function (re) { return re.test(w); })) return;
      var c = zhCands(w);
      if (!c.length) { nodict++; return; }
      (hitCN(c, t) ? hit : miss).push({ w: w, zh: c.slice(0, 3) });
    });
    return { hit: hit, miss: miss, nodict: nodict, total: hit.length + miss.length };
  }

  /* ② 概念比对：答案句有的维度你写了没有；你多说了什么（会改变答案的才算）
     正负评价不算「多读」：你说「作者是支持的」是你的判断，不是原文加戏，只在该报读反时才报 */
  var EXTRA_OK = { all: 1, limit: 1, contrast: 1, up: 1, down: 1 };

  /* 态度读反：答案句贬、你写成褒（或反过来），这才是真错 */
  function attWrong(sent, mine) {
    var t = String(mine || ""), pos = null, neg = null;
    DIM.forEach(function (d) { if (d.k === "pos") pos = d; if (d.k === "neg") neg = d; });
    if (!pos || !neg) return "";
    if (neg.en.test(sent) && pos.zh.test(t) && !neg.zh.test(t)) return "pos";
    if (pos.en.test(sent) && neg.zh.test(t) && !pos.zh.test(t)) return "neg";
    return "";
  }

  function compare(sent, mine) {
    var t = String(mine || ""), miss = [], extra = [];
    DIM.forEach(function (d) {
      var has = d.en.test(sent), said = d.zh.test(t);
      if (has && !said) miss.push(d);
      else if (!has && said && EXTRA_OK[d.k]) extra.push(d);
    });
    /* 正负评价只留一边：答案句全是褒义就别再报「你没写负面」 */
    var hasPos = miss.some(function (d) { return d.k === "pos"; });
    var hasNeg = miss.some(function (d) { return d.k === "neg"; });
    if (hasPos && hasNeg) {
      var sentNeg = /\b(critic\w*|doubt\w*|fail\w*|harm\w*|risk\w*|problem\w*|concern\w*|warn\w*)\b/i.test(sent);
      miss = miss.filter(function (d) { return sentNeg ? d.k !== "pos" : d.k !== "neg"; });
    }
    return {
      miss: miss, extra: extra, att: attWrong(sent, mine),
      dims: DIM.filter(function (d) { return d.en.test(sent); })
    };
  }

  /* 句子骨架：按逻辑词切块，标出每块的角色（＝你的「拆分过程」） */
  function sketch(sent) {
    var re = /\b(however|but|yet|nevertheless|instead|rather than|on the contrary|in contrast|although|though|while|whereas|despite|in spite of|because|since|therefore|thus|so that|as a result|moreover|furthermore|in addition|for example|for instance)\b/gi;
    var hits = [], m;
    while ((m = re.exec(sent))) hits.push({ at: m.index, w: m[0].toLowerCase() });
    if (!hits.length) return [{ t: trim(sent), r: "整句" }];
    var out = [], last = 0;
    hits.forEach(function (h, i) {
      if (h.at > last) {
        var seg = trim(sent.slice(last, h.at)).replace(/[,;]\s*$/, "");
        if (seg.length > 3) out.push({ t: seg, r: i === 0 ? "主干" : "承接" });
      }
      var role = "转折";
      if (/although|though|while|whereas|despite|in spite of/.test(h.w)) role = "让步";
      else if (/because|since|therefore|thus|so that|as a result/.test(h.w)) role = "因果";
      else if (/moreover|furthermore|in addition/.test(h.w)) role = "递进";
      else if (/for example|for instance/.test(h.w)) role = "举例";
      var end = hits[i + 1] ? hits[i + 1].at : sent.length;
      out.push({ t: trim(sent.slice(h.at, end)).replace(/[,;]\s*$/, ""), r: role });
      last = end;
    });
    if (last < sent.length - 3) out.push({ t: trim(sent.slice(last)), r: "收尾" });
    return out.filter(function (x) { return x.t && x.t.length > 2; });
  }

  /* 我的理解 vs 答案句：只对「答案句里确实存在」的要素检查覆盖，不乱扣帽子 */
  function check(f, mine) {
    var t = String(mine || ""), out = [];
    f.logic.forEach(function (type) {
      var g = LOGIC.filter(function (x) { return x.t === type; })[0];
      out.push({ k: "logic", n: "逻辑关系", v: type, hit: !!(g && g.cn.test(t)),
        hint: "答案句是「" + type + "」关系，选项正是靠它成立的。" });
    });
    f.scope.forEach(function (type) {
      var g = SCOPE.filter(function (x) { return x.t === type; })[0];
      out.push({ k: "scope", n: "限定范围", v: type, hit: !!(g && g.cn.test(t)),
        hint: "答案句带「" + type + "」的限定，复述丢了它，选项就容易放大或缩小。" });
    });
    if (f.att) {
      var hit = f.att === "正" ? ATT_CN.p.test(t) : f.att === "负" ? ATT_CN.n.test(t) : ATT_CN.m.test(t);
      out.push({ k: "attitude", n: "作者态度", v: f.att + "向", hit: hit,
        hint: "答案句是" + (f.att === "正" ? "正面" : f.att === "负" ? "负面" : "中性/谨慎") + "评价，你的复述没体现态度。" });
    }
    if (f.ref) {
      out.push({ k: "ref", n: "指代", v: "it / they / this 类", hit: REF_CN.test(t),
        hint: "答案句有指代词，先想清它指谁，再判断选项说的是不是这个东西。", soft: true });
    }
    if (f.subj && f.subj.length > 3) {
      out.push({ k: "subject", n: "主体", v: f.subj, hit: t.toLowerCase().indexOf(f.subj.toLowerCase()) >= 0,
        hint: "答案句的主体是「" + f.subj + "」，复述没点出主体最容易主客颠倒。", soft: true });
    }
    return out;
  }

  /* 正确选项 / 我选的选项 与答案句的词对词对应（同义替换就是在这里露馅） */
  function bridge(options, std, mine, sentText, passage) {
    var sw = words(sentText).map(stem);
    function split(letter) {
      var hit = [], miss = [];
      keys(optText(options, letter)).slice(0, 6).forEach(function (k) {
        if (sw.some(function (w) { return w === k || w.indexOf(k) === 0 || k.indexOf(w) === 0; })) hit.push(k);
        else miss.push(k);
      });
      return { hit: hit, miss: miss };
    }
    var st = split(std), mi = split(mine);
    /* 我选的那项，有几个词在全文出现过（说明它为什么「看着像」） */
    var allW = words(passage).map(stem);
    mi.hit = mi.hit.filter(function (k) {
      return allW.some(function (w) { return w === k || w.indexOf(k) === 0; });
    });
    return { std: st, mine: mi };
  }

  /* 诊断总入口：o = {year, sec, stem, options, std, mine, tr, rd}
     tr = 我对定位句的翻译，rd = 我为什么选它（两段都按中文理解） */
  function diagnose(o) {
    var passage = o.passage != null ? o.passage : passageOf(o.year, o.sec);
    var anc = locate(passage, o.stem, o.options, o.std);
    if (!anc) return null;
    var full = anc.text + " " + (anc.more || []).join(" ");
    /* ① 没写就不查漏译：拿「为什么选它」去比实词，只会冤枉你 */
    var trTxt = trim(o.tr || "");
    var tr = trTxt ? checkTranslate(full, trTxt)
      : { hit: [], miss: [], nodict: 0, total: 0, skipped: 1 };
    var zhAll = trim((o.tr || "") + " " + (o.rd || ""));
    var cmp = compare(full, zhAll);
    /* 态度读反只看「为什么选它」：翻译里写对「批评」不算错，落点是你最后怎么判断作者 */
    cmp.att = attWrong(full, o.rd || "");
    /* 选项对照用「答案句所在整段」：正确答案的支撑常在相邻句里 */
    var seg = splitSents(passage).filter(function (x) { return x.p === anc.para - 1; })
      .map(function (x) { return x.t; }).join(" ") || full;
    var br = (o.options && o.std)
      ? bridge(o.options, o.std, o.mine || "?", seg, passage) : null;

    var gaps = [];
    function add(k) { if (gaps.indexOf(k) < 0) gaps.push(k); }
    if (cmp.att) add("attitude");          /* 态度读反最先说，它比漏几个词更致命 */
    if (tr.total && tr.miss.length >= 2) add("vocab");
    cmp.miss.forEach(function (d) { add(d.g); });
    cmp.extra.forEach(function () { add("extra"); });
    if (!anc.sure) add("locate");
    if (!gaps.length && zhAll) add("option");

    return { anc: anc, tr: tr, cmp: cmp, br: br, gaps: gaps, sk: sketch(anc.text) };
  }

  /* ══════ 逐题卡片 ══════ */
  function gapsText(gaps) {
    return (gaps || []).map(function (k) { return (GAP_MAP[k] || { n: k }).n; }).join(" · ");
  }

  function cardHTML(r) {
    var rec = r.mis || null;
    var opts = (r.options || []).map(function (o, i) {
      var L = "ABCDEFGH"[i];
      var cls = L === r.std ? " std" : L === r.mine ? " mine" : "";
      return '<li class="wo' + cls + '"><b>' + L + "</b>" + esc(o) + "</li>";
    }).join("");
    return '<div class="why" data-date="' + esc(r.date) + '" data-key="' + esc(r.key) +
      '" data-year="' + esc(r.year) + '" data-sec="' + esc(r.sec) + '" data-n="' + r.n + '">' +
      '<button type="button" class="why-hd">' +
      '<span class="why-ar">▸</span>理解复盘' +
      (rec ? '<i class="why-tag">' + esc(gapsText(rec.g) || "已记录") + "</i>" : "") + "</button>" +
      '<div class="why-bd" hidden>' +
      '<p class="why-stem">' + esc(r.stem) + "</p>" +
      (opts ? '<ul class="why-opts">' + opts + "</ul>" : "") +
      '<div class="why-io">' +
      '<label class="why-lb"><b>①</b>这句我怎么翻的<span>把上面这句翻成中文，照你当时读出来的意思写</span></label>' +
      '<textarea class="why-in why-tr" rows="2" placeholder="例：工党一些议员提议设立一个「文化之城」奖项，想靠它带动当地经济">' +
      esc(rec && rec.tr ? rec.tr : "") + "</textarea>" +
      '<label class="why-lb"><b>②</b>我为什么选它<span>谁做了什么 → 所以我选了 ' +
      esc(r.mine || "?") + "（主体 + 动作 + 评价都写出来）</span></label>" +
      '<textarea class="why-in why-rd" rows="2" placeholder="例：我觉得作者是支持的，他说这能给小镇带来投资，所以选 C">' +
      esc(rec ? (rec.rd || rec.t || "") : "") + "</textarea></div>" +
      '<div class="why-act"><button type="button" class="btn primary why-go">对照并保存</button>' +
      '<span class="why-st">' + (rec ? "上次对照于 " + new Date(rec.at).toLocaleDateString("zh-CN") : "") + "</span></div>" +
      '<div class="why-out"></div></div></div>';
  }

  function renderOut(box, d, r) {
    if (!d) { box.innerHTML = '<div class="why-none">这题没定位到答案句（题型特殊），先按错因走一遍。</div>'; return; }
    var sk = d.sk.map(function (s) {
      return '<span class="wsk" data-r="' + esc(s.r) + '"><i>' + esc(s.r) + "</i>" + esc(s.t) + "</span>";
    }).join("");

    /* ① 漏译：定位句实词你译到几个 */
    var trBox = "";
    if (d.tr.total) {
      trBox = '<div class="why-trb"><div class="wtb-hd">你的翻译 · 实词译到 ' +
        d.tr.hit.length + "/" + d.tr.total + "</div>" +
        (d.tr.miss.length
          ? '<div class="wmiss">' + d.tr.miss.map(function (w) {
              return '<b>' + esc(w.w) + "</b><i>" + esc(w.zh.join(" / ")) + "</i>";
            }).join("") + "</div>"
          : '<div class="wmiss ok">这句的实词你都译到了</div>') + "</div>";
    } else if (d.tr.skipped) {
      trBox = '<div class="why-trb"><div class="wtb-hd">你的翻译 · 还没写</div>' +
        '<div class="wmiss">先在 ① 里把这句翻成中文，才能一行行查漏译。</div></div>';
    }

    /* ② 概念：答案句带了哪几层意思，你写到没有 */
    var cmpRows = d.cmp.dims.filter(function (x) {
      /* 读反的那一边已经由上面 attRow 说了，这里不再重复成「对上了」 */
      return !(d.cmp.att && ((x.k === "neg" && d.cmp.att === "pos") || (x.k === "pos" && d.cmp.att === "neg")));
    }).map(function (x) {
      var m = d.cmp.miss.indexOf(x) >= 0, e = d.cmp.extra.indexOf(x) >= 0;
      return '<div class="wr ' + (m ? "no" : e ? "soft" : "ok") + '">' +
        '<span class="wr-n">' + esc(x.n) + "</span>" +
        '<span class="wr-v">' + (m ? "答案句有，你没写到" : e ? "你写了，答案句没有" : "对上了") + "</span>" +
        '<span class="wr-m">' + (m ? "漏" : e ? "多" : "✓") + "</span></div>" +
        (m || e ? '<div class="wr-h">' + esc(x.why) + "</div>" : "");
    }).join("");
    /* 你多说的：答案句没有的评价/范围，你却读出来了 */
    var extraRows = d.cmp.extra.map(function (x) {
      return '<div class="wr soft"><span class="wr-n">' + esc(x.n) + "</span>" +
        '<span class="wr-v">你写了，答案句没有</span><span class="wr-m">多</span></div>' +
        '<div class="wr-h">答案句这里只是陈述，并没有「' + esc(x.n) +
        "」这层意思。你把话读重了，选项正好靠这个把你带走。</div>";
    }).join("");
    /* 态度读反：答案句贬你写褒（或反过来）——比漏读更要紧，单列一行 */
    var attRow = d.cmp.att
      ? '<div class="wr no"><span class="wr-n">态度方向</span><span class="wr-v">读反了</span>' +
        '<span class="wr-m">反</span></div><div class="wr-h">答案句是' +
        (d.cmp.att === "pos" ? "负面评价，你写成了肯定" : "正面评价，你写成了否定") +
        "。选项正是靠这个把你带走：回读时先把评价形容词的正负圈出来，再定强弱。</div>"
      : "";
    var cmpBox = (attRow ? '<div class="why-chk">' + attRow + "</div>" : "") +
      (cmpRows ? '<div class="why-chk">' + cmpRows + "</div>" : "") +
      (extraRows ? '<div class="why-chk">' + extraRows + "</div>" : "") ||
      '<div class="why-none">这句没有明显的逻辑/评价/范围信号词，主要靠实词和上下文。</div>';

    var vd;
    var trFull = d.tr.total > 0 && !d.tr.miss.length;
    var onlyOpt = !d.gaps.length || (d.gaps.length === 1 && d.gaps[0] === "option");
    if (onlyOpt && trFull) {
      vd = "<b>这句你读对了</b>　实词 " + d.tr.hit.length + "/" + d.tr.total +
        " 全译到、概念也对得上。问题不在读句，在选项辨析——把下面两组词逐一对一遍。";
    } else if (d.gaps.length) {
      vd = "<b>偏差：" + esc(gapsText(d.gaps)) + "</b>　" + esc((GAP_MAP[d.gaps[0]] || {}).d || "") +
        (d.cmp.extra.length ? "　另外你多读了「" +
          esc(d.cmp.extra.map(function (x) { return x.n; }).join(" · ")) + "」，答案句里没有这层意思。" : "");
    } else {
      vd = "<b>还没看出偏差</b>　把 ① 的翻译和 ② 的选择理由都写出来，对照才有依据。";
    }

    box.innerHTML =
      '<div class="why-anc">' +
      '<div class="why-anc-hd">答案句 · 第 ' + d.anc.para + " 段" +
      (d.anc.sure ? "" : '<em>（按关键词匹配，可信度中）</em>') + "</div>" +
      '<p class="why-sent">' + esc(d.anc.text) + "</p>" +
      (d.anc.more && d.anc.more.length
        ? '<p class="why-more">紧接的依据：' + esc(d.anc.more.join(" ")) + "</p>" : "") +
      '<div class="why-sk">' + sk + "</div></div>" +
      trBox + cmpBox +
      brHTML(d.br, r) +
      gapPicker(d, r) +
      '<div class="why-vd">' + vd + "</div>";
  }

  /* 偏差归类：系统预选，你自己也能改——你比规则更清楚错在哪一步 */
  function gapPicker(d, r) {
    var chosen = (r && r.mis && r.mis.g && r.mis.g.length) ? r.mis.g : (d ? d.gaps : []);
    return '<div class="wgp"><div class="wgp-hd">这次算哪类偏差？点一下切换（系统已按上面结果预选）</div>' +
      '<div class="wgp-list">' + GAPS.map(function (g) {
        return '<button type="button" class="wgp-c' + (chosen.indexOf(g.k) >= 0 ? " on" : "") +
          '" data-g="' + g.k + '">' + esc(g.n) + "</button>";
      }).join("") + "</div></div>";
  }

  function brHTML(br, r) {
    if (!br) return "";
    var L = function (x) { return r && x === r.std ? "正确项 " + x : "你选的 " + x; };
    function tags(arr, cls) {
      return arr.length ? arr.map(function (k) {
        return '<b class="' + cls + '">' + esc(k) + "</b>";
      }).join("") : '<span class="wbr-none">—</span>';
    }
    function pair(hit, miss, r2) {
      return tags(hit, "wy") + (hit.length && miss.length ? '<span class="wsep">·</span>' : "") + tags(miss, "wn");
    }
    var hint = "";
    if (br.std.miss.length) {
      hint = "正确项里的 " + br.std.miss.slice(0, 3).map(function (k) { return "「" + k + "」"; }).join("") +
        " 在答案句里没有原词，是换了说法——这里认不出来，就等于读懂了句子也没认出答案。";
    } else if (br.mine.hit.length) {
      hint = "你选的 " + r.mine + " 项里的 " + br.mine.hit.slice(0, 3).map(function (k) { return "「" + k + "」"; }).join("") +
        " 在原文确实出现过（所以看着像），回去看它出现的那句说的是不是同一个主体/范围。";
    } else if (r && r.mine && r.mine !== r.std) {
      hint = "你选的 " + r.mine + " 项关键词在全文都没出现，它靠换个说法让你觉得眼熟。";
    }
    return '<div class="why-br">' +
      '<div class="wbr-row"><span class="wbr-k">' + L(r && r.std) + " ↔ 原文</span>" +
      '<span class="wbr-v">' + pair(br.std.hit, br.std.miss) + "</span></div>" +
      (r && r.mine && r.mine !== r.std
        ? '<div class="wbr-row"><span class="wbr-k">' + L(r.mine) + " ↔ 原文</span>" +
          '<span class="wbr-v">' + pair(br.mine.hit, br.mine.miss) + "</span></div>"
        : "") +
      (hint ? '<div class="wbr-hint">' + esc(hint) + "</div>" : "") + "</div>";
  }

  /* 两段输入：tr = 我的翻译，rd = 我为什么选它 */
  function readIO(card) {
    var a = card.querySelector(".why-tr"), b = card.querySelector(".why-rd");
    return { tr: a ? trim(a.value) : "", rd: b ? trim(b.value) : "" };
  }

  function save(r, io) {
    var N = window.JOURNAL, J = N && N.J();
    if (!J || !J.days[r.date] || !J.days[r.date][r.key]) return false;
    var rec = J.days[r.date][r.key];
    if (!rec.mis) rec.mis = {};
    var d = diagnose({ year: r.year, sec: r.sec, stem: r.stem, options: r.options,
      std: r.std, mine: r.mine, tr: io.tr, rd: io.rd });
    rec.mis[r.n] = {
      tr: io.tr, rd: io.rd, g: d ? d.gaps : [],
      ms: d ? d.tr.miss.map(function (w) { return { w: w.w, zh: w.zh }; }) : [],
      s: d ? d.anc.text : "", at: Date.now()
    };
    N.touch(rec); N.commit("理解已存");
    return d;
  }

  function item(r) { return cardHTML(r); }

  /* 展开卡片并按当前文本重算对照（词表没加载好就先拉，加载完自动补渲染） */
  function expand(card) {
    if (!card) return;
    var bd = card.querySelector(".why-bd"), ar = card.querySelector(".why-hd .why-ar");
    if (bd) bd.hidden = false;
    if (ar) ar.textContent = "▾";
    var io = readIO(card), box = card.querySelector(".why-out");
    if (!box || (io.tr + io.rd).length < 5) return;
    var r = rowOf(card);
    if (!r) return;
    var run = function () {
      renderOut(box, diagnose({ year: r.year, sec: r.sec, stem: r.stem, options: r.options,
        std: r.std, mine: r.mine, tr: io.tr, rd: io.rd }), r);
    };
    if (DICT) run(); else loadDict(run);
  }

  /* 保存/改分类会触发分析页重建（DOM 换新），稍后按同样的题把卡片重新展开 */
  function restore(card) {
    var key = card.getAttribute("data-key"), n = card.getAttribute("data-n");
    setTimeout(function () {
      var c = document.querySelector('.why[data-key="' + key + '"][data-n="' + n + '"]');
      if (c) expand(c);
    }, 320);
  }

  function bind(root) {
    if (!root || root._whyBound) return;
    root._whyBound = true;
    root.addEventListener("click", function (e) {
      var hd = e.target.closest(".why-hd");
      if (hd) {
        var card0 = hd.closest(".why");
        var bd = card0.querySelector(".why-bd");
        var ar = hd.querySelector(".why-ar");
        if (bd.hidden) {
          expand(card0);              /* 展开时重放上次存的理解，刷新后也看得到 */
        } else {
          bd.hidden = true;
          if (ar) ar.textContent = "▸";
        }
        return;
      }
      /* 偏差归类 chips：点一下就存，页面重建后自动恢复选中态 */
      var gp = e.target.closest(".wgp-c");
      if (gp) {
        var cardG = gp.closest(".why");
        var rg = rowOf(cardG);
        if (!rg) return;
        var Jg = window.JOURNAL.J(), recG = Jg.days[rg.date] && Jg.days[rg.date][rg.key];
        if (!recG) return;
        recG.mis = recG.mis || {};
        var ioG = readIO(cardG);
        var cur = recG.mis[rg.n] || { tr: ioG.tr, rd: ioG.rd, g: [], at: Date.now() };
        var k = gp.getAttribute("data-g"), gs = (cur.g || []).slice();
        var at = gs.indexOf(k);
        if (at >= 0) gs.splice(at, 1); else gs.push(k);
        cur.g = gs; cur.at = Date.now();
        if (!cur.tr) cur.tr = ioG.tr;
        if (!cur.rd) cur.rd = ioG.rd;
        recG.mis[rg.n] = cur;
        window.JOURNAL.touch(recG);
        window.JOURNAL.commit();
        restore(cardG);
        return;
      }
      var go = e.target.closest(".why-go");
      if (!go) return;
      var card = go.closest(".why");
      var io = readIO(card);
      var box = card.querySelector(".why-out");
      var st = card.querySelector(".why-st");
      if ((io.tr + io.rd).length < 5) {
        box.innerHTML = '<div class="why-none">先写一句：这句你怎么翻的、为什么选它（加起来至少几个字）。</div>';
        return;
      }
      var r = rowOf(card);
      if (!r) return;
      var run = function () {
        var d = save(r, io);
        renderOut(box, d, r);
        if (st) st.textContent = "已保存 · " + new Date().toLocaleTimeString("zh-CN").slice(0, 5);
        var tag = card.querySelector(".why-tag");
        if (tag) tag.textContent = gapsText(d ? d.gaps : []) || "已记录";
        restore(card);
      };
      if (DICT) run(); else loadDict(run);
    });
  }

  /* ══════ 累计：偏差画像 + 学习方向 + 历史档案 ══════ */
  function rowOf(card) {
    var N = window.JOURNAL, J = N && N.J();
    if (!J) return null;
    var year = card.getAttribute("data-year"), sec = card.getAttribute("data-sec");
    var n = parseInt(card.getAttribute("data-n"), 10);
    var date = card.getAttribute("data-date"), key = card.getAttribute("data-key");
    var s = N.paperSec(year, sec);
    if (!s) return null;
    var it = s.items.filter(function (x) { return +x.n === n; })[0];
    if (!it) return null;
    var rec = (J.days[date] && J.days[date][key]) || {};
    return { year: year, sec: sec, n: n, date: date, key: key,
      stem: it.stem || "", options: it.options || [], std: it.answer || "",
      mine: (rec.ans || {})[n] || "" };
  }

  function misRows(rows) {
    return rows.filter(function (r) {
      return r.mis && (r.mis.t || r.mis.tr || r.mis.rd);
    });
  }

  /* 词盲区：定位句里没译出来的实词，按出现次数排 → 这就是该背的词表 */
  function blindWords(ms) {
    var cnt = {}, zh = {};
    ms.forEach(function (r) {
      (r.mis.ms || []).forEach(function (m) {
        if (!m || !m.w) return;
        cnt[m.w] = (cnt[m.w] || 0) + 1;
        if (!zh[m.w] && m.zh && m.zh.length) zh[m.w] = m.zh;
      });
    });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || a.localeCompare(b); })
      .map(function (w) { return { w: w, n: cnt[w], zh: zh[w] || [] }; });
  }

  function renderStats(rows) {
    var box = document.getElementById("whyStat");
    if (!box) return;
    var ms = misRows(rows);
    if (!ms.length) {
      box.innerHTML = '<div class="empty">还没有理解复盘。到「今天这一篇」里点错题下面的「理解复盘」，' +
        "把定位句怎么翻的、为什么选它用中文写一遍——系统会逐词检查你漏了什么，攒几道就能看出你固定在哪一步读偏。</div>";
      return;
    }
    var cnt = {}, partCnt = {};
    ms.forEach(function (r) {
      (r.mis.g || []).forEach(function (k) {
        cnt[k] = (cnt[k] || 0) + 1;
        var p = r.part || "read";
        (partCnt[p] || (partCnt[p] = {}))[k] = (partCnt[p][k] || 0) + 1;
      });
    });
    var ks = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    var wb = blindWords(ms);
    var max = cnt[ks[0]] || 1;

    var h = "";
    if (ks.length) {
      h = '<div class="cause">' + ks.map(function (k) {
        var g = GAP_MAP[k] || { n: k, d: "" };
        return '<div class="crow"><span>' + esc(g.n) + "</span>" +
          '<span class="cb"><i style="width:' + Math.round(cnt[k] / max * 100) + '%"></i></span>' +
          '<span class="cv">' + cnt[k] + "</span></div>" +
          '<div class="wgap-d">' + esc(g.d) + "</div>";
      }).join("") + "</div>";
    }
    if (wb.length) {
      h += '<div class="wblind-hd">你在定位句里没译出来的词（按次数）</div><div class="wblind">' +
        wb.slice(0, 12).map(function (x) {
          return '<span class="wb"><b>' + esc(x.w) + "</b>" +
            (x.zh.length ? "<i>" + esc(x.zh.join("/")) + "</i>" : "") +
            (x.n > 1 ? "<em>×" + x.n + "</em>" : "") + "</span>";
        }).join("") + "</div>";
    }

    /* 学习方向：词 → 逻辑/态度/范围 → 题型 */
    var pn = { read: "阅读", cloze: "完型", pb: "新题型" };
    var adv = [];
    if (wb.length) {
      adv.push("<li><b>先解决这几个词</b>：" + wb.slice(0, 6).map(function (x) {
        return esc(x.w) + (x.zh.length ? "（" + esc(x.zh[0]) + "）" : "");
      }).join("、") + "。它们出现在你错题的定位句里而你没译出来——先认词，再谈读句。</li>");
    }
    ks.slice(0, 2).forEach(function (k) {
      var worst = Object.keys(partCnt).sort(function (a, b) {
        return (partCnt[b][k] || 0) - (partCnt[a][k] || 0);
      })[0];
      var g = GAP_MAP[k] || {};
      adv.push("<li><b>" + esc(g.n) + "</b>：复盘 " + cnt[k] + " 次" +
        (worst && partCnt[worst][k] ? "，其中" + pn[worst] + " " + partCnt[worst][k] + " 次" : "") +
        "。练法：" + esc(g.d) + "</li>");
    });
    box.innerHTML = h + '<div class="why-adv"><div class="why-adv-hd">下一步练什么</div><ul>' +
      (adv.join("") || "<li>先把错题的理解写下来，攒够 3 道再来看分布。</li>") + "</ul>" +
      '<div class="note">口径：只统计写过理解的错题；同一题多个缺口各计一次。词盲区只算定位句的实词，' +
      "同一个词反复漏 = 高频词却认不出，优先背。</div></div>";
  }

  function renderArchive(rows) {
    var box = document.getElementById("whyArch");
    if (!box) return;
    var ms = misRows(rows).sort(function (a, b) { return (b.mis.at || 0) - (a.mis.at || 0); });
    if (!ms.length) { box.innerHTML = '<div class="empty">暂无</div>'; return; }
    box.innerHTML = ms.slice(0, 30).map(function (r) {
      var d = new Date(r.mis.at || 0);
      var g = (r.mis.g || []).length ? gapsText(r.mis.g) : "要素对齐";
      var opts = (r.options || []).map(function (o, i) {
        return { L: "ABCDEFGH"[i], t: o };
      }).filter(function (x) { return x.L === r.std || x.L === r.mine; })
        .map(function (x) {
          return '<span class="wa-o ' + (x.L === r.std ? "std" : "mine") + '"><b>' + x.L + "</b>" + esc(x.t) + "</span>";
        }).join("");
      return '<div class="warch"><div class="warch-hd">' +
        '<span class="wq-id">' + r.date.slice(5) + " · " + r.year + " " + esc(r.secLabel || r.sec) + " · 第 " + r.n + " 题</span>" +
        '<i class="why-tag">' + esc(g) + "</i>" +
        '<span class="warch-t">' + (isNaN(d.getTime()) ? "" : d.toLocaleDateString("zh-CN")) + "</span></div>" +
        (r.mis.tr ? '<p class="warch-mine"><b>我的翻译</b>' + esc(r.mis.tr) + "</p>" : "") +
        (r.mis.rd || r.mis.t ? '<p class="warch-mine"><b>为什么选它</b>' + esc(r.mis.rd || r.mis.t) + "</p>" : "") +
        (r.mis.ms && r.mis.ms.length
          ? '<div class="warch-ms">漏译 ' + r.mis.ms.slice(0, 8).map(function (m) {
              return "<b>" + esc(m.w) + "</b>" + (m.zh && m.zh.length ? "<i>" + esc(m.zh[0]) + "</i>" : "");
            }).join("") + "</div>" : "") +
        (r.mis.s ? '<p class="warch-sent">' + esc(r.mis.s) + "</p>" : "") +
        (opts ? '<div class="warch-opts">' + opts + "</div>" : "") + "</div>";
    }).join("");
  }

  window.JOURNAL_WHY = {
    item: item, bind: bind, renderStats: renderStats, renderArchive: renderArchive,
    diagnose: diagnose, locate: locate, sketch: sketch, GAPS: GAPS, GAP_MAP: GAP_MAP
  };
})();
