// app.js — renders data/avs.json into the roster table and the player report card.

const POSITIONS = { C: "Center", L: "Left Wing", R: "Right Wing", D: "Defense", G: "Goalie" };
const GROUP_ORDER = ["Forward", "Defense", "Goalie"];
const GROUP_LABEL = { Forward: "Forwards", Defense: "Defense", Goalie: "Goalies" };

let DATA = null;
let currentFilter = "all";

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Dates like "1995-09-01" are parsed as local dates so they don't shift a day.
function parseDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(ymd) {
  const d = parseDate(ymd);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}
function age(ymd) {
  const b = parseDate(ymd);
  if (!b) return "";
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}
function height(inches) {
  return inches ? `${Math.floor(inches / 12)}′ ${inches % 12}″` : "";
}

function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "active") return "ok";
  if (s.includes("day")) return "warn";   // Day-To-Day
  return "bad";                          // Out, Injured Reserve, etc.
}
function statusBadge(status) {
  return `<span class="badge ${statusClass(status)}">${esc(status)}</span>`;
}

function isInjured(p) { return p.status !== "Active"; }

// ---------- Roster table ----------

function renderTable() {
  const body = $("#roster-body");
  const players = DATA.players.filter((p) =>
    currentFilter === "all" ? true :
    currentFilter === "injured" ? isInjured(p) :
    p.group === currentFilter);

  if (!players.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">${
      currentFilter === "injured" ? "No injuries reported. Everyone's healthy!" : "No players found."
    }</td></tr>`;
    return;
  }

  let html = "";
  for (const group of GROUP_ORDER) {
    const list = players
      .filter((p) => p.group === group)
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
    if (!list.length) continue;
    html += `<tr class="group-row"><td colspan="5">${GROUP_LABEL[group]}</td></tr>`;
    for (const p of list) {
      html += `
        <tr tabindex="0" data-id="${p.id}">
          <td class="num">${esc(p.number ?? "")}</td>
          <td class="player">${esc(p.name)}</td>
          <td>${esc(p.position)}</td>
          <td class="ca">${p.letter ? `<span class="letter">${esc(p.letter)}</span>` : ""}</td>
          <td>${statusBadge(p.status)}</td>
        </tr>`;
    }
  }
  body.innerHTML = html;
}

function renderOffRoster() {
  const list = DATA.offRosterInjuries || [];
  const box = $("#off-roster");
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h2>Also on the injury report (not on active roster)</h2><ul>${
    list.map((i) => `<li><strong>${esc(i.name)}</strong> — ${esc(i.status)}${
      i.bodyPart ? `, ${esc(i.bodyPart)}` : ""}${
      i.returnDate ? ` (est. return ${esc(fmtDate(i.returnDate))})` : ""}</li>`).join("")
  }</ul>`;
}

// ---------- Report card ----------

function statTiles(p) {
  const s = p.stats || {};
  const tiles = p.group === "Goalie"
    ? [
        ["GP", s.gp],
        ["Record", `${s.wins}-${s.losses}-${s.otl}`],
        ["GAA", s.gaa != null ? s.gaa.toFixed(2) : "–"],
        ["SV%", s.svPct != null ? s.svPct.toFixed(3).replace(/^0/, "") : "–"],
      ]
    : [
        ["Games", s.gp],
        ["Goals", s.goals],
        ["Assists", s.assists],
        ["Points", s.points],
      ];
  return tiles.map(([lbl, val]) =>
    `<div class="stat"><div class="val">${esc(val)}</div><div class="lbl">${lbl}</div></div>`).join("");
}

function injuryReport(p) {
  const i = p.injury;
  if (!i) {
    return `<section class="injury"><h3>Injury Report</h3><p>No injuries reported.</p></section>`;
  }
  const what = [i.side, i.bodyPart, i.detail].filter(Boolean).join(" ") || "Undisclosed";
  return `
    <section class="injury has-injury">
      <h3>Injury Report</h3>
      <dl class="inj-grid">
        <dt>Injury</dt><dd>${esc(what)}</dd>
        <dt>Status</dt><dd>${esc(i.status)}</dd>
        <dt>Expected return</dt><dd>${i.returnDate ? esc(fmtDate(i.returnDate)) : "Not announced"}</dd>
        ${i.updated ? `<dt>Last update</dt><dd>${esc(fmtDate(i.updated))}</dd>` : ""}
      </dl>
      ${i.shortComment ? `<p>${esc(i.shortComment)}</p>` : ""}
      ${i.longComment && i.longComment !== i.shortComment ? `<p>${esc(i.longComment)}</p>` : ""}
      <p class="note">Return dates are estimates and teams often list injuries only as "upper body" or "lower body."</p>
    </section>`;
}

function openCard(id) {
  const p = DATA.players.find((x) => String(x.id) === String(id));
  if (!p) return;

  const born = [fmtDate(p.birthDate), p.birthPlace].filter(Boolean).join(" — ");
  const size = [height(p.height), p.weight ? `${p.weight} lb` : ""].filter(Boolean).join(", ");
  const handLabel = p.group === "Goalie" ? "Catches" : "Shoots";
  const hand = p.shoots === "L" ? "Left" : p.shoots === "R" ? "Right" : "";

  $("#card-content").innerHTML = `
    <div class="card-head">
      <span class="big-num">#${esc(p.number ?? "")}</span>
      <h2 id="card-name">${esc(p.name)}${p.letter ? ` <span class="letter head-letter">${esc(p.letter)}</span>` : ""}</h2>
    </div>
    <div class="card-body">
      <dl class="facts">
        <dt>Born</dt><dd>${esc(born) || "–"}</dd>
        <dt>Age</dt><dd>${esc(age(p.birthDate)) || "–"}</dd>
        <dt>Position</dt><dd>${esc(POSITIONS[p.position] || p.position)}</dd>
        <dt>Number</dt><dd>${esc(p.number ?? "–")}</dd>
        ${size ? `<dt>Size</dt><dd>${esc(size)}</dd>` : ""}
        ${hand ? `<dt>${handLabel}</dt><dd>${hand}</dd>` : ""}
        <dt>Status</dt><dd>${statusBadge(p.status)}</dd>
      </dl>
      <div class="photo">${
        p.headshot
          ? `<img src="${esc(p.headshot)}" alt="${esc(p.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'no-photo',textContent:'No photo'}))">`
          : `<span class="no-photo">No photo</span>`
      }</div>
    </div>
    <div class="stat-row">${statTiles(p)}</div>
    ${injuryReport(p)}
  `;
  $("#card").showModal();
}

// ---------- Wiring ----------

function wire() {
  $("#roster-body").addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (row) openCard(row.dataset.id);
  });
  $("#roster-body").addEventListener("keydown", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openCard(row.dataset.id); }
  });

  const card = $("#card");
  $("#card-close").addEventListener("click", () => card.close());
  // Click on the dark backdrop closes the card
  card.addEventListener("click", (e) => { if (e.target === card) card.close(); });

  document.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-on"));
      chip.classList.add("is-on");
      currentFilter = chip.dataset.filter;
      renderTable();
    }));
}

async function load() {
  wire();
  try {
    // cache-busting so GitHub Pages' CDN doesn't serve stale data
    const res = await fetch(`data/avs.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch {
    $("#roster-body").innerHTML =
      `<tr><td colspan="5" class="empty">No data yet. Run the "Update Avs data" workflow on the Actions tab.</td></tr>`;
    return;
  }

  const when = new Date(DATA.updated).toLocaleString("en-US",
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  $("#updated").textContent = `Updated ${when}${DATA.injuryFeedOk ? "" : " · injury feed unavailable"}`;

  renderTable();
  renderOffRoster();
}

load();
