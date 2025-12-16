// -------------------- Carte --------------------
const map = L.map("map").setView([48.8566, 2.3522], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let spots = [];
let markers = [];
let userMarker = null;

let userLocation = null;   // { lat, lng }
let nearMeMode = false;

// -------------------- Icônes colorées (+ un peu plus grosses pour mobile) --------------------
function coloredIcon(color) {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [30, 50],     // un peu plus grand que défaut
    iconAnchor: [15, 50],
    popupAnchor: [1, -38],
    shadowSize: [45, 45]
  });
}

const ICONS = {
  cafe: coloredIcon("green"),
  restaurant: coloredIcon("red"),
  musee: coloredIcon("blue"),
  monument_lieu: coloredIcon("violet"),
  magasin: coloredIcon("orange")
};

function getIconForTheme(theme) {
  return ICONS[theme] || coloredIcon("grey");
}

// -------------------- Légende des couleurs --------------------
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
  const div = L.DomUtil.create("div", "info legend");
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
    ["Magasins", "orange"]
  ];

  div.innerHTML = `<b>Légende</b><br/>` + items.map(([label, color]) => {
    return `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="display:inline-block; width:10px; height:10px; border-radius:999px; background:${color};"></span>
        <span>${label}</span>
      </div>
    `;
  }).join("");

  return div;
};

legend.addTo(map);

// -------------------- Utilitaires --------------------
function normalize(str) {
  return (str ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// distance (m) via haversine
function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const x = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLng/2) ** 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  return R * c;
}

function getActiveFilters() {
  return {
    theme: document.getElementById("themeFilter").value,
    q: document.getElementById("searchInput").value,
    tag: document.getElementById("tagFilter").value,
    radiusKm: parseFloat(document.getElementById("radiusSelect").value || "0")
  };
}

function spotMatches(spot, filters) {
  // Filtre thème
  if (filters.theme !== "all" && spot.theme !== filters.theme) return false;

  // Filtre tag
  const tags = Array.isArray(spot.tags) ? spot.tags : [];
  if (filters.tag !== "all") {
    const hasTag = tags.some(t => normalize(t) === normalize(filters.tag));
    if (!hasTag) return false;
  }

  // Recherche texte
  const q = normalize(filters.q).trim();
  if (q) {
    const hay = [
      spot.name,
      spot.address,
      spot.note,
      ...(Array.isArray(spot.tags) ? spot.tags : [])
    ].map(normalize).join(" | ");
    if (!hay.includes(q)) return false;
  }

  // Autour de moi
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
      <b>${spot.name ?? "Sans nom"}</b><br/>
      ${spot.note ? `<div style="margin-top:4px;">${spot.note}</div>` : ""}
      ${spot.address ? `<div style="margin-top:6px; opacity:.7">${spot.address}</div>` : ""}
      ${tagsHtml}
      ${linkHtml}
    </div>
  `;
}

// -------------------- Rendu --------------------
function clearMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}

function fitToMarkers(markersToFit) {
  if (!markersToFit.length) return;
  const group = L.featureGroup(markersToFit);
  map.fitBounds(group.getBounds().pad(0.18));
}

function render() {
  const filters = getActiveFilters();

  clearMarkers();

  const filtered = spots.filter(s => spotMatches(s, filters));

  // Ajoute les marqueurs
  filtered.forEach(s => {
    const icon = getIconForTheme(s.theme);
    const marker = L.marker([s.lat, s.lng], { icon }).addTo(map).bindPopup(buildPopup(s));
    markers.push(marker);
  });

  // Centrage auto sur les résultats (Étape 1)
  if (markers.length) {
    fitToMarkers(markers);
  } else if (nearMeMode && userLocation) {
    map.setView([userLocation.lat, userLocation.lng], 14);
  }
}

// -------------------- Tags : remplir le select --------------------
function refreshTagDropdown() {
  const tagSelect = document.getElementById("tagFilter");

  // garde la valeur actuelle si possible
  const current = tagSelect.value;

  const allTags = new Set();
  spots.forEach(s => {
    (Array.isArray(s.tags) ? s.tags : []).forEach(t => allTags.add(t));
  });

  const sorted = Array.from(allTags).sort((a, b) => a.localeCompare(b, "fr"));

  // rebuild options
  tagSelect.innerHTML = `<option value="all">Tous les tags</option>` + sorted.map(t =>
    `<option value="${t}">${t}</option>`
  ).join("");

  // restore if exists
  const exists = Array.from(tagSelect.options).some(o => o.value === current);
  tagSelect.value = exists ? current : "all";
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

      // marker utilisateur
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        weight: 2
      }).addTo(map).bindPopup("Vous êtes ici");

      setNearMeUI(true);

      // si aucun rayon choisi, on en met un par défaut
      const radiusSelect = document.getElementById("radiusSelect");
      if (parseFloat(radiusSelect.value || "0") === 0) radiusSelect.value = "1";

      render();
    },
    (err) => {
      alert("Impossible d’obtenir ta position. Autorise la localisation puis réessaie.");
      console.error(err);
    },
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

  // remet le rayon à "—"
  document.getElementById("radiusSelect").value = "0";
  render();
}

// -------------------- Init --------------------
async function init() {
  // anti-cache : évite de voir une ancienne version
  const res = await fetch("./spots.json?v=" + Date.now());
  spots = await res.json();

  refreshTagDropdown();
  render();
}

// -------------------- Événements UI --------------------
document.getElementById("themeFilter").addEventListener("change", render);
document.getElementById("tagFilter").addEventListener("change", render);
document.getElementById("radiusSelect").addEventListener("change", render);

// recherche: instant (mais léger debounce)
let searchTimer = null;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
});

document.getElementById("nearMeBtn").addEventListener("click", enableNearMe);
document.getElementById("clearNearMeBtn").addEventListener("click", disableNearMe);

init();

