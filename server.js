const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PACKAGE_FILE = path.join(DATA_DIR, "packages.json");
const PORT = Number(process.env.PORT || 4173);
const SESSION_COOKIE = "sv_admin";
const sessionToken = crypto.randomBytes(32).toString("hex");

loadEnvFile();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Ivaanexpress@006";

const STATUS = {
  booked: {
    label: "Booked",
    detail: "Shipment booked and awaiting pickup",
    progress: 0,
  },
  "picked-up": {
    label: "Picked Up",
    detail: "Package has been picked up",
    progress: 1,
  },
  "in-transit": {
    label: "In Transit",
    detail: "Shipment is moving through the network",
    progress: 2,
  },
  "out-for-delivery": {
    label: "Out for Delivery",
    detail: "Courier is carrying the package today",
    progress: 3,
  },
  delivered: {
    label: "Delivered",
    detail: "Shipment has been delivered",
    progress: 4,
  },
  exception: {
    label: "Exception",
    detail: "Shipment needs attention",
    progress: 2,
  },
};

const SEED_PACKAGES = [
  {
    awb: "D11234567IN",
    customer: "Rohit Sharma",
    origin: { city: "New Delhi", pin: "110001" },
    destination: { city: "Mumbai", pin: "400001" },
    status: "in-transit",
    statusDetail: "Departed Delhi gateway hub",
    eta: "23 May 2026",
    etaNote: "Tomorrow",
    booked: "20 May 2026",
    service: "DTDC Express",
    weight: "1.4 kg",
    pieces: 1,
    confidence: "92%",
    internalNote: "High priority customer shipment",
    events: [
      { event: "Departed Delhi Gateway Hub", location: "IGI Cargo Complex, New Delhi", time: "22 May 2026, 4:12 AM" },
      { event: "Arrived at gateway hub", location: "Indira Gandhi International, New Delhi", time: "21 May 2026, 11:40 PM" },
      { event: "Package picked up", location: "Connaught Place, New Delhi - 110001", time: "21 May 2026, 6:45 PM" },
      { event: "Shipment booked", location: "DTDC Netaji Subhash Place", time: "20 May 2026, 2:30 PM" },
    ],
  },
  {
    awb: "D98765432IN",
    customer: "Neha Iyer",
    origin: { city: "Bengaluru", pin: "560001" },
    destination: { city: "New Delhi", pin: "110092" },
    status: "delivered",
    statusDetail: "Signed by Raj Sharma",
    eta: "19 May 2026",
    etaNote: "Delivered on schedule",
    booked: "17 May 2026",
    service: "DTDC Priority",
    weight: "0.8 kg",
    pieces: 2,
    confidence: "100%",
    internalNote: "Delivered successfully",
    events: [
      { event: "Delivered - Signed by Raj Sharma", location: "Preet Vihar, New Delhi - 110092", time: "19 May 2026, 11:22 AM" },
      { event: "Out for delivery", location: "Delhi East Distribution Hub", time: "19 May 2026, 7:58 AM" },
      { event: "Arrived at destination hub", location: "Patparganj Industrial Area, Delhi", time: "18 May 2026, 11:34 PM" },
      { event: "Departed origin gateway", location: "Kempegowda International Cargo, Bengaluru", time: "17 May 2026, 10:20 PM" },
    ],
  },
  {
    awb: "D55501234IN",
    customer: "Arjun Patel",
    origin: { city: "Hyderabad", pin: "500001" },
    destination: { city: "Gurugram", pin: "122002" },
    status: "out-for-delivery",
    statusDetail: "Arriving today before 7 PM",
    eta: "22 May 2026",
    etaNote: "Today before 7 PM",
    booked: "18 May 2026",
    service: "DTDC Ground",
    weight: "3.2 kg",
    pieces: 1,
    confidence: "88%",
    internalNote: "Call recipient before delivery",
    events: [
      { event: "Out for delivery", location: "Gurugram South Distribution Centre", time: "22 May 2026, 8:44 AM" },
      { event: "Arrived at delivery hub", location: "Sector 18, Gurugram - 122002", time: "22 May 2026, 6:10 AM" },
      { event: "In transit", location: "DTDC Delhi-NCR Gateway", time: "21 May 2026, 9:30 PM" },
      { event: "Shipment booked", location: "DTDC Banjara Hills, Hyderabad", time: "18 May 2026, 10:00 AM" },
    ],
  },
].map((item) => normalizePackage(item, "seed"));

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PACKAGE_FILE)) {
    fs.writeFileSync(PACKAGE_FILE, JSON.stringify(SEED_PACKAGES, null, 2));
  }
}

function readPackages() {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8"));
    return Array.isArray(raw) ? raw.map((pkg) => normalizePackage(pkg, "stored")) : [];
  } catch {
    return [];
  }
}

function writePackages(packages) {
  ensureStore();
  fs.writeFileSync(PACKAGE_FILE, JSON.stringify(packages.map((pkg) => normalizePackage(pkg, "stored")), null, 2));
}

function normalizeAwb(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function safeText(value, fallback = "") {
  return String(value || fallback).trim();
}

function normalizeStatus(value) {
  const status = safeText(value || "booked").toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return STATUS[status] ? status : "in-transit";
}

function normalizePackage(input, source) {
  const status = normalizeStatus(input.status);
  const meta = STATUS[status];
  const now = new Date().toISOString();
  return {
    id: input.id || crypto.createHash("sha1").update(normalizeAwb(input.awb) || crypto.randomUUID()).digest("hex").slice(0, 12),
    awb: normalizeAwb(input.awb),
    customer: safeText(input.customer || input.consignee || "Customer"),
    origin: {
      city: safeText(input.origin?.city || input.originCity || input.origin),
      pin: safeText(input.origin?.pin || input.originPin),
    },
    destination: {
      city: safeText(input.destination?.city || input.destinationCity || input.destination),
      pin: safeText(input.destination?.pin || input.destinationPin),
    },
    status,
    statusName: input.statusName || meta.label,
    statusDetail: safeText(input.statusDetail || input.status_description || meta.detail),
    eta: safeText(input.eta || input.estimated_delivery || "TBD"),
    etaNote: safeText(input.etaNote || input.delivery_remark),
    booked: safeText(input.booked || input.booking_date || displayDate(new Date())),
    service: safeText(input.service || input.service_type || input.product || "DTDC"),
    weight: safeText(input.weight || "--"),
    pieces: Number(input.pieces || 1),
    progress: Number.isFinite(Number(input.progress)) ? Number(input.progress) : meta.progress,
    confidence: safeText(input.confidence || "--"),
    internalNote: safeText(input.internalNote || input.note),
    source: source === "live" ? "live" : "managed",
    events: Array.isArray(input.events) && input.events.length
      ? input.events.map((event) => ({
          event: safeText(event.event || event.description || event.status || "Shipment update"),
          location: safeText(event.location),
          time: safeText(event.time || event.timestamp || displayDate(new Date())),
        }))
      : [{ event: "Shipment Created", location: safeText(input.origin?.city || input.originCity || "Private dashboard"), time: displayDate(new Date()) }],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function publicShipment(pkg) {
  const normalized = normalizePackage(pkg, pkg.source);
  return {
    awb: normalized.awb,
    status: normalized.status,
    statusName: normalized.statusName,
    statusDetail: normalized.statusDetail,
    origin: normalized.origin,
    destination: normalized.destination,
    eta: normalized.eta,
    etaNote: normalized.etaNote,
    booked: normalized.booked,
    service: normalized.service,
    weight: normalized.weight,
    pieces: normalized.pieces,
    progress: normalized.progress,
    confidence: normalized.confidence,
    source: normalized.source || "managed",
    events: normalized.events,
    updatedAt: normalized.updatedAt,
  };
}

function displayDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((cookie) => {
    const [key, ...rest] = cookie.trim().split("=");
    return [key, decodeURIComponent(rest.join("=") || "")];
  }).filter(([key]) => key));
}

function isAdmin(req) {
  return parseCookies(req)[SESSION_COOKIE] === sessionToken;
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: "Admin login required" });
  return false;
}

function cookieHeader(value, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function passwordMatches(value) {
  const a = Buffer.from(String(value || ""));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function findPackage(packages, awb) {
  const key = normalizeAwb(awb);
  return packages.find((pkg) => normalizeAwb(pkg.awb) === key);
}

function upsertPackage(packages, nextPackage) {
  const key = normalizeAwb(nextPackage.awb);
  const index = packages.findIndex((pkg) => normalizeAwb(pkg.awb) === key);
  if (index === -1) return [...packages, nextPackage];
  const next = packages.slice();
  next[index] = nextPackage;
  return next;
}

function demoShipment(awb) {
  const packages = readPackages();
  const found = findPackage(packages, awb);
  if (found) return publicShipment({ ...found, source: "managed" });
  const key = normalizeAwb(awb);
  return {
    awb: key,
    status: "exception",
    statusName: "Ready for API",
    statusDetail: "This consignment is not in your private dashboard yet",
    origin: { city: "Awaiting scan", pin: "" },
    destination: { city: "Awaiting API", pin: "" },
    eta: "TBD",
    etaNote: "Add the package in Admin",
    booked: "TBD",
    service: "DTDC",
    weight: "--",
    pieces: 1,
    progress: 0,
    confidence: "--",
    source: "demo",
    events: [{ event: "Consignment not yet managed", location: "Private admin dashboard", time: displayDate(new Date()) }],
  };
}

async function fetchLiveShipment(awb) {
  const response = await fetch(
    "https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": process.env.DTDC_API_KEY
      },
      body: JSON.stringify({
        trkType: "cnno",
        strcnno: awb,
        addtnlDtl: "Y"
      })
    }
  );

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));

if (!data.statusFlag) {
  const errorMessage =
    data?.errorDetails?.find(
      item => item.name === "strError"
    )?.value ||
    "Shipment not found";

  throw new Error(errorMessage);
}

  return mapLiveResponse(awb, data);
}
function dtdcDate(value) {
  if (!value || value.length !== 8) return value || "";

  const day = value.slice(0, 2);
  const month = value.slice(2, 4);
  const year = value.slice(4, 8);

  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec"
  ];

  return `${day} ${months[Number(month) - 1]} ${year}`;
}
function dtdcDateTime(date, time) {
  const formattedDate = dtdcDate(date);

  if (!time || time.length !== 4) {
    return formattedDate;
  }

  const hh = time.slice(0, 2);
  const mm = time.slice(2, 4);

  return `${formattedDate}, ${hh}:${mm}`;
}
function mapLiveResponse(awb, data) {
  const header = data.trackHeader || {};
  const details = data.trackDetails || [];

  const statusText = String(header.strStatus || "").toLowerCase();

  let status = "in-transit";

  if (statusText.includes("delivered")) {
    status = "delivered";
  } else if (statusText.includes("out for delivery")) {
    status = "out-for-delivery";
  } else if (statusText.includes("booked")) {
    status = "booked";
  }

const events = [];
const seenActions = new Set();

details
  .slice()
  .reverse()
  .forEach(item => {
    const event = item.strAction || item.strCode || "Shipment Update";

    const normalized = event.toLowerCase();

    if (
      normalized.includes("in transit") &&
      seenActions.has("in-transit")
    ) {
      return;
    }

    if (normalized.includes("in transit")) {
      seenActions.add("in-transit");
    }

    events.push({
      event,

      location:
        item.strOrigin && item.strDestination
          ? `${item.strOrigin} → ${item.strDestination}`
          : item.strOrigin || item.strDestination || "",

      time: dtdcDateTime(
        item.strActionDate,
        item.strActionTime
      )
    });
  });
  return normalizePackage({
    awb,

    status,

    statusDetail: header.strStatus || "In Transit",

    origin: {
      city: header.strOrigin || "",
      pin: ""
    },

    destination: {
      city: header.strDestination || "",
      pin: ""
    },

    booked: dtdcDate(header.strBookedDate),

    eta: dtdcDate(
  header.strRevExpectedDeliveryDate ||
  header.strExpectedDeliveryDate
),

    service: header.strCNProduct || "DTDC",

    pieces: Number(header.strPieces || 1),
    events,
    updatedAt: new Date().toISOString()
  }, "live");
}
function createPackageFromBody(body) {
  const awb = normalizeAwb(body.awb);
  if (!awb) throw new Error("AWB number is required");
  return normalizePackage({
    awb,
    customer: body.customer,
    origin: { city: body.originCity || body.origin, pin: body.originPin },
    destination: { city: body.destinationCity || body.destination, pin: body.destinationPin },
    status: body.status || "booked",
    eta: body.eta || "TBD",
    etaNote: body.etaNote,
    booked: body.booked || displayDate(new Date()),
    service: body.service || "DTDC",
    weight: body.weight || "--",
    pieces: body.pieces || 1,
    internalNote: body.internalNote,
    events: [{ event: "Shipment Created", location: body.originCity || body.origin || "Private dashboard", time: displayDate(new Date()) }],
  }, "managed");
}

function patchPackage(pkg, body) {
  const current = normalizePackage(pkg, "managed");
  const nextStatus = body.status ? normalizeStatus(body.status) : current.status;
  const statusChanged = nextStatus !== current.status;
  const next = normalizePackage({
    ...current,
    customer: body.customer ?? current.customer,
    origin: {
      city: body.originCity ?? current.origin.city,
      pin: body.originPin ?? current.origin.pin,
    },
    destination: {
      city: body.destinationCity ?? current.destination.city,
      pin: body.destinationPin ?? current.destination.pin,
    },
    status: nextStatus,
    statusDetail: body.statusDetail || (statusChanged ? STATUS[nextStatus].detail : current.statusDetail),
    eta: body.eta ?? current.eta,
    etaNote: body.etaNote ?? current.etaNote,
    service: body.service ?? current.service,
    weight: body.weight ?? current.weight,
    pieces: body.pieces ?? current.pieces,
    internalNote: body.internalNote ?? current.internalNote,
    events: statusChanged
      ? [{ event: STATUS[nextStatus].label, location: current.destination.city || current.origin.city || "Private dashboard", time: displayDate(new Date()) }, ...current.events]
      : current.events,
    updatedAt: new Date().toISOString(),
  }, "managed");
  return next;
}

async function refreshManagedPackage(pkg) {
  if (!process.env.DTDC_API_KEY) {
    return normalizePackage({
      ...pkg,
      statusDetail: `${pkg.statusDetail || STATUS[pkg.status].detail} - waiting for DTDC API key`,
      updatedAt: new Date().toISOString(),
    }, "managed");
  }
  const live = await fetchLiveShipment(pkg.awb);
  return normalizePackage({
    ...pkg,
    ...live,
    customer: pkg.customer,
    internalNote: pkg.internalNote,
    createdAt: pkg.createdAt,
    updatedAt: new Date().toISOString(),
  }, "live");
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin" || pathname === "/admin/") pathname = "/admin.html";

  const publicFiles = new Set([
    "/index.html",
    "/admin.html",
    "/styles.css",
    "/customer.js",
    "/admin.js",
    "/shipview-glass-concept.png",
     "/ads.txt",
  ]);

  if (!publicFiles.has(pathname)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      reachable: true,
      hasApiKey: Boolean(process.env.DTDC_API_KEY && process.env.DTDC_API_KEY !== "your_key_here"),
      demoMode: !(process.env.DTDC_API_KEY && process.env.DTDC_API_KEY !== "your_key_here"),
      managedCount: readPackages().length,
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/track") {
    try {
      const body = await readJson(req);
      const awb = normalizeAwb(body.awb);
      if (!awb) {
        sendJson(res, 400, { error: "AWB number is required" });
        return;
      }

      const packages = readPackages();
      const managed = findPackage(packages, awb);
      if (managed) {
        sendJson(res, 200, { shipment: publicShipment(managed) });
        return;
      }

      if (body.mode !== "live") {
        sendJson(res, 200, { shipment: demoShipment(awb) });
        return;
      }

      if (!process.env.DTDC_API_KEY || process.env.DTDC_API_KEY === "your_key_here") {
        sendJson(res, 503, { error: "DTDC_API_KEY is not configured on the server" });
        return;
      }

      sendJson(res, 200, { shipment: publicShipment(await fetchLiveShipment(awb)) });
    } catch (error) {
      sendJson(res, 502, { error: error.message || "Tracking failed" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    sendJson(res, 200, { authenticated: isAdmin(req) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    try {
      const body = await readJson(req);
      if (!passwordMatches(body.password)) {
        sendJson(res, 401, { error: "Wrong password" });
        return;
      }
      sendJson(res, 200, { authenticated: true }, { "Set-Cookie": cookieHeader(sessionToken, 60 * 60 * 12) });
    } catch {
      sendJson(res, 400, { error: "Could not read login" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    sendJson(res, 200, { authenticated: false }, { "Set-Cookie": cookieHeader("", 0) });
    return;
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!requireAdmin(req, res)) return;

    if (req.method === "GET" && pathname === "/api/admin/packages") {
      sendJson(res, 200, { packages: readPackages() });
      return;
    }

    if (req.method === "POST" && pathname === "/api/admin/packages") {
      try {
        const packages = readPackages();
        const nextPackage = createPackageFromBody(await readJson(req));
        if (findPackage(packages, nextPackage.awb)) {
          sendJson(res, 409, { error: "That AWB is already managed" });
          return;
        }
        const nextPackages = upsertPackage(packages, nextPackage);
        writePackages(nextPackages);
        sendJson(res, 201, { package: nextPackage, packages: nextPackages });
      } catch (error) {
        sendJson(res, 400, { error: error.message || "Could not add package" });
      }
      return;
    }

    const match = pathname.match(/^\/api\/admin\/packages\/([^/]+)(?:\/(refresh))?$/);
    if (match) {
      const awb = normalizeAwb(match[1]);
      const action = match[2];
      const packages = readPackages();
      const current = findPackage(packages, awb);
      if (!current) {
        sendJson(res, 404, { error: "Package not found" });
        return;
      }

      if (req.method === "DELETE" && !action) {
        const nextPackages = packages.filter((pkg) => normalizeAwb(pkg.awb) !== awb);
        writePackages(nextPackages);
        sendJson(res, 200, { removed: awb, packages: nextPackages });
        return;
      }

      if (req.method === "PUT" && !action) {
        try {
          const updated = patchPackage(current, await readJson(req));
          const nextPackages = upsertPackage(packages, updated);
          writePackages(nextPackages);
          sendJson(res, 200, { package: updated, packages: nextPackages });
        } catch (error) {
          sendJson(res, 400, { error: error.message || "Could not update package" });
        }
        return;
      }

      if (req.method === "POST" && action === "refresh") {
        try {
          const refreshed = await refreshManagedPackage(current);
          const nextPackages = upsertPackage(packages, refreshed);
          writePackages(nextPackages);
          sendJson(res, 200, {
            package: refreshed,
            packages: nextPackages,
            live: refreshed.source === "live",
          });
        } catch (error) {
          sendJson(res, 502, { error: error.message || "Refresh failed" });
        }
        return;
      }
    }

    sendJson(res, 404, { error: "Admin endpoint not found" });
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

ensureStore();

server.listen(PORT, () => {
  console.log(`Ivaan Express Tracker running at http://127.0.0.1:${PORT}`);
  console.log(`Private admin dashboard at http://127.0.0.1:${PORT}/admin`);
});
