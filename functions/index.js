const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const DVSA_API_KEY = defineSecret("DVSA_API_KEY");

const ALLOWED_ORIGINS = [
  "https://appointments-transvortex.web.app",
  "https://appointments-transvortex.firebaseapp.com",
  "https://jeyyo12.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "").toLowerCase();
}

function isAllowedOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  if (ALLOWED_ORIGINS.map(normalizeOrigin).includes(normalized)) {
    return true;
  }

  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(normalized)) {
    return true;
  }

  return false;
}

function applyCors(req, res) {
  const origin = req.get("origin") || "";
  if (isAllowedOrigin(origin)) {
    res.set("Access-Control-Allow-Origin", normalizeOrigin(origin));
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.set("Access-Control-Max-Age", "3600");
}

exports.dvsa = onRequest(
  {
    region: "europe-west2",
    secrets: [DVSA_API_KEY]
  },
  async (req, res) => {
    applyCors(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const vrmFromBody = req.body && typeof req.body === "object" ? req.body.vrm : "";
    const vrm = String(req.query.vrm || vrmFromBody || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!vrm) {
      return res.status(400).json({ error: "Missing vrm" });
    }

    try {
      const apiKey = DVSA_API_KEY.value();
      if (!apiKey) {
        logger.error("DVSA_API_KEY is not configured");
        return res.status(500).json({ error: "Service configuration error" });
      }

      const dvsaResponse = await fetch(
        "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ registrationNumber: vrm })
        }
      );

      if (dvsaResponse.status === 404) {
        return res.status(404).json({ error: "Vehicle not found", vrm });
      }

      if (!dvsaResponse.ok) {
        const errorText = await dvsaResponse.text();
        logger.error("DVSA upstream error", {
          status: dvsaResponse.status,
          body: errorText.slice(0, 500)
        });
        return res.status(502).json({ error: "DVSA upstream error" });
      }

      const vehicle = await dvsaResponse.json();

      return res.json({
        vrm,
        make: vehicle.make || "",
        model: vehicle.model || "",
        colour: vehicle.colour || "",
        year: vehicle.yearOfManufacture || null,
        fuelType: vehicle.fuelType || "",
        engineCapacity: vehicle.engineCapacity || null,
        motStatus: vehicle.motStatus || "",
        motExpiry: vehicle.motExpiryDate || null,
        taxStatus: vehicle.taxStatus || "",
        taxDue: vehicle.taxDueDate || null
      });
    } catch (error) {
      logger.error("DVSA proxy failed", error);
      return res.status(503).json({ error: "Service unavailable" });
    }
  }
);