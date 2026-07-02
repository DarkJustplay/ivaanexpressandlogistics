const fetch = global.fetch;

loadEnvFile();

async function test() {
  const awb = process.argv[2] || "D1015544368";
  const requestedVendor = process.argv[3] || "auto";
  const profiles = selectProfiles(requestedVendor);

  if (!profiles.length) {
    throw new Error("Set DTDC_LL2462_TRACK_TOKEN and/or DTDC_LL2487_TRACK_TOKEN before running this test");
  }

  for (const profile of profiles) {
    const headers = {
      "Content-Type": "application/json",
      "x-access-token": profile.token,
    };

    if (profile.apiKey && profile.apiKey !== profile.token) {
      headers["api-key"] = profile.apiKey;
    }

    console.log("VENDOR:", profile.vendor);
    try {
      const response = await fetch(process.env.DTDC_TRACK_URL || "https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails", {
        method: "POST",
        headers,
        body: JSON.stringify({
          trkType: "cnno",
          strcnno: awb,
          addtnlDtl: "Y"
        }),
      });

      const text = await response.text();

      console.log("STATUS:", response.status);
      console.log(text);

      if (response.ok && /"status"\s*:\s*"SUCCESS"/i.test(text)) return;
    } catch (error) {
      console.log("ERROR:", error.message || error);
    }
  }

  throw new Error("Tracking failed for all configured vendors");
}

test();

function selectProfiles(vendor) {
  const profiles = getProfiles();
  if (!vendor || vendor === "auto") return profiles;
  return profiles.filter((profile) => profile.vendor.toLowerCase() === String(vendor).toLowerCase());
}

function getProfiles() {
  const vendors = String(process.env.DTDC_VENDORS || "LL2462,LL2487")
    .split(",")
    .map((vendor) => vendor.trim())
    .filter(Boolean);

  const profiles = vendors
    .map((vendor) => ({
      vendor,
      token: process.env[`DTDC_${vendor}_TRACK_TOKEN`] || process.env[`DTDC_${vendor}_ACCESS_TOKEN`] || "",
      apiKey: process.env[`DTDC_${vendor}_API_KEY`] || "",
    }))
    .filter((profile) => profile.token);

  const legacyToken = process.env.DTDC_TRACK_TOKEN || process.env.DTDC_API_KEY;
  if (legacyToken && !profiles.some((profile) => profile.token === legacyToken)) {
    profiles.push({ vendor: "legacy", token: legacyToken, apiKey: "" });
  }

  return profiles;
}

function loadEnvFile() {
  const fs = require("fs");
  const path = require("path");
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}
