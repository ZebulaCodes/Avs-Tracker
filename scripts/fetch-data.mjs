// fetch-data.mjs
// Pulls the Colorado Avalanche roster + season stats from the NHL's public API,
// merges in injury info from ESPN's public injuries feed, and writes data/avs.json.
// Runs in GitHub Actions on a schedule (Node 20+, no packages needed).
//
// Run locally:  node scripts/fetch-data.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";

const TEAM = "COL";
const ESPN_TEAM_NAME = "Colorado Avalanche";

const NHL = "https://api-web.nhle.com/v1";
const ESPN_INJURIES = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries";

const HEADERS = { "User-Agent": "avs-tracker (personal fan site)" };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// "Nathan MacKinnon" / "Nathan Mackinnon" / "Nathan MacKinnon Jr." all become "nathanmackinnon"
function nameKey(name) {
  return String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii)\b\.?/g, "")
    .replace(/[^a-z]/g, "");
}

const txt = (v) => (v && typeof v === "object" ? v.default ?? "" : v ?? "");

async function loadCaptains() {
  try {
    const raw = JSON.parse(await readFile("data/captains.json", "utf8"));
    const map = new Map();
    for (const n of raw.captain ? [raw.captain] : []) map.set(nameKey(n), "C");
    for (const n of raw.alternates || []) map.set(nameKey(n), "A");
    return map;
  } catch {
    console.warn("No data/captains.json found; C/A column will be blank.");
    return new Map();
  }
}

async function loadInjuries() {
  try {
    const data = await getJson(ESPN_INJURIES);
    const team = (data.injuries || []).find(
      (t) => t.displayName === ESPN_TEAM_NAME || t.abbreviation === TEAM
    );
    const map = new Map();
    for (const inj of team?.injuries || []) {
      const d = inj.details || {};
      map.set(nameKey(inj.athlete?.displayName), {
        name: inj.athlete?.displayName || "",
        status: inj.status || inj.type?.description || "Injured",
        bodyPart: d.type || null,          // e.g. "Lower Body", "Knee"
        detail: d.detail || null,          // e.g. "Sprain"
        side: d.side && d.side !== "Not Specified" ? d.side : null,
        returnDate: d.returnDate || null,  // ESPN's estimate, YYYY-MM-DD
        updated: inj.date || null,
        shortComment: inj.shortComment || null,
        longComment: inj.longComment || null,
      });
    }
    return { map, ok: true };
  } catch (err) {
    // Don't fail the whole run if ESPN is down; just keep stats fresh.
    console.warn("Injury feed unavailable:", err.message);
    return { map: new Map(), ok: false };
  }
}

async function main() {
  const [roster, stats, captains, injuries] = await Promise.all([
    getJson(`${NHL}/roster/${TEAM}/current`),
    getJson(`${NHL}/club-stats/${TEAM}/now`),
    loadCaptains(),
    loadInjuries(),
  ]);

  const skaterStats = new Map((stats.skaters || []).map((s) => [s.playerId, s]));
  const goalieStats = new Map((stats.goalies || []).map((g) => [g.playerId, g]));

  const groups = [
    ["forwards", "Forward"],
    ["defensemen", "Defense"],
    ["goalies", "Goalie"],
  ];

  const players = [];
  for (const [key, group] of groups) {
    for (const p of roster[key] || []) {
      const name = `${txt(p.firstName)} ${txt(p.lastName)}`.trim();
      const k = nameKey(name);
      const isGoalie = key === "goalies";
      const s = isGoalie ? goalieStats.get(p.id) : skaterStats.get(p.id);
      const injury = injuries.map.get(k) || null;

      players.push({
        id: p.id,
        name,
        number: p.sweaterNumber ?? null,
        position: p.positionCode,          // C, L, R, D, G
        group,
        letter: captains.get(k) || "",     // "C", "A" or ""
        headshot: p.headshot || null,
        birthDate: p.birthDate || null,
        birthPlace: [txt(p.birthCity), txt(p.birthStateProvince), p.birthCountry]
          .filter(Boolean).join(", "),
        height: p.heightInInches ?? null,
        weight: p.weightInPounds ?? null,
        shoots: p.shootsCatches || null,
        status: injury ? injury.status : "Active",
        injury,
        stats: isGoalie
          ? {
              gp: s?.gamesPlayed ?? 0,
              wins: s?.wins ?? 0,
              losses: s?.losses ?? 0,
              otl: s?.overtimeLosses ?? 0,
              gaa: s?.goalsAgainstAverage ?? null,
              svPct: s?.savePercentage ?? null,
              shutouts: s?.shutouts ?? 0,
            }
          : {
              gp: s?.gamesPlayed ?? 0,
              goals: s?.goals ?? 0,
              assists: s?.assists ?? 0,
              points: s?.points ?? 0,
              plusMinus: s?.plusMinus ?? 0,
              pim: s?.penaltyMinutes ?? 0,
            },
      });
    }
  }

  // Injured players ESPN lists who aren't on the active NHL roster (e.g. on LTIR)
  const onRoster = new Set(players.map((p) => nameKey(p.name)));
  const offRoster = [];
  for (const [k, inj] of injuries.map) {
    if (!onRoster.has(k)) offRoster.push(inj);
  }

  const out = {
    team: TEAM,
    season: stats.season ?? null,
    updated: new Date().toISOString(),
    injuryFeedOk: injuries.ok,
    players,
    offRosterInjuries: offRoster,
  };

  await mkdir("data", { recursive: true });
  await writeFile("data/avs.json", JSON.stringify(out, null, 2));
  console.log(`Wrote ${players.length} players (${[...injuries.map.keys()].length} on injury report).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
