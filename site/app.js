"use strict";
const EST = [0.25, 0.5, 1, 2, 4, 8, 16];
const EST_LBL = { 0.25: "15m", 0.5: "30m", 1: "1t", 2: "2t", 4: "4t", 8: "1 dag", 16: "weekend" };
const PRIOS = [0, 1, 2, 3, 4, 5];
const PRIO_TXT = { 0: "Ikke fælles", 1: "Lav", 2: "Lidt", 3: "Middel", 4: "Vigtig", 5: "Kritisk (højest)" };
const CATS = [["hus", "Hus"], ["have", "Have"], ["andet", "Andet"]];

let me = localStorage.getItem("todo_user") || "";
let view = "dist";
let tasks = [];
let lastJSON = "";
let openId = null;
let pendingOpen = null;
let editing = false;
const editSel = {};
const rateSel = {};
const addSel = { cat: "andet", prio: null, est: null };
let addFile = null;

const $ = s => document.querySelector(s);
const num = x => (x === null || x === undefined || x === "") ? null : Number(x);
const fmtH = h => h == null ? "?" : (EST_LBL[h] ?? (Math.round(h * 100) / 100 + "t"));
const esc = s => (s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const catLbl = k => CATS.find(c => c[0] === k)?.[1] || "Andet";
const fdate = ts => ts ? new Date(ts * 1000).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const POINT_TIP = "Point = gennemsnitlig prioritet × gennemsnitlig tid. Tjenes når opgaven markeres færdig.";
const SCORE_TIP = "Score = gennemsnitlig prioritet ÷ gennemsnitlig tid. Bestemmer rækkefølgen i puljen — vigtigt + hurtigt øverst.";
const SCORES_TIP = "Optjente point fra udførte opgaver. Tal i (parentes) = forventede point fra dine tildelte, ikke-udførte opgaver.";

function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2200); }

async function api(action, payload) {
  if (action === "list") return (await fetch("api/list.php?t=" + Date.now())).json();
  const r = await fetch("api/task.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, user: me, ...payload }) });
  return r.json();
}

// ---- afledte ----
const prioA = t => num(t.prio_allan), prioJ = t => num(t.prio_jette);
const estA = t => num(t.est_allan), estJ = t => num(t.est_jette);
const avg = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
const combPrio = t => avg([prioA(t), prioJ(t)]);
const avgEst = t => avg([estA(t), estJ(t)]);
const ratedByMe = t => me === "Allan" ? prioA(t) != null : (me === "Jette" ? prioJ(t) != null : false);
const hasZero = t => prioA(t) === 0 || prioJ(t) === 0;
const shared = t => prioA(t) != null && prioA(t) >= 1 && prioJ(t) != null && prioJ(t) >= 1;
const decided = t => shared(t) || hasZero(t);
const assignedTo = t => (t.assigned_to === "Allan" || t.assigned_to === "Jette") ? t.assigned_to : null;
const disagree = t => shared(t) && Math.abs(prioA(t) - prioJ(t)) >= 2;
const score = t => shared(t) ? combPrio(t) / (avgEst(t) || 0.25) : 0;
const taskPoints = t => shared(t) ? Math.round(combPrio(t) * avgEst(t) * 10) : 0;
const other = () => me === "Allan" ? "Jette" : "Allan";
const stars = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const r2 = h => Math.round(h * 4) / 4;

function buildChips() {
  $("#t-cat").innerHTML = CATS.map(([k, l]) => `<button data-cat="${k}"${k === addSel.cat ? ' class="on"' : ""}>${l}</button>`).join("");
  $("#t-prio").innerHTML = PRIOS.map(p => `<button data-prio="${p}" title="${PRIO_TXT[p]}"${p === addSel.prio ? ' class="on"' : ""}>${p}</button>`).join("");
  $("#t-est").innerHTML = EST.map(e => `<button data-est="${e}"${e === addSel.est ? ' class="on"' : ""}>${EST_LBL[e]}</button>`).join("");
}
function setWho(u) {
  me = u; localStorage.setItem("todo_user", u);
  document.querySelectorAll(".who").forEach(b => b.classList.toggle("on", b.dataset.user === u));
  $("#gate").hidden = true;
  render();
}
const planned = u => tasks.filter(t => t.status !== "done" && shared(t) && assignedTo(t) === u).reduce((s, t) => s + taskPoints(t), 0);

// ---- galleri ----
function galleryHtml(t) {
  const a = t.attachments || [];
  const up = `<label class="upl" title="Tilføj billede/video til opgaven">➕📷<input type="file" accept="image/*,video/*" data-up="${t.id}" hidden></label>`;
  const items = a.map(x => {
    const src = "uploads/" + x.file;
    const media = x.kind === "image" ? `<img loading="lazy" src="${src}" data-full="${src}">`
      : `<video src="${src}" preload="metadata" controls playsinline></video>`;
    return `<div class="att" title="Lagt på af ${esc(x.created_by)}">${media}<button class="attx" data-act="delatt" data-id="${x.id}" title="Fjern denne fil">×</button></div>`;
  }).join("");
  return `<div class="gallery">${items}${up}</div>`;
}

// ---- vurderings-tabel ----
const pcell = p => p == null ? "–" : (p === 0 ? "🚫" : "P" + p);
const ecell = (p, e) => p === 0 ? "—" : (e != null ? fmtH(e) : "–");
function rateRows(t) {
  let h = `<div class="rtr"><b>Allan</b><span>${pcell(prioA(t))}</span><span>${ecell(prioA(t), estA(t))}</span></div>`
    + `<div class="rtr"><b>Jette</b><span>${pcell(prioJ(t))}</span><span>${ecell(prioJ(t), estJ(t))}</span></div>`;
  if (shared(t)) h += `<div class="rtr avg"><b>ø</b><span>P${combPrio(t).toFixed(1)}</span><span>${fmtH(r2(avgEst(t)))}</span></div>`;
  return `<div class="rt">${h}</div>`;
}

// ---- opgavekort (pulje + til vurdering) ----
function taskCard(t) {
  const isDone = t.status === "done", isShared = shared(t), isZero = hasZero(t);
  const waitWho = prioA(t) == null ? "Allan" : (prioJ(t) == null ? "Jette" : null);
  let cls = "task"; if (isDone) cls += " done"; else if (isZero) cls += " zero"; else if (!isShared) cls += " pending"; if (disagree(t)) cls += " disagree";
  const badge = isDone ? `<div class="pbadge done" title="Udført">✓</div>`
    : isZero ? `<div class="pbadge zero" title="Ikke en fælles opgave">🚫</div>`
      : isShared ? `<div class="pbadge" title="${SCORE_TIP}">⚡${score(t).toFixed(1)}</div>`
        : `<div class="pbadge wait" title="Mangler vurdering fra en af jer">⏳</div>`;
  let rate = "";
  if (!isDone && !isZero && !ratedByMe(t)) {
    const sel = rateSel[t.id] || {};
    rate = `<div class="ratebox">
      <div class="rl">Din vurdering (${me || "vælg hvem du er ↑"}) — <span class="sub">0 = ikke fælles · 5 = højest</span>:</div>
      <div class="chips prio" data-rate="prio" data-id="${t.id}">${PRIOS.map(p => `<button data-rprio="${p}" title="${PRIO_TXT[p]}"${sel.prio === p ? ' class="on"' : ""}>${p}</button>`).join("")}</div>
      <div class="chips est" data-rate="est" data-id="${t.id}" style="margin-top:6px">${EST.map(e => `<button data-rest="${e}"${sel.est === e ? ' class="on"' : ""}>${EST_LBL[e]}</button>`).join("")}</div>
      <button class="ghost small" data-act="saverate" data-id="${t.id}" style="margin-top:8px">Gem vurdering</button>
    </div>`;
  }
  return `<div class="${cls}" data-id="${t.id}">
    ${badge}
    <div class="body">
      <div class="ttl">${esc(t.title)}</div>
      <div class="meta">
        <span class="badge ${t.category}">${catLbl(t.category)}</span>
        <span title="Hvem foreslog opgaven">💡 Oprettet af ${t.created_by}</span>
        ${isShared && !isDone ? `<span title="${POINT_TIP}">🏅 ${taskPoints(t)}</span>` : ""}
        ${isZero ? `<span class="badge" title="En af jer har sat prioritet 0 – ikke en fælles opgave">🚫 ikke fælles</span>` : ""}
        ${disagree(t) ? `<span class="badge warn" title="I har givet meget forskellig prioritet (≥2 fra hinanden)">⚠️ uenige</span>` : ""}
        ${waitWho && !isDone && !isZero ? `<span class="badge wait" title="${waitWho} har ikke vurderet endnu">⏳ afventer ${waitWho}</span>` : ""}
      </div>
      ${(prioA(t) != null || prioJ(t) != null) ? rateRows(t) : ""}
      ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
      ${(t.attachments || []).length ? galleryHtml(t) : ""}
      ${rate}
      ${isShared && !isDone ? `<div class="assign">👤 Tildel: ${["Allan", "Jette"].map(w => `<button class="ass${assignedTo(t) === w ? " on " + w.toLowerCase() : ""}" data-assign="${t.id}" data-to="${w}" title="Tildel til ${w} (ryger til Fordeling)">${w}</button>`).join("")}</div>` : ""}
    </div>
  </div>`;
}

// ---- detalje-popup ----
function detailHtml(t) {
  const isDone = t.status === "done", isAssigned = !!assignedTo(t);
  const st = isDone ? "Udført" : hasZero(t) ? "Ikke fælles" : shared(t) ? (isAssigned ? "Tildelt " + assignedTo(t) : "I puljen") : "Afventer vurdering";
  return `<button class="mclose" data-close title="Luk">×</button>
    <h3 class="mttl">${esc(t.title)}</h3>
    <div class="meta">
      <span class="badge ${t.category}">${catLbl(t.category)}</span>
      <span title="Hvem foreslog opgaven">💡 Oprettet af ${t.created_by}</span>
      <span class="badge">${st}</span>
      ${shared(t) ? `<span title="${SCORE_TIP}">⚡ ${score(t).toFixed(1)}</span><span title="${POINT_TIP}">🏅 ${taskPoints(t)}</span>` : ""}
      ${isDone ? `<span class="badge good">✅ udført af ${t.done_by || "?"} · +${taskPoints(t)} ⭐</span>` : ""}
    </div>
    ${rateRows(t)}
    <div class="dates sub">📅 Oprettet ${fdate(t.created_at)}${isAssigned ? ` · Tildelt ${fdate(t.assigned_at)}` : ""}${isDone ? ` · Udført ${fdate(t.done_at)}` : ""}</div>
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : `<div class="note sub">Ingen note</div>`}
    ${galleryHtml(t)}
    ${!isDone && shared(t) ? `<div class="assign">👤 Tildelt: ${["Allan", "Jette", ""].map(w => `<button class="ass${(assignedTo(t) === w) || (w === "" && !assignedTo(t)) ? " on " + (w ? w.toLowerCase() : "") : ""}" data-assign="${t.id}" data-to="${w}" title="${w ? `Tildel til ${w}` : "Fjern tildeling – tilbage i puljen"}">${w || "Ingen"}</button>`).join("")}</div>` : ""}
    <div class="acts">
      ${isDone ? `<button data-act="undone" data-id="${t.id}" title="Fortryd – markér som ikke-udført igen">↩︎ Genåbn</button>`
      : `${isAssigned ? `<button data-act="done" data-id="${t.id}" title="Markér som udført — ${me || "du"} får de ${taskPoints(t)} point. (${POINT_TIP})">✓ Færdig</button>` : ""}
         <button data-act="edit" data-id="${t.id}" title="Redigér titel, note, kategori og begges prioritet/tid">✎ Redigér</button>`}
      <button class="del" data-act="del" data-id="${t.id}" title="Slet opgaven permanent — kan ikke fortrydes">🗑 Slet</button>
    </div>`;
}
function editHtml(t) {
  const pc = sel => PRIOS.map(p => `<button data-prio="${p}" title="${PRIO_TXT[p]}"${sel === p ? ' class="on"' : ""}>${p}</button>`).join("");
  const ec = sel => EST.map(e => `<button data-est="${e}"${sel === e ? ' class="on"' : ""}>${EST_LBL[e]}</button>`).join("");
  return `<button class="mclose" data-close title="Luk">×</button>
    <h3 class="mttl">Redigér opgave</h3>
    <input id="e-title" class="title-in" value="${esc(t.title)}" maxlength="120">
    <div class="field"><label>Kategori</label><div class="chips cat" data-ed="cat">${CATS.map(([k, l]) => `<button data-cat="${k}"${editSel.cat === k ? ' class="on"' : ""}>${l}</button>`).join("")}</div></div>
    <div class="erate"><div class="erh" style="color:var(--allan)">Allans vurdering <span class="sub">(0 = ikke fælles · 5 = højest)</span></div>
      <div class="chips prio" data-ed="pa">${pc(editSel.pa)}</div>
      <div class="chips est" data-ed="ea" style="margin-top:6px">${ec(editSel.ea)}</div></div>
    <div class="erate"><div class="erh" style="color:var(--jette)">Jettes vurdering</div>
      <div class="chips prio" data-ed="pj">${pc(editSel.pj)}</div>
      <div class="chips est" data-ed="ej" style="margin-top:6px">${ec(editSel.ej)}</div></div>
    <textarea id="e-note" class="note-in" rows="2" placeholder="Note (valgfri)">${esc(t.note)}</textarea>
    <div class="acts"><button class="primary small" data-act="savEdit" data-id="${t.id}">💾 Gem</button><button class="ghost small" data-act="cancelEdit">Annullér</button></div>`;
}
function renderModal() { const t = tasks.find(x => x.id === openId); if (!t) return closeDetail(); $("#mbox").innerHTML = editing ? editHtml(t) : detailHtml(t); }
function openDetail(id) { openId = id; editing = false; if (!tasks.find(x => x.id === id)) return; renderModal(); $("#detail").hidden = false; }
function refreshDetail() { if ($("#detail").hidden || openId == null || editing) return; renderModal(); }
function closeDetail() { $("#detail").hidden = true; openId = null; editing = false; }
async function saveEdit(id) {
  const title = $("#e-title").value.trim(); if (!title) return toast("Skriv en titel");
  if (editSel.pa != null && editSel.pa > 0 && editSel.ea == null) return toast("Vælg Allans tid");
  if (editSel.pj != null && editSel.pj > 0 && editSel.ej == null) return toast("Vælg Jettes tid");
  await api("edit", {
    id, title, note: $("#e-note").value, category: editSel.cat,
    prio_allan: editSel.pa, est_allan: editSel.pa === 0 ? 0 : editSel.ea,
    prio_jette: editSel.pj, est_jette: editSel.pj === 0 ? 0 : editSel.ej
  });
  editing = false; toast("Gemt ✓"); lastJSON = ""; reload();
}

// ---- views ----
function renderPool() {
  const cat = $("#catFilter").value, sort = $("#sort").value;
  let list = tasks.filter(t => t.status !== "done" && decided(t) && !assignedTo(t) && (!cat || t.category === cat));
  const metric = sort === "new" ? (t => t.created_at) : sort === "prio" ? combPrio : sort === "time" ? (t => -(avgEst(t) || 999)) : score;
  list.sort((a, b) => ((hasZero(a) ? 1 : 0) - (hasZero(b) ? 1 : 0)) || (metric(b) - metric(a)) || (b.created_at - a.created_at));
  $("#list").innerHTML = list.length ? list.map(taskCard).join("")
    : `<p class="empty">Ingen ufordelte opgaver. Lav en under «Ny», tjek «Til vurdering», eller se «Fordeling».</p>`;
}
function needMine() { return me ? tasks.filter(t => t.status !== "done" && !decided(t) && !ratedByMe(t)) : []; }
function renderNeed() {
  $("#needOtherH").textContent = `⏳ Venter på ${other()}`;
  if (!me) { $("#needMine").innerHTML = `<p class="empty">Vælg først hvem du er ↑</p>`; $("#needOther").innerHTML = ""; $("#needMineH").hidden = $("#needOtherH").hidden = $("#needEmpty").hidden = true; return; }
  const mine = needMine(), oth = tasks.filter(t => t.status !== "done" && !decided(t) && ratedByMe(t));
  $("#needMineH").hidden = !mine.length; $("#needOtherH").hidden = !oth.length;
  $("#needMine").innerHTML = mine.map(taskCard).join(""); $("#needOther").innerHTML = oth.map(taskCard).join("");
  $("#needEmpty").hidden = mine.length || oth.length;
}
const distChip = t => `<div class="dchip" data-id="${t.id}" title="Vis detaljer"><span class="dt">🏅 ${taskPoints(t)}</span>${esc(t.title)}</div>`;
function renderDist() {
  const open = tasks.filter(t => t.status !== "done" && shared(t) && assignedTo(t));
  const load = { Allan: 0, Jette: 0 }, time = { Allan: 0, Jette: 0 }, col = { Allan: [], Jette: [] };
  for (const t of open) { const w = assignedTo(t); col[w].push(t); load[w] += taskPoints(t); time[w] += avgEst(t); }
  const tot = load.Allan + load.Jette || 1;
  $("#balance").innerHTML = `<div class="ba" style="width:${load.Allan / tot * 100}%"></div><div class="bj" style="width:${load.Jette / tot * 100}%"></div>`;
  for (const u of ["Allan", "Jette"]) {
    $("#tot-" + u).textContent = `${load[u]} point · ${fmtH(r2(time[u]))} · ${col[u].length} stk`;
    $("#col-" + u).innerHTML = col[u].sort((a, b) => taskPoints(b) - taskPoints(a)).map(distChip).join("") || `<p class="hint" style="margin:4px">—</p>`;
  }
  const done = { Allan: 0, Jette: 0 }, dcol = { Allan: [], Jette: [] };
  for (const t of tasks) if (t.status === "done" && t.done_by in dcol) { dcol[t.done_by].push(t); done[t.done_by] += taskPoints(t); }
  for (const u of ["Allan", "Jette"]) {
    $("#dtot-" + u).textContent = `${done[u]} point · ${dcol[u].length} stk`;
    $("#dcol-" + u).innerHTML = dcol[u].sort((a, b) => (b.done_at || 0) - (a.done_at || 0)).map(distChip).join("") || `<p class="hint" style="margin:4px">—</p>`;
  }
}
function updateBadges() {
  const n = needMine().length; const b = $("#needBadge"); b.textContent = n; b.hidden = n === 0;
  document.title = (n ? `(${n}) ` : "") + "AOGJ's to-do";
}
function renderScores() {
  const earned = { Allan: 0, Jette: 0 };
  for (const t of tasks) if (t.status === "done" && t.done_by in earned) earned[t.done_by] += taskPoints(t);
  const plan = { Allan: planned("Allan"), Jette: planned("Jette") };
  const lead = earned.Allan === earned.Jette ? "" : (earned.Allan > earned.Jette ? "Allan" : "Jette");
  const cell = u => `<span class="sc${lead === u ? " lead" : ""}">${u} ${earned[u]}${plan[u] ? ` <small>(+${plan[u]})</small>` : ""}</span>`;
  $("#scores").innerHTML = `<span title="${SCORES_TIP}">🏆 ${cell("Allan")}<span class="vs">·</span>${cell("Jette")}</span>`;
}
function render() {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.view === view));
  $("#newView").hidden = view !== "new"; $("#poolView").hidden = view !== "pool";
  $("#needView").hidden = view !== "need"; $("#distView").hidden = view !== "dist";
  $("#helpView").hidden = view !== "help";
  updateBadges(); renderScores();
  if (view === "pool") renderPool(); else if (view === "need") renderNeed(); else if (view === "dist") renderDist();
}
async function reload() {
  const d = await api("list"); const s = JSON.stringify(d.tasks);
  if (s === lastJSON) return;
  lastJSON = s; tasks = d.tasks || []; render(); refreshDetail();
  if (pendingOpen != null) {
    openDetail(pendingOpen);
    if (pendingEdit) { const t = tasks.find(x => x.id === pendingOpen); if (t) { editing = true; editSel.cat = t.category; editSel.pa = prioA(t); editSel.ea = estA(t); editSel.pj = prioJ(t); editSel.ej = estJ(t); renderModal(); } pendingEdit = false; }
    pendingOpen = null;
  }
}

// ---- konfetti ----
function confetti() {
  const c = document.createElement("canvas"); c.className = "confetti"; document.body.appendChild(c);
  const ctx = c.getContext("2d"); const W = c.width = innerWidth, H = c.height = innerHeight;
  const cols = ["#6366f1", "#22d3ee", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#fbbf24"];
  const P = Array.from({ length: 150 }, () => ({ x: W / 2 + (Math.random() - .5) * 160, y: H * .32, vx: (Math.random() - .5) * 14, vy: Math.random() * -13 - 4, g: .32 + Math.random() * .22, s: 5 + Math.random() * 8, c: cols[Math.random() * cols.length | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .5 }));
  const t0 = performance.now();
  (function frame(now) { ctx.clearRect(0, 0, W, H); for (const p of P) { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - (now - t0) / 1900); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); } if (now - t0 < 1900) requestAnimationFrame(frame); else c.remove(); })(t0);
}

// ---- events ----
document.querySelectorAll(".who").forEach(b => b.onclick = () => setWho(b.dataset.user));
document.querySelectorAll(".tab").forEach(b => b.onclick = () => { view = b.dataset.view; location.hash = view; render(); });
$("#sort").onchange = renderPool;
$("#catFilter").onchange = renderPool;

$("#t-cat").onclick = e => { const b = e.target.closest("[data-cat]"); if (!b) return; addSel.cat = b.dataset.cat; buildChips(); };
$("#t-prio").onclick = e => { const b = e.target.closest("[data-prio]"); if (!b) return; addSel.prio = +b.dataset.prio; if (addSel.prio === 0) addSel.est = null; buildChips(); };
$("#t-est").onclick = e => { const b = e.target.closest("[data-est]"); if (!b) return; addSel.est = +b.dataset.est; buildChips(); };
$("#addBtn").onclick = async () => {
  if (!me) return toast("Vælg først hvem du er ↑");
  const title = $("#t-title").value.trim();
  if (!title) return toast("Skriv en titel");
  if (addSel.prio == null) return toast("Vælg din prioritet (0–5)");
  if (addSel.prio > 0 && addSel.est == null) return toast("Vælg din tid");
  const z = addSel.prio === 0;
  const res = await api("add", { title, note: $("#t-note").value, category: addSel.cat, priority: addSel.prio, estimate: z ? 0 : addSel.est });
  if (addFile && res && res.id) {
    const fd = new FormData(); fd.append("file", addFile); fd.append("task_id", res.id); fd.append("user", me);
    toast("Uploader billede…");
    try { await fetch("api/upload.php", { method: "POST", body: fd }); } catch (e) {}
  }
  $("#t-title").value = ""; $("#t-note").value = ""; addSel.prio = null; addSel.est = null; addFile = null;
  $("#t-photo").value = ""; $("#addPhotoName").textContent = ""; buildChips();
  toast(z ? "Tilføjet ✓" : `Tilføjet — afventer ${other()}s vurdering ⏳`); lastJSON = ""; reload();
};
$("#t-photo").onchange = e => { addFile = e.target.files[0] || null; $("#addPhotoName").textContent = addFile ? "✓ billede valgt" : ""; };

function listClick(e) {
  const rp = e.target.closest("[data-rprio]"); if (rp) { const id = e.target.closest("[data-rate]").dataset.id; const s = (rateSel[id] ||= {}); s.prio = +rp.dataset.rprio; if (s.prio === 0) s.est = null; render(); refreshDetail(); return; }
  const re = e.target.closest("[data-rest]"); if (re) { const id = e.target.closest("[data-rate]").dataset.id; (rateSel[id] ||= {}).est = +re.dataset.rest; render(); refreshDetail(); return; }
  const im = e.target.closest("img[data-full]"); if (im) { openLight(im.dataset.full); return; }
  const asg = e.target.closest("[data-assign]"); if (asg) { const id = asg.dataset.assign, to = asg.dataset.to; const cur = assignedTo(tasks.find(x => x.id == id)); api("assign", { assignments: { [id]: cur === to ? "" : to } }).then(() => { lastJSON = ""; reload(); }); return; }
  const b = e.target.closest("[data-act]");
  if (b) {
    const id = +b.dataset.id, act = b.dataset.act, fin = () => { lastJSON = ""; reload(); };
    if (act === "saverate") { if (!me) return toast("Vælg hvem du er ↑"); const s = rateSel[id] || {}; if (s.prio == null) return toast("Vælg prioritet (0–5)"); if (s.prio > 0 && s.est == null) return toast("Vælg tid"); api("rate", { id, priority: s.prio, estimate: s.prio === 0 ? 0 : s.est }).then(() => { delete rateSel[id]; toast("Vurdering gemt ✓"); fin(); }); }
    else if (act === "done") api("done", { id, done: 1 }).then(() => { confetti(); fin(); });
    else if (act === "undone") api("done", { id, done: 0 }).then(fin);
    else if (act === "park") { const t = tasks.find(x => x.id == id); api("park", { id, parked: t.parked == 1 ? 0 : 1 }).then(fin); }
    else if (act === "delatt") { if (confirm("Fjern denne fil?")) api("delattach", { id }).then(fin); }
    else if (act === "del") { if (confirm("Slet opgaven permanent? Dette kan ikke fortrydes.")) api("delete", { id }).then(() => { closeDetail(); fin(); }); }
    else if (act === "edit") { const t = tasks.find(x => x.id == id); const title = prompt("Titel:", t.title); if (title === null) return; const note = prompt("Note:", t.note || ""); api("edit", { id, title, note, category: t.category }).then(fin); }
    return;
  }
  const card = e.target.closest(".task"); if (card) openDetail(+card.dataset.id);
}
["#list", "#needMine", "#needOther"].forEach(s => $(s).onclick = listClick);

async function uploadFile(taskId, inp) {
  const file = inp.files[0]; if (!file) return;
  if (!me) { toast("Vælg hvem du er ↑"); inp.value = ""; return; }
  const fd = new FormData(); fd.append("file", file); fd.append("task_id", taskId); fd.append("user", me);
  toast("Uploader… " + (file.size > 3e6 ? Math.round(file.size / 1e6) + " MB" : ""));
  try { const j = await (await fetch("api/upload.php", { method: "POST", body: fd })).json(); if (j.error) toast("Fejl: " + j.error); else { toast("Tilføjet 📷"); lastJSON = ""; reload(); } }
  catch (e) { toast("Upload fejlede"); }
  inp.value = "";
}
function onUpChange(e) { const inp = e.target.closest("input[data-up]"); if (inp) uploadFile(inp.dataset.up, inp); }
["#list", "#needMine", "#needOther", "#detail"].forEach(s => $(s).addEventListener("change", onUpChange));

function openLight(src) { const lb = $("#lightbox"); lb.innerHTML = `<img src="${src}">`; lb.hidden = false; }
$("#lightbox").onclick = () => { $("#lightbox").hidden = true; $("#lightbox").innerHTML = ""; };
$("#distView").addEventListener("click", e => { const c = e.target.closest(".dchip[data-id]"); if (c) openDetail(+c.dataset.id); });
function modalClick(e) {
  if (e.target.closest("[data-close]")) return closeDetail();
  const ed = e.target.closest("[data-ed]");
  if (ed) {
    const b = e.target.closest("button");
    if (b) {
      const k = ed.dataset.ed;
      if (k === "cat") editSel.cat = b.dataset.cat;
      else if (k === "pa") { editSel.pa = +b.dataset.prio; if (editSel.pa === 0) editSel.ea = 0; }
      else if (k === "pj") { editSel.pj = +b.dataset.prio; if (editSel.pj === 0) editSel.ej = 0; }
      else if (k === "ea") editSel.ea = +b.dataset.est;
      else if (k === "ej") editSel.ej = +b.dataset.est;
      renderModal();
    }
    return;
  }
  const b = e.target.closest("[data-act]");
  if (b) {
    const act = b.dataset.act, id = +b.dataset.id;
    if (act === "edit") { const t = tasks.find(x => x.id === id); editing = true; editSel.cat = t.category; editSel.pa = prioA(t); editSel.ea = estA(t); editSel.pj = prioJ(t); editSel.ej = estJ(t); renderModal(); return; }
    if (act === "cancelEdit") { editing = false; renderModal(); return; }
    if (act === "savEdit") { saveEdit(id); return; }
  }
  listClick(e);
}
$("#mbox").onclick = modalClick;
$("#detail").onclick = e => { if (e.target.id === "detail") closeDetail(); };

// init
const qme = new URLSearchParams(location.search).get("me");
if (["Allan", "Jette"].includes(qme)) { me = qme; localStorage.setItem("todo_user", qme); }
const qt = new URLSearchParams(location.search).get("task"); if (qt) pendingOpen = +qt;
let pendingEdit = new URLSearchParams(location.search).get("edit") === "1";
if (["new", "pool", "need", "dist", "help"].includes(location.hash.slice(1))) view = location.hash.slice(1);
buildChips();
if (me) setWho(me); else { $("#gate").hidden = false; render(); }
reload();
setInterval(reload, 20000);
