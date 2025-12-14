const map = L.map("map").setView([48.8566, 2.3522], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let spots = [];
let markers = [];

function renderMarkers(theme = "all") {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const filtered = theme === "all" ? spots : spots.filter(s => s.theme === theme);

  filtered.forEach(s => {
    const popup = `
      <div style="min-width:200px">
        <b>${s.name}</b><br/>
        ${s.note ? `<div>${s.note}</div>` : ""}
        ${s.address ? `<div style="opacity:.7">${s.address}</div>` : ""}
        ${s.link ? `<div><a href="${s.link}" target="_blank" rel="noreferrer">Lien</a></div>` : ""}
      </div>
    `;
    const m = L.marker([s.lat, s.lng]).addTo(map).bindPopup(popup);
    markers.push(m);
  });
}

async function init() {
  const res = await fetch("./spots.json");
  spots = await res.json();
  renderMarkers("all");
}

document.getElementById("themeFilter").addEventListener("change", (e) => {
  renderMarkers(e.target.value);
});

init();
