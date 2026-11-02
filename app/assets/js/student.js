/* 学生端工作台：课堂互动 / 课后记录 / 作业任务
 * ---------------------------------------------------------------
 * 与老师端共用同一份学生数据（kexiaobang.students.v2.<老师id>），只是换个视角看：
 *   课堂互动 —— 复用 KBGame，强制「学生自评」，结果只留在本地不写回学情；
 *   课后记录 —— 直接展示老师保存的 lessons，数据不需要任何转换；
 *   作业任务 —— 取最近一次课里标为「半会 / 不会」的题自动生成，老师无需额外布置。
 * 作业完成状态存在独立分区 kexiaobang.homework.v1.<老师id>.<学生id>，
 * 属于练习记录，不参与学情计算——正式成绩只由老师课堂判定产生。
 */
(function () {
  "use strict";

  var S = window.KBStore, D = window.KBData, HW = window.KBHomework;
  var FALLBACK_KEY = "math-g4b";

  var ST = {
    tab: "play",
    teacherId: null, studentId: null,
    student: null,        /* 缓存同一个对象引用，避免游戏模块误判为“换人”而重置进度 */
    practicePlan: null,   /* 练习包只存在于内存，不落盘、不影响老师端 */
    playResults: {},      /* 自评结果，本地留存 */
    onLogout: null
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = "toast"; }, 2600);
  }
  function lessonsDesc(stu) {
    return (stu.lessons || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function stat(label, num, cls) {
    return '<div class="stat ' + cls + '"><div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div></div>';
  }

  /* ---------- 进入 / 退出 ---------- */

  function boot(teacherId, studentId, onLogout) {
    ST.teacherId = teacherId; ST.studentId = studentId; ST.onLogout = onLogout;
    ST.student = S.getOf(teacherId, studentId);
    if (!ST.student) { if (onLogout) onLogout(); return; }
    /* 切到该学生所用教材，题库索引随之切换 */
    if (window.KB_Syllabus) window.KB_Syllabus.setCurrent(ST.student.syllabus || FALLBACK_KEY);

    ST.practicePlan = null; ST.playResults = {}; ST.tab = "play";
    if (window.KBGame) window.KBGame.reset();

    $("login-view").style.display = "none";
    $("app-shell").style.display = "none";
    $("student-shell").style.display = "";
    $("stu-name").textContent = ST.student.name;
    $("stu-sub").textContent = "课堂互动 · 课后记录 · 作业任务";
    $("btn-stu-logout").onclick = logout;
    ["play", "records", "homework"].forEach(function (t) {
      var b = $("stab-" + t);
      if (b) b.onclick = function () { setTab(t); };
    });
    setTab("play");
  }

  function logout() {
    if (window.KBStuSession) window.KBStuSession.clear();
    if (window.KBGame) window.KBGame.reset();
    $("student-shell").style.display = "none";
    if (ST.onLogout) ST.onLogout();
  }

  function setTab(t) {
    ST.tab = t;
    ["play", "records", "homework"].forEach(function (x) {
      var b = $("stab-" + x), v = $("sview-" + x);
      if (b) b.className = "tab" + (x === t ? " active" : "");
      if (v) v.style.display = x === t ? "block" : "none";
    });
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  function render() {
    if (ST.tab === "records") renderRecords();
    else if (ST.tab === "homework") renderHomework();
    else renderPlay();
  }

  /* ---------- 课堂互动 ---------- */

  /* 练习包：优先最近一次课的知识点，其次薄弱知识点，最后兜底取有题的知识点。
   * 只在内存里，不写入任何存储。 */
  function buildPracticePlan(stu) {
    if (ST.practicePlan) return ST.practicePlan;
    var idx = D.kpIndex(), kpIds = [];
    var lessons = lessonsDesc(stu);
    if (lessons.length && lessons[0].kpIds && lessons[0].kpIds.length) {
      kpIds = lessons[0].kpIds.slice(0, 3);
    }
    if (!kpIds.length) {
      var m = stu.mastery || {};
      Object.keys(m).forEach(function (id) {
        if (kpIds.length < 3 && (m[id] === "weak" || m[id] === "fuzzy") && idx[id]) kpIds.push(id);
      });
    }
    if (!kpIds.length) {
      var all = D.allKps ? D.allKps() : [];
      for (var i = 0; i < all.length && kpIds.length < 3; i++) {
        if (D.questionsOf(all[i].id).length) kpIds.push(all[i].id);
      }
    }
    var sections = [];
    kpIds.forEach(function (id) {
      var item = idx[id];
      if (!item) return;
      var qs = [];
      [1, 2, 3].forEach(function (lv) {
        var arr = D.questionsOf(id);
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].level === lv) { qs.push({ q: arr[i] }); break; }
        }
      });
      if (qs.length) sections.push({ kpId: id, kpName: item.kp.name, unitName: item.unit.name, questions: qs });
    });
    ST.practicePlan = sections.length ? { kpIds: sections.map(function (s) { return s.kpId; }), sections: sections } : null;
    return ST.practicePlan;
  }

  function renderPlay() {
    var stu = ST.student, plan = buildPracticePlan(stu);
    var host = $("sview-play");
    var html = '<div id="stu-game-host"></div>';
    html += '<div class="card"><h2>怎么用</h2>' +
      '<p class="muted small">闯关夺星练的是你最近一次课的知识点，错题复仇打的是你自己历史上的错题怪。' +
      '做完先自己选「我会做 / 有点卡 / 不会做」，然后才会揭晓答案和解析。</p>' +
      '<div class="tip"><strong>自评不计入成绩：</strong>这里的结果只保存在你自己的设备上，' +
      '不会写进老师的学情档案——老师看到的掌握情况，仍然以上课时的判定为准。</div></div>';
    host.innerHTML = html;

    var g = $("stu-game-host");
    if (window.KBGame && g && plan) {
      window.KBGame.mount(g, {
        plan: plan,
        student: stu,
        results: ST.playResults,
        studentMode: true,      /* 文案切换：强调是练习记录 */
        hideJudge: true,        /* 学生端不显示判定方式切换 */
        forceJudge: "self",     /* 强制学生自评 */
        bossIgnorePlan: true,   /* 学生没有备课包，历史错题全部算进来 */
        onUpdate: function (qid, val) { ST.playResults[qid] = val; },
        onFinish: function () { renderPlay(); }
      });
    } else if (g) {
      g.innerHTML = '<div class="card"><p class="muted">暂无可练习的题目。</p></div>';
    }
  }

  /* ---------- 课后记录 ---------- */

  /* 课次正确率序列（时间正序：旧 → 新），与老师端趋势图同一算法 */
  function historyOf(stu) {
    return (stu.lessons || []).map(function (l) {
      var c = { ok: 0, partial: 0, wrong: 0 };
      Object.keys(l.results || {}).forEach(function (k) {
        if (c[l.results[k]] !== undefined) c[l.results[k]]++;
      });
      var total = c.ok + c.partial + c.wrong;
      return { date: l.date, rate: total ? Math.round(((c.ok + c.partial * 0.5) / total) * 100) : 0, total: total };
    }).sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  }

  /* 正确率折线图：内联 SVG，复用老师端同一套 .chart 样式（渐变 id 加 Stu 后缀避免重复） */
  function trendChart(his) {
    var n = his.length;
    var pts = his.map(function (h, i) {
      return { x: n === 1 ? 50 : (i / (n - 1)) * 100, y: (1 - h.rate / 100) * 100, h: h };
    });
    var line = pts.map(function (p, i) {
      return (i ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2);
    }).join(" ");
    var area = line + " L" + pts[n - 1].x.toFixed(2) + " 100 L" + pts[0].x.toFixed(2) + " 100 Z";
    var grid = [0, 50, 100].map(function (v) {
      return '<line x1="0" y1="' + v + '" x2="100" y2="' + v +
        '" stroke="#E6EBF1" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    }).join("");
    var dots = pts.map(function (p, i) {
      var cls = i === 0 ? " first" : (i === n - 1 ? " last" : "");
      return '<span class="chart-dot" style="left:' + p.x.toFixed(2) + '%;top:' + p.y.toFixed(2) + '%"></span>' +
        '<span class="chart-val' + cls + '" style="left:' + p.x.toFixed(2) + '%;top:' + p.y.toFixed(2) + '%">' + p.h.rate + '%</span>' +
        '<span class="chart-date' + cls + '" style="left:' + p.x.toFixed(2) + '%">' + esc(String(p.h.date).slice(5)) + '</span>';
    }).join("");

    return '<div class="chart">' +
      '<div class="chart-y"><span>100%</span><span>50%</span><span>0%</span></div>' +
      '<div class="chart-plot">' +
        '<svg class="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
          '<defs><linearGradient id="trendFillStu" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#7DA9D9" stop-opacity=".22"/>' +
            '<stop offset="100%" stop-color="#7DA9D9" stop-opacity="0"/>' +
          '</linearGradient></defs>' + grid +
          '<path d="' + area + '" fill="url(#trendFillStu)"/>' +
          '<path d="' + line + '" fill="none" stroke="#7DA9D9" stroke-width="2.5" ' +
            'vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
        '</svg>' + dots +
      '</div></div>';
  }

  function renderRecords() {
    var stu = ST.student, idx = D.kpIndex();
    var lessons = lessonsDesc(stu);
    var html = "";

    /* 先看整体趋势，再看每次课的明细 */
    if (lessons.length) {
      var his = historyOf(stu);
      var rates = his.map(function (h) { return h.rate; });
      var first = rates[0], lastR = rates[rates.length - 1];
      var best = Math.max.apply(null, rates);
      var avg = Math.round(rates.reduce(function (a, b) { return a + b; }, 0) / rates.length);
      var diff = lastR - first;
      var verdict, cls;
      if (his.length < 2) {
        verdict = "目前只有 1 次课的记录，再上几次课这里就会出现你的进步曲线。";
        cls = "mid";
      } else if (diff > 5) {
        verdict = "从第 1 次的 " + first + "% 提升到最近一次的 " + lastR + "%，进步了 " + diff + " 个百分点，继续保持！";
        cls = "ok";
      } else if (diff < -5) {
        verdict = "最近一次 " + lastR + "% 比第一次低了 " + Math.abs(diff) + " 个百分点，这几块要多练练。";
        cls = "bad";
      } else {
        verdict = "成绩稳定在 " + avg + "% 左右，冲一冲就能再上一个台阶。";
        cls = "mid";
      }
      html += '<div class="card"><h2>我的进步曲线</h2>' +
        '<p class="muted small">每次课的正确率变化。用的就是老师课堂记录里那份数据，两端看到的完全一致。</p>' +
        '<div class="stat-row">' + stat("上课次数", his.length, "") + stat("平均正确率", avg + "%", cls) +
        stat("最好一次", best + "%", "ok") + '</div>';
      if (his.length >= 2) {
        html += trendChart(his) + '<div class="tip"><strong>' + verdict + '</strong></div>';
      } else {
        html += '<p class="muted small">' + verdict + '</p>';
      }
      html += '</div>';
    }

    html += '<div class="card"><h2>我的上课记录</h2>';
    if (!lessons.length) {
      html += '<p class="muted">还没有上课记录。老师上完课并在「课堂记录」里保存之后，' +
        '这里会列出每次学的内容和老师的备注。</p>';
    } else {
      html += '<p class="muted small">这份数据和老师端看到的是同一份——老师课上勾选并保存，你这边立刻就能看到。</p>';
      html += '<div class="lesson-list">';
      lessons.forEach(function (l) {
        var names = (l.kpIds || []).map(function (id) {
          return idx[id] ? idx[id].kp.name : id;
        }).join("、");
        var c = { ok: 0, partial: 0, wrong: 0 };
        Object.keys(l.results || {}).forEach(function (k) {
          if (c[l.results[k]] !== undefined) c[l.results[k]]++;
        });
        var total = c.ok + c.partial + c.wrong;
        var rate = total ? Math.round(((c.ok + c.partial * 0.5) / total) * 100) : 0;
        html += '<div class="lesson-row">' +
          '<div class="lesson-date">' + esc(String(l.date).slice(5)) + '</div>' +
          '<div class="lesson-kps">' + esc(names || "—") +
          '<small>答对 ' + c.ok + ' · 半会 ' + c.partial + ' · 不会 ' + c.wrong +
          (l.note ? '　|　老师备注：' + esc(l.note) : '') + '</small></div>' +
          '<div class="lesson-rate">' + esc(l.summary || ("正确率 " + rate + "%")) + '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    $("sview-records").innerHTML = html;
  }

  /* ---------- 作业任务 ---------- */

  function renderHomework() {
    var stu = ST.student, idx = D.kpIndex();
    var lessons = lessonsDesc(stu);
    var last = lessons[0];
    var host = $("sview-homework");
    var html = '<div class="card"><h2>本次作业</h2>';

    if (!last) {
      html += '<p class="muted">还没有作业。上完第一节课后，老师课上标为「半会 / 不会」的题会自动出现在这里。</p>';
    } else {
      var items = [];
      Object.keys(last.results || {}).forEach(function (qid) {
        var v = last.results[qid];
        if (v !== "partial" && v !== "wrong") return;
        var f = D.questionById(qid);
        if (!f) return;
        items.push({ q: f.q, kpName: idx[f.kpId] ? idx[f.kpId].kp.name : "", val: v });
      });

      if (!items.length) {
        html += '<p class="muted">' + esc(last.date) + ' 那次课全部答对了，这次没有需要重做的题。<br>' +
          '想练手可以去「课堂互动」玩闯关夺星。</p>';
      } else {
        var done = HW.get(ST.teacherId, ST.studentId);
        var n = 0;
        items.forEach(function (x) { if (done[x.q.id]) n++; });
        html += '<p class="muted small">来自 ' + esc(last.date) + ' 的课堂记录：课上被标为「半会 / 不会」的题，' +
          '自动变成这次的作业——老师不用另外布置。</p>';
        html += '<div class="stat-row">' + stat("作业题数", items.length, "mid") + stat("已完成", n, "ok") + '</div>';
        html += '<ul class="qlist">';
        items.forEach(function (x, i) {
          var on = !!done[x.q.id];
          html += '<li class="qitem">' +
            '<div class="row-between"><span class="qtag">' + esc(x.kpName) + '</span>' +
            '<span class="tag ' + (x.val === "wrong" ? "weak" : "fuzzy") + '">' + (x.val === "wrong" ? "不会" : "半会") + '</span></div>' +
            '<div class="stem">' + (i + 1) + '. ' + esc(x.q.stem) + '</div>' +
            '<div class="muted small">' + (x.val === "wrong" ? "照着解析重做一遍" : "先讲一遍思路再做") + '</div>' +
            '<div class="qans" id="hw-ans-' + i + '" style="display:none">' +
            '<div><strong>答案：</strong>' + esc(x.q.answer) + '</div>' +
            '<div class="muted"><strong>解析：</strong>' + esc(x.q.solution) + '</div></div>' +
            '<div class="qbtns">' +
            '<button class="weui-btn weui-btn_default weui-btn_mini" data-hwans="' + i + '">查看解析</button>' +
            '<button class="weui-btn weui-btn_mini weui-btn_' + (on ? "primary" : "default") + '" data-hw="' + esc(x.q.id) + '">' +
            (on ? "已完成，点我撤销" : "我完成了") + '</button>' +
            '</div></li>';
        });
        html += '</ul>';
        if (n === items.length) html += '<div class="tip"><strong>全部完成了：</strong>下次课老师会重新考这几道题，加油。</div>';
        html += '<div class="tip warn"><strong>打勾只是练习记录：</strong>存在你自己的设备上，' +
          '不会写进学情档案；老师看到的掌握情况仍以课堂判定为准。</div>';
      }
    }
    html += '</div>';
    host.innerHTML = html;

    Array.prototype.forEach.call(host.querySelectorAll("[data-hw]"), function (b) {
      b.onclick = function () {
        var qid = b.getAttribute("data-hw");
        var cur = HW.get(ST.teacherId, ST.studentId)[qid];
        HW.mark(ST.teacherId, ST.studentId, qid, !cur);
        if (!cur) toast("已标记完成");
        renderHomework();
      };
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-hwans]"), function (b) {
      b.onclick = function () {
        var box = $("hw-ans-" + b.getAttribute("data-hwans"));
        var show = box.style.display === "none";
        box.style.display = show ? "block" : "none";
        b.textContent = show ? "收起解析" : "查看解析";
      };
    });
  }

  window.KBStudent = { boot: boot, logout: logout, render: render };
})();
