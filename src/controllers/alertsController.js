const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

const AfricasTalking = require("africastalking");
const AT = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});
const sms = AT.SMS;

const createDangerAlert = asyncHandler(async (req, res) => {
  const { phone, message, severity, alert_type } = req.body;

  try {
    const { rows } = await pool.query(
      `SELECT m.name, m.nurse_name, m.nurse_phone,
       COALESCE(m.partner_name, '') as partner_name,
       COALESCE(m.partner_phone, '') as partner_phone,
       COALESCE(m.facility_name, '') as facility_name
        FROM mothers m
        WHERE m.phone = $1`,
      [phone],
    );

    const mother = rows[0];

    if (!mother) {
      return res.json({
        success: true,
        warning:
          "Mother profile not found in database — alert logged locally only",
        sms_sent: false,
      });
    }

    const recipients = [];
    if (
      mother.nurse_phone &&
      mother.nurse_phone !== "N/A" &&
      mother.nurse_phone.length > 8
    ) {
      recipients.push(mother.nurse_phone);
    }
    if (
      mother.partner_phone &&
      mother.partner_phone !== "N/A" &&
      mother.partner_phone.length > 8
    ) {
      recipients.push(mother.partner_phone);
    }

    let smsSent = false;

    if (recipients.length > 0) {
      const smsText =
        `MAMA NA MTOTO+ ALERT 🚨\n` +
        `Patient: ${mother.name || phone}\n` +
        `Symptom: ${message}\n` +
        `Severity: ${severity?.toUpperCase()}\n` +
        `Please respond IMMEDIATELY.\n` +
        `Mama na Mtoto+`;

      try {
        await sms.send({
          to: recipients,
          message: smsText,
        });
        smsSent = true;
      } catch (smsError) {
        console.error("SMS send failed:", smsError.message);
      }
    }
    // Send WhatsApp (non-blocking, fires in parallel with SMS)
    if (mother.nurse_phone) {
      sendWhatsAppAlert(mother.nurse_phone, {
        motherName: mother.name || phone,
        symptom: message,
        severity: severity || "critical",
        riskLevel: "high", // or compute from mother's data
        recommendation:
          severity === "critical"
            ? "Call mother immediately and prepare for referral."
            : "Follow up within 1 hour.",
      });
    }

    await pool.query(
      `INSERT INTO alerts
       (mother_phone, symptom, severity, alert_type,
        nurse_phone, partner_phone, sms_sent, status, fired_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        phone,
        message,
        severity,
        alert_type,
        mother.nurse_phone || null,
        mother.partner_phone || null,
        smsSent,
        "open",
      ],
    );

    res.json({
      success: true,
      sms_sent: smsSent,
      recipients_notified: recipients.length,
      warning:
        recipients.length === 0
          ? "No nurse or partner phone on file — alert saved locally"
          : null,
    });
  } catch (error) {
    console.error("Alert error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
const AfricasTalking = require("africastalking");

// A dedicated function for testing SMS
const sendTestSMS = async (phone, message) => {
  try {
    // 1. Initialize the SDK with credentials from environment variables.
    //    For sandbox, the username MUST be 'sandbox'.
    const AT = AfricasTalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME, // Should be 'sandbox' in Railway
    });

    // 2. Get the SMS service.
    const sms = AT.SMS;

    // 3. Send the message.
    const options = {
      to: [phone],
      message: message,
      // In the sandbox, you often use "Sandbox" or your sandbox shortcode.
      // If you leave it out, it may use a default. It's safer to specify.
      // Check your AT dashboard for the exact sandbox sender ID if needed.
      // For this test, we'll omit it first; if it fails, we'll add it.
    };

    console.log(`📤 Sending test SMS to ${phone}...`);
    const response = await sms.send(options);
    console.log("✅ AT Send Response:", JSON.stringify(response, null, 2));

    return { success: true, data: response };
  } catch (error) {
    console.error("❌ AT Send Error:", error.message);
    return { success: false, error: error.message };
  }
};

// Temporary test route
exports.testSendSms = async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res
      .status(400)
      .json({ success: false, error: "phone and message are required" });
  }
  const result = await sendTestSMS(phone, message);
  res.json(result);
};
// ── Send WhatsApp Alert via Africa's Talking ───────────────────────────────
const sendWhatsAppAlert = async (phone, alertData) => {
  const { motherName, symptom, severity, riskLevel, recommendation } =
    alertData;

  // Only attempt if WhatsApp Product ID is configured
  if (!process.env.AT_WHATSAPP_PRODUCT_ID) {
    console.log("⚠️ WhatsApp skipped — AT_WHATSAPP_PRODUCT_ID not set");
    return false;
  }

  const normalizedPhone = phone.startsWith("+") ? phone.slice(1) : phone;

  const message =
    `🚨 *MAMA NA MTOTO+ ALERT*\n\n` +
    `*Patient:* ${motherName}\n` +
    `*Symptom:* ${symptom}\n` +
    `*Severity:* ${severity?.toUpperCase()}\n` +
    `*Risk Level:* ${(riskLevel || "unknown").toUpperCase()}\n\n` +
    `*Recommended action:*\n${recommendation || "Assess mother immediately."}\n\n` +
    `_Please respond immediately._\n` +
    `_Mama na Mtoto+ — PPH Foundation_`;

  try {
    const response = await fetch(
      "https://api.africastalking.com/version1/messaging/whatsapp",
      {
        method: "POST",
        headers: {
          apiKey: process.env.AT_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: process.env.AT_USERNAME,
          productId: process.env.AT_WHATSAPP_PRODUCT_ID,
          channel: "whatsapp",
          to: normalizedPhone,
          message: {
            type: "text",
            text: { body: message },
          },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.warn(
        `⚠️ WhatsApp failed (${response.status}):`,
        err.slice(0, 200),
      );
      return false;
    }

    console.log(`✅ WhatsApp alert sent to ${phone}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ WhatsApp error for ${phone}:`, error.message);
    return false;
  }
};

// ── Get All Alerts (bulletproof, no JOIN dependency) ──────────────────────
const getAllAlerts = async (req, res) => {
  try {
    // First: get all alerts
    const alertsResult = await pool.query(
      "SELECT * FROM alerts ORDER BY COALESCE(fired_at, created_at, NOW()) DESC LIMIT 100",
    );

    // Second: for each alert, try to fetch the mother's name (safe lookup)
    const alerts = await Promise.all(
      alertsResult.rows.map(async (alert) => {
        let mother_name = null;
        let mother_id = alert.mother_id || null;

        if (alert.mother_phone) {
          try {
            const m = await pool.query(
              "SELECT id, name FROM mothers WHERE phone = $1 LIMIT 1",
              [alert.mother_phone],
            );
            if (m.rows.length > 0) {
              mother_name = m.rows[0].name;
              mother_id = m.rows[0].id;
            }
          } catch (e) {
            // Mother not found — that's fine, continue
          }
        }

        return {
          id: alert.id,
          motherId: mother_id,
          motherPhone: alert.mother_phone,
          motherName: mother_name,
          symptom: alert.symptom,
          dangerSign: alert.symptom,
          message: alert.message || alert.symptom,
          severity: alert.severity,
          status: alert.status,
          alertType: alert.alert_type,
          nursePhone: alert.nurse_phone,
          partnerPhone: alert.partner_phone,
          smsSent: alert.sms_sent,
          firedAt: alert.fired_at,
          createdAt: alert.created_at,
          acknowledgedAt: alert.acknowledged_at,
          resolvedAt: alert.resolved_at,
        };
      }),
    );

    res.status(200).json({ success: true, data: alerts });
  } catch (error) {
    console.error("getAllAlerts error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Update Alert Status (bulletproof) ─────────────────────────────────────
const updateAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 🛡️ Validate status
    if (!["open", "acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be: open, acknowledged, or resolved",
      });
    }

    // 🛡️ Validate UUID format (prevents 500 on bad id)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid alert ID format",
      });
    }

    // 🛡️ Build the update — only set timestamps if columns exist
    const result = await pool.query(
      `UPDATE alerts 
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Alert not found",
      });
    }

    const alert = result.rows[0];

    // 🛡️ Try to set timestamps separately (in case columns don't exist)
    try {
      if (status === "acknowledged") {
        await pool.query(
          `UPDATE alerts SET acknowledged_at = NOW() WHERE id = $1`,
          [id],
        );
      } else if (status === "resolved") {
        await pool.query(
          `UPDATE alerts SET resolved_at = NOW() WHERE id = $1`,
          [id],
        );
      }
    } catch (tsError) {
      // Timestamp column doesn't exist — that's fine, ignore
      console.warn("Timestamp column missing (skipped):", tsError.message);
    }

    // Return the alert with camelCase fields
    res.json({
      success: true,
      data: {
        id: alert.id,
        motherId: alert.mother_id,
        motherPhone: alert.mother_phone,
        motherName: alert.mother_name,
        symptom: alert.symptom,
        dangerSign: alert.symptom,
        message: alert.message,
        severity: alert.severity,
        status: alert.status,
        alertType: alert.alert_type,
        nursePhone: alert.nurse_phone,
        partnerPhone: alert.partner_phone,
        smsSent: alert.sms_sent,
        firedAt: alert.fired_at,
        createdAt: alert.created_at,
        acknowledgedAt: alert.acknowledged_at,
        resolvedAt: alert.resolved_at,
      },
    });
  } catch (error) {
    console.error("updateAlert error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createDangerAlert, getAllAlerts, updateAlert };
