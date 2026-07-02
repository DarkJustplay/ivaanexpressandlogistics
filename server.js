const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PACKAGE_FILE = path.join(DATA_DIR, "packages.json");
const SESSION_COOKIE = "sv_admin";
const sessionToken = crypto.randomBytes(32).toString("hex");

loadEnvFile();

const PORT = Number(process.env.PORT || 4173);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Ivaanexpress@006";
const DTDC_TRACK_URL = process.env.DTDC_TRACK_URL
  || process.env.DTDC_API_URL
  || "https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails";

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
  if (value && typeof value === "object") {
    return safeText(
      value.city
        || value.name
        || value.location
        || value.branch
        || value.strOrigin
        || value.strDestination,
      fallback,
    );
  }
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

function isConfiguredSecret(value) {
  return Boolean(value)
    && value !== "your_key_here"
    && value !== "your_api_key_here"
    && value !== "your_track_token_here"
    && !String(value).startsWith("your_");
}

function dtdcEnvName(vendor, key) {
  return `DTDC_${String(vendor).toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${key}`;
}

function getDtdcVendorProfiles() {
  const configuredVendors = String(process.env.DTDC_VENDORS || "")
    .split(",")
    .map((vendor) => vendor.trim())
    .filter(Boolean);

  const vendors = configuredVendors.length ? configuredVendors : ["LL2462", "LL2487"];
  const profiles = [];

  for (const vendor of vendors) {
    const token = process.env[dtdcEnvName(vendor, "TRACK_TOKEN")]
      || process.env[dtdcEnvName(vendor, "ACCESS_TOKEN")]
      || process.env[dtdcEnvName(vendor, "X_ACCESS_TOKEN")];

    if (!isConfiguredSecret(token)) continue;

    profiles.push({
      vendor,
      customerCode: process.env[dtdcEnvName(vendor, "CUSTOMER_CODE")] || vendor,
      token,
      apiKey: process.env[dtdcEnvName(vendor, "API_KEY")] || "",
    });
  }

  const legacyToken = process.env.DTDC_TRACK_TOKEN
    || process.env.DTDC_ACCESS_TOKEN
    || process.env.DTDC_X_ACCESS_TOKEN
    || process.env.DTDC_API_KEY;

  if (isConfiguredSecret(legacyToken) && !profiles.some((profile) => profile.token === legacyToken)) {
    profiles.push({
      vendor: process.env.DTDC_VENDOR_DEFAULT || "legacy",
      customerCode: process.env.DTDC_CUSTOMER_CODE || "",
      token: legacyToken,
      apiKey: process.env.DTDC_TRACK_TOKEN ? process.env.DTDC_API_KEY || "" : "",
    });
  }

  const preferred = process.env.DTDC_VENDOR_DEFAULT;
  if (preferred) {
    profiles.sort((a, b) => {
      if (a.vendor === preferred) return -1;
      if (b.vendor === preferred) return 1;
      return 0;
    });
  }

  return profiles;
}

function hasLiveDtdcCredentials() {
  return getDtdcVendorProfiles().length > 0;
}

function selectDtdcVendorProfiles(vendor) {
  const profiles = getDtdcVendorProfiles();
  if (!vendor || vendor === "auto") return profiles;

  const selected = profiles.filter((profile) => profile.vendor.toLowerCase() === String(vendor).toLowerCase());
  if (!selected.length) throw new Error(`DTDC vendor ${vendor} is not configured`);
  return selected;
}

function getPathValue(input, pathName) {
  return pathName.split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return value[key];
  }, input);
}

function firstValue(input, paths, fallback = "") {
  for (const pathName of paths) {
    const value = getPathValue(input, pathName);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function collectArrays(input, arrays = []) {
  if (!input || typeof input !== "object") return arrays;
  if (Array.isArray(input)) {
    arrays.push(input);
    input.forEach((item) => collectArrays(item, arrays));
    return arrays;
  }
  Object.values(input).forEach((value) => collectArrays(value, arrays));
  return arrays;
}

function scoreTrackingRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return 0;
  const keys = Object.keys(row).join(" ").toLowerCase();
  let score = 0;
  if (/status|scan|action|event|activity|remark|description/.test(keys)) score += 2;
  if (/date|time|timestamp/.test(keys)) score += 1;
  if (/branch|location|city|hub|origin/.test(keys)) score += 1;
  return score;
}

function findTrackingRows(data) {
  const direct = firstValue(data, [
    "statuses",
    "trackDetails",
    "trackingDetails",
    "scanDetails",
    "scans",
    "data.statuses",
    "data.trackDetails",
    "data.trackingDetails",
    "data.scanDetails",
    "data.scans",
    "result.statuses",
    "result.trackDetails",
    "result.trackingDetails",
  ], null);

  if (Array.isArray(direct)) return direct;

  return collectArrays(data)
    .filter((items) => items.some((item) => scoreTrackingRow(item) >= 3))
    .sort((a, b) => {
      const bScore = b.reduce((total, item) => total + scoreTrackingRow(item), 0);
      const aScore = a.reduce((total, item) => total + scoreTrackingRow(item), 0);
      return bScore - aScore;
    })[0] || [];
}

function inferStatus(value) {
  const statusText = String(value || "").toLowerCase();
  if (statusText.includes("delivered")) return "delivered";
  if (statusText.includes("out for delivery") || statusText.includes("ofd")) return "out-for-delivery";
  if (statusText.includes("picked") || statusText.includes("pickup")) return "picked-up";
  if (statusText.includes("booked") || statusText.includes("manifest")) return "booked";
  if (statusText.includes("exception") || statusText.includes("rto") || statusText.includes("failed")) return "exception";
  return "in-transit";
}

function isFalseLike(value) {
  return value === false || String(value).toLowerCase() === "false" || String(value) === "0";
}

async function fetchLiveShipment(awb, vendor = "auto") {
  const profiles = selectDtdcVendorProfiles(vendor);
  if (!profiles.length) throw new Error("DTDC tracking token is not configured");

  const errors = [];
  for (const profile of profiles) {
    try {
      return await fetchLiveShipmentWithVendor(awb, profile);
    } catch (error) {
      errors.push(`${profile.vendor}: ${error.message || "Tracking failed"}`);
    }
  }

  throw new Error(errors.join("; ") || "Shipment not found");
}

async function fetchLiveShipmentWithVendor(awb, profile) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.DTDC_TIMEOUT_MS || 15000));

  const headers = {
    "Content-Type": "application/json",
    "x-access-token": profile.token,
  };

  if (isConfiguredSecret(profile.apiKey) && profile.apiKey !== profile.token) {
    headers["api-key"] = profile.apiKey;
  }

  let response;
  try {
    response = await fetch(DTDC_TRACK_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        trkType: "cnno",
        strcnno: awb,
        addtnlDtl: "Y",
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("DTDC returned a non-JSON tracking response");
  }

  if (!response.ok) {
    throw new Error(firstValue(data, ["message", "error", "errorMessage"], `DTDC tracking failed with HTTP ${response.status}`));
  }

  const statusCode = Number(firstValue(data, ["statusCode", "code", "responseCode"], 200));
  const successFlag = firstValue(data, ["success", "statusFlag", "isSuccess"], true);
  const message = String(firstValue(data, ["message", "error", "errorMessage", "status"], ""));
  if (
    statusCode >= 400
    || isFalseLike(successFlag)
    || /\b(error|failed|invalid|not found)\b/i.test(message)
  ) {
    throw new Error(message || "Shipment not found");
  }

  return mapLiveResponse(awb, data, profile);
}
function mapLiveResponse(awb, data, profile = {}) {
const header = firstValue(data, [
  "header",
  "trackHeader",
  "data.header",
  "data.trackHeader",
  "result.header",
  "result.trackHeader",
  "shipment",
  "data.shipment",
  "cnoteDetails",
  "data.cnoteDetails",
  "cnDetails",
  "data.cnDetails",
], {});
const details = findTrackingRows(data);
const statusText = firstValue(header, [
  "currentStatusDescription",
  "currentStatus",
  "shipmentStatus",
  "cnoteStatus",
  "status",
  "strStatus",
  "strAction",
], firstValue(details[0] || {}, [
  "statusDescription",
  "strAction",
  "scan",
  "event",
  "activity",
  "status",
  "remarks",
], ""));

const status = inferStatus(statusText || firstValue(details[details.length - 1] || {}, ["strAction", "statusDescription", "status"], ""));

const events = details
  .slice()
  .reverse()
  .map((item) => ({
    event: safeText(firstValue(item, [
      "statusDescription",
      "strAction",
      "scanDescription",
      "scan",
      "event",
      "activity",
      "status",
      "remarks",
      "description",
    ], "Shipment Update")),
    location: safeText(firstValue(item, [
      "actBranchName",
      "actCityName",
      "scanLocation",
      "strOrigin",
      "branch",
      "location",
      "city",
      "hub",
    ], "")),
    time: dtdcDateTime(firstValue(item, [
      "statusTimestamp",
      "scanDateTime",
      "dateTime",
      "timestamp",
    ], [
      firstValue(item, ["strActionDate", "actionDate", "eventDate", "scanDate", "date", "statusDate"], ""),
      firstValue(item, ["strActionTime", "scanTime", "time", "statusTime"], ""),
    ].join(" ").trim())),
  }))
  .filter((item) => item.event || item.location || item.time);

  return normalizePackage({
    awb,

    status,

    statusDetail:
  statusText || "In Transit",

    origin: {
      city: firstValue(header, ["originCity", "origin", "strOrigin", "bookingBranch", "originBranch"], ""),
      pin: ""
    },

    destination: {
      city: firstValue(header, ["destinationCity", "destination", "strDestination", "destinationBranch"], ""),
      pin: ""
    },

    eta: dtdcDate(
  firstValue(header, ["opsEdd", "edd", "estimatedDeliveryDate", "expectedDeliveryDate", "strRevExpectedDeliveryDate", "strExpectedDeliveryDate"], "")
),

booked: dtdcDateTime(
  [
    firstValue(header, ["bookingDate", "bookedDate", "pickupDate", "strBookedDate"], ""),
    firstValue(header, ["bookingTime", "bookedTime", "pickupTime", "strBookedTime"], ""),
  ].join(" ").trim()
),
    service:
  firstValue(header, ["serviceName", "serviceType", "service", "product", "strCNProduct", "strCNTypeName"], "DTDC"),

    weight: firstValue(header, ["weight", "chargedWeight", "actualWeight", "strWeight"], "--"),
    pieces: Number(firstValue(header, ["noOfPieces", "pieces", "pieceCount", "strPieces"], 1)),
    events,
    updatedAt: new Date().toISOString()
  }, "live");
}
function dtdcDate(value) {
  if (!value) return "";

  const date = parseDtdcDate(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function dtdcDateTime(value) {
  if (!value) return "";

  const date = parseDtdcDate(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function parseDtdcDate(value) {
  const raw = String(value || "").trim();
  const compact = raw.match(/^(\d{2})(\d{2})(\d{4})(?:\s+(\d{2}):?(\d{2})(?::?(\d{2}))?)?$/);
  if (compact) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = compact;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  const separated = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{1,2}):?(\d{2})(?::?(\d{2}))?)?$/);
  if (separated) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = separated;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  return new Date(raw);
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

async function refreshManagedPackage(pkg, vendor = "auto") {
  const live = await fetchLiveShipment(pkg.awb, vendor);

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
  if (pathname === "/") pathname = "/about.html";
  if (pathname === "/tracker") pathname = "/index.html";
  if (pathname === "/admin" || pathname === "/admin/") pathname = "/admin.html";

  const publicFiles = new Set([
    "/index.html",
    "/admin.html",
    "/styles.css",
    "/customer.js",
    "/about.html",
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
if (req.method === "GET" && pathname === "/about.html") {
  const html = fs.readFileSync(
    path.join(ROOT, "about.html"),
    "utf8"
  );

  res.writeHead(200, {
    "Content-Type": "text/html"
  });

  res.end(html);
  return;
}
  if (req.method === "GET" && pathname === "/api/health") {
    const vendors = getDtdcVendorProfiles().map((profile) => profile.vendor);
    const liveReady = hasLiveDtdcCredentials();
    sendJson(res, 200, {
      reachable: true,
      hasApiKey: liveReady,
      demoMode: !liveReady,
      vendors,
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

      if (managed && body.mode === "live") {
        try {
          const refreshed = await refreshManagedPackage(managed, body.vendor || "auto");
          const nextPackages = upsertPackage(packages, refreshed);
          writePackages(nextPackages);
          sendJson(res, 200, { shipment: publicShipment(refreshed), refreshed: true });
        } catch (error) {
          sendJson(res, 200, {
            shipment: publicShipment(managed),
            refreshed: false,
            warning: error.message || "Live refresh failed",
          });
        }
        return;
      }

      if (managed) {
        sendJson(res, 200, { shipment: publicShipment(managed) });
        return;
      }

      if (body.mode !== "live") {
        sendJson(res, 200, { shipment: demoShipment(awb) });
        return;
      }

      sendJson(res, 200, { shipment: publicShipment(await fetchLiveShipment(awb, body.vendor || "auto")) });
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
