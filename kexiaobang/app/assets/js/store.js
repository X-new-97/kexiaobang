/* 数据层：本地存储 + 知识点/题库索引 + 学情统计
 * 一期使用浏览器 localStorage，二期可替换为云数据库，接口保持不变。
 */
(function () {
  "use strict";

  /* 存储分区：
   *   老师账号表   kexiaobang.teachers.v1
   *   当前登录态   kexiaobang.session.v1
   *   学生数据     kexiaobang.students.v2.<teacherId>   ← 按老师隔离
   * 二期接云数据库时，只需把 "<teacherId>" 换成查询条件，接口不变。
   */
  var TEACHER_KEY = "kexiaobang.teachers.v1";
  var SESSION_KEY = "kexiaobang.session.v1";
  var STUDENTS_PREFIX = "kexiaobang.students.v2.";
  var LEGACY_KEY = "kexiaobang.students.v1";
  var DEMO_ID = "t-demo";

  var STATUS = { mastered: "掌握", fuzzy: "模糊", weak: "薄弱" };
  var STATUS_ORDER = ["weak", "fuzzy", "mastered"];
  var RESULT_WEIGHT = { ok: 1, partial: 0.5, wrong: 0 };

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---------- 老师账号 ----------
   * 一期定位：身份标识，用于区分不同老师的学生档案，不是安全认证。
   * 不校验密码；同名（去除首尾空格后完全相同）视为同一账号。
   * 二期接微信登录 / 账号密码后，替换本模块即可，其余代码不用动。
   */
  var Teacher = {
    all: function () { return readJSON(TEACHER_KEY, []); },
    save: function (list) { writeJSON(TEACHER_KEY, list); },
    get: function (id) {
      var list = Teacher.all();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    currentId: function () {
      try { return localStorage.getItem(SESSION_KEY) || null; } catch (e) { return null; }
    },
    current: function () {
      var id = Teacher.currentId();
      return id ? Teacher.get(id) : null;
    },
    findByName: function (name) {
      var list = Teacher.all(), key = String(name || "").trim();
      for (var i = 0; i < list.length; i++) if (list[i].name === key) return list[i];
      return null;
    },
    /* 输入姓名进入：已存在则登入，否则创建新账号（学生档案为空） */
    enter: function (name) {
      var key = String(name || "").trim();
      if (!key) return { error: "请输入姓名" };
      var exist = Teacher.findByName(key);
      if (exist) {
        try { localStorage.setItem(SESSION_KEY, exist.id); } catch (e) {}
        return { teacher: exist, created: false };
      }
      var t = {
        id: uid("t"),
        name: key,
        demo: false,
        createdAt: new Date().toISOString().slice(0, 10)
      };
      var list = Teacher.all();
      list.push(t);
      Teacher.save(list);
      try { localStorage.setItem(SESSION_KEY, t.id); } catch (e) {}
      return { teacher: t, created: true };
    },
    login: function (id) {
      try { localStorage.setItem(SESSION_KEY, id); } catch (e) {}
    },
    logout: function () {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    },
    /* 演示账号：自带 3 位学生与累计学情，用于现场展示闭环 */
    ensureDemo: function () {
      var list = Teacher.all(), demo = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === DEMO_ID) demo = list[i];
      if (!demo) {
        demo = { id: DEMO_ID, name: "林老师", demo: true, createdAt: new Date().toISOString().slice(0, 10) };
        list.unshift(demo);
        Teacher.save(list);
      }
      var key = STUDENTS_PREFIX + DEMO_ID;
      /* 旧版本（无账号体系）的数据直接迁移给演示账号，避免用户已有记录丢失 */
      var legacy = null;
      try { legacy = localStorage.getItem(LEGACY_KEY); } catch (e) {}
      if (legacy && !localStorage.getItem(key)) {
        try {
          localStorage.setItem(key, legacy);
          localStorage.removeItem(LEGACY_KEY);
        } catch (e) {}
      }
      if (!localStorage.getItem(key)) {
        writeJSON(key, window.KB_SAMPLE_STUDENTS || []);
      }
      return demo;
    }
  };

  function studentsKey() {
    var t = Teacher.current();
    return STUDENTS_PREFIX + (t ? t.id : "guest");
  }

  var Store = {
    all: function () {
      var key = studentsKey(), t = Teacher.current();
      var raw = null;
      try { raw = localStorage.getItem(key); } catch (e) {}
      if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
      }
      /* 首次进入该账号：演示账号带示例学生，其他账号从空档案开始 */
      var seed = (t && t.demo) ? (window.KB_SAMPLE_STUDENTS || []) : [];
      writeJSON(key, seed);
      return JSON.parse(JSON.stringify(seed));
    },
    saveAll: function (list) {
      writeJSON(studentsKey(), list);
    },
    get: function (id) {
      var list = Store.all();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    update: function (student) {
      var list = Store.all();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === student.id) { list[i] = student; break; }
      }
      Store.saveAll(list);
    },
    /* 加随机后缀，避免同一毫秒内连续添加产生重复 id */
    newId: function () {
      var id;
      do {
        id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      } while (Store.get(id));
      return id;
    },
    add: function (student) {
      var list = Store.all();
      list.push(student);
      Store.saveAll(list);
      return student;
    },
    remove: function (id) {
      var list = Store.all();
      var next = [];
      for (var i = 0; i < list.length; i++) if (list[i].id !== id) next.push(list[i]);
      Store.saveAll(next);
    },
    reset: function () {
      try { localStorage.removeItem(studentsKey()); } catch (e) {}
    },
    /* 当前账号下的学生数，用于登录页展示 */
    count: function () {
      var key = studentsKey(), raw = null;
      try { raw = localStorage.getItem(key); } catch (e) {}
      if (!raw) return 0;
      try { return JSON.parse(raw).length; } catch (e) { return 0; }
    }
  };

  /* 当前教材：新增年级只需注册新 syllabus，这里无需改动 */
  function syll() {
    return (window.KB_Syllabus && window.KB_Syllabus.current()) || window.KB_KNOWLEDGE;
  }
  function bank() {
    return syll().questions || window.KB_QUESTIONS;
  }

  var KB = {
    /* 当前教材元信息，用于界面显示 */
    meta: function () { return syll(); },
    units: function () { return syll().units; },
    kpIndex: function () {
      var map = {};
      var units = syll().units;
      for (var i = 0; i < units.length; i++) {
        for (var j = 0; j < units[i].kps.length; j++) {
          var kp = units[i].kps[j];
          map[kp.id] = { kp: kp, unit: units[i] };
        }
      }
      return map;
    },
    allKps: function () {
      var out = [], units = syll().units;
      for (var i = 0; i < units.length; i++) {
        for (var j = 0; j < units[i].kps.length; j++) out.push(units[i].kps[j]);
      }
      return out;
    },
    levelName: function (n) { return syll().levels[n] || "基础"; },
    questionById: function (qid) {
      var b = bank();
      for (var kp in b) {
        var arr = b[kp];
        for (var i = 0; i < arr.length; i++) if (arr[i].id === qid) return { q: arr[i], kpId: kp };
      }
      return null;
    },
    questionsOf: function (kpId) { return bank()[kpId] || []; },
    /* 同难度备选题，用于“换一题” */
    alternatives: function (level, excludeIds) {
      var out = [], b = bank();
      for (var kp in b) {
        var arr = b[kp];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].level === level && excludeIds.indexOf(arr[i].id) === -1) {
            out.push({ q: arr[i], kpId: kp });
          }
        }
      }
      return out;
    }
  };

  var Analyze = {
    counts: function (student) {
      var c = { mastered: 0, fuzzy: 0, weak: 0 };
      for (var k in student.mastery) if (c[student.mastery[k]] !== undefined) c[student.mastery[k]]++;
      return c;
    },
    /* 按薄弱程度排序的知识点列表，用于备课推荐 */
    priorityKps: function (student) {
      var idx = KB.kpIndex(), out = [];
      for (var id in student.mastery) {
        if (!idx[id]) continue;
        out.push({ id: id, kp: idx[id].kp, unit: idx[id].unit, status: student.mastery[id] });
      }
      out.sort(function (a, b) {
        var d = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (d !== 0) return d;
        return a.kp.level - b.kp.level;
      });
      return out;
    },
    weakPoints: function (student, limit) {
      var list = Analyze.priorityKps(student).filter(function (x) { return x.status !== "mastered"; });
      return list.slice(0, limit || 5);
    },
    /* 历史做题正确率趋势 */
    history: function (student) {
      return (student.lessons || []).map(function (l) {
        var total = 0, score = 0;
        for (var qid in l.results) {
          total++; score += RESULT_WEIGHT[l.results[qid]] || 0;
        }
        return { date: l.date, rate: total ? Math.round((score / total) * 100) : 0, total: total, note: l.note };
      });
    },
    /* 某个知识点在历史练习中的表现 */
    kpHistory: function (student, kpId) {
      var wrong = 0, total = 0;
      (student.lessons || []).forEach(function (l) {
        for (var qid in l.results) {
          if (qid.indexOf(kpId) === 0) {
            total++;
            if (l.results[qid] !== "ok") wrong++;
          }
        }
      });
      return { total: total, wrong: wrong };
    }
  };

  window.KBStore = Store;
  window.KBTeacher = Teacher;
  window.KBData = KB;
  window.KBAnalyze = Analyze;
  window.KBStatus = STATUS;
  window.KBResultWeight = RESULT_WEIGHT;

  /* 启动时确保演示账号与示例数据存在（同时迁移旧版无账号数据） */
  try { Teacher.ensureDemo(); } catch (e) {}
})();
