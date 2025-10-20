import { globby } from "globby";
import AdmZip from "adm-zip";

let fail = false;
const err = (m)=>{ console.error("✖", m); fail = true; };
const ok  = (m)=>{ console.log("✔", m); };

const zips = await globby(["plugins/*/dist/*.zip"]);
for (const zipPath of zips) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().map(e => e.entryName);
  const manifestEntry = entries.find(e => /manifest\.json$/.test(e));
  if (!manifestEntry) { err(`${zipPath}: manifest.json なし`); continue; }
  const manifest = JSON.parse(zip.readAsText(manifestEntry));
  const base = manifestEntry.replace(/manifest\.json$/, "");
  for (const p of (manifest?.config?.css ?? [])) {
    const expected = (base + p).replace(/\/\.\//g, "/");
    const hit = entries.includes(expected) || entries.includes(p);
    if (!hit) err(`${zipPath}: ZIP内に ${p} が見つかりません`);
    else ok(`${zipPath}: ${p} OK`);
  }
}
process.exit(fail ? 1 : 0);