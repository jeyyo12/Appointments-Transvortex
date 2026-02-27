const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const DVSA_API_KEY = defineSecret("DVSA_API_KEY");

const ALLOWED_ORIGINS = [
  "https://appointments-transvortex.web.app",
  "https://appointments-transvortex.firebaseapp.com",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

exports.dvsa = onRequest(
  {
    region: "europe-west2",
    secrets: [DVSA_API_KEY],
    cors: ALLOWED_ORIGINS
  },
  async (req, res) => {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const vrm = String(req.query.vrm || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!vrm) {
      return res.status(400).json({ error: "Missing vrm query parameter" });
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