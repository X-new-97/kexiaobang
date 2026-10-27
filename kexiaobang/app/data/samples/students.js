/* 预置演示数据：用于解决演示“冷启动”问题
 * 打开原型即有一个已积累多次课学情的学生，可直接展示完整闭环。
 */
window.KB_SAMPLE_STUDENTS = [
  {
    id: "s1",
    name: "陈小雨",
    grade: "四年级",
    school: "XX 小学",
    traits: "计算速度快，但容易在小数点位置和单位进率上出错",
    parentStyle: "妈妈关注细节，希望每次课后知道具体错在哪",
    mastery: {
      "u1-03": "mastered", "u1-01": "mastered", "u3-01": "mastered", "u3-02": "fuzzy",
      "u3-03": "weak", "u3-04": "fuzzy", "u4-04": "weak", "u4-05": "weak",
      "u4-06": "weak", "u4-03": "fuzzy", "u5-03": "mastered", "u5-04": "mastered",
      "u6-01": "fuzzy", "u8-01": "mastered"
    },
    lessons: [
      { id: "l1", date: "2026-09-12", kpIds: ["u4-04"], results: { "u4-04-1": "ok", "u4-04-2": "wrong", "u4-04-3": "wrong" }, note: "小数点向左移动时位数不够不会补 0", summary: "正确率 33%" },
      { id: "l2", date: "2026-09-19", kpIds: ["u4-04", "u4-05"], results: { "u4-04-1": "ok", "u4-04-2": "partial", "u4-05-1": "ok", "u4-05-2": "wrong" }, note: "吨与千克的进率记错", summary: "正确率 50%" },
      { id: "l3", date: "2026-09-26", kpIds: ["u3-03"], results: { "u3-03-1": "ok", "u3-03-2": "wrong", "u3-03-3": "partial" }, note: "逆用分配律时找不到公因数 36", summary: "正确率 33%" },
      { id: "l4", date: "2026-10-10", kpIds: ["u4-06", "u6-01"], results: { "u4-06-1": "ok", "u4-06-2": "wrong", "u6-01-1": "ok", "u6-01-2": "partial" }, note: "9.95 保留一位小数写成 10，丢了精度 0", summary: "正确率 50%" },
      { id: "l5", date: "2026-10-17", kpIds: ["u4-05", "u3-04"], results: { "u4-05-1": "ok", "u4-05-2": "partial", "u4-05-3": "wrong", "u3-04-1": "ok", "u3-04-2": "ok" }, note: "复名数改写 3 千米 50 米不会处理", summary: "正确率 60%" }
    ]
  },
  {
    id: "s2",
    name: "林一诺",
    grade: "四年级",
    school: "XX 小学",
    traits: "理解力强，但遇到需要多步推理的应用题容易放弃",
    parentStyle: "爸爸更关注学习态度和习惯",
    mastery: {
      "u1-03": "mastered", "u3-03": "mastered", "u4-04": "mastered", "u4-05": "mastered",
      "u5-02": "weak", "u5-03": "fuzzy", "u5-06": "fuzzy", "u6-01": "mastered",
      "u8-01": "weak", "u9-01": "weak", "u9-02": "fuzzy"
    },
    lessons: [
      { id: "l1", date: "2026-09-13", kpIds: ["u5-02"], results: { "u5-02-1": "ok", "u5-02-2": "wrong", "u5-02-3": "wrong" }, note: "第三边取值范围的边界判断不清", summary: "正确率 33%" },
      { id: "l2", date: "2026-09-27", kpIds: ["u8-01"], results: { "u8-01-1": "ok", "u8-01-2": "partial", "u8-01-3": "wrong" }, note: "不会用总数倒推去掉的数", summary: "正确率 33%" },
      { id: "l3", date: "2026-10-11", kpIds: ["u9-01"], results: { "u9-01-1": "ok", "u9-01-2": "wrong", "u9-01-3": "wrong" }, note: "假设法会做第一问，换情境就不会迁移", summary: "正确率 33%" }
    ]
  },
  {
    id: "s3",
    name: "王梓涵",
    grade: "四年级",
    school: "XX 小学",
    traits: "基础薄弱，计算准确率低，需要更多基础题铺垫",
    parentStyle: "家长希望多鼓励，避免打击信心",
    mastery: {
      "u1-03": "weak", "u1-04": "fuzzy", "u3-01": "fuzzy", "u3-04": "weak",
      "u4-01": "weak", "u4-04": "fuzzy", "u6-01": "weak", "u6-02": "weak"
    },
    lessons: [
      { id: "l1", date: "2026-10-08", kpIds: ["u1-03"], results: { "u1-03-1": "partial", "u1-03-2": "wrong", "u1-03-3": "wrong" }, note: "混合运算顺序不熟，中括号没学过", summary: "正确率 0%" },
      { id: "l2", date: "2026-10-15", kpIds: ["u6-01"], results: { "u6-01-1": "partial", "u6-01-2": "wrong", "u6-01-3": "wrong" }, note: "习惯末位对齐，小数点没有对齐", summary: "正确率 0%" }
    ]
  }
];
