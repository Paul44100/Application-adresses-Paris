const map = L.map("map").setView([48.8566, 2.3522], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let spots = [];
let markers = [];

// --- Icônes colorées ---
function coloredIcon(color) {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
}

// Choix des couleurs par thème (tu peux changer les couleurs si tu veux)
const ICONS = {
  cafe: coloredIcon("green"),
  restaurant: coloredIcon("red"),
  musee: coloredIcon("blue"),
  monument_lieu: coloredIcon("violet"),
  magasin: coloredIcon("orange")
};

function renderMarkers(theme = "all") {
  // Supprimer les anciens pins
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const filtered = theme === "all" ? spots : spots.filter(s => s.theme === theme);

  filtered.forEach(s => {
    const popup = `
      <div style="min-width:200px">
        <b>${s.name ?? "Sans nom"}</b><br/>
        ${s.note ? `<div>${s.note}</div>` : ""}
        ${s.address ? `<div style="opacity:.7">${s.address}</div>` : ""}
        ${
          s.link
            ? `<div><a href="${s.link}" target="_blank" rel="noreferrer">Voir sur Instagram</a></div>`
            : ""
        }
      </div>
    `;

    const icon = ICONS[s.theme] || coloredIcon("grey");
    const m = L.marker([s.lat, s.lng], { icon }).addTo(map).bindPopup(popup);
    markers.push(m);
  });
}

async function init() {
  // anti-cache pour éviter de voir une ancienne version de spots.json
  const res = await fetch("./spots.json?v=" + Date.now());
  spots = await res.json();
  renderMarkers("all");
}

document.getElementById("themeFilter").addEventListener("change", (e) => {
  renderMarkers(e.target.value);
});

init();
