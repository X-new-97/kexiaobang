/* 教材（学科 + 年级 + 册次）索引层
 * ── 为什么要有这一层 ──
 * 知识点体系按「学科 / 年级 / 册次 / 版本」解耦存放，页面与生成引擎只面向「当前教材」取数。
 * 这样新增一个年级时，只需按下面的 schema 再注册一份数据，其余代码一行都不用改。
 *
 * ── 扩展一份新教材的做法 ──
 *   1. 新建 data/knowledge/syllabus-<学科>-<年级><册次>.js，例如 syllabus-math-g5a.js
 *   2. 文件末尾写：window.KB_Syllabus.register({ key:"math-g5a", subject:"数学",
 *        grade:"小学五年级", term:"上册", textbook:"人教版", levels:{...}, units:[...], questions:{...} })
 *   3. 在 index.html 里加一行 <script src="...">
 *   4. 在 app.js 的 GRADE_SYLLABUS 里加一条 年级 → key 的映射
 * 知识点 schema：{ id, name, level:1|2|3, tip, errors:[...] }
 * 题目   schema：{ id, level, stem, answer, solution, errorTag }
 */
(function () {
  "use strict";

  var registry = {};
  var DEFAULT_KEY = "math-g4b";

  var Syllabus = {
    register: function (item) {
      if (!item || !item.key) return;
      registry[item.key] = item;
    },
    keys: function () { return Object.keys(registry); },
    /* 供界面展示的教材清单 */
    list: function () {
      return Object.keys(registry).map(function (k) {
        var s = registry[k];
        return {
          key: k,
          label: s.subject + " · " + s.grade + s.term + "（" + s.textbook + "）",
          subject: s.subject, grade: s.grade, term: s.term, textbook: s.textbook
        };
      });
    },
    get: function (key) { return registry[key] || null; },
    has: function (key) { return !!registry[key]; },
    defaultKey: function () { return DEFAULT_KEY; },
    currentKey: DEFAULT_KEY,
    setCurrent: function (key) {
      if (registry[key]) Syllabus.currentKey = key;
      else Syllabus.currentKey = DEFAULT_KEY;
    },
    current: function () { return registry[Syllabus.currentKey] || registry[DEFAULT_KEY]; },
    /* 教材未接入时用于界面提示 */
    labelOf: function (key) {
      var s = registry[key] || registry[DEFAULT_KEY];
      return s.subject + " · " + s.grade + s.term + "（" + s.textbook + "）";
    }
  };

  /* 注册已接入的教材：人教版四年级下册数学（数据见 knowledge-math-g4.js / question-bank.js） */
  Syllabus.register({
    key: DEFAULT_KEY,
    subject: window.KB_KNOWLEDGE.subject,
    grade: "小学四年级",
    term: window.KB_KNOWLEDGE.term,
    textbook: window.KB_KNOWLEDGE.version,
    levels: window.KB_KNOWLEDGE.levels,
    units: window.KB_KNOWLEDGE.units,
    questions: window.KB_QUESTIONS
  });

  window.KB_Syllabus = Syllabus;
})();
