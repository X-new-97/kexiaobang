/* 把 app/ 多文件原型打包成单个 HTML 文件
 * 用法：node tools/build-standalone.js
 * 产出：课小帮-单文件版.html（根目录，可直接双击打开、微信发送、离线运行）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "app");
const OUT = path.join(ROOT, "课小帮-单文件版.html");

let html = fs.readFileSync(path.join(APP, "index.html"), "utf8");

// 内联样式表
html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, function (_m, href) {
  const css = fs.readFileSync(path.join(APP, href.split("?")[0]), "utf8");
  return "<style>\n" + css + "\n</style>";
});

// 内联脚本（保持原有先后顺序）
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_m, src) {
  const js = fs.readFileSync(path.join(APP, src.split("?")[0]), "utf8");
  if (/<\/script>/i.test(js)) throw new Error("脚本内含 </script>，需要转义：" + src);
  return "<script>\n" + js + "\n</script>";
});

// 打包后不应再有任何真实的外部资源引用（注释里的示例文字不算）
const leftovers = (html.match(/<(?:link|script)[^>]*(?:href|src)="([^"]+)"/g) || [])
  .filter((s) => /\.(css|js|png|jpe?g|svg|woff2?)(\?|"|$)/i.test(s) || /^https?:/i.test(s));
if (leftovers.length) {
  console.warn("⚠ 仍有外部引用：\n" + leftovers.join("\n"));
} else {
  console.log("✓ 自检通过：无外部资源引用，可离线运行");
}

fs.writeFileSync(OUT, html, "utf8");
console.log("✓ 已生成 " + OUT + "（" + (Buffer.byteLength(html, "utf8") / 1024).toFixed(1) + " KB）");
