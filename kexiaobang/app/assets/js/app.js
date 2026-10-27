/* 界面逻辑：学生档案 → 智能备课 → 课堂记录 → 课后反馈 */
(function () {
  "use strict";

  var S = window.KBStore, D = window.KBData, A = window.KBAnalyze, E = window.KBEngine;
  var T = window.KBTeacher;
  var STATUS = window.KBStatus;

  var state = {
    tab: "students",
    studentId: null,
    selected: [],
    selectedInit: false,
    plan: null,
    results: {},
    feedback: null,
    tone: "encourage",
    saved: false,
    changes: [],
    showAdd: false,
    confirmDel: false,
    draft: { name: "", grade: "小学四年级", unit: 0, traits: "" }
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  /* 取当前学生，同时把数据层切到该学生所用教材 */
  function student() {
    var s = state.studentId ? S.get(state.studentId) : null;
    if (s && window.KB_Syllabus) window.KB_Syllabus.setCurrent(s.syllabus || FALLBACK_KEY);
    return s;
  }

  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = "toast"; }, 2600);
  }

  /* 空状态引导卡：任何一步都能点开，但会告诉你先做什么 */
  function guideCard(title, desc, btnText, target) {
    return '<div class="card empty"><h2>' + title + '</h2>' +
      '<p class="muted">' + desc + '</p>' +
      '<div class="actions"><button class="weui-btn weui-btn_primary" data-go="' + target + '">' + btnText + '</button></div></div>';
  }

  function bindGo() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function (b) {
      b.onclick = function () { setTab(b.getAttribute("data-go")); };
    });
  }

  function tabReady(t) {
    if (t === "plan") return !!state.studentId;
    if (t === "record") return !!state.plan;
    if (t === "feedback") return !!state.feedback;
    return true;
  }

  /* ---------- 登录（一期为身份标识，不是安全认证） ---------- */
  function loginHtml() {
    var others = T.all().filter(function (t) { return !t.demo; });
    var h = '<div class="login-card">' +
      '<div class="login-brand"><div class="logo">课</div>' +
      '<h1>课小帮</h1>' +
      '<p class="muted small">一对一家教 · 备课 → 授课 → 学情 → 家校反馈</p></div>' +
      '<div class="form-row"><label for="login-name">老师姓名</label>' +
      '<input id="login-name" class="weui-input" type="text" maxlength="12" placeholder="例如：张老师"></div>' +
      '<div class="actions"><button class="weui-btn weui-btn_primary" id="btn-login">进入工作台</button></div>' +
      '<p class="muted small">输入姓名即可进入；同名视为同一位老师，学生档案按老师分开保存。</p>' +
      '<div class="login-sep"><span>或</span></div>' +
      '<button class="weui-btn weui-btn_default" id="btn-demo">使用演示账号（含 3 位学生与历史学情）</button>';
    if (others.length) {
      h += '<div class="login-accounts"><p class="muted small">本机已有账号（点选直接进入）</p><div class="chips">';
      others.forEach(function (t) {
        h += '<button class="chip-btn" data-acc="' + t.id + '">' + esc(t.name) + '</button>';
      });
      h += '</div></div>';
    }
    h += '<p class="login-note">演示版不校验密码：登录用于区分不同老师的数据，二期接入微信登录与云数据库后才是真实账号体系。</p>' +
      '</div>';
    return h;
  }

  function bindLogin() {
    var input = $("login-name");
    function go() {
      var r = T.enter(input ? input.value : "");
      if (r.error) { toast(r.error); if (input) input.focus(); return; }
      bootWorkspace(r.teacher, r.created);
    }
    if ($("btn-login")) $("btn-login").onclick = go;
    if (input) {
      input.onkeydown = function (e) { if (e.key === "Enter") go(); };
      try { input.focus(); } catch (e) {}
    }
    if ($("btn-demo")) $("btn-demo").onclick = function () {
      var demo = T.ensureDemo();
      T.login(demo.id);
      bootWorkspace(demo, false);
    };
    Array.prototype.forEach.call(document.querySelectorAll("[data-acc]"), function (b) {
      b.onclick = function () {
        T.login(b.getAttribute("data-acc"));
        bootWorkspace(T.current(), false);
      };
    });
  }

  function showLogin() {
    var v = $("login-view");
    if (!v) return;
    v.style.display = "";
    v.innerHTML = loginHtml();
    $("app-shell").style.display = "none";
    bindLogin();
  }

  function bootWorkspace(teacher, created) {
    if (!teacher) { showLogin(); return; }
    $("login-view").style.display = "none";
    $("app-shell").style.display = "";
    state.studentId = null;
    state.showAdd = false;
    resetFlow();
    $("cur-teacher").textContent = teacher.name + " 老师";
    var r = $("btn-reset");
    if (r) r.textContent = teacher.demo ? "恢复演示数据" : "清空本账号数据";
    setTab("students");
    if (created) toast("欢迎，" + teacher.name + "。先添加第一位学生吧");
  }

  /* ---------- 标签页 ---------- */
  function setTab(tab) {
    state.tab = tab;
    ["students", "plan", "record", "feedback"].forEach(function (t) {
      var b = $("tab-" + t), v = $("view-" + t);
      if (b) b.className = "tab" + (t === tab ? " active" : "") + (tabReady(t) ? "" : " locked");
      if (v) v.style.display = t === tab ? "block" : "none";
    });
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  /* ---------- 学生档案 ---------- */
  function renderStudents() {
    var list = S.all();
    var html = '<div class="grid">';

    html += '<div class="list-head"><span class="weui-cells__title">学生列表（' + list.length + '）</span>' +
      '<button class="weui-btn weui-btn_primary weui-btn_mini" id="btn-add-toggle">' +
      (state.showAdd ? '收起表单' : '＋ 添加学生') + '</button></div>';
    if (state.showAdd) html += addFormHtml();

    html += '<div class="weui-cells stu-list">';
    if (!list.length) {
      html += '<div class="weui-cell"><div class="weui-cell__bd"><p class="muted small">还没有学生，点上方「添加学生」创建第一个。</p></div></div>';
    }
    list.forEach(function (s) {
      var c = A.counts(s);
      var active = s.id === state.studentId ? " active" : "";
      html += '<div class="weui-cell weui-cell_access stu-item' + active + '" data-id="' + s.id + '">' +
        '<div class="weui-cell__bd">' +
        '<p class="stu-name">' + esc(s.name) + '</p>' +
        '<div class="bar">' +
        '<span class="seg ok" style="width:' + pct(c.mastered, c) + '%"></span>' +
        '<span class="seg mid" style="width:' + pct(c.fuzzy, c) + '%"></span>' +
        '<span class="seg bad" style="width:' + pct(c.weak, c) + '%"></span>' +
        '</div>' +
        '<p class="muted small">掌握 ' + c.mastered + ' · 模糊 ' + c.fuzzy + ' · 薄弱 ' + c.weak + '</p>' +
        '</div>' +
        '<div class="weui-cell__ft">' + esc(s.grade) + ' · ' + (s.lessons ? s.lessons.length : 0) + ' 次课</div>' +
        '</div>';
    });
    html += '</div>';

    var stu = student();
    html += '<div class="card">';
    if (!stu) {
      html += '<h2>学情概览</h2><p class="muted">选择左侧学生查看学情档案。系统会根据薄弱知识点自动推荐下次课的备课重点。</p>';
    } else {
      var c = A.counts(stu), weak = A.weakPoints(stu, 5), his = A.history(stu);
      html += '<h2>' + esc(stu.name) + ' · 学情概览</h2>';
      html += '<p class="muted small">' + esc(stu.grade || "") + ' · ' + esc(D.meta().textbook + D.meta().subject + " " + D.meta().term) +
        (stu.syllabus && !syllabusKeyOf(stu.grade) ? '（该年级体系待接入，暂按此教材推荐）' : '') + '</p>';
      html += '<p class="muted small">' + esc(stu.traits || "") + '</p>';
      html += '<div class="stat-row">' + stat("掌握", c.mastered, "ok") + stat("模糊", c.fuzzy, "mid") + stat("薄弱", c.weak, "bad") + '</div>';
      html += '<h3>薄弱知识点（备课优先推荐）</h3><div class="chips">';
      if (!weak.length) html += '<span class="muted small">暂无明显薄弱点</span>';
      weak.forEach(function (w) {
        html += '<span class="chip ' + w.status + '">' + esc(w.kp.name) + ' · ' + STATUS[w.status] + '</span>';
      });
      html += '</div>';
      html += '<h3>历史正确率趋势</h3><div class="trend">';
      his.forEach(function (h) {
        html += '<div class="trend-item"><span class="trend-date">' + esc(h.date) + '</span>' +
          '<div class="trend-bar"><span style="width:' + h.rate + '%"></span></div>' +
          '<span class="trend-val">' + h.rate + '%</span></div>';
      });
      if (!his.length) html += '<span class="muted small">暂无历史记录</span>';
      html += '</div>';
      html += '<div class="actions">' +
        '<button class="weui-btn weui-btn_primary" id="btn-to-plan">为 TA 生成备课包</button>' +
        '<button class="weui-btn weui-btn_default weui-btn_mini" id="btn-del-stu">' +
        (state.confirmDel ? '再点一次确认删除' : '删除该学生') + '</button></div>';
    }
    html += '</div></div>';
    $("view-students").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll(".stu-item"), function (el) {
      el.onclick = function () {
        state.studentId = el.getAttribute("data-id");
        resetFlow();
        setTab("students");
      };
    });
    if ($("btn-to-plan")) $("btn-to-plan").onclick = function () { setTab("plan"); };
    if ($("btn-del-stu")) $("btn-del-stu").onclick = function () {
      if (!state.confirmDel) { state.confirmDel = true; renderStudents(); toast("再点一次「删除」即可移除该学生"); return; }
      var name = student() ? student().name : "";
      S.remove(state.studentId);
      state.confirmDel = false;
      state.studentId = null;
      resetFlow();
      setTab("students");
      toast("已删除学生：" + name);
    };
    if ($("btn-add-toggle")) $("btn-add-toggle").onclick = function () {
      state.showAdd = !state.showAdd;
      if (state.showAdd) state.draft = { name: "", grade: "小学四年级", unit: 0, traits: "" };
      renderStudents();
    };
    if (state.showAdd) bindAddForm();
  }

  /* 新建学生后清空本次流程状态 */
  function resetFlow() {
    state.selected = []; state.selectedInit = false;
    state.plan = null; state.results = {}; state.feedback = null;
    state.saved = false; state.changes = []; state.confirmDel = false;
  }

  var GRADES = ["小学一年级", "小学二年级", "小学三年级", "小学四年级",
    "小学五年级", "小学六年级", "初一", "初二", "初三"];

  /* 年级 → 教材 key。未列出的年级表示知识点体系尚未接入，
   * 添加时会明确提示，并暂用默认教材推荐（不做假装适配）。 */
  var GRADE_SYLLABUS = {
    "小学四年级": "math-g4b"
  };
  var FALLBACK_KEY = "math-g4b";

  function syllabusKeyOf(grade) {
    return GRADE_SYLLABUS[grade] || null;
  }

  function addFormHtml() {
    var d = state.draft;
    var key = syllabusKeyOf(d.grade);
    var supported = !!key;
    var syl = supported ? window.KB_Syllabus.get(key) : window.KB_Syllabus.get(FALLBACK_KEY);
    var units = syl.units;

    var h = '<div class="card add-form"><h3>添加新学生</h3>' +
      '<div class="form-row"><label for="nf-name">姓名</label>' +
      '<input id="nf-name" class="weui-input" type="text" maxlength="12" placeholder="例如：张小明" value="' + esc(d.name) + '"></div>' +
      '<div class="form-row"><label for="nf-grade">年级</label><select id="nf-grade" class="weui-input">';
    GRADES.forEach(function (g) {
      h += '<option' + (g === d.grade ? ' selected' : '') + '>' + g + '</option>';
    });
    h += '</select></div>';

    h += '<div class="form-row"><label for="nf-unit">当前进度</label><select id="nf-unit" class="weui-input">' +
      '<option value="-1"' + (d.unit === -1 ? ' selected' : '') + '>暂不评估（留空档案，随上课记录填充）</option>';
    units.forEach(function (u, i) {
      h += '<option value="' + i + '"' + (d.unit === i ? ' selected' : '') + '>' + esc(u.name) + '</option>';
    });
    h += '</select></div>';

    h += '<div class="form-row"><label for="nf-traits">学生特点</label>' +
      '<input id="nf-traits" class="weui-input" type="text" maxlength="40" placeholder="选填：计算粗心、读题慢…" value="' + esc(d.traits) + '"></div>';

    h += '<p class="muted small">已接入教材：<strong>' + esc(syl.textbook + syl.subject + " · " + syl.grade + syl.term) + '</strong>。' +
      (supported ? '' : ' 该年级的知识点体系尚未接入，将暂按上述教材推荐备课内容。') + '</p>' +
      '<p class="muted small">选择起始单元后，系统把该单元及之前单元的知识点初始化为「模糊」；选「暂不评估」则档案留空。</p>' +
      '<div class="actions">' +
      '<button class="weui-btn weui-btn_primary" id="btn-add-save">保存并选中</button>' +
      '<button class="weui-btn weui-btn_default" id="btn-add-cancel">取消</button></div></div>';
    return h;
  }

  /* 重绘前把输入值收进草稿，避免切换年级时丢内容 */
  function syncDraft() {
    var n = $("nf-name"), t = $("nf-traits"), u = $("nf-unit");
    if (n) state.draft.name = n.value;
    if (t) state.draft.traits = t.value;
    if (u) state.draft.unit = +(u.value || 0);
  }

  function bindAddForm() {
    var save = $("btn-add-save"), cancel = $("btn-add-cancel");
    var grade = $("nf-grade"), unit = $("nf-unit");
    if (cancel) cancel.onclick = function () { state.showAdd = false; renderStudents(); };
    /* 年级变了 → 进度下拉要跟着换成该年级教材的单元 */
    if (grade) grade.onchange = function () { syncDraft(); state.draft.grade = grade.value; state.draft.unit = 0; renderStudents(); };
    if (unit) unit.onchange = function () { syncDraft(); };
    if (save) save.onclick = function () {
      syncDraft();
      var name = (state.draft.name || "").trim();
      if (!name) { toast("请填写学生姓名"); return; }

      var key = syllabusKeyOf(state.draft.grade) || FALLBACK_KEY;
      var syl = window.KB_Syllabus.get(key);
      var mastery = {};
      if (state.draft.unit >= 0) {
        for (var i = 0; i <= state.draft.unit && i < syl.units.length; i++) {
          syl.units[i].kps.forEach(function (kp) { mastery[kp.id] = "fuzzy"; });
        }
      }
      var stu = {
        id: S.newId(),
        name: name,
        grade: state.draft.grade,
        syllabus: key,
        traits: (state.draft.traits || "").trim(),
        mastery: mastery,
        kpLog: {},
        lessons: []
      };
      S.add(stu);
      state.showAdd = false;
      state.studentId = stu.id;
      resetFlow();
      setTab("students");
      var tip = syllabusKeyOf(state.draft.grade) ? "" : "，该年级知识点待接入，暂按默认教材推荐";
      toast("已添加学生：" + name + tip);
    };
  }

  function gradeText(ratio) {
    return ratio >= 0.6 ? '差' : (ratio < 0.25 ? '好' : '中');
  }

  function pct(n, c) {
    var t = c.mastered + c.fuzzy + c.weak;
    return t ? Math.round((n / t) * 100) : 0;
  }
  function stat(label, n, cls) {
    return '<div class="stat ' + cls + '"><div class="stat-num">' + n + '</div><div class="stat-label">' + label + '</div></div>';
  }

  /* ---------- 智能备课 ---------- */
  function renderPlan() {
    var stu = student();
    if (!stu) {
      $("view-plan").innerHTML = guideCard("还没有选择学生", "请先到「学生档案」里选一名学生，系统会依据 TA 的薄弱知识点推荐备课重点。", "去选择学生", "students");
      bindGo();
      return;
    }
    if (!state.plan) {
      var rec = A.priorityKps(stu).slice(0, 6);
      if (!state.selectedInit) {
        state.selectedInit = true;
        state.selected = rec.slice(0, 3).map(function (r) { return r.id; });
      }
      var html = '<div class="card"><h2>第 1 步 · 选择本次课知识点</h2>' +
        '<p class="muted small">系统已按薄弱程度排序，默认勾选最需要巩固的知识点。</p><div class="chips">';
      rec.forEach(function (r) {
        var on = state.selected.indexOf(r.id) !== -1;
        html += '<button class="chip-btn ' + r.status + (on ? " on" : "") + '" data-kp="' + r.id + '">' +
          esc(r.kp.name) + ' <em>' + STATUS[r.status] + '</em></button>';
      });
      html += '</div>';

      html += '<details class="more"><summary>查看全部知识点（按单元）</summary>';
      D.units().forEach(function (u) {
        html += '<div class="unit"><div class="unit-name">' + esc(u.name) + '</div><div class="chips">';
        u.kps.forEach(function (kp) {
          var st = stu.mastery[kp.id];
          var on = state.selected.indexOf(kp.id) !== -1;
          html += '<button class="chip-btn ' + (st || "") + (on ? " on" : "") + '" data-kp="' + kp.id + '">' +
            esc(kp.name) + (st ? ' <em>' + STATUS[st] + '</em>' : '') + '</button>';
        });
        html += '</div></div>';
      });
      html += '</details>';

      html += '<div class="actions"><button class="weui-btn weui-btn_primary" id="btn-gen">生成备课包</button>' +
        '<span class="muted small" id="gen-tip"></span></div></div>';
      $("view-plan").innerHTML = html;

      Array.prototype.forEach.call(document.querySelectorAll(".chip-btn"), function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-kp"), i = state.selected.indexOf(id);
          if (i === -1) state.selected.push(id); else state.selected.splice(i, 1);
          renderPlan();
        };
      });
      $("btn-gen").onclick = function () {
        if (!state.selected.length) { toast("请至少勾选一个知识点"); return; }
        $("gen-tip").textContent = "正在根据学情档案生成…";
        $("btn-gen").disabled = true;
        setTimeout(function () {
          state.plan = E.generatePlan(S.get(state.studentId), state.selected);
          state.results = {}; state.feedback = null; state.saved = false;
          renderPlan();
        }, 900);
      };
      return;
    }

    var p = state.plan;
    var html = '<div class="card"><h2>备课包 · ' + esc(p.createdAt) + '</h2>' +
      '<p class="muted small">' + esc(p.notice) + '</p>';

    html += '<h3>教学目标</h3><ol class="goals">';
    p.goals.forEach(function (g) { html += '<li>' + esc(g) + '</li>'; });
    html += '</ol>';

    p.sections.forEach(function (s, si) {
      html += '<div class="section"><div class="row-between"><h3>' + esc(s.kpName) + '</h3>' +
        '<span class="tag ' + s.status + '">' + STATUS[s.status] + ' · ' + esc(s.levelName) + '</span></div>' +
        '<div class="muted small">' + esc(s.unitName) + '</div>' +
        '<div class="tip"><strong>讲解要点：</strong>' + esc(s.tip) + '</div>' +
        '<div class="tip warn"><strong>易错提醒：</strong>' + esc(s.errors.join("；")) + '</div>' +
        (s.history.total ? '<div class="muted small">历史练习 ' + s.history.total + ' 题，其中 ' + s.history.wrong + ' 题未答对</div>' : '') +
        (s.recent && s.recent.length ? '<div class="muted small">近 ' + s.recent.length + ' 次课堂表现：' +
          s.recent.map(function (r) { return gradeText(r.ratio); }).join(' → ') + '</div>' : '');
      html += '<ul class="qlist">';
      s.questions.forEach(function (item, qi) {
        var q = item.q;
        html += '<li class="qitem">' +
          '<div class="row-between"><span class="qtag">' + D.levelName(q.level) + (item.extra ? ' · 补充' : '') + '</span>' +
          '<span class="muted small">' + esc(item.from || "") + '</span></div>' +
          '<div class="stem">' + esc(q.stem) + '</div>' +
          '<div class="qans" id="ans-' + si + '-' + qi + '" style="display:none">' +
          '<div><strong>答案：</strong>' + esc(q.answer) + '</div>' +
          '<div class="muted"><strong>解析：</strong>' + esc(q.solution) + '</div></div>' +
          '<div class="qbtns">' +
          '<button class="weui-btn weui-btn_default weui-btn_mini" data-toggle="' + si + '-' + qi + '">显示答案</button>' +
          '<button class="weui-btn weui-btn_default weui-btn_mini" data-swap="' + si + '-' + qi + '">换一题</button>' +
          '</div></li>';
      });
      if (!s.questions.length) html += '<li class="muted small">该知识点题库待补充，可先用讲解要点授课。</li>';
      html += '</ul></div>';
    });

    html += '<div class="actions">' +
      '<button class="weui-btn weui-btn_primary" id="btn-to-record">进入课堂记录</button>' +
      '<button class="weui-btn weui-btn_default" id="btn-export">导出备课包文本</button>' +
      '<button class="weui-btn weui-btn_default" id="btn-regen">重新选择知识点</button></div>';
    html += '<textarea id="export-box" class="export" style="display:none"></textarea></div>';
    $("view-plan").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll("[data-toggle]"), function (b) {
      b.onclick = function () {
        var box = $("ans-" + b.getAttribute("data-toggle"));
        var show = box.style.display === "none";
        box.style.display = show ? "block" : "none";
        b.textContent = show ? "隐藏答案" : "显示答案";
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-swap]"), function (b) {
      b.onclick = function () {
        var key = b.getAttribute("data-swap").split("-");
        if (!E.swapQuestion(state.plan, +key[0], +key[1])) toast("暂无更多同难度备选题");
        renderPlan();
      };
    });
    $("btn-to-record").onclick = function () { setTab("record"); };
    $("btn-regen").onclick = function () { state.plan = null; renderPlan(); };
    $("btn-export").onclick = function () {
      var t = exportText();
      var box = $("export-box");
      box.style.display = "block";
      box.value = t;
      copy(t);
      toast("备课包文本已生成并复制到剪贴板");
    };
  }

  function exportText() {
    var p = state.plan, stu = student();
    var t = "课小帮 · 备课包\n学生：" + stu.name + "　日期：" + p.createdAt + "\n\n【教学目标】\n";
    p.goals.forEach(function (g, i) { t += (i + 1) + ". " + g + "\n"; });
    p.sections.forEach(function (s) {
      t += "\n【" + s.kpName + "】（" + s.unitName + "）\n";
      t += "讲解要点：" + s.tip + "\n易错提醒：" + s.errors.join("；") + "\n";
      s.questions.forEach(function (item) {
        t += "· [" + D.levelName(item.q.level) + "] " + item.q.stem + "　答案：" + item.q.answer + "\n";
      });
    });
    return t;
  }

  /* ---------- 课堂记录 ---------- */
  function renderRecord() {
    if (!state.plan) {
      $("view-record").innerHTML = guideCard("还没有备课包", "课堂记录是围绕备课包里的题目来勾选的，请先到「智能备课」生成一节备课包。", "去生成备课包", "plan");
      bindGo();
      return;
    }
    var p = state.plan;
    var html = '<div class="card"><h2>课堂记录 · 勾选掌握情况</h2>' +
      '<p class="muted small">每题一键勾选，系统据此更新学情档案并生成课后反馈。</p>';
    var n = 0;
    p.sections.forEach(function (s) {
      html += '<div class="section"><h3>' + esc(s.kpName) + '</h3><ul class="qlist">';
      s.questions.forEach(function (item) {
        n++;
        var r = state.results[item.q.id] || "";
        html += '<li class="qitem"><div class="stem">' + n + '. ' + esc(item.q.stem) + '</div>' +
          '<div class="mark">' +
          markBtn(item.q.id, "ok", "掌握", r) +
          markBtn(item.q.id, "partial", "半会", r) +
          markBtn(item.q.id, "wrong", "不会", r) +
          '</div><div class="muted small">正确答案：' + esc(item.q.answer) + '</div></li>';
      });
      html += '</ul></div>';
    });
    html += '<div class="actions"><button class="weui-btn weui-btn_primary" id="btn-fb">保存并生成课后反馈</button>' +
      (state.saved ? '<span class="muted small">已写入学情档案</span>' : '') + '</div></div>';
    $("view-record").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll("[data-mark]"), function (b) {
      b.onclick = function () {
        state.results[b.getAttribute("data-mark")] = b.getAttribute("data-val");
        renderRecord();
      };
    });
    $("btn-fb").onclick = function () {
      var stu = S.get(state.studentId);
      state.feedback = E.buildFeedback(stu, p, state.results);
      if (!state.saved) {
        var res = E.applyResults(stu, p, state.results);
        res.lesson.summary = state.feedback.summary;
        S.update(stu);
        state.saved = true;
        state.changes = res.changed || [];
      }
      setTab("feedback");
    };
  }

  function markBtn(qid, val, label, cur) {
    return '<button class="weui-btn weui-btn_mini weui-btn_default mark-btn ' + val + (cur === val ? " on" : "") + '" data-mark="' + qid + '" data-val="' + val + '">' + label + '</button>';
  }

  /* ---------- 课后反馈 ---------- */
  function renderFeedback() {
    if (!state.feedback) {
      $("view-feedback").innerHTML = guideCard("还没有课后反馈", "课后反馈由课堂记录的勾选结果自动生成，请先完成「课堂记录」的勾选。", "去填写课堂记录", "record");
      bindGo();
      return;
    }
    var f = state.feedback, stu = student();
    var html = '<div class="card"><h2>课后学情分析</h2>' +
      '<div class="stat-row">' + stat("正确率", f.rate + "%", f.rate >= 80 ? "ok" : (f.rate >= 50 ? "mid" : "bad")) +
      stat("答对", f.ok, "ok") + stat("半会", f.partial, "mid") + stat("错误", f.wrong, "bad") + '</div>' +
      '<p>' + esc(f.summary) + '</p>' +
      (state.changes.length ? '<div class="tip"><strong>学情档案已更新：</strong>' +
        state.changes.map(function (c) {
          var it = D.kpIndex()[c.kpId];
          return esc(it ? it.kp.name : c.kpId) + '：' + (c.from ? STATUS[c.from] : '未评估') + ' → ' + STATUS[c.to];
        }).join('；') + '</div>' : '') +
      (f.good.length ? '<div class="tip"><strong>已掌握：</strong>' + esc(f.good.join("、")) + '</div>' : '') +
      (f.weak.length ? '<div class="tip warn"><strong>仍需巩固：</strong>' + esc(f.weak.join("、")) + '</div>' : '') +
      (f.topErrors.length ? '<div class="tip warn"><strong>主要错误类型：</strong>' + esc(f.topErrors.join("、")) + '</div>' : '');

    html += '<h3>下次课建议</h3><ul class="goals">';
    f.suggestions.forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
    html += '</ul></div>';

    html += '<div class="card"><h2>家长反馈话术</h2><div class="tones">' +
      toneBtn("encourage", "鼓励型") + toneBtn("neutral", "客观型") + toneBtn("attention", "需关注") +
      '</div><div class="talk" id="talk-box">' + esc(f.parent[state.tone]) + '</div>' +
      '<div class="actions"><button class="weui-btn weui-btn_primary" id="btn-copy">复制话术</button>' +
      '<button class="weui-btn weui-btn_default" id="btn-report">生成家长报告</button></div>' +
      '<div id="report-box" style="display:none"></div></div>';
    $("view-feedback").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll("[data-tone]"), function (b) {
      b.onclick = function () { state.tone = b.getAttribute("data-tone"); renderFeedback(); };
    });
    $("btn-copy").onclick = function () { copy(f.parent[state.tone]); toast("话术已复制到剪贴板"); };
    $("btn-report").onclick = function () {
      var box = $("report-box");
      box.style.display = "block";
      box.innerHTML = '<div class="report" id="report">' + reportHtml() + '</div>' +
        '<div class="actions"><button class="weui-btn weui-btn_default" id="btn-print">打印 / 存为 PDF</button></div>';
      $("btn-print").onclick = function () { window.print(); };
    };
  }

  function toneBtn(key, label) {
    return '<button class="chip-btn' + (state.tone === key ? " on" : "") + '" data-tone="' + key + '">' + label + '</button>';
  }

  function reportHtml() {
    var f = state.feedback, stu = student();
    var h = '<h2>' + esc(stu.name) + ' · 学情报告</h2><p class="muted small">生成日期：' + new Date().toISOString().slice(0, 10) + '</p>';
    h += '<p>' + esc(f.summary) + '</p>';
    h += '<h3>知识点掌握情况</h3><ul>';
    var list = A.priorityKps(stu);
    list.forEach(function (x) { h += '<li>' + esc(x.kp.name) + '：' + STATUS[x.status] + '</li>'; });
    h += '</ul>';
    h += '<h3>给家长的建议</h3><p>' + esc(f.parent[state.tone]) + '</p>';
    return h;
  }

  function copy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function render() {
    if (state.tab === "students") renderStudents();
    else if (state.tab === "plan") renderPlan();
    else if (state.tab === "record") renderRecord();
    else if (state.tab === "feedback") renderFeedback();
    var stu = student();
    $("cur-student").textContent = stu ? "当前学生：" + stu.name : "未选择学生";
  }

  document.addEventListener("DOMContentLoaded", function () {
    ["students", "plan", "record", "feedback"].forEach(function (t) {
      var b = $("tab-" + t);
      if (b) b.onclick = function () { setTab(t); };
    });
    var r = $("btn-reset");
    if (r) r.onclick = function () {
      var t = T.current();
      S.reset();
      state.studentId = null;
      state.showAdd = false;
      resetFlow();
      setTab("students");
      toast(t && t.demo ? "已恢复为初始演示数据" : "已清空本账号的学生数据");
    };
    var out = $("btn-logout");
    if (out) out.onclick = function () {
      T.logout();
      state.studentId = null;
      state.showAdd = false;
      resetFlow();
      showLogin();
      toast("已退出，数据仍保留在本机");
    };

    var cur = T.current();
    if (cur) bootWorkspace(cur, false);
    else showLogin();
  });

  window.KBApp = { setTab: setTab, state: state };
})();
