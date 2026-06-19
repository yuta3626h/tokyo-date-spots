const fs = require("fs");
const NOTION_TOKEN = process.env.NOTION_TOKEN;

/* ===========================================================
   ここだけ編集すればOK：サイトにしたいルーチン(DB)を並べる
   - out        : 出力するHTMLファイル名
   - databaseId : NotionのデータベースID(URLの /p/ の後ろの文字列)
   - eyebrow    : 小見出し(英字)
   - title      : ページ見出し
   - filterBy   : フィルター用プロパティ名(select か multi_select)。無指定で自動、""で無効。
   - sort       : { by:"プロパティ名", dir:"desc"|"asc" }。無指定で自動(数値→日付の順で降順)。
   後でルーチンを足したくなったら、このリストにブロックを1つ足すだけ。
   =========================================================== */
const SITES = [
  {
    out: "index.html",
    databaseId: "5fb254cf5f634ed59285646958bc8855",   // 📍 Date Spots Library
    eyebrow: "Date Spots",
    title: "東京・デートスポット図書館",
    filterBy: "Area",
    sort: { by: "Rating", dir: "desc" },
  },
  {
    out: "fashion.html",
    databaseId: "75c90455677d4adda453ff4a3c984de1",                // 👕 Fashion & Style Brief ← ここにIDを貼る
    eyebrow: "Fashion & Style",
    title: "ファッション・スタイル集",
    // filterBy / sort は自動
  },
  {
    out: "events.html",
    databaseId: "957baa6586c742c28143ad1963c9f4e2",   // 🎉 Events & Outings
    eyebrow: "Events & Outings",
    title: "イベント・おでかけ",
    sort: { by: "開催日", dir: "asc" },               // 近い日付順
  },
];

/* ---------- 以下は触らなくてOK(共通エンジン) ---------- */
const txt = r => (r || []).map(x => x.plain_text).join("");
const esc = s => (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const looksLikeImage = u =>
  /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(u) ||
  /img\.youtube\.com/.test(u) ||
  /lh3\.googleusercontent\.com/.test(u);

async function queryAll(databaseId){
  let out = [], cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: { Authorization:`Bearer ${NOTION_TOKEN}`, "Notion-Version":"2022-06-28", "Content-Type":"application/json" },
      body: JSON.stringify(cursor ? { start_cursor:cursor, page_size:100 } : { page_size:100 }),
    });
    if(!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const d = await res.json();
    out = out.concat(d.results);
    cursor = d.has_more ? d.next_cursor : null;
  } while(cursor);
  return out;
}

function readProps(p){
  const props = p.properties || {};
  let title="", note="", link="", image="";
  const tags=[], selects=[], numbers=[], checks=[], dates=[];
  for(const [key, val] of Object.entries(props)){
    switch(val.type){
      case "title": title = txt(val.title); break;
      case "rich_text": if(!note) note = txt(val.rich_text); break;
      case "url": {
        const u = val.url || ""; if(!u) break;
        if(!image && (looksLikeImage(u) || /(image|画像|photo|thumb|サムネ|cover|写真)/i.test(key))) image = u;
        else if(!link) link = u;
        break;
      }
      case "select": if(val.select) selects.push({ key, name: val.select.name }); break;
      case "multi_select": (val.multi_select || []).forEach(o => tags.push({ key, name: o.name })); break;
      case "number": if(val.number != null) numbers.push({ key, value: val.number }); break;
      case "checkbox": checks.push({ key, value: !!val.checkbox }); break;
      case "date": if(val.date && val.date.start) dates.push({ key, start: val.date.start, end: val.date.end }); break;
    }
  }
  if(!image && p.cover) image = (p.cover.external && p.cover.external.url) || (p.cover.file && p.cover.file.url) || "";
  return { title, note, link, image, tags, selects, numbers, checks, dates };
}

const fmtDate = s => { try { return new Date(s).toLocaleDateString("ja-JP",{ timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit" }); } catch { return s; } };

function metaParts(d){
  const parts = [];
  d.dates.forEach(x => parts.push(x.end ? `${fmtDate(x.start)}–${fmtDate(x.end)}` : fmtDate(x.start)));
  d.selects.forEach(x => parts.push(x.name));
  d.numbers.forEach(x => parts.push(/(rating|評価|score|星)/i.test(x.key) ? "★"+x.value : `${x.key}: ${x.value}`));
  d.checks.filter(x => x.value).forEach(x => parts.push((/(雨|rain)/i.test(x.key) ? "☔ " : "✓ ") + x.key));
  return parts;
}

function filterValuesFor(d, filterBy){
  if(filterBy === "") return [];
  if(filterBy){
    const sel = d.selects.find(s => s.key === filterBy);
    if(sel) return [sel.name];
    const multi = d.tags.filter(t => t.key === filterBy).map(t => t.name);
    if(multi.length) return multi;
    return [];
  }
  if(d.selects[0]) return [d.selects[0].name];
  if(d.tags[0]) return [d.tags[0].name];
  return [];
}

function card(p, site){
  const d = readProps(p);
  const name = d.title || "(無題)";
  const meta = metaParts(d);
  const tagNames = [...new Set(d.tags.map(t => t.name))].slice(0, 6);
  const fvals = filterValuesFor(d, site.filterBy);
  const flags = d.checks.filter(c => c.value).map(c => c.key);
  const thumb = d.image
    ? `<img class="thumb" loading="lazy" alt="${esc(name)}" onerror="imgFallback(this,'📍')" src="${esc(d.image)}">`
    : `<div class="ph">📍</div>`;
  const linkBtn = d.link ? `<div class="foot"><a class="btn" target="_blank" rel="noopener" href="${esc(d.link)}">開く →</a></div>` : "";
  return `<article class="card" data-filter="${esc(fvals.join("|"))}" data-flags="${esc(flags.join("|"))}">
${thumb}
<div class="body">
<h3 class="name">${esc(name)}</h3>
${meta.length ? `<div class="meta">${meta.map(b=>`<span>${esc(b)}</span>`).join('<span>·</span>')}</div>` : ""}
${tagNames.length ? `<div class="tags">${tagNames.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}
${linkBtn}
</div>
</article>`;
}

function sortPages(pages, site){
  const get = (p, key) => {
    const d = readProps(p);
    const n = d.numbers.find(x => x.key === key); if(n) return n.value;
    const dt = d.dates.find(x => x.key === key); if(dt) return new Date(dt.start).getTime();
    return null;
  };
  let by = site.sort && site.sort.by;
  let dir = (site.sort && site.sort.dir) || "desc";
  if(!by){
    const sample = readProps(pages[0] || { properties:{} });
    if(sample.numbers[0]) by = sample.numbers[0].key;
    else if(sample.dates[0]) { by = sample.dates[0].key; dir = "desc"; }
  }
  if(!by) return pages;
  const sign = dir === "asc" ? 1 : -1;
  return [...pages].sort((a,b) => {
    const va = get(a, by), vb = get(b, by);
    if(va == null && vb == null) return 0;
    if(va == null) return 1;
    if(vb == null) return -1;
    return (va - vb) * sign;
  });
}

function buildChips(pages, site){
  const vals = new Set(), flags = new Set();
  pages.forEach(p => {
    const d = readProps(p);
    filterValuesFor(d, site.filterBy).forEach(v => v && vals.add(v));
    d.checks.filter(c => c.value).forEach(c => flags.add(c.key));
  });
  let chips = `<button class="chip active" data-type="all">すべて</button>`;
  [...vals].forEach(v => chips += `<button class="chip" data-type="filter" data-val="${esc(v)}">${esc(v)}</button>`);
  [...flags].forEach(f => chips += `<button class="chip" data-type="flag" data-val="${esc(f)}">${(/(雨|rain)/i.test(f)?"☔ ":"")}${esc(f)}</button>`);
  return chips;
}

function pageHtml(pages, site){
  const sorted = sortPages(pages, site);
  const chips = buildChips(sorted, site);
  const today = new Date().toLocaleDateString("ja-JP",{ timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit" });
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(site.title)}</title>
<script>function imgFallback(el,e){const d=document.createElement('div');d.className='ph';d.textContent=e;el.replaceWith(d);}</script>
<style>
:root{--bg:#faf9f7;--card:#fff;--ink:#1a1a1a;--muted:#8a8a8a;--line:#ececec;--chip:#f1f0ed;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;}
.wrap{max-width:1040px;margin:0 auto;padding:48px 20px 80px;}
.eyebrow{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin:0 0 6px;}
h1{font-size:30px;font-weight:700;margin:0 0 6px;letter-spacing:-.02em;}
.sub{color:var(--muted);font-size:14px;margin:0;}
.nav{display:flex;gap:14px;margin:18px 0 0;font-size:13px;}
.nav a{color:var(--muted);text-decoration:none;border-bottom:1px solid transparent;padding-bottom:2px;}
.nav a:hover{color:var(--ink);}
.nav a.on{color:var(--ink);border-color:var(--ink);}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 28px;}
.chip{border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:13px;padding:7px 14px;border-radius:999px;cursor:pointer;transition:.15s;}
.chip:hover{border-color:#cfcfcf;}
.chip.active{background:var(--ink);color:#fff;border-color:var(--ink);}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:.18s;}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.06);}
.thumb{aspect-ratio:3/2;width:100%;object-fit:cover;display:block;background:linear-gradient(135deg,#e9e6e1,#d8d3cc);}
.ph{aspect-ratio:3/2;display:flex;align-items:center;justify-content:center;font-size:40px;background:linear-gradient(135deg,#eceae6,#dcd6cd);color:#b7b0a6;}
.body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:10px;flex:1;}
.name{font-size:17px;font-weight:700;margin:0;letter-spacing:-.01em;}
.meta{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:7px;align-items:center;}
.tags{display:flex;flex-wrap:wrap;gap:5px;}
.tag{font-size:11px;background:var(--chip);color:#5a5650;padding:3px 9px;border-radius:999px;}
.note{font-size:13.5px;color:#3a3a3a;margin:0;}
.foot{margin-top:auto;padding-top:4px;}
.btn{display:inline-block;font-size:13px;text-decoration:none;border:1px solid var(--ink);border-radius:999px;padding:7px 16px;color:var(--ink);transition:.15s;}
.btn:hover{background:var(--ink);color:#fff;}
footer{margin-top:48px;color:#b0b0b0;font-size:12px;text-align:center;}
.hidden{display:none!important;}
</style></head><body>
<div class="wrap">
<header>
<p class="eyebrow">${esc(site.eyebrow)}</p>
<h1>${esc(site.title)}</h1>
<p class="sub">全${sorted.length}件 · 最終更新 ${today}</p>
<nav class="nav">
<a href="index.html"${site.out==="index.html"?' class="on"':''}>デート</a>
<a href="fashion.html"${site.out==="fashion.html"?' class="on"':''}>ファッション</a>
<a href="events.html"${site.out==="events.html"?' class="on"':''}>イベント</a>
</nav>
</header>
<div class="filters">${chips}</div>
<div class="grid">
${sorted.map(p => card(p, site)).join("\n")}
</div>
<footer>データ：Notion · GitHub Actionsで自動更新</footer>
</div>
<script>
const chips=[...document.querySelectorAll('.chip')];
const cards=[...document.querySelectorAll('.card')];
chips.forEach(c=>c.addEventListener('click',()=>{
  chips.forEach(x=>x.classList.remove('active'));c.classList.add('active');
  const type=c.dataset.type, val=c.dataset.val;
  cards.forEach(card=>{
    let show=true;
    if(type==='filter'){ show=(card.dataset.filter||'').split('|').includes(val); }
    else if(type==='flag'){ show=(card.dataset.flags||'').split('|').includes(val); }
    card.classList.toggle('hidden',!show);
  });
}));
</script>
</body></html>`;
}

(async () => {
  let ok = 0;
  for(const site of SITES){
    try {
      if(!site.databaseId || site.databaseId.startsWith("PASTE_")){
        console.log(`Skip ${site.out}: databaseId 未設定`);
        continue;
      }
      const pages = await queryAll(site.databaseId);
      fs.writeFileSync(site.out, pageHtml(pages, site));
      console.log(`Built ${site.out} with ${pages.length} items.`);
      ok++;
    } catch (e) {
      console.error(`FAILED ${site.out}: ${e.message}`);
    }
  }
  console.log(`Done. ${ok}/${SITES.length} pages built.`);
})();
