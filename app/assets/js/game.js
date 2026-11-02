/* 课堂互动小游戏：闯关夺星 + 错题复仇
 * ---------------------------------------------------------------
 * 设计约束（答辩时要讲的三件事）：
 *   1. 不新增数据结构：题目直接取自本次备课包（闯关）与学生历史错题（复仇），
 *      复用题库已有的 stem / answer / solution / errorTag 字段。
 *   2. 游戏即记录：判定结果实时写入课堂记录的 results，玩完游戏下面的
 *      掌握/半会/不会已经勾好，老师不再需要课后逐题回忆勾选——是减负不是加负。
 *   3. 学情闭环可见：错题复仇的题目来自该学生历史「不会/半会」记录，
 *      历史薄弱点直接变成下一节课的关卡，数据不是存着看的。
 * 判定方式两种：老师判定（旁听打分）/ 学生自评（先自评，再揭晓答案核对）。
 */
(function () {
  "use strict";

  var D = window.KBData;

  var STAGE_NAME = ["小试身手", "乘胜追击", "终极挑战"];
  var STAGE_DESC = ["基础题热身，先把信心立起来", "进阶题，连对会有连击奖励", "变式题，拿下就能冲满星"];
  var OK_WORDS = ["答对了，很稳！", "正确，继续保持", "漂亮，这一步没掉坑", "很棒，思路很清楚"];
  var PART_WORDS = ["思路是对的，但没做完", "会一半，差最后一步", "方向对了，细节还差一点"];
  var BAD_WORDS = ["这题掉坑了，看一眼易错点", "没关系，这题本来就是坎", "先记下来，下节课再拿下它"];

  /* 游戏运行时状态：挂在模块内，页面重渲染不丢失 */
  var G = {
    mode: null,        // "run" | "boss"
    judge: "teacher",  // "teacher" | "self"
    stages: [], stage: 0, idx: 0,
    boss: [],
    answers: {},       // qid -> "ok" | "partial" | "wrong"
    combo: 0, best: 0,
    revealed: false,
    banner: "",
    last: null,        // { val, text }
    finished: false,
    summary: null,
    host: null, api: null,
    planRef: null, stuRef: null
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function lvName(n) { return D.levelName ? D.levelName(n) : "基础"; }

  /* ---------- 关卡构建 ---------- */

  /* 闯关夺星：把备课包里的题按难度分成三关 */
  function buildStages(plan) {
    var stages = [];
    [1, 2, 3].forEach(function (lv) {
      var qs = [];
      plan.sections.forEach(function (s) {
        s.questions.forEach(function (it) {
          if (it.q.level === lv) qs.push({ q: it.q, kpId: s.kpId, kpName: s.kpName });
        });
      });
      if (qs.length) {
        stages.push({
          level: lv,
          name: STAGE_NAME[lv - 1],
          desc: STAGE_DESC[lv - 1],
          questions: qs
        });
      }
    });
    return stages;
  }

  /* 错题复仇：从学生历史课堂记录里捞出「不会 / 半会」的题，包装成 Boss */
  function buildBoss(student, plan) {
    var inPlan = {};
    (plan ? plan.sections : []).forEach(function (s) {
      s.questions.forEach(function (it) { inPlan[it.q.id] = 1; });
    });
    var map = {}, order = [];
    (student.lessons || []).forEach(function (l) {
      var rs = l.results || {};
      Object.keys(rs).forEach(function (qid) {
        var v = rs[qid];
        if (v !== "wrong" && v !== "partial") return;
        if (inPlan[qid]) return;                 /* 本次备课包里已经有了，不重复出现 */
        var f = D.questionById(qid);
        if (!f) return;
        var idx = D.kpIndex()[f.kpId];
        var item = map[qid];
        /* 同一道题多次出错，保留最近一次的状态与日期 */
        if (!item) {
          item = map[qid] = {
            q: f.q, kpId: f.kpId,
            kpName: idx ? idx.kp.name : "",
            date: l.date, last: v, hp: 2, max: 2
          };
          order.push(qid);
        } else {
          if (l.date > item.date) { item.date = l.date; item.last = v; }
          if (v === "wrong") item.last = "wrong";
        }
      });
    });
    var arr = order.map(function (k) { return map[k]; });
    arr.sort(function (a, b) {
      if ((a.last === "wrong") !== (b.last === "wrong")) return a.last === "wrong" ? -1 : 1;
      return a.date < b.date ? 1 : -1;
    });
    return arr.slice(0, 6);
  }

  function bossList() { return G.boss || []; }
  function bossKilled() {
    var n = 0;
    bossList().forEach(function (b) { if (b.hp === 0) n++; });
    return n;
  }

  /* ---------- 流程控制 ---------- */

  function reset() {
    G.mode = null; G.stages = []; G.stage = 0; G.idx = 0; G.boss = [];
    G.answers = {}; G.combo = 0; G.best = 0;
    G.revealed = false; G.banner = ""; G.last = null;
    G.finished = false; G.summary = null;
  }

  function start(mode) {
    G.mode = mode;
    G.stage = 0; G.idx = 0; G.answers = {}; G.combo = 0; G.best = 0;
    G.revealed = false; G.last = null; G.finished = false; G.summary = null;
    if (mode === "run") {
      G.stages = buildStages(G.api.plan);
      G.boss = [];
      G.banner = "第 1 关 · " + (G.stages[0] ? G.stages[0].name : "");
    } else {
      G.stages = [];
      /* 学生端没有备课包概念，错题要全部算进来（bossIgnorePlan） */
      G.boss = buildBoss(G.api.student, G.api.bossIgnorePlan ? null : G.api.plan);
      G.boss.forEach(function (b) { b.hp = b.max; });
      G.banner = G.boss.length ? "错题复仇 · " + G.boss.length + " 只错题怪来袭" : "";
    }
  }

  function cur() {
    if (G.mode === "boss") {
      var b = G.boss[G.idx];
      return b ? { q: b.q, kpName: b.kpName, date: b.date, last: b.last } : null;
    }
    var s = G.stages[G.stage];
    if (!s) return null;
    var it = s.questions[G.idx];
    return it ? { q: it.q, kpName: it.kpName } : null;
  }

  function totalQ() {
    if (G.mode === "boss") return G.boss.length;
    var n = 0;
    G.stages.forEach(function (s) { n += s.questions.length; });
    return n;
  }
  function doneQ() {
    if (G.mode === "boss") return G.idx;
    var n = 0;
    for (var i = 0; i < G.stage; i++) n += G.stages[i].questions.length;
    return n + G.idx;
  }

  function count() {
    var ok = 0, p = 0, w = 0;
    Object.keys(G.answers).forEach(function (k) {
      var v = G.answers[k];
      if (v === "ok") ok++; else if (v === "partial") p++; else w++;
    });
    return { ok: ok, partial: p, wrong: w, total: ok + p + w };
  }

  function answer(val) {
    var item = cur();
    if (!item) return;
    G.answers[item.q.id] = val;
    if (G.api && G.api.onUpdate) G.api.onUpdate(item.q.id, val);
    if (val === "ok") { G.combo++; if (G.combo > G.best) G.best = G.combo; }
    else G.combo = 0;
    if (G.mode === "boss" && G.boss[G.idx]) {
      G.boss[G.idx].hp = val === "ok" ? 0 : (val === "partial" ? 1 : 2);
    }
    G.revealed = true;
    G.last = { val: val, text: fbText(item, val) };
    draw();
  }

  function fbText(item, val) {
    var q = item.q;
    if (val === "ok") {
      var t = rnd(OK_WORDS);
      if (G.combo >= 3) t += "　连对 " + G.combo + " 题，手感来了！";
      return t;
    }
    if (val === "partial") return rnd(PART_WORDS) + "。正确答案：" + q.answer;
    return rnd(BAD_WORDS) + "。易错点：" + (q.errorTag || "注意审题");
  }

  function next() {
    G.revealed = false; G.last = null; G.banner = "";
    if (G.mode === "boss") {
      if (G.idx < G.boss.length - 1) { G.idx++; draw(); return; }
      finish(); return;
    }
    var s = G.stages[G.stage];
    if (s && G.idx < s.questions.length - 1) { G.idx++; draw(); return; }
    if (G.stage < G.stages.length - 1) {
      G.stage++; G.idx = 0;
      G.banner = "第 " + (G.stage + 1) + " 关 · " + G.stages[G.stage].name;
      draw(); return;
    }
    finish();
  }

  function finish() {
    var c = count();
    var rate = c.total ? Math.round(((c.ok + c.partial * 0.5) / c.total) * 100) : 0;
    G.summary = {
      ok: c.ok, partial: c.partial, wrong: c.wrong, total: c.total, rate: rate,
      star: rate >= 85 ? 3 : (rate >= 60 ? 2 : 1),
      best: G.best,
      killed: G.mode === "boss" ? bossKilled() : 0,
      bossTotal: G.mode === "boss" ? G.boss.length : 0,
      mode: G.mode
    };
    G.finished = true;
    /* 交回页面层：写回课堂记录并整体重绘（重绘后由 mount 呈现结算页） */
    if (G.api && G.api.onFinish) G.api.onFinish();
    else draw();
  }

  /* ---------- 渲染 ---------- */

  function mount(host, api) {
    G.host = host; G.api = api;
    if (!host) return;
    /* 学生端强制走「学生自评」：自己做完自己评，老师端才有老师判定 */
    if (api.forceJudge) G.judge = api.forceJudge;
    /* 换了学生或重新生成了备课包，游戏进度作废 */
    if (G.planRef !== api.plan || G.stuRef !== api.student) {
      G.planRef = api.plan; G.stuRef = api.student;
      reset();
    }
    draw();
  }

  function draw() {
    if (!G.host) return;
    G.host.innerHTML = G.finished ? resultHtml() : (G.mode ? playHtml() : entryHtml());
    bind();
    /* 每帧把已记录数量同步到页面，供演示时对照 */
    var live = G.host.querySelector("[data-live]");
    if (live) {
      var c = count();
      live.textContent = "已记录 " + c.total + " 题（答对 " + c.ok + " · 半会 " + c.partial + " · 不会 " + c.wrong + "）";
    }
  }

  function bind() {
    if (!G.host) return;
    var nodes = G.host.querySelectorAll("[data-act]");
    Array.prototype.forEach.call(nodes, function (b) {
      b.onclick = function () { act(b.getAttribute("data-act"), b.getAttribute("data-val")); };
    });
  }

  function act(a, val) {
    if (a === "start") { start(val); draw(); return; }
    if (a === "judge") { G.judge = val; draw(); return; }
    if (a === "answer") { answer(val); return; }
    if (a === "next") { next(); return; }
    if (a === "again") { var m = G.summary ? G.summary.mode : "run"; reset(); start(m); draw(); return; }
    if (a === "quit" || a === "close") { reset(); draw(); return; }
  }

  /* 入口页 */
  function entryHtml() {
    var plan = G.api.plan, stu = G.api.student;
    var boss = buildBoss(stu, plan);
    var stages = buildStages(plan);
    var qn = 0;
    stages.forEach(function (s) { qn += s.questions.length; });

    var h = '<div class="card game-card"><div class="row-between"><h2>课堂互动 · 小游戏</h2>' +
      '<span class="tag">' + tagText() + '</span></div>' +
      '<p class="muted small">' + (G.api.studentMode
        ? '题目来自你最近一次课的知识点和历史错题。自评结果只作为练习记录，不计入老师的学情档案。'
        : '题目直接来自本次备课包与学生历史错题，判定完即写回学情档案，不用课后再补一遍勾选。') + '</p>';

    if (!G.api.hideJudge) {
      h += '<div class="gm judge"><span class="gm-label">判定方式</span>' +
        judgeBtn("teacher", "老师判定", "学生口答或纸笔作答，老师在旁打分") +
        judgeBtn("self", "学生自评", "先不公布答案，学生自报会/不会，再揭晓核对") +
        '</div>';
    }

    h += '<div class="gm-entry">';
    h += '<div class="ge-card run">' +
      '<div class="ge-ico">★</div>' +
      '<div class="ge-t">闯关夺星</div>' +
      '<div class="ge-d">' + (qn ? '把本次备课包的 ' + qn + ' 道题分成 ' + stages.length + ' 关：' +
        stages.map(function (s) { return s.name; }).join(' → ') : '本次备课包暂无题目') + '</div>' +
      (qn ? '<button class="weui-btn weui-btn_primary weui-btn_mini" data-act="start" data-val="run">开始闯关</button>'
          : '<button class="weui-btn weui-btn_default weui-btn_mini" disabled>暂无题目</button>') +
      '</div>';

    h += '<div class="ge-card boss' + (boss.length ? '' : ' off') + '">' +
      '<div class="ge-ico">⚔</div>' +
      '<div class="ge-t">错题复仇</div>' +
      '<div class="ge-d">' + (boss.length
        ? '调出' + (G.api.studentMode ? '你' : stu.name) + '历史标记为不会/半会的 ' + boss.length + ' 道题，这次能消灭几只？'
        : '暂无历史错题。先上一节课积累课堂记录，下次课就有复仇关卡了。') + '</div>' +
      (boss.length ? '<button class="weui-btn weui-btn_primary weui-btn_mini" data-act="start" data-val="boss">开始复仇</button>'
        : '<button class="weui-btn weui-btn_default weui-btn_mini" disabled>暂无错题</button>') +
      '</div>';
    h += '</div>';

    if (boss.length) {
      h += '<div class="boss-preview"><div class="muted small">错题怪清单</div><div class="chips">';
      boss.forEach(function (b) {
        h += '<span class="chip ' + (b.last === "wrong" ? "weak" : "fuzzy") + '">' + esc(b.kpName) + ' · ' + esc(b.date) + '</span>';
      });
      h += '</div></div>';
    }
    h += '</div>';
    return h;
  }

  function judgeBtn(key, label, desc) {
    var on = G.judge === key;
    return '<button class="gj' + (on ? " on" : "") + '" data-act="judge" data-val="' + key + '">' +
      '<strong>' + label + '</strong><span>' + desc + '</span></button>';
  }

  /* ��戏进行中 */
  function playHtml() {
    var item = cur();
    if (!item) return '<div class="card game-card"><p class="muted">没有可用题目。</p></div>';
    var isBoss = G.mode === "boss";
    var q = item.q;
    var self = G.judge === "self";
    var n = doneQ() + 1, tot = totalQ();

    var h = '<div class="card game-card">';
    h += '<div class="gtop"><button class="chip-btn" data-act="quit">退出</button>' +
      '<div class="gtitle">' + (isBoss ? '错题复仇' : ('第 ' + (G.stage + 1) + ' 关 · ' + esc(G.stages[G.stage].name))) + '</div>' +
      '<div class="gmode-tag">' + (self ? '学生自评' : '老师判定') + '</div></div>';

    h += '<div class="gbar"><span style="width:' + Math.round((n - 1) / tot * 100) + '%"></span></div>' +
      '<div class="muted small">第 ' + n + ' / ' + tot + ' 题' +
      (G.combo >= 2 ? '　·　连对 ' + G.combo + ' 题' : '') + '</div>';

    if (isBoss) {
      h += '<div class="boss-list">';
      G.boss.forEach(function (b, i) {
        var st = b.hp === 0 ? "已消灭" : (b.hp === 1 ? "残血" : "待挑战");
        h += '<div class="boss-item' + (i === G.idx ? " cur" : "") + (b.hp === 0 ? " dead" : "") + '">' +
          '<div class="bn">' + (i + 1) + '. ' + esc(b.kpName) + '</div>' +
          '<div class="hp"><span style="width:' + (b.hp / b.max * 100) + '%"></span></div>' +
          '<div class="bs">' + st + '</div></div>';
      });
      h += '</div>';
    }

    if (G.banner) h += '<div class="gbanner">' + esc(G.banner) + '</div>';

    h += '<div class="gq">' +
      '<div class="gq-meta">' + esc(item.kpName || "") +
      (isBoss && item.date ? '　·　上次错于 ' + esc(item.date) : '') +
      '　·　' + lvName(q.level) + '</div>' +
      '<div class="stem">' + esc(q.stem) + '</div>';

    if (!G.revealed) {
      h += '<div class="gjudge">';
      if (self) {
        h += '<p class="muted small">先不公布答案——学生做完之后自己选：</p>' +
          ansBtn("ok", "我会做") + ansBtn("partial", "有点卡") + ansBtn("wrong", "不会做");
      } else {
        h += '<p class="muted small">学生作答后，老师在旁判定：</p>' +
          ansBtn("ok", "答对") + ansBtn("partial", "半对") + ansBtn("wrong", "答错");
      }
      h += '</div>';
    } else {
      h += '<div class="greveal ' + (G.last && G.last.val === "ok" ? "ok" : (G.last && G.last.val === "partial" ? "mid" : "bad")) + '">' +
        '<div class="gr-fb">' + esc(G.last ? G.last.text : "") + '</div>' +
        '<div><strong>正确答案：</strong>' + esc(q.answer) + '</div>' +
        '<div class="muted"><strong>解析：</strong>' + esc(q.solution) + '</div>' +
        (q.errorTag ? '<div class="muted small"><strong>易错点：</strong>' + esc(q.errorTag) + '</div>' : '') +
        '<div class="gr-mark">' + (G.api.studentMode ? '自评：' : '记为：') + markText(G.answers[q.id]) +
        (self ? '　<span class="muted small">（' + (G.api.studentMode ? '自评只作练习记录，不写入学情档案' : '学生自评，老师可更正') + '）</span>' : '') + '</div>';
      if (self && !G.api.studentMode) {
        h += '<div class="gfix">' +
          '<span class="muted small">老师更正：</span>' +
          '<button class="chip-btn" data-act="answer" data-val="ok">掌握</button>' +
          '<button class="chip-btn" data-act="answer" data-val="partial">半会</button>' +
          '<button class="chip-btn" data-act="answer" data-val="wrong">不会</button>' +
          '</div>';
      }
      h += '</div>';
      h += '<div class="actions"><button class="weui-btn weui-btn_primary" data-act="next">' +
        (n >= tot ? '完成挑战' : '下一题') + '</button></div>';
    }
    h += '</div>';

    h += '<div class="gfoot"><span data-live></span>' +
      '<span class="gstars">' + starsHtml(count()) + '</span></div>';
    h += '</div>';
    return h;
  }

  function ansBtn(val, label) {
    var cls = val === "ok" ? "ok" : (val === "partial" ? "mid" : "bad");
    return '<button class="gans ' + cls + '" data-act="answer" data-val="' + val + '">' + label + '</button>';
  }
  function markText(v) {
    return v === "ok" ? "掌握" : (v === "partial" ? "半会" : (v === "wrong" ? "不会" : "—"));
  }

  function starsHtml(c) {
    var got = c.ok + c.partial * 0.5;
    var full = Math.floor(got), half = got - full >= 0.5;
    var s = "";
    for (var i = 0; i < 3; i++) {
      s += '<i class="st ' + (i < full ? "on" : (i === full && half ? "half" : "")) + '">★</i>';
    }
    return s;
  }

  /* 结算页 */
  function resultHtml() {
    var s = G.summary || { ok: 0, partial: 0, wrong: 0, total: 0, rate: 0, star: 1, best: 0, killed: 0, bossTotal: 0, mode: "run" };
    var isBoss = s.mode === "boss";
    var words = s.star === 3 ? "太稳了，这节课可以直接加难度" :
      (s.star === 2 ? "整体不错，把半会的那几题再过一遍" : "别急，基础题先吃透，下次再来");

    var h = '<div class="card game-card"><div class="row-between"><h2>' +
      (isBoss ? '错题复仇 · 结算' : '闯关夺星 · 结算') + '</h2>' +
      '<span class="tag">' + tagText() + '</span></div>';

    h += '<div class="gresult"><div class="gr-stars">' + bigStars(s.star) + '</div>' +
      '<div class="gr-rate">' + s.rate + '%</div>' +
      '<div class="muted small">' + words + '</div></div>';

    h += '<div class="stat-row">' +
      stat("答对", s.ok, "ok") + stat("半会", s.partial, "mid") + stat("不会", s.wrong, "bad") +
      (isBoss ? stat("消灭", s.killed + "/" + s.bossTotal, s.killed === s.bossTotal ? "ok" : "mid") : stat("最高连对", s.best, "ok")) +
      '</div>';

    if (G.api.studentMode) {
      h += '<div class="tip"><strong>这是练习记录：</strong>自评结果保存在本机，不写进老师的学情档案——' +
        '正式的成绩只由老师课堂判定产生，避免学生自己打分把学情数据带偏。</div>';
      if (s.wrong || s.partial) {
        h += '<div class="tip warn"><strong>还没拿下的题：</strong>可以去「作业任务」里再练一遍，' +
          '老师下次备课也会优先照顾这些知识点。</div>';
      }
    } else {
      h += '<div class="tip"><strong>课堂记录已自动勾选：</strong>下方每题的掌握 / 半会 / 不会已按本次判定填好，' +
        '老师扫一眼微调即可点「保存并生成课后反馈」。</div>';
      if (isBoss) {
        h += '<div class="tip warn"><strong>复仇结果怎么用：</strong>本次消灭的错题会从下节课的复仇清单里移除；' +
          '没消灭的会继续留在薄弱清单里，并影响下次备课的推荐顺序。</div>';
      }
    }

    h += '<div class="actions">' +
      '<button class="weui-btn weui-btn_primary" data-act="again">再来一局</button>' +
      '<button class="weui-btn weui-btn_default" data-act="close">收起</button></div>';
    h += '</div>';
    return h;
  }

  /* 顶部徽标文案：老师端强调写入记录，学生端强调只作练习 */
  function tagText() {
    return G.api && G.api.studentMode ? "自评练习 · 不写入学情档案" : "游戏结果自动填入下方课堂记录";
  }

  function bigStars(n) {
    var s = "";
    for (var i = 0; i < 3; i++) s += '<i class="bst' + (i < n ? " on" : "") + '">★</i>';
    return s;
  }
  function stat(label, num, cls) {
    return '<div class="stat ' + cls + '"><div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div></div>';
  }

  window.KBGame = { mount: mount, reset: reset };
})();
