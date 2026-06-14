const $ = (id) => document.getElementById(id);

const state = {
  health: { reachable: false, hasApiKey: false, demoMode: true, managedCount: 0 },
};

const ICONS = {
  box: `<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  truck: `<svg viewBox="0 0 24 24"><path d="M10 17H5V6h11v11h-2"/><path d="M16 9h3l3 3v5h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  alert: `<svg viewBox="0 0 24 24"><path d="M10.3 4 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  shield: `<svg viewBox="0 0 24 24"><path d="M12 3 4 7v5c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-5"/></svg>`,
};

const TRACKER_STEPS = [
  ["Booked", "Order received"],
  ["Picked Up", "Package collected"],
  ["In Transit", "Moving now"],
  ["Out for Delivery", "Courier assigned"],
  ["Delivered", "Completed"],
];

const LOCAL_DEMO = {
  D11234567IN: {
    awb: "D11234567IN",
    status: "in-transit",
    statusName: "In Transit",
    statusDetail: "Departed Delhi gateway hub",
    origin: { city: "New Delhi", pin: "110001" },
    destination: { city: "Mumbai", pin: "400001" },
    eta: "23 May 2026",
    etaNote: "Tomorrow",
    booked: "20 May 2026",
    service: "DTDC Express",
    weight: "1.4 kg",
    pieces: 1,
    progress: 2,
    confidence: "92%",
    source: "demo",
    events: [
      { event: "Departed Delhi Gateway Hub", location: "IGI Cargo Complex, New Delhi", time: "22 May 2026, 4:12 AM" },
      { event: "Arrived at gateway hub", location: "Indira Gandhi International, New Delhi", time: "21 May 2026, 11:40 PM" },
      { event: "Package picked up", location: "Connaught Place, New Delhi - 110001", time: "21 May 2026, 6:45 PM" },
      { event: "Shipment booked", location: "DTDC Netaji Subhash Place", time: "20 May 2026, 2:30 PM" },
    ],
  },
  D98765432IN: {
    awb: "D98765432IN",
    status: "delivered",
    statusName: "Delivered",
    statusDetail: "Signed by Raj Sharma",
    origin: { city: "Bengaluru", pin: "560001" },
    destination: { city: "New Delhi", pin: "110092" },
    eta: "19 May 2026",
    etaNote: "Delivered on schedule",
    booked: "17 May 2026",
    service: "DTDC Priority",
    weight: "0.8 kg",
    pieces: 2,
    progress: 4,
    confidence: "100%",
    source: "demo",
    events: [
      { event: "Delivered - Signed by Raj Sharma", location: "Preet Vihar, New Delhi - 110092", time: "19 May 2026, 11:22 AM" },
      { event: "Out for delivery", location: "Delhi East Distribution Hub", time: "19 May 2026, 7:58 AM" },
      { event: "Arrived at destination hub", location: "Patparganj Industrial Area, Delhi", time: "18 May 2026, 11:34 PM" },
      { event: "Departed origin gateway", location: "Kempegowda International Cargo, Bengaluru", time: "17 May 2026, 10:20 PM" },
    ],
  },
  D55501234IN: {
    awb: "D55501234IN",
    status: "out-for-delivery",
    statusName: "Out for Delivery",
    statusDetail: "Arriving today before 7 PM",
    origin: { city: "Hyderabad", pin: "500001" },
    destination: { city: "Gurugram", pin: "122002" },
    eta: "22 May 2026",
    etaNote: "Today before 7 PM",
    booked: "18 May 2026",
    service: "DTDC Ground",
    weight: "3.2 kg",
    pieces: 1,
    progress: 3,
    confidence: "88%",
    source: "demo",
    events: [
      { event: "Out for delivery", location: "Gurugram South Distribution Centre", time: "22 May 2026, 8:44 AM" },
      { event: "Arrived at delivery hub", location: "Sector 18, Gurugram - 122002", time: "22 May 2026, 6:10 AM" },
      { event: "In transit", location: "DTDC Delhi-NCR Gateway", time: "21 May 2026, 9:30 PM" },
      { event: "Shipment booked", location: "DTDC Banjara Hills, Hyderabad", time: "18 May 2026, 10:00 AM" },
    ],
  },
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function normalizeAwb(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function updateHealthUI() {
  const serverState = $("serverState");
  const modeBadge = $("modeBadge");
  const keyState = $("keyState");
  const managedCount = $("managedCount");

  if (serverState) {
    serverState.classList.toggle("live", state.health.reachable);
    serverState.classList.toggle(
      "warn",
      state.health.reachable && !state.health.hasApiKey
    );

    serverState.lastChild.textContent = "Tracking Service";
  }

  if (modeBadge) {
    modeBadge.style.display = "none";
  }

  if (keyState) {
    keyState.textContent = "Active";
  }

  if (managedCount) {
    managedCount.textContent =
      `${state.health.managedCount || 0} shipments`;
  }
}
async function checkHealth() {
  if (location.protocol === "file:") {
    state.health = { reachable: false, hasApiKey: false, demoMode: true, managedCount: Object.keys(LOCAL_DEMO).length };
    updateHealthUI();
    return;
  }

  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    state.health = await res.json();
  } catch {
    state.health = { reachable: false, hasApiKey: false, demoMode: true, managedCount: 0 };
  }
  updateHealthUI();
}

function localShipment(awb) {
  const key = normalizeAwb(awb);
  if (LOCAL_DEMO[key]) return LOCAL_DEMO[key];
  return {
    awb: key,
    status: "exception",
    statusName: "Shipment Not Found",
    statusDetail: "No shipment was found with this consignment number",
    origin: { city: "Awaiting scan", pin: "" },
    destination: { city: "Awaiting API", pin: "" },
    eta: "TBD",
    etaNote: "",
    booked: "TBD",
    service: "DTDC",
    weight: "--",
    pieces: 1,
    progress: 0,
    confidence: "--",
    source: "demo",
    events: [{ event: "No tracking information available", location: "", time: "Now" }],
  };
}

async function fetchTracking(awb) {
  if (location.protocol === "file:") return localShipment(awb);
  const res = await fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ awb, mode: state.health.hasApiKey ? "live" : "demo" }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Tracking is not ready");
  return payload.shipment;
}

function statusIcon(status) {
  if (status === "delivered") return ICONS.check;
  if (status === "exception") return ICONS.alert;
  if (status === "out-for-delivery") return ICONS.clock;
  return ICONS.truck;
}

function progressData(d) {
  const progress = Math.max(0, Math.min(4, Number(d.progress ?? 0)));
  const t = progress / 4;
  return {
    progress,
    percent: Math.round(t * 100),
    left: 10 + (t * 80),
    top: 68 - (Math.sin(t * Math.PI) * 34),
  };
}

function renderVisualTracker(d) {
  const route = progressData(d);
  const pathOffset = 100 - route.percent;
  const origin = [d.origin?.city, d.origin?.pin].filter(Boolean).join(" - ") || "Origin";
  const destination = [d.destination?.city, d.destination?.pin].filter(Boolean).join(" - ") || "Destination";

  return `
    <div class="visual-tracker" style="--marker-left:${route.left}%;--marker-top:${route.top}%;">
      <div class="visual-head">
        <div>
          <span>Live visual tracker</span>
          <strong>${escapeHtml(origin)} to ${escapeHtml(destination)}</strong>
        </div>
        <em>${route.percent}% complete</em>
      </div>

      <div class="route-canvas" aria-label="Visual route from ${escapeHtml(origin)} to ${escapeHtml(destination)}">
        <svg class="route-svg" viewBox="0 0 800 230" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="routeGradient" x1="0" x2="1">
              <stop offset="0" stop-color="#99f0cb"/>
              <stop offset=".55" stop-color="#9cdefe"/>
              <stop offset="1" stop-color="#f7fbff"/>
            </linearGradient>
            <filter id="routeGlow">
              <feGaussianBlur stdDeviation="6" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <path class="route-base" d="M80 156 C 220 38, 430 185, 720 74"/>
          <path class="route-fill" pathLength="100" style="stroke-dashoffset:${pathOffset}" d="M80 156 C 220 38, 430 185, 720 74"/>
          <circle class="route-endpoint origin-dot" cx="80" cy="156" r="8"/>
          <circle class="route-endpoint destination-dot" cx="720" cy="74" r="8"/>
        </svg>
        <span class="route-pulse origin-pulse" aria-hidden="true"></span>
        <span class="route-pulse destination-pulse" aria-hidden="true"></span>
        <span class="package-marker" aria-hidden="true">${ICONS.truck}</span>
        <div class="city-tag origin-tag"><span>Origin</span><strong>${escapeHtml(origin)}</strong></div>
        <div class="city-tag destination-tag"><span>Destination</span><strong>${escapeHtml(destination)}</strong></div>
      </div>

      <div class="stage-rail">
        ${TRACKER_STEPS.map(([label, helper], index) => `
          <div class="stage ${index < route.progress ? "done" : ""} ${index === route.progress ? "active" : ""}">
            <span class="stage-node">${index <= route.progress ? ICONS.check : ""}</span>
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(helper)}</small>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEmpty() {
  $("resultSurface").innerHTML = `
    <section class="shipment-card empty-state">
      <div>
        ${ICONS.box}
        <h2>Ready when you are</h2>
        <p>Enter your consignment number to view shipment status, delivery updates, and tracking information.</p>
      </div>
    </section>
    <section class="journey-card empty-state">
      <div>
        ${ICONS.shield}
        <h3>Secure Tracking</h3>
        <p>Shipment information is processed securely through our tracking infrastructure.</p>
      </div>
    </section>
  `;
}

function renderLoading(awb) {
  $("resultSurface").innerHTML = `
    <section class="shipment-card empty-state">
      <div>
        ${ICONS.truck}
        <h2>Tracking ${escapeHtml(awb)}</h2>
        <p>Retrieving latest shipment information.</p>
      </div>
    </section>
    <section class="journey-card empty-state">
      <div>
        ${ICONS.clock}
        <h3>Syncing journey</h3>
        <p>The route and timeline will appear here.</p>
      </div>
    </section>
  `;
}

function renderError(awb, error) {
  $("resultSurface").innerHTML = `
    <section class="shipment-card empty-state">
      <div>
        ${ICONS.alert}
        <h2>Tracking paused</h2>
        <p>${escapeHtml(error.message || error)} for ${escapeHtml(awb)}.</p>
      </div>
    </section>
  `;
}

function renderResult(d) {
  const details = [
    ["AWB", d.awb],
    ["Origin", [d.origin?.city, d.origin?.pin].filter(Boolean).join(" - ") || "--"],
    ["Destination", [d.destination?.city, d.destination?.pin].filter(Boolean).join(" - ") || "--"],
    ["Service", d.service || "DTDC"],
    ["Shipment Accepted", d.booked || "--"],
  ];

  $("resultSurface").innerHTML = `
    <section class="shipment-card">
      <div class="status-row">
        <div class="status-lockup">
          <span class="status-icon ${escapeHtml(d.status)}">${statusIcon(d.status)}</span>
          <div class="status-copy">
            <span>Current status</span>
            <h2>${escapeHtml(d.statusName)}</h2>
            <p>${escapeHtml(d.statusDetail)}</p>
          </div>
        </div>
        <div class="eta">
          <span>${d.status === "delivered" ? "Delivered on" : "Estimated delivery"}</span>
          <strong>${escapeHtml(d.eta || "TBD")}</strong>
          <span>${escapeHtml(d.etaNote || "")}</span>
        </div>
      </div>
      ${renderVisualTracker(d)}
      <div class="detail-grid">
        ${details.map(([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="journey-card">
      <h3>Shipment journey</h3>
      <div class="journey-list">
        ${(d.events || []).map((event) => `
          <div class="journey-item">
            <div class="journey-rail"><span class="journey-dot"></span><span class="journey-line"></span></div>
            <div class="journey-body">
              <strong>${escapeHtml(event.event)}</strong>
              <span>${escapeHtml(event.location || "")}</span>
            </div>
            <time>${escapeHtml(event.time || "")}</time>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

async function trackAwb(raw) {
  const awb = normalizeAwb(raw || $("awbInput").value);
  if (!awb) {
    showToast("Enter an AWB number");
    return;
  }
  $("awbInput").value = awb;
  $("trackButton").disabled = true;
  renderLoading(awb);
  try {
    const shipment = await fetchTracking(awb);
    renderResult(shipment);
    showToast("Shipment information loaded");
  } catch (error) {
    renderError(awb, error);
    showToast("Unable to retrieve shipment information");
  } finally {
    $("trackButton").disabled = false;
  }
}

$("trackForm").addEventListener("submit", (event) => {
  event.preventDefault();
  trackAwb();
});

document.addEventListener("click", (event) => {
  const quick = event.target.closest("[data-awb]");
  if (quick) trackAwb(quick.dataset.awb);
});

renderEmpty();
checkHealth();
