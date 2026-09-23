#!/usr/bin/env node
/**
 * Geocode Quebec MRC chefs-lieux + equivalent territories, then fetch PVWatts v8.
 *
 * Priority: Sud/30° for every town (dropdown yield), then full grids
 * (tilts 0/15/30/45/60/75/90 × azimuth every 15°; tilt 0 fetched once).
 *
 * Resume: towns.json keeps S/30 yields; scripts/pvwatts-progress/ keeps raw cells
 * for a town that is not finished; assets/town-grids/<id>.json is written only
 * when that town grid is complete, and its progress file is then removed.
 *
 * API key: NLR_API_KEY env or .dev.vars (never logged, never committed).
 *
 *   node scripts/fetch-quebec-towns.mjs --geocode-only
 *   node scripts/fetch-quebec-towns.mjs --s30-only
 *   node scripts/fetch-quebec-towns.mjs --grids-only
 *   node scripts/fetch-quebec-towns.mjs --status
 *   node scripts/fetch-quebec-towns.mjs --grids-only --budget 900 --exit-on-limit
 *
 * --budget N and --exit-on-limit stop the process (exit 0) so a later run can
 * continue. GitHub Actions uses that pair once an hour. See
 * .github/workflows/fetch-quebec-grids.yml.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TOWNS_PATH = join(ROOT, "assets", "towns.json");
const QUEBEC_GRID_PATH = join(ROOT, "assets", "quebec-full-grid.json");
const GRID_DIR = join(ROOT, "assets", "town-grids");
const CACHE_DIR = join(__dirname, "pvwatts-progress");
const LOG_PATH = join(__dirname, "fetch-quebec-towns.log");

const PV_HOST = "https://developer.nlr.gov/api/pvwatts/v8.json";
const QUEBEC_S30 = 1254.8064;
const QUEBEC_LAT = 46.813;
const QUEBEC_LON = -71.208;
const TILTS = [0, 15, 30, 45, 60, 75, 90];
const AZS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];

const REG = {
  BSL: "Bas-Saint-Laurent",
  SAG: "Saguenay–Lac-Saint-Jean",
  CAP: "Capitale-Nationale",
  MAU: "Mauricie",
  EST: "Estrie",
  MTL: "Montréal",
  OUT: "Outaouais",
  ABI: "Abitibi-Témiscamingue",
  CN: "Côte-Nord",
  NORD: "Nord-du-Québec",
  GAS: "Gaspésie–Îles-de-la-Madeleine",
  CHA: "Chaudière-Appalaches",
  LAV: "Laval",
  LAN: "Lanaudière",
  LAU: "Laurentides",
  MON: "Montérégie",
  CDQ: "Centre-du-Québec"
};

/** [name, region, territory, type] — 87 MRC + 17 equivalents. */
const PLACE_ROWS = [
  ["Amqui", REG.BSL, "La Matapédia", "MRC"],
  ["Matane", REG.BSL, "La Matanie", "MRC"],
  ["Mont-Joli", REG.BSL, "La Mitis", "MRC"],
  ["Rimouski", REG.BSL, "Rimouski-Neigette", "MRC"],
  ["Trois-Pistoles", REG.BSL, "Les Basques", "MRC"],
  ["Rivière-du-Loup", REG.BSL, "Rivière-du-Loup", "MRC"],
  ["Témiscouata-sur-le-Lac", REG.BSL, "Témiscouata", "MRC"],
  ["Saint-Pascal", REG.BSL, "Kamouraska", "MRC"],

  ["Roberval", REG.SAG, "Le Domaine-du-Roy", "MRC"],
  ["Dolbeau-Mistassini", REG.SAG, "Maria-Chapdelaine", "MRC"],
  ["Alma", REG.SAG, "Lac-Saint-Jean-Est", "MRC"],
  ["Saguenay", REG.SAG, "Saguenay", "Equivalent"],
  ["Saint-Honoré", REG.SAG, "Le Fjord-du-Saguenay", "MRC"],

  ["Clermont", REG.CAP, "Charlevoix-Est", "MRC"],
  ["Baie-Saint-Paul", REG.CAP, "Charlevoix", "MRC"],
  ["Sainte-Famille-de-l'Île-d'Orléans", REG.CAP, "L'Île-d'Orléans", "MRC"],
  ["Château-Richer", REG.CAP, "La Côte-de-Beaupré", "MRC"],
  ["Shannon", REG.CAP, "La Jacques-Cartier", "MRC"],
  ["Québec", REG.CAP, "Québec", "Equivalent"],
  ["Cap-Santé", REG.CAP, "Portneuf", "MRC"],

  ["Saint-Tite", REG.MAU, "Mékinac", "MRC"],
  ["Shawinigan", REG.MAU, "Shawinigan", "Equivalent"],
  ["Trois-Rivières", REG.MAU, "Trois-Rivières", "Equivalent"],
  ["Saint-Luc-de-Vincennes", REG.MAU, "Les Chenaux", "MRC"],
  ["Louiseville", REG.MAU, "Maskinongé", "MRC"],
  ["La Tuque", REG.MAU, "La Tuque", "Equivalent"],

  ["Lac-Mégantic", REG.EST, "Le Granit", "MRC"],
  ["Val-des-Sources", REG.EST, "Les Sources", "MRC"],
  ["Cookshire-Eaton", REG.EST, "Le Haut-Saint-François", "MRC"],
  ["Richmond", REG.EST, "Le Val-Saint-François", "MRC"],
  ["Sherbrooke", REG.EST, "Sherbrooke", "Equivalent"],
  ["Coaticook", REG.EST, "Coaticook", "MRC"],
  ["Magog", REG.EST, "Memphrémagog", "MRC"],
  ["Cowansville", REG.EST, "Brome-Missisquoi", "MRC"],
  ["Granby", REG.EST, "La Haute-Yamaska", "MRC"],

  ["Montréal", REG.MTL, "Montréal", "Equivalent"],

  ["Papineauville", REG.OUT, "Papineau", "MRC"],
  ["Gatineau", REG.OUT, "Gatineau", "Equivalent"],
  ["Chelsea", REG.OUT, "Les Collines-de-l'Outaouais", "MRC"],
  ["Gracefield", REG.OUT, "La Vallée-de-la-Gatineau", "MRC"],
  ["Campbell's Bay", REG.OUT, "Pontiac", "MRC"],

  ["Ville-Marie", REG.ABI, "Témiscamingue", "MRC"],
  ["Rouyn-Noranda", REG.ABI, "Rouyn-Noranda", "Equivalent"],
  ["La Sarre", REG.ABI, "Abitibi-Ouest", "MRC"],
  ["Amos", REG.ABI, "Abitibi", "MRC"],
  ["Val-d'Or", REG.ABI, "La Vallée-de-l'Or", "MRC"],

  ["Les Escoumins", REG.CN, "La Haute-Côte-Nord", "MRC"],
  ["Baie-Comeau", REG.CN, "Manicouagan", "MRC"],
  ["Sept-Îles", REG.CN, "Sept-Rivières", "MRC"],
  ["Fermont", REG.CN, "Caniapiscau", "MRC"],
  ["Havre-Saint-Pierre", REG.CN, "Minganie", "MRC"],
  ["Côte-Nord-du-Golfe-du-Saint-Laurent", REG.CN, "Le Golfe-du-Saint-Laurent", "MRC"],

  ["Kuujjuaq", REG.NORD, "Kativik", "Equivalent"],
  ["Chibougamau", REG.NORD, "Jamésie", "Equivalent"],
  ["Nemaska", REG.NORD, "Eeyou Istchee", "Equivalent"],

  ["Les Îles-de-la-Madeleine", REG.GAS, "Les Îles-de-la-Madeleine", "Equivalent"],
  ["Chandler", REG.GAS, "Le Rocher-Percé", "MRC"],
  ["Gaspé", REG.GAS, "La Côte-de-Gaspé", "MRC"],
  ["Sainte-Anne-des-Monts", REG.GAS, "La Haute-Gaspésie", "MRC"],
  ["New Carlisle", REG.GAS, "Bonaventure", "MRC"],
  ["Maria", REG.GAS, "Avignon", "MRC"],

  ["Saint-Jean-Port-Joli", REG.CHA, "L'Islet", "MRC"],
  ["Montmagny", REG.CHA, "Montmagny", "MRC"],
  ["Saint-Lazare-de-Bellechasse", REG.CHA, "Bellechasse", "MRC"],
  ["Lévis", REG.CHA, "Lévis", "Equivalent"],
  ["Sainte-Marie", REG.CHA, "La Nouvelle-Beauce", "MRC"],
  ["Beauceville", REG.CHA, "Beauce-Centre", "MRC"],
  ["Lac-Etchemin", REG.CHA, "Les Etchemins", "MRC"],
  ["Saint-Georges", REG.CHA, "Beauce-Sartigan", "MRC"],
  ["Thetford Mines", REG.CHA, "Les Appalaches", "MRC"],
  ["Sainte-Croix", REG.CHA, "Lotbinière", "MRC"],

  ["Laval", REG.LAV, "Laval", "Equivalent"],

  ["Berthierville", REG.LAN, "D'Autray", "MRC"],
  ["L'Assomption", REG.LAN, "L'Assomption", "MRC"],
  ["Joliette", REG.LAN, "Joliette", "MRC"],
  ["Rawdon", REG.LAN, "Matawinie", "MRC"],
  ["Sainte-Julienne", REG.LAN, "Montcalm", "MRC"],
  ["Terrebonne", REG.LAN, "Les Moulins", "MRC"],

  ["Saint-Eustache", REG.LAU, "Deux-Montagnes", "MRC"],
  ["Sainte-Thérèse", REG.LAU, "Thérèse-De Blainville", "MRC"],
  ["Mirabel", REG.LAU, "Mirabel", "Equivalent"],
  ["Saint-Jérôme", REG.LAU, "La Rivière-du-Nord", "MRC"],
  ["Lachute", REG.LAU, "Argenteuil", "MRC"],
  ["Sainte-Adèle", REG.LAU, "Les Pays-d'en-Haut", "MRC"],
  ["Mont-Blanc", REG.LAU, "Les Laurentides", "MRC"],
  ["Mont-Laurier", REG.LAU, "Antoine-Labelle", "MRC"],

  ["Acton Vale", REG.MON, "Acton", "MRC"],
  ["Sorel-Tracy", REG.MON, "Pierre-De Saurel", "MRC"],
  ["Saint-Hyacinthe", REG.MON, "Les Maskoutains", "MRC"],
  ["Marieville", REG.MON, "Rouville", "MRC"],
  ["Saint-Jean-sur-Richelieu", REG.MON, "Le Haut-Richelieu", "MRC"],
  ["Belœil", REG.MON, "La Vallée-du-Richelieu", "MRC"],
  ["Longueuil", REG.MON, "Longueuil", "Equivalent"],
  ["Verchères", REG.MON, "Marguerite-D'Youville", "MRC"],
  ["Saint-Constant", REG.MON, "Roussillon", "MRC"],
  ["Saint-Michel", REG.MON, "Les Jardins-de-Napierville", "MRC"],
  ["Huntingdon", REG.MON, "Le Haut-Saint-Laurent", "MRC"],
  ["Beauharnois", REG.MON, "Beauharnois-Salaberry", "MRC"],
  ["Vaudreuil-Dorion", REG.MON, "Vaudreuil-Soulanges", "MRC"],

  ["Plessisville", REG.CDQ, "L'Érable", "MRC"],
  ["Bécancour", REG.CDQ, "Bécancour", "MRC"],
  ["Victoriaville", REG.CDQ, "Arthabaska", "MRC"],
  ["Drummondville", REG.CDQ, "Drummond", "MRC"],
  ["Nicolet", REG.CDQ, "Nicolet-Yamaska", "MRC"]
];

/** Reject a hit farther than this from the municipality we mean. */
const ANCHORS = {
  "Mont-Blanc": [46.116, -74.466],
  "Saint-Michel": [45.233, -73.566],
  "Sainte-Croix": [46.62, -71.73],
  "Richmond": [45.666, -72.145],
  "Chelsea": [45.5, -75.78],
  "Shannon": [46.883, -71.517],
  "Clermont": [47.696, -70.23],
  "Maria": [48.17, -65.98],
  "Chibougamau": [49.917, -74.366],
  "Rouyn-Noranda": [48.242, -79.021],
  "Québec": [QUEBEC_LAT, QUEBEC_LON]
};

function slug(name) {
  return String(name)
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function places() {
  const list = PLACE_ROWS.map(([name, region, territory, type]) => ({
    id: slug(name),
    name,
    region,
    territory,
    type
  }));
  const ids = new Set();
  for (const p of list) {
    if (ids.has(p.id)) throw new Error("duplicate id " + p.id);
    ids.add(p.id);
  }
  if (list.length !== 104) throw new Error("expected 104 places, got " + list.length);
  const eq = list.filter((p) => p.type === "Equivalent").length;
  const mrc = list.filter((p) => p.type === "MRC").length;
  if (eq !== 17 || mrc !== 87) throw new Error(`types MRC=${mrc} Equivalent=${eq}`);
  return list;
}

function log(msg) {
  const line = new Date().toISOString() + " " + msg;
  console.log(line);
  try {
    writeFileSync(LOG_PATH, line + "\n", { flag: "a" });
  } catch (_) {}
}

function redact(s) {
  return String(s).replace(/api_key=[^&\s]+/gi, "api_key=REDACTED").replace(/NLR_API_KEY=\S+/g, "NLR_API_KEY=REDACTED");
}

function loadKey() {
  if (process.env.NLR_API_KEY && String(process.env.NLR_API_KEY).trim()) {
    return String(process.env.NLR_API_KEY).trim();
  }
  const p = join(ROOT, ".dev.vars");
  if (!existsSync(p)) return "";
  const text = readFileSync(p, "utf8");
  const m = text.match(/^NLR_API_KEY=(.+)$/m);
  return m ? m[1].trim() : "";
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function hasYield(v) {
  if (v == null || v === "") return false;
  const n = Number(v);
  return isFinite(n) && n > 0;
}

function sortTowns(towns) {
  return towns.slice().sort((a, b) => a.name.localeCompare(b.name, "fr-CA", { sensitivity: "base" }));
}

function writeTowns(towns) {
  const sorted = sortTowns(towns);
  const nS30 = sorted.filter((t) => hasYield(t.ac_annual_s30)).length;
  const nFull = sorted.filter((t) => t.grid === "full").length;
  const doc = {
    meta: {
      location_set: "87 MRC + 17 territoires équivalents du Québec",
      n_towns: sorted.length,
      n_s30: nS30,
      n_full_grid: nFull,
      n_scaled: sorted.length - nFull,
      sort: "fr-CA",
      default_id: "quebec",
      quebec_s30: QUEBEC_S30,
      units: "kWh_ac per kWdc per year (1 kWc)",
      s30: { tilt_deg: 30, azimuth_deg: 180, label: "Sud 30°" },
      setup: {
        api: "PVWatts v8",
        host: PV_HOST,
        system_capacity_kW: 1,
        losses_pct: 14,
        array_type: 1,
        module_type: 0,
        dataset: "nsrdb",
        timeframe: "monthly"
      },
      grid_note: "grid=full is a PVWatts cell grid. grid=scaled means only Sud/30° is measured; the calculator scales the Québec grid by ac_annual_s30 / quebec_s30.",
      as_of_utc: new Date().toISOString()
    },
    towns: sorted.map((t) => {
      const out = {
        id: t.id,
        name: t.name,
        region: t.region,
        territory: t.territory,
        type: t.type,
        lat: t.lat,
        lon: t.lon,
        ac_annual_s30: t.ac_annual_s30 == null ? null : t.ac_annual_s30,
        grid: t.grid || "scaled"
      };
      if (t.grid === "full" && t.grid_file) out.grid_file = t.grid_file;
      if (t.coord_note) out.coord_note = t.coord_note;
      return out;
    })
  };
  writeFileSync(TOWNS_PATH, JSON.stringify(doc, null, 2) + "\n");
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLon = (lon2 - lon1) * p;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function fold(s) {
  return String(s || "")
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function nominatim(params) {
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams(params).toString();
  let last = "nominatim failed";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "solutionera-calculateur-solaire/0.2 (quebec town grid; educational)"
      }
    });
    if (res.status === 429 || res.status >= 500) {
      last = "nominatim HTTP " + res.status;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error("nominatim HTTP " + res.status);
    return res.json();
  }
  throw new Error(last);
}

function scoreHit(place, hit) {
  const a = hit.address || {};
  if (String(a.country_code || "") !== "ca") return -1;
  const state = fold(a.state);
  if (!state.includes("quebec")) return -1;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!(lat >= 44 && lat <= 63 && lon >= -80 && lon <= -56)) return -1;
  let s = 0;
  const name = fold(hit.name);
  const want = fold(place.name);
  if (name === want) s += 60;
  else if (name.includes(want) || want.includes(name)) s += 25;
  else s -= 15;
  const blob = fold(JSON.stringify(a) + " " + (hit.display_name || ""));
  if (blob.includes(fold(place.territory))) s += 35;
  if (blob.includes(fold(place.region))) s += 15;
  if (["town", "city", "village", "municipality", "administrative"].includes(hit.addresstype)) s += 8;
  if (hit.category === "boundary" && ["city", "town", "village", "municipality"].includes(hit.addresstype)) s += 40;
  if (hit.category === "highway" || hit.category === "amenity" || hit.category === "leisure") s -= 50;
  if (place.name === "Saint-Michel" && blob.includes("montreal")) s -= 100;
  if (place.name === "Mont-Blanc" && (blob.includes("alpes") || blob.includes("france"))) s -= 100;
  const anchor = ANCHORS[place.name];
  if (anchor) {
    const d = haversineKm(lat, lon, anchor[0], anchor[1]);
    if (d > 45) s -= 80;
    else s += 15;
  }
  return s;
}

async function geocodePlace(place) {
  if (place.id === "quebec") {
    return {
      lat: QUEBEC_LAT,
      lon: QUEBEC_LON,
      display: "Québec (ville) — point de la grille existante"
    };
  }
  const q = `${place.name}, ${place.territory}, ${place.region}, Québec, Canada`;
  const hits = await nominatim({
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "ca",
    limit: "6",
    q
  });
  let best = null;
  let bestScore = -1;
  for (const hit of hits || []) {
    const sc = scoreHit(place, hit);
    if (sc > bestScore) {
      bestScore = sc;
      best = hit;
    }
  }
  if (!best || bestScore < 20) {
    throw new Error(`geocode failed for ${place.name} (best ${bestScore}) query=${q}`);
  }
  return {
    lat: Math.round(Number(best.lat) * 10000) / 10000,
    lon: Math.round(Number(best.lon) * 10000) / 10000,
    display: best.display_name
  };
}

async function reverseWater(lat, lon) {
  const url = "https://nominatim.openstreetmap.org/reverse?" + new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    zoom: "10",
    addressdetails: "1"
  });
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "solutionera-calculateur-solaire/0.2 (quebec town grid; educational)"
    }
  });
  if (!res.ok) return false;
  const data = await res.json();
  const cat = String(data.category || "");
  const type = String(data.type || "");
  const name = fold(data.name || data.display_name || "");
  if (cat === "natural" && /water|sea|bay|strait|coastline/.test(type)) return true;
  if (/^golfe du saint laurent|^gulf of st/.test(name)) return true;
  if (type === "sea" || type === "ocean") return true;
  return false;
}

async function geocodeAll(townsById) {
  const list = places();
  for (const place of list) {
    const prev = townsById.get(place.id);
    if (prev && isFinite(prev.lat) && isFinite(prev.lon) && prev.lat >= 44 && prev.lat <= 63 && prev.lon >= -80 && prev.lon <= -56) {
      Object.assign(prev, place);
      continue;
    }
    await sleep(1100);
    let geo = await geocodePlace(place);
    let coordNote = "";
    if (place.id === "cote-nord-du-golfe-du-saint-laurent") {
      await sleep(1100);
      const offshore = await reverseWater(geo.lat, geo.lon);
      log(`golfe centroid ${geo.lat},${geo.lon} offshore=${offshore} (${geo.display})`);
      if (offshore) {
        await sleep(1100);
        const blanc = await geocodePlace({
          id: "blanc-sablon",
          name: "Blanc-Sablon",
          territory: "Le Golfe-du-Saint-Laurent",
          region: REG.CN
        });
        geo = {
          lat: blanc.lat,
          lon: blanc.lon,
          display: "Blanc-Sablon (à la place du centroïde au large) — " + blanc.display
        };
        coordNote = "Centroïde de Côte-Nord-du-Golfe-du-Saint-Laurent au large; point utilisé : Blanc-Sablon.";
      }
    }
    if (!(geo.lat >= 44 && geo.lat <= 63 && geo.lon >= -80 && geo.lon <= -56)) {
      throw new Error(`coords out of range for ${place.name}: ${geo.lat},${geo.lon}`);
    }
    const row = Object.assign({}, prev || {}, place, {
      lat: geo.lat,
      lon: geo.lon,
      ac_annual_s30: prev && prev.ac_annual_s30 != null ? prev.ac_annual_s30 : null,
      grid: prev && prev.grid === "full" ? "full" : "scaled",
      grid_file: prev && prev.grid_file
    });
    if (coordNote) row.coord_note = coordNote;
    else delete row.coord_note;
    if (place.id === "quebec") {
      row.ac_annual_s30 = QUEBEC_S30;
      row.grid = "full";
      row.grid_file = "assets/quebec-full-grid.json";
      row.lat = QUEBEC_LAT;
      row.lon = QUEBEC_LON;
    }
    townsById.set(place.id, row);
    writeTowns([...townsById.values()]);
    log(`geocode ${place.name} → ${row.lat}, ${row.lon} | ${geo.display}`);
  }
}

function cachePath(id) {
  return join(CACHE_DIR, id + ".json");
}

function readCache(id) {
  const data = readJson(cachePath(id));
  if (!data || !data.cells) return { cells: {} };
  return data;
}

function writeCache(id, cache) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(id), JSON.stringify(cache));
}

function clearCache(id) {
  const path = cachePath(id);
  if (existsSync(path)) unlinkSync(path);
}

/** 99% of the 1 000/hour cap, leaving a 10-call buffer. */
const RATE_LIMIT = 1000;
const RATE_BUFFER = 10;
let gapMs = Math.round(3600000 / (RATE_LIMIT - RATE_BUFFER));
let nextSlot = 0;
let callsUsed = 0;
let maxCalls = Infinity;
let exitOnLimit = false;
let stopReason = "";

class StopFetch extends Error {
  constructor(reason) {
    super(reason);
    this.name = "StopFetch";
  }
}

function noteBudget(remain) {
  callsUsed += 1;
  if (exitOnLimit && isFinite(remain) && remain <= RATE_BUFFER) stopReason = stopReason || "rate";
  if (callsUsed >= maxCalls) stopReason = stopReason || "budget";
}

function parseArgs(argv) {
  const flags = new Set();
  let budget = Infinity;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--budget" || arg.startsWith("--budget=")) {
      const raw = arg === "--budget" ? argv[++i] : arg.slice("--budget=".length);
      const n = Number(raw);
      if (!raw || !isFinite(n) || n < 1) throw new Error("--budget expects a positive number");
      budget = Math.floor(n);
      continue;
    }
    flags.add(arg);
  }
  return { flags, budget };
}

function runSelfCheck() {
  const errors = [];
  const parsed = parseArgs(["--grids-only", "--budget", "12", "--exit-on-limit"]);
  if (parsed.budget !== 12 || !parsed.flags.has("--grids-only") || !parsed.flags.has("--exit-on-limit")) {
    errors.push("parse");
  }
  let rejected = false;
  try {
    parseArgs(["--budget", "0"]);
  } catch (_) {
    rejected = true;
  }
  if (!rejected) errors.push("budget 0");
  maxCalls = 2;
  exitOnLimit = true;
  stopReason = "";
  callsUsed = 0;
  noteBudget(800);
  if (stopReason) errors.push("early stop");
  noteBudget(800);
  if (stopReason !== "budget" || callsUsed !== 2) errors.push("budget stop");
  stopReason = "";
  callsUsed = 0;
  maxCalls = 50;
  noteBudget(RATE_BUFFER);
  if (stopReason !== "rate" || callsUsed !== 1) errors.push("rate stop");
  maxCalls = Infinity;
  exitOnLimit = false;
  stopReason = "";
  callsUsed = 0;
  if (errors.length) {
    console.error(errors.join("; "));
    process.exit(1);
  }
  console.log("self-check ok");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pace() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + gapMs;
  if (wait) await sleep(wait);
}

function cellFromOutputs(outputs) {
  const monthly = outputs.ac_monthly;
  if (!Array.isArray(monthly) || monthly.length !== 12) throw new Error("ac_monthly missing");
  const ac = Number(outputs.ac_annual);
  if (!isFinite(ac) || ac <= 0) throw new Error("ac_annual missing");
  const jan = Number(monthly[0]);
  const feb = Number(monthly[1]);
  const dec = Number(monthly[11]);
  const w = (dec + jan + feb) / ac;
  return {
    ac_annual: Math.round(ac * 10000) / 10000,
    W_winter: Math.round(w * 1e6) / 1e6,
    ac_dec: Math.round(dec * 10000) / 10000,
    ac_monthly: monthly.map((n) => Math.round(Number(n) * 10000) / 10000)
  };
}

async function pvwatts(key, lat, lon, tilt, azimuth) {
  if (stopReason) throw new StopFetch(stopReason);
  const params = new URLSearchParams({
    api_key: key,
    lat: String(lat),
    lon: String(lon),
    system_capacity: "1",
    azimuth: String(azimuth),
    tilt: String(tilt),
    array_type: "1",
    module_type: "0",
    losses: "14",
    dataset: "nsrdb",
    timeframe: "monthly"
  });
  let lastErr = "unknown";
  for (let attempt = 0; attempt < 8; attempt++) {
    await pace();
    let res;
    try {
      res = await fetch(PV_HOST + "?" + params.toString(), { headers: { Accept: "application/json" } });
    } catch (err) {
      lastErr = redact(err && err.message ? err.message : err);
      log(`network error tilt=${tilt} az=${azimuth} attempt=${attempt} ${lastErr}`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = isFinite(ra) && ra > 0 ? Math.min(ra, 600) * 1000 : Math.min(120000, 15000 * (attempt + 1));
      gapMs = Math.min(8000, Math.max(gapMs * 2, 1500));
      log(`429 tilt=${tilt} az=${azimuth} wait=${Math.round(wait / 1000)}s gap=${gapMs}ms`);
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      lastErr = "HTTP " + res.status + " " + redact(text).slice(0, 240);
      log(lastErr);
      if (res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(lastErr);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error("pvwatts json: " + redact(err.message));
    }
    if (data.errors && data.errors.length) {
      throw new Error("pvwatts errors: " + redact(JSON.stringify(data.errors)).slice(0, 300));
    }
    const remainRaw = res.headers.get("x-ratelimit-remaining") || res.headers.get("ratelimit-remaining");
    const remain = remainRaw == null ? NaN : Number(remainRaw);
    if (isFinite(remain) && remain <= RATE_BUFFER && !exitOnLimit) {
      const resetRaw = res.headers.get("x-ratelimit-reset") || res.headers.get("ratelimit-reset");
      const resetNum = Number(resetRaw);
      let waitMs = 5 * 60 * 1000;
      if (isFinite(resetNum) && resetNum > 1e9) waitMs = Math.max(5000, resetNum * 1000 - Date.now() + 2000);
      else if (isFinite(resetNum) && resetNum > 0 && resetNum < 7200) waitMs = resetNum * 1000 + 2000;
      gapMs = Math.round(3600000 / (RATE_LIMIT - RATE_BUFFER));
      nextSlot = Date.now() + waitMs;
      log(`rate buffer remaining=${remain} wait=${Math.round(waitMs / 1000)}s reset=${resetRaw || ""}`);
    } else if (isFinite(remain) && remain <= RATE_BUFFER + 20) {
      gapMs = Math.round(3600000 / (RATE_LIMIT - RATE_BUFFER));
    } else {
      gapMs = 400;
    }
    const cell = cellFromOutputs(data.outputs || {});
    noteBudget(remain);
    return cell;
  }
  throw new Error("pvwatts gave up: " + lastErr);
}

function compactCell(cell) {
  return {
    ac_annual: cell.ac_annual,
    W_winter: cell.W_winter,
    ac_dec: cell.ac_dec
  };
}

async function fetchMissingCell(key, place, row, tilt, az, cache) {
  const keyCell = tilt + ":" + az;
  if (cache.cells[keyCell]) return cache.cells[keyCell];
  if (stopReason) throw new StopFetch(stopReason);
  const cell = await pvwatts(key, row.lat, row.lon, tilt, az);
  cache.cells[keyCell] = cell;
  writeCache(place.id, cache);
  if (stopReason) throw new StopFetch(stopReason);
  return cell;
}

function pause(placeName) {
  log(`pause ${placeName} reason=${stopReason} calls=${callsUsed}`);
}

async function fetchS30(key, townsById) {
  for (const place of places()) {
    const row = townsById.get(place.id);
    if (!row || !isFinite(row.lat)) throw new Error("missing coords for " + place.name);
    if (place.id === "quebec" && Number(row.ac_annual_s30) === QUEBEC_S30) {
      log("s30 Québec seeded " + QUEBEC_S30);
      continue;
    }
    if (hasYield(row.ac_annual_s30)) {
      log(`s30 skip ${place.name} ${row.ac_annual_s30}`);
      continue;
    }
    const cache = readCache(place.id);
    let cell;
    try {
      cell = await fetchMissingCell(key, place, row, 30, 180, cache);
    } catch (err) {
      if (err instanceof StopFetch) {
        pause(place.name);
        return;
      }
      throw err;
    }
    row.ac_annual_s30 = cell.ac_annual;
    if (row.grid !== "full") row.grid = "scaled";
    townsById.set(place.id, row);
    writeTowns([...townsById.values()]);
    log(`s30 ${place.name} ${cell.ac_annual} kWh/kW`);
  }
}

function gridComplete(cells) {
  for (const tilt of TILTS) {
    for (const az of AZS) {
      if (!cells[String(tilt)] || !cells[String(tilt)][String(az)]) return false;
    }
  }
  return true;
}

async function fetchFullGrids(key, townsById, onlyIds) {
  mkdirSync(GRID_DIR, { recursive: true });
  for (const place of places()) {
    if (onlyIds && !onlyIds.has(place.id)) continue;
    const row = townsById.get(place.id);
    if (!row) continue;
    if (place.id === "quebec") {
      if (row.grid !== "full" || row.grid_file !== "assets/quebec-full-grid.json") {
        row.grid = "full";
        row.grid_file = "assets/quebec-full-grid.json";
        townsById.set(place.id, row);
        writeTowns([...townsById.values()]);
      }
      continue;
    }
    const outPath = join(GRID_DIR, place.id + ".json");
    if (row.grid === "full" && existsSync(outPath)) {
      const existing = readJson(outPath);
      if (existing && existing.scaled !== true && gridComplete(existing.cells || {})) {
        log(`grid skip ${place.name}`);
        continue;
      }
    }
    const cache = readCache(place.id);
    const built = {};
    for (const tilt of TILTS) {
      const azimuths = tilt === 0 ? [0] : AZS;
      for (const az of azimuths) {
        let cell = cache.cells[tilt + ":" + az];
        if (!cell) {
          try {
            cell = await fetchMissingCell(key, place, row, tilt, az, cache);
          } catch (err) {
            if (err instanceof StopFetch) {
              pause(place.name);
              return;
            }
            throw err;
          }
        }
        if (!built[String(tilt)]) built[String(tilt)] = {};
        if (tilt === 0) {
          for (const copyAz of AZS) built["0"][String(copyAz)] = compactCell(cell);
        } else {
          built[String(tilt)][String(az)] = compactCell(cell);
        }
      }
    }
    if (!gridComplete(built)) throw new Error("incomplete grid " + place.id);
    const s30cell = built["30"] && built["30"]["180"];
    if (s30cell && Number(s30cell.ac_annual) > 0) row.ac_annual_s30 = s30cell.ac_annual;
    const doc = {
      id: place.id,
      source: "pvwatts-v8-nsrdb",
      scaled: false,
      lat: row.lat,
      lon: row.lon,
      ac_annual_s30: row.ac_annual_s30,
      cells: built
    };
    writeFileSync(outPath, JSON.stringify(doc));
    clearCache(place.id);
    row.grid = "full";
    row.grid_file = "assets/town-grids/" + place.id + ".json";
    townsById.set(place.id, row);
    writeTowns([...townsById.values()]);
    log(`grid full ${place.name} (168 cells)`);
  }
}

function loadTownMap() {
  const doc = readJson(TOWNS_PATH);
  const map = new Map();
  const base = places();
  for (const p of base) map.set(p.id, Object.assign({}, p, { ac_annual_s30: null, grid: "scaled" }));
  if (doc && Array.isArray(doc.towns)) {
    for (const t of doc.towns) {
      const prev = map.get(t.id);
      if (!prev) continue;
      map.set(t.id, Object.assign({}, prev, t, {
        name: prev.name,
        region: prev.region,
        territory: prev.territory,
        type: prev.type
      }));
    }
  }
  const qc = map.get("quebec");
  qc.lat = QUEBEC_LAT;
  qc.lon = QUEBEC_LON;
  qc.ac_annual_s30 = Number(qc.ac_annual_s30) > 0 ? Number(qc.ac_annual_s30) : QUEBEC_S30;
  qc.grid = "full";
  qc.grid_file = "assets/quebec-full-grid.json";
  const fixes = {
    chibougamau: {
      lat: 49.9137,
      lon: -74.3714,
      coord_note: "Centre de la ville de Chibougamau (le premier géocodage visait le lac)."
    },
    "rouyn-noranda": {
      lat: 48.2421,
      lon: -79.0205,
      coord_note: "Centre de Rouyn-Noranda (le premier géocodage visait Cadillac)."
    }
  };
  for (const [id, fix] of Object.entries(fixes)) {
    const row = map.get(id);
    if (!row) continue;
    const cache = readCache(id);
    if (cache.cells && Object.keys(cache.cells).length) continue;
    row.lat = fix.lat;
    row.lon = fix.lon;
    row.coord_note = fix.coord_note;
  }
  return map;
}

function printStatus(short) {
  const towns = [...loadTownMap().values()];
  const full = towns.filter((t) => t.grid === "full");
  if (short) {
    console.log(full.length + "/" + towns.length);
    return;
  }
  const left = towns.filter((t) => t.grid !== "full").map((t) => t.name);
  log(`status full=${full.length}/${towns.length} remaining=${left.length} calls=${callsUsed} stop=${stopReason || "none"}`);
  if (left.length) log("next " + left.slice(0, 8).join(", "));
}

async function main() {
  const { flags, budget } = parseArgs(process.argv.slice(2));
  maxCalls = budget;
  exitOnLimit = flags.has("--exit-on-limit") || Number.isFinite(budget);
  if (flags.has("--self-check")) {
    runSelfCheck();
    return;
  }
  if (flags.has("--status")) {
    printStatus(flags.has("--short"));
    return;
  }
  const geocodeOnly = flags.has("--geocode-only");
  const s30Only = flags.has("--s30-only");
  const gridsOnly = flags.has("--grids-only");
  const phase1 = flags.has("--phase1");
  const doGeocode = geocodeOnly || (!s30Only && !gridsOnly && !phase1);
  const doS30 = s30Only || phase1 || (!geocodeOnly && !gridsOnly);
  const doGrids = gridsOnly || (!geocodeOnly && !s30Only && !phase1);

  const map = loadTownMap();
  if (doGeocode) {
    await geocodeAll(map);
    writeTowns([...map.values()]);
  }
  if (geocodeOnly) {
    log("geocode done " + map.size);
    return;
  }
  const key = loadKey();
  if (!key) {
    log("missing NLR_API_KEY — S/30 and grids not fetched");
    process.exit(1);
  }
  if (phase1) await fetchFullGrids(key, map, new Set(["montreal", "sherbrooke"]));
  if (doS30 && !stopReason) await fetchS30(key, map);
  if (doGrids && !stopReason) await fetchFullGrids(key, map);
  if (!stopReason) writeTowns([...map.values()]);
  printStatus(false);
}

main().catch((err) => {
  if (err instanceof StopFetch) {
    log("paused " + err.message + " calls=" + callsUsed);
    process.exit(0);
  }
  log("FATAL " + redact(err && err.stack ? err.stack : err));
  process.exit(1);
});
