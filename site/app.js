"use strict";
const SIZES = [1, 2, 3];
const SIZE_LBL = { 1: "Lille", 2: "Mellem", 3: "Stor" };
const SIZE_SHORT = { 1: "S", 2: "M", 3: "L" };
const PRIOS = [0, 1, 2];
const PRIO_LBL = { 0: "Nej", 1: "Lav", 2: "Høj" };
const CATS = [["hus", "Hus"], ["have", "Have"], ["andet", "Andet"]];

let tasks = [];
let lastJSON = "";
let openId = null;
let addFile = null;
const addSel = { cat: "andet", size: 2, pa: null, pj: null };

const $ = s => document.querySelector(s);
const num = x => (x === null || x === undefined || x === "") ? null : Number(x);
const esc = s => (s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const catLbl = k => CATS.find(c => c[0] === k)?.[1] || "Andet";
const fdate = ts => ts ? new Date(ts * 1000).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2000); }

async function api(action, payload) {
  if (action === "list") return (await fetch("api/list.php?t=" + Date.now())).json();
  const r = await fetch("api/task.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
  return r.json();
}
const reloadNow = () => { lastJSON = ""; reload(); };

// ---- afledte ----
const prioA = t => num(t.prio_allan), prioJ = t => num(t.prio_jette);
const sizeOf = t => num(t.size) || 2;
const bothRated = t => prioA(t) != null && prioJ(t) != null;
const avgPrio = t => { const v = [prioA(t), prioJ(t)].filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : -1; };
const assignedTo = t => (t.assigned_to === "Allan" || t.assigned_to === "Jette") ? t.assigned_to : null;

// ---- små render-hjælpere ----
const prioBtns = (who, id, sel) => `<div class="chips prio" data-pwho="${who}" data-id="${id}">` +
  PRIOS.map(p => `<button data-prio="${p}"${sel === p ? ` class="on p${p}"` : ""}>${PRIO_LBL[p]}</button>`).join("") + `</div>`;
const sizeBadge = t => `<button class="szbadge" data-size="${t.id}" title="Størrelse: ${SIZE_LBL[sizeOf(t)]} — tryk for at skifte">${SIZE_SHORT[sizeOf(t)]}</button>`;

function galleryHtml(t) {
  const a = t.attachments || [];
  const up = `<label class="upl" title="Tilføj billede/video">➕📷<input type="file" accept="image/*,video/*" data-up="${t.id}" hidden></label>`;
  const items = a.map(x => {
    const src = "uploads/" + x.file;
    const m = x.kind === "image" ? `<img loading="lazy" src="${src}" data-full="${src}">` : `<video src="${src}" preload="metadata" controls playsinline></video>`;
    return `<div class="att">${m}<button class="attx" data-act="delatt" data-id="${x.id}" title="Fjern">×</button></div>`;
  }).join("");
  return `<div class="gallery">${items}${up}</div>`;
}

// ---- kort i listen (skal prioriteres / pulje) ----
function taskCard(t) {
  const aT = assignedTo(t);
  return `<div class="task" data-id="${t.id}">
    <div class="trow"><span class="ttl" data-detail="${t.id}">${esc(t.title)}</span>${sizeBadge(t)}</div>
    ${(t.attachments || []).length ? `<span class="camtag" data-detail="${t.id}">📷 ${(t.attachments || []).length}</span>` : ""}
    <div class="pgrid">
      <span class="pl a">Allan</span>${prioBtns("Allan", t.id, prioA(t))}
      <span class="pl j">Jette</span>${prioBtns("Jette", t.id, prioJ(t))}
    </div>
    ${bothRated(t) ? `<div class="arow">👤 Tag: ${["Allan", "Jette"].map(w => `<button class="ass${aT === w ? " on " + w.toLowerCase() : ""}" data-assign="${t.id}" data-to="${w}">${w}</button>`).join("")}</div>` : ""}
  </div>`;
}
const asgChip = t => `<div class="achip"><span class="sz">${SIZE_SHORT[sizeOf(t)]}</span><span class="t" data-detail="${t.id}">${esc(t.title)}</span><button class="done" data-act="done" data-id="${t.id}" title="Markér udført">✓</button></div>`;
const doneChip = t => `<div class="achip is-done"><span class="sz">${SIZE_SHORT[sizeOf(t)]}</span><span class="t" data-detail="${t.id}">${esc(t.title)}</span><span class="by">${t.done_by || ""}</span></div>`;

// ---- detalje-popup ----
function detailHtml(t) {
  const aT = assignedTo(t), isDone = t.status === "done";
  return `<button class="mclose" data-close title="Luk">×</button>
    <h3 class="mttl">${esc(t.title)} <button class="mini" data-act="rename" data-id="${t.id}" title="Redigér titel/note">✎</button></h3>
    <div class="meta"><span class="badge ${t.category}">${catLbl(t.category)}</span>
      <span>📅 ${fdate(t.created_at)}</span>${aT ? `<span>👤 ${aT}${t.assigned_at ? " · " + fdate(t.assigned_at) : ""}</span>` : ""}
      ${isDone ? `<span class="badge good">✅ udført af ${t.done_by || "?"} · ${fdate(t.done_at)}</span>` : ""}</div>
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : `<div class="note sub">Ingen note</div>`}
    ${galleryHtml(t)}
    <div class="field"><label>Kategori</label><div class="chips cat" data-catid="${t.id}">${CATS.map(([k, l]) => `<button data-cat="${k}"${t.category === k ? ' class="on"' : ""}>${l}</button>`).join("")}</div></div>
    <div class="field"><label>Størrelse</label><div class="chips size" data-szid="${t.id}">${SIZES.map(s => `<button data-sv="${s}"${sizeOf(t) === s ? ' class="on"' : ""}>${SIZE_LBL[s]}</button>`).join("")}</div></div>
    <div class="pgrid">
      <span class="pl a">Allan</span>${prioBtns("Allan", t.id, prioA(t))}
      <span class="pl j">Jette</span>${prioBtns("Jette", t.id, prioJ(t))}
    </div>
    <div class="arow">👤 Tildelt: ${["Allan", "Jette", ""].map(w => `<button class="ass${(aT === w) || (w === "" && !aT) ? " on " + (w ? w.toLowerCase() : "") : ""}" data-assign="${t.id}" data-to="${w}">${w || "Ingen"}</button>`).join("")}</div>
    <div class="acts">
      ${isDone ? `<button data-act="undone" data-id="${t.id}">↩︎ Genåbn</button>`
      : (aT ? `<button data-act="done" data-id="${t.id}">✓ Færdig</button>` : `<span class="sub">Tildel for at kunne markere færdig</span>`)}
      <button class="del" data-act="del" data-id="${t.id}" title="Slet permanent">🗑 Slet</button>
    </div>`;
}
function openDetail(id) { openId = id; if (!tasks.find(x => x.id === id)) return; $("#mbox").innerHTML = detailHtml(tasks.find(x => x.id === id)); $("#detail").hidden = false; }
function refreshDetail() { if ($("#detail").hidden || openId == null) return; const t = tasks.find(x => x.id === openId); if (t) $("#mbox").innerHTML = detailHtml(t); else closeDetail(); }
function closeDetail() { $("#detail").hidden = true; openId = null; }

// ---- render ----
function render() {
  const open = tasks.filter(t => t.status !== "done");
  const sumOpenSize = u => open.filter(t => assignedTo(t) === u).reduce((s, t) => s + sizeOf(t), 0);
  const sA = sumOpenSize("Allan"), sJ = sumOpenSize("Jette");
  $("#balance").innerHTML = `⚖️ Fordeling af tildelte opgaver — <b class="a">Allan ${sA}</b> · <b class="j">Jette ${sJ}</b> <span class="sub">(tal = størrelse)</span>`;

  for (const u of ["Allan", "Jette"]) {
    const mine = open.filter(t => assignedTo(t) === u);
    $("#sum-" + u).textContent = `(${mine.reduce((s, t) => s + sizeOf(t), 0)})`;
    $("#asg-" + u).innerHTML = mine.sort((a, b) => avgPrio(b) - avgPrio(a)).map(asgChip).join("") || `<p class="hint" style="margin:4px">—</p>`;
  }

  const need = open.filter(t => !bothRated(t) && !assignedTo(t)).sort((a, b) => b.created_at - a.created_at);
  $("#needList").innerHTML = need.map(taskCard).join("");
  $("#needEmpty").hidden = need.length > 0;

  const pool = open.filter(t => bothRated(t) && !assignedTo(t)).sort((a, b) => avgPrio(b) - avgPrio(a) || sizeOf(b) - sizeOf(a) || b.created_at - a.created_at);
  $("#poolList").innerHTML = pool.map(taskCard).join("");
  $("#poolEmpty").hidden = pool.length > 0;

  const done = tasks.filter(t => t.status === "done").sort((a, b) => (b.done_at || 0) - (a.done_at || 0));
  $("#doneCount").textContent = done.length ? `(${done.length})` : "";
  $("#doneList").innerHTML = done.map(doneChip).join("") || `<p class="empty">Ingen udførte endnu.</p>`;
  refreshDetail();
}
async function reload() { const d = await api("list"); const s = JSON.stringify(d.tasks); if (s === lastJSON) return; lastJSON = s; tasks = d.tasks || []; render(); }

// ---- ny opgave ----
function buildAddChips() {
  $("#t-cat").innerHTML = CATS.map(([k, l]) => `<button data-cat="${k}"${k === addSel.cat ? ' class="on"' : ""}>${l}</button>`).join("");
  $("#t-size").innerHTML = SIZES.map(s => `<button data-sv="${s}"${s === addSel.size ? ' class="on"' : ""}>${SIZE_LBL[s]}</button>`).join("");
  $("#t-pa").innerHTML = PRIOS.map(p => `<button data-pa="${p}"${p === addSel.pa ? ` class="on p${p}"` : ""}>${PRIO_LBL[p]}</button>`).join("");
  $("#t-pj").innerHTML = PRIOS.map(p => `<button data-pj="${p}"${p === addSel.pj ? ` class="on p${p}"` : ""}>${PRIO_LBL[p]}</button>`).join("");
}
function openNew() { addSel.cat = "andet"; addSel.size = 2; addSel.pa = null; addSel.pj = null; addFile = null; $("#t-title").value = ""; $("#t-note").value = ""; $("#t-photo").value = ""; $("#addPhotoName").textContent = ""; buildAddChips(); $("#newModal").hidden = false; $("#t-title").focus(); }
function closeNew() { $("#newModal").hidden = true; }

$("#newBtn").onclick = openNew;
$("#newModal").onclick = e => {
  if (e.target.closest("[data-newclose]") || e.target.id === "newModal") return closeNew();
  const c = e.target.closest("[data-cat]"); if (c) { addSel.cat = c.dataset.cat; return buildAddChips(); }
  const s = e.target.closest("[data-sv]"); if (s) { addSel.size = +s.dataset.sv; return buildAddChips(); }
  const a = e.target.closest("[data-pa]"); if (a) { addSel.pa = addSel.pa === +a.dataset.pa ? null : +a.dataset.pa; return buildAddChips(); }
  const j = e.target.closest("[data-pj]"); if (j) { addSel.pj = addSel.pj === +j.dataset.pj ? null : +j.dataset.pj; return buildAddChips(); }
};
$("#t-photo").onchange = e => { addFile = e.target.files[0] || null; $("#addPhotoName").textContent = addFile ? "✓ billede valgt" : ""; };
$("#addBtn").onclick = async () => {
  const title = $("#t-title").value.trim(); if (!title) return toast("Skriv hvad der skal laves");
  const res = await api("add", { title, note: $("#t-note").value, category: addSel.cat, size: addSel.size, prio_allan: addSel.pa, prio_jette: addSel.pj });
  if (addFile && res && res.id) { const fd = new FormData(); fd.append("file", addFile); fd.append("task_id", res.id); toast("Uploader…"); try { await fetch("api/upload.php", { method: "POST", body: fd }); } catch (e) {} }
  closeNew(); toast("Tilføjet ✓"); reloadNow();
};

// ---- klik i lister + popup ----
function handle(e) {
  const det = e.target.closest("[data-detail]"); if (det) { openDetail(+det.dataset.detail); return; }
  const im = e.target.closest("img[data-full]"); if (im) { const lb = $("#lightbox"); lb.innerHTML = `<img src="${im.dataset.full}">`; lb.hidden = false; return; }
  const pb = e.target.closest(".prio [data-prio]");
  if (pb) { const box = pb.closest("[data-pwho]"); const cur = num(tasks.find(x => x.id == box.dataset.id)?.[box.dataset.pwho === "Allan" ? "prio_allan" : "prio_jette"]); const v = +pb.dataset.prio; api("prio", { id: +box.dataset.id, who: box.dataset.pwho, priority: cur === v ? null : v }).then(reloadNow); return; }
  const sb = e.target.closest("[data-size]"); if (sb) { const t = tasks.find(x => x.id == sb.dataset.size); api("size", { id: +sb.dataset.size, size: sizeOf(t) % 3 + 1 }).then(reloadNow); return; }
  const sv = e.target.closest("[data-szid] [data-sv]"); if (sv) { api("size", { id: +sv.closest("[data-szid]").dataset.szid, size: +sv.dataset.sv }).then(reloadNow); return; }
  const cc = e.target.closest("[data-catid] [data-cat]"); if (cc) { api("cat", { id: +cc.closest("[data-catid]").dataset.catid, category: cc.dataset.cat }).then(reloadNow); return; }
  const asg = e.target.closest("[data-assign]"); if (asg) { const t = tasks.find(x => x.id == asg.dataset.assign); const to = asg.dataset.to; api("assign", { id: +asg.dataset.assign, to: assignedTo(t) === to ? "" : to }).then(reloadNow); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = +b.dataset.id, act = b.dataset.act;
  if (act === "done") api("done", { id, done: 1 }).then(reloadNow);
  else if (act === "undone") api("done", { id, done: 0 }).then(reloadNow);
  else if (act === "delatt") { if (confirm("Fjern denne fil?")) api("delattach", { id }).then(reloadNow); }
  else if (act === "del") { if (confirm("Slet opgaven permanent? Kan ikke fortrydes.")) api("delete", { id }).then(() => { closeDetail(); reloadNow(); }); }
  else if (act === "rename") { const t = tasks.find(x => x.id === id); const title = prompt("Titel:", t.title); if (title === null) return; const note = prompt("Note:", t.note || ""); api("rename", { id, title: title.trim() || t.title, note }).then(reloadNow); }
}
["#needList", "#poolList", "#asg-Allan", "#asg-Jette", "#doneList", "#mbox"].forEach(s => $(s).addEventListener("click", handle));
$("#mbox").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeDetail(); });
$("#detail").addEventListener("click", e => { if (e.target.id === "detail") closeDetail(); });
$("#lightbox").onclick = () => { $("#lightbox").hidden = true; $("#lightbox").innerHTML = ""; };

function onUp(e) { const inp = e.target.closest("input[data-up]"); if (!inp) return; const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append("file", f); fd.append("task_id", inp.dataset.up); toast("Uploader…"); fetch("api/upload.php", { method: "POST", body: fd }).then(r => r.json()).then(j => { toast(j.error ? "Fejl: " + j.error : "Tilføjet 📷"); reloadNow(); }).catch(() => toast("Upload fejlede")); inp.value = ""; }
["#needList", "#poolList", "#mbox"].forEach(s => $(s).addEventListener("change", onUp));

$("#doneToggle").onclick = () => { $("#doneList").hidden = !$("#doneList").hidden; };

reload();
setInterval(reload, 20000);
