const fs = require("fs");
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = "5fb254cf5f634ed59285646958bc8855"; // あなたの Date Spots Library

const emojiByType = {"カフェ":"☕","ディナー":"🍝","バー・一杯":"🍷","アクティビティ":"🎯","本・カルチャー":"📚","景色・散歩":"🌳"};
const txt = r => (r||[]).map(x=>x.plain_text).join("");
const esc = s => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

async function queryAll(){
  let out=[], cursor;
  do{
    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`,{
      method:"POST",
      headers:{Authorization:`Bearer ${NOTION_TOKEN}`,"Notion-Version":"2022-06-28","Content-Type":"application/json"},
      body: JSON.stringify(cursor?{start_cursor:cursor,page_size:100}:{page_size:100})
    });
    if(!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const d = await res.json();
    out = out.concat(d.results);
    cursor = d.has_more ? d.next_cursor : null;
  } while(cursor);
  return out;
}

function card(p){
  const P=p.properties;
  const name=txt(P["Name"]?.title);
  const area=P["Area"]?.select?.name||"その他";
  const types=(P["Type"]?.multi_select||[]).map(o=>o.name);
  const vibes=(P["Vibe"]?.multi_select||[]).map(o=>o.name);
  const good=(P["Good for"]?.multi_select||[]).map(o=>o.name);
  const price=P["Price"]?.select?.name||"";
  const rain=!!P["雨の日OK"]?.checkbox;
  const rating=P["Rating"]?.number;
  const maps=P["Maps"]?.url||"#";
  const note=txt(P["Notes"]?.rich_text);
  const image=(P["Image"]&&P["Image"].url)||(p.cover&&(p.cover.external?.url||p.cover.file?.url))||"";
  const emoji=emojiByType[types[0]]||"📍";
  const tags=[...types,...vibes.slice(0,1),...good.slice(0,1)];
  const meta=[area,price,rating!=null?("★"+rating):null,rain?"☔ 雨OK":null].filter(Boolean);
  const thumb=image
    ? `<img class="thumb" loading="lazy" alt="${esc(name)}" onerror="imgFallback(this,'${emoji}')" src="${esc(image)}">`
    : `<div class="ph">${emoji}</div>`;
  return `<article class="card" data-area="${esc(area)}" data-rain="${rain?1:0}">
${thumb}
<div class="body">
<h3 class="name">${esc(name)}</h3>
<div class="meta">${meta.map(b=>`<span>${esc(b)}</span>`).join('<span>·</span>')}</div>
<div class="tags">${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>
<p class="note">${esc(note)}</p>
<div class="foot"><a class="btn" target="_blank" rel="noopener" href="${esc(maps)}">Googleマップ →</a></div>
</div>
</article>`;
}

(async()=>{
  const spots = await queryAll();
  spots.sort((a,b)=>((b.properties["Rating"]?.number??-1)-(a.properties["Rating"]?.number??-1)));
  const areas=[...new Set(spots.map(s=>s.properties["Area"]?.select?.name).filter(Boolean))];
  const chips=`<button class="chip active" data-f="all">すべて</button>`+
    areas.map(a=>`<button class="chip" data-f="${esc(a)}">${esc(a)}</button>`).join("")+
    `<button class="chip" data-f="rain">☔ 雨の日OK</button>`;
  const today=new Date().toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"});

  const html=`<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Date Spots · Tokyo</title>
<script>function imgFallback(el,e){const d=document.createElement('div');d.className='ph';d.textContent=e;el.replaceWith(d);}</script>
<style>
:root{--bg:#faf9f7;--card:#fff;--ink:#1a1a1a;--muted:#8a8a8a;--line:#ececec;--chip:#f1f0ed;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;}
.wrap{max-width:1040px;margin:0 auto;padding:48px 20px 80px;}
.eyebrow{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin:0 0 6px;}
h1{font-size:30px;font-weight:700;margin:0 0 6px;letter-spacing:-.02em;}
.sub{color:var(--muted);font-size:14px;margin:0;}
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
footer a{color:#8a8a8a;}
.hidden{display:none!important;}
</style></head><body>
<div class="wrap">
<header><p class="eyebrow">Date Spots</p><h1>東京・デートスポット図書館</h1>
<p class="sub">全${spots.length}件 · 最終更新 ${today} · クリーン／ミニマルで使えるところだけ</p></header>
<div class="filters">${chips}</div>
<div class="grid">
${spots.map(card).join("\n")}
</div>
<footer>データ：📍 Date Spots Library（Notion）· 自動更新</footer>
</div>
<script>
const chips=[...document.querySelectorAll('.chip')];
const cards=[...document.querySelectorAll('.card')];
chips.forEach(c=>c.addEventListener('click',()=>{
  chips.forEach(x=>x.classList.remove('active'));c.classList.add('active');
  const f=c.dataset.f;
  cards.forEach(card=>{
    let show = f==='all' ? true : (f==='rain' ? card.dataset.rain==='1' : card.dataset.area===f);
    card.classList.toggle('hidden',!show);
  });
}));
</script>
</body></html>`;
  fs.writeFileSync("index.html", html);
  console.log(`Built index.html with ${spots.length} spots.`);
})();
