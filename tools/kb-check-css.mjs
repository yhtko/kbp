// tools/kb-check-css.mjs
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { globby } from "globby";

let fail = false;
const htmlMarkers = [/<!doctype\s+html/i, /<html[\s>]/i];
const err = (m)=>{ console.error("✖", m); fail = true; };
const ok  = (m)=>{ console.log("✔", m); };

const manifests = await globby(["plugins/*/manifest.json"]);
for (const m of manifests) {
  const manifest = JSON.parse(readFileSync(m, "utf8"));
  const cssList = manifest?.config?.css ?? [];
  const pluginDir = dirname(m);

  for (const p of cssList) {
    if (/^https?:\/\//i.test(p)) { err(`${m}: config.css に外部URLは使用不可 -> ${p}`); continue; }

    // ★ p と src/p の両方を候補にする
    const candidates = [ join(pluginDir, p), join(pluginDir, "src", p) ];
    const hit = candidates.find(abs => existsSync(abs));

    if (!hit) { err(`${m}: config.css が見つかりません -> ${p}（または src/${p}）`); continue; }
    if (!p.endsWith(".css")) err(`${m}: ${p} は .css 拡張子ではありません`);

    const head = readFileSync(hit, "utf8").slice(0, 512);
    if (htmlMarkers.some(re => re.test(head))) err(`${m}: ${p} がHTMLを含みます（MIME不一致の典型）`);
    else ok(`${m}: ${p} OK（${hit.includes('/src/') ? 'src/ で検出' : '直下で検出'}）`);
  }
}
process.exit(fail ? 1 : 0);
