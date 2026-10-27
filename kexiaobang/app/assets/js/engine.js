/* 生成引擎：备课包生成 + 课后学情分析与家长反馈生成
 * 演示版使用「知识点数据 + 题库 + 规则模板」离线生成，保证内容可解释、无幻觉；
 * 正式版把 generatePlan / buildFeedback 换成调用大模型即可，上层页面无需改动。
 */
(function () {
  "use strict";

  var D = window.KBData, A = window.KBAnalyze;

  function pick(kpId, level, used) {
    var arr = D.questionsOf(kpId);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].level === level && used.indexOf(arr[i].id) === -1) return arr[i];
    }
    return null;
  }

  function goalFor(kp) {
    var lv = D.levelName(kp.level);
    return "能正确运用「" + kp.name + "」解决" + lv + "类问题，重点规避：" + kp.errors.join("、") + "。";
  }

  /* 生成备课包 */
  function generatePlan(student, kpIds) {
    var idx = D.kpIndex(), used = [];
    var sections = [], goals = [];

    kpIds.forEach(function (id) {
      var item = idx[id];
      if (!item) return;
      var kp = item.kp, status = student.mastery[id] || "fuzzy";
      goals.push(goalFor(kp));

      var qs = [];
      [1, 2, 3].forEach(function (lv) {
        var q = pick(id, lv, used);
        if (q) { used.push(q.id); qs.push({ q: q, extra: false }); }
      });

      /* 薄弱知识点额外补一道基础题 */
      if (status === "weak") {
        var alts = D.alternatives(1, used);
        if (alts.length) {
          var extra = alts[Math.floor(Math.random() * alts.length)];
          used.push(extra.q.id);
          qs.push({ q: extra.q, extra: true, from: idx[extra.kpId] ? idx[extra.kpId].kp.name : "" });
        }
      }

    var hist = A.kpHistory(student, id);
    hist.recent = ((student.kpLog || {})[id] || []).slice();
    sections.push({
        kpId: id,
        kpName: kp.name,
        unitName: item.unit.name,
        levelName: D.levelName(kp.level),
        tip: kp.tip,
        errors: kp.errors,
        status: status,
        history: hist,
        recent: hist.recent,
        questions: qs
      });
    });

    return {
      studentId: student.id,
      kpIds: kpIds,
      createdAt: new Date().toISOString().slice(0, 10),
      goals: goals,
      sections: sections,
      questionCount: used.length,
      notice: "本备课包由系统依据学情档案自动生成，教师可在下方编辑、换题后使用。"
    };
  }

  /* 换一题：同难度随机替换 */
  function swapQuestion(plan, sectionIdx, qIdx) {
    var sec = plan.sections[sectionIdx];
    var target = sec.questions[qIdx];
    if (!target) return null;
    var usedIds = [];
    plan.sections.forEach(function (s) { s.questions.forEach(function (x) { usedIds.push(x.q.id); }); });
    var alts = D.alternatives(target.q.level, usedIds);
    if (!alts.length) return null;
    var next = alts[Math.floor(Math.random() * alts.length)];
    target.q = next.q;
    if (next.kpId !== sec.kpId) target.from = "（选自：" + (D.kpIndex()[next.kpId] || {}).kp.name + "）";
    else target.from = "";
    return target;
  }

  /* 课后反馈生成 */
  function buildFeedback(student, plan, results) {
    var idx = D.kpIndex();
    var total = 0, ok = 0, partial = 0, wrong = 0;
    var weak = [], good = [], errorTags = {};

    plan.sections.forEach(function (s) {
      var kpWrong = 0, kpTotal = 0;
      s.questions.forEach(function (item) {
        var r = results[item.q.id];
        if (!r) return;
        total++; kpTotal++;
        if (r === "ok") ok++;
        else if (r === "partial") { partial++; kpWrong += 0.5; }
        else { wrong++; kpWrong++; errorTags[item.q.errorTag] = (errorTags[item.q.errorTag] || 0) + 1; }
      });
      if (kpTotal > 0 && kpWrong / kpTotal >= 0.5) weak.push(s.kpName);
      else if (kpTotal > 0 && kpWrong === 0) good.push(s.kpName);
    });

    var rate = total ? Math.round(((ok + partial * 0.5) / total) * 100) : 0;
    var topErrors = Object.keys(errorTags).sort(function (a, b) { return errorTags[b] - errorTags[a]; }).slice(0, 3);

    var summary = "本次课共练习 " + total + " 题，答对 " + ok + " 题、半对 " + partial + " 题、错误 " + wrong +
      " 题，综合正确率 " + rate + "%。" +
      (good.length ? "已掌握：" + good.join("、") + "。" : "") +
      (weak.length ? "仍需巩固：" + weak.join("、") + "。" : "");

    var suggestion = [];
    if (weak.length) suggestion.push("下次课优先复习：" + weak.join("、"));
    if (topErrors.length) suggestion.push("重点纠正错误类型：" + topErrors.join("、"));
    if (rate >= 80) suggestion.push("可提升难度，加入变式题进行拓展");
    else if (rate < 50) suggestion.push("降低难度，先补足基础题再进入进阶练习");

    var kpNames = plan.sections.map(function (s) { return s.kpName; }).join("、");
    var parent = {
      encourage: "家长您好！" + student.name + "今天上课状态不错，我们一起完成了「" + kpNames + "」的练习。" +
        (good.length ? "其中" + good.join("、") + "掌握得很好，" : "") +
        "综合正确率 " + rate + "%。" +
        (weak.length ? "「" + weak.join("、") + "」还需要再巩固，建议本周在家每天做 2~3 道同类型题，做完后让孩子讲一遍思路。" : "整体掌握扎实，可以适当做几道变式题练练手。") +
        "有情况随时联系我。",
      neutral: "家长您好，反馈一下本次课情况。上课内容：" + kpNames + "。课堂练习 " + total + " 题，正确率 " + rate + "%。" +
        (good.length ? "已掌握：" + good.join("、") + "。" : "") +
        (weak.length ? "仍需巩固：" + weak.join("、") + "。" : "") +
        (topErrors.length ? "主要错误类型：" + topErrors.join("、") + "。" : "") +
        "下次课安排：" + (suggestion[0] || "按原计划推进") + "。",
      attention: "家长您好，有几点需要您配合关注。" + student.name + "在「" + (weak.join("、") || kpNames) +
        "」这部分掌握还不牢固，本次正确率 " + rate + "%。" +
        (topErrors.length ? "主要问题是：" + topErrors.join("、") + "。" : "") +
        "建议本周固定时间做 10 分钟同类练习，做题时让孩子边做边说思路，不要只看答案。我们下次课会先回顾这部分，辛苦您配合。"
    };

    return {
      rate: rate, total: total, ok: ok, partial: partial, wrong: wrong,
      good: good, weak: weak, topErrors: topErrors,
      summary: summary, suggestions: suggestion, parent: parent
    };
  }

  /* 单次课的表现评级：good=达到掌握水平 / mid=一般 / bad=薄弱表现 */
  function gradeOf(ratio) {
    return ratio >= 0.6 ? "bad" : (ratio < 0.25 ? "good" : "mid");
  }

  /* 近三次综合判定：
   * 只有 1 次记录 → 直接采纳本次表现；
   * 最近 3 次里有 2 次以上做到「好」 → 掌握；有 2 次以上「差」 → 薄弱；否则模糊。
   * 教学依据：单次课表现有偶然性，看最近三次更能反映当前真实水平。
   */
  function decideStatus(log) {
    var recent = log.slice(-3);
    if (!recent.length) return null;
    if (recent.length === 1) {
      var g0 = gradeOf(recent[0].ratio);
      return g0 === "bad" ? "weak" : (g0 === "good" ? "mastered" : "fuzzy");
    }
    var good = 0, bad = 0;
    recent.forEach(function (r) {
      var g = gradeOf(r.ratio);
      if (g === "good") good++; else if (g === "bad") bad++;
    });
    if (bad >= 2) return "weak";
    if (good >= 2) return "mastered";
    return "fuzzy";
  }

  /* 把本次结果写回学情档案 */
  function applyResults(student, plan, results) {
    var today = new Date().toISOString().slice(0, 10);
    student.kpLog = student.kpLog || {};
    var changed = [];

    plan.sections.forEach(function (s) {
      var total = 0, wrong = 0;
      s.questions.forEach(function (item) {
        var r = results[item.q.id];
        if (!r) return;
        total++;
        if (r === "wrong") wrong += 1;
        else if (r === "partial") wrong += 0.5;
      });
      if (!total) return;

      var ratio = wrong / total;
      var log = student.kpLog[s.kpId] || [];
      log.push({ date: today, ratio: Math.round(ratio * 100) / 100 });
      if (log.length > 3) log = log.slice(-3);
      student.kpLog[s.kpId] = log;

      var before = student.mastery[s.kpId];
      var next = decideStatus(log);
      student.mastery[s.kpId] = next;
      if (before !== next) changed.push({ kpId: s.kpId, from: before, to: next });
    });

    var lesson = {
      id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: today,
      kpIds: plan.kpIds,
      results: results,
      note: "",
      summary: ""
    };
    student.lessons = student.lessons || [];
    student.lessons.push(lesson);
    return { lesson: lesson, changed: changed };
  }

  window.KBEngine = {
    generatePlan: generatePlan,
    swapQuestion: swapQuestion,
    buildFeedback: buildFeedback,
    applyResults: applyResults
  };
})();
