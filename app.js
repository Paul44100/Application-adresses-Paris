// -------------------- CONFIG --------------------
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS3WcHiVxtcU4czBc6wG2xAcecWkphH2f4579aN0nlY5wnvdGZOBrcHX3nA069U23WU_3HZnm14fmK_/pub?output=csv&gid=0";

// -------------------- Carte --------------------
const map = L.map("map").setView([48.8566, 2.3522], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

let spots = [];
let markers = [];
let userMarker = null;

let userLocation = null; // { lat, lng }
let nearMeMode = false;

// -------------------- Icônes colorées --------------------
function coloredIcon(color) {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [30, 50],
    iconAnchor: [15, 50],
    popupAnchor: [1, -38],
    shadowSize: [45, 45],
  });
}

const ICONS = {
  cafe: coloredIcon("green"),
  restaurant: coloredIcon("red"),
  musee: coloredIcon("blue"),
  monument_lieu: coloredIcon("violet"),
  magasin: coloredIcon("orange"),
};

function getIconForTheme(theme) {
  return ICONS[theme] || coloredIcon("grey");
}

// -------------------- Légende --------------------
const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div");
  div.style.background = "white";
  div.style.padding = "10px 12px";
  div.style.borderRadius = "12px";
  div.style.boxShadow = "0 2px 10px rgba(0,0,0,0.12)";
  div.style.fontSize = "14px";
  div.style.lineHeight = "1.5";

  const items = [
    ["Café / Bar", "green"],
    ["Restaurants", "red"],
    ["Musées", "blue"],
    ["Monument / Lieu", "violet"],
    ["Magasins", "orange"],
  ];

  div.innerHTML =
    `<b>Légende</b><br/>` +
    items
      .map(
        ([label, color]) => `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="display:inline-block; width:10px; height:10px; border-radius:999px; background:${color};"></span>
        <span>${label}</span>
      </div>`
      )
      .join("");

  return div;
};
legend.addTo(map);

// -------------------- CSV robuste (gère les guillemets/virgules) --------------------
function parseCSV(text) {
  // Normalise les fins de ligne, enlève BOM éventuel
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // double-quote échappé
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  // dernière cellule
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h) => (h ?? "").trim());
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const vals = rows[r];
    if (!vals || vals.every((v) => String(v ?? "").trim() === "")) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (vals[idx] ?? "").trim();
    });

    // conversions
    obj.lat = obj.lat ? Number(obj.lat) : null;
    obj.lng = obj.lng ? Number(obj.lng) : null;

    // tags: "a, b" ou "a; b" -> ["a","b"]
    obj.tags = obj.tags
      ? obj.tags
          .split(";")
          .join(",")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    // nettoyages
    if (!obj.theme) obj.theme = "autre";

    // garde uniquement les spots avec coords
    if (Number.isFinite(obj.lat) && Number.isFinite(obj.lng)) out.push(obj);
  }

  return out;
}

// -------------------- Utilitaires --------------------
function normalize(str) {
  return (str ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLng / 2) ** 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function getActiveFilters() {
  return {
    theme: document.getElementById("themeFilter").value,
    q: document.getElementById("searchInput").value,
    tag: document.getElementById("tagFilter").value,
    radiusKm: parseFloat(document.getElementById("radiusSelect").value || "0"),
  };
}

function spotMatches(spot, filters) {
  if (filters.theme !== "all" && spot.theme !== filters.theme) return false;

  const tags = Array.isArray(spot.tags) ? spot.tags : [];
  if (filters.tag !== "all") {
    const hasTag = tags.some((t) => normalize(t) === normalize(filters.tag));
    if (!hasTag) return false;
  }

  const q = normalize(filters.q).trim();
  if (q) {
    const hay = [spot.name, spot.address, spot.note, ...tags].map(normalize).join(" | ");
    if (!hay.includes(q)) return false;
  }

  if (nearMeMode && userLocation && filters.radiusKm > 0) {
    const d = distanceMeters(userLocation.lat, userLocation.lng, spot.lat, spot.lng);
    if (d > filters.radiusKm * 1000) return false;
  }

  return true;
}

function buildPopup(spot) {
  const tags = Array.isArray(spot.tags) ? spot.tags : [];
  const tagsHtml = tags.length
    ? `<div style="margin-top:6px; opacity:.85;"><b>Tags :</b> ${tags.join(", ")}</div>`
    : "";

  const linkHtml = spot.link
    ? `<div style="margin-top:8px;"><a href="${spot.link}" target="_blank" rel="noreferrer">Voir sur Instagram</a></div>`
    : "";

  return `
    <div style="min-width:220px">
      <b>${spot.name || "Sans nom"}</b><br/>
      ${spot.note ? `<div style="margin-top:4px;">${spot.note}</div>` : ""}
      ${spot.address ? `<div style="margin-top:6px; opacity:.7">${spot.address}</div>` : ""}
      ${tagsHtml}
      ${linkHtml}
    </div>
  `;
}

// -------------------- Rendu --------------------
function clearMarkers() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
}

function fitToMarkers(markersToFit) {
  if (!markersToFit.length) return;
  const group = L.featureGroup(markersToFit);
  map.fitBounds(group.getBounds().pad(0.18));
}

function refreshTagDropdown() {
  const tagSelect = document.getElementById("tagFilter");
  const current = tagSelect.value;

  const allTags = new Set();
  spots.forEach((s) => (Array.isArray(s.tags) ? s.tags : []).forEach((t) => allTags.add(t)));

  const sorted = Array.from(allTags).sort((a, b) => a.localeCompare(b, "fr"));

  tagSelect.innerHTML =
    `<option value="all">Tous les tags</option>` +
    sorted.map((t) => `<option value="${t}">${t}</option>`).join("");

  const exists = Array.from(tagSelect.options).some((o) => o.value === current);
  tagSelect.value = exists ? current : "all";
}

function render() {
  const filters = getActiveFilters();
  clearMarkers();

  const filtered = spots.filter((s) => spotMatches(s, filters));

  filtered.forEach((s) => {
    const icon = getIconForTheme(s.theme);
    const marker = L.marker([s.lat, s.lng], { icon }).addTo(map).bindPopup(buildPopup(s));
    markers.push(marker);
  });

  if (markers.length) {
    fitToMarkers(markers);
  } else if (nearMeMode && userLocation) {
    map.setView([userLocation.lat, userLocation.lng], 14);
  }
}

// -------------------- Autour de moi --------------------
function setNearMeUI(enabled) {
  nearMeMode = enabled;
  document.getElementById("clearNearMeBtn").style.display = enabled ? "inline-block" : "none";
}

function enableNearMe() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n’est pas disponible sur ce navigateur.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        weight: 2,
      })
        .addTo(map)
        .bindPopup("Vous êtes ici");

      setNearMeUI(true);

      const radiusSelect = document.getElementById("radiusSelect");
      if (parseFloat(radiusSelect.value || "0") === 0) radiusSelect.value = "1";

      render();
    },
    () => alert("Impossible d’obtenir ta position. Autorise la localisation puis réessaie."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function disableNearMe() {
  setNearMeUI(false);
  if (userMarker) {
    map.removeLayer(userMarker);
    userMarker = null;
  }
  userLocation = null;
  document.getElementById("radiusSelect").value = "0";
  render();
}

// -------------------- Init --------------------
async function init() {
  const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes("?") ? "&" : "?") + "v=" + Date.now();
  const res = await fetch(url);
  const csv = await res.text();
  spots = parseCSV(csv);

  refreshTagDropdown();
  render();
}

// -------------------- Events UI --------------------
document.getElementById("themeFilter").addEventListener("change", render);
document.getElementById("tagFilter").addEventListener("change", render);
document.getElementById("radiusSelect").addEventListener("change", render);

let searchTimer = null;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
});

document.getElementById("nearMeBtn").addEventListener("click", enableNearMe);
document.getElementById("clearNearMeBtn").addEventListener("click", disableNearMe);

init();

