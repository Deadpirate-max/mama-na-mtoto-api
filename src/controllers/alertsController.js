const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { encrypt, decrypt, hashForSearch } = require("../utils/encryption"); // 👈 Added imports
const AfricasTalking = require("africastalking");

// Initialize AT once — used for both SMS and WhatsApp
let sms = null;
try {
  const AT = AfricasTalking({
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
  });
  sms = AT.SMS;
} catch (e) {
  console.warn("⚠️ Africa's Talking not initialized. Check .env variables.");
}

// ── Send WhatsApp Alert via Africa's Talking ───────────────────────────────
const sendWhatsAppAlert = async (phone, alertData) => {
  const { motherName, symptom, severity, riskLevel, recommendation } =
    alertData;

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
          message: { type: "text", text: { body: message } },
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

// ── Test SMS sender ────────────────────────────────────────────────────────
const sendTestSMS = async (phone, message) => {
  if (!sms) return { success: false, error: "AT not initialized" };
  try {
    const response = await sms.send({ to: [phone], message });
    return { success: true, data: response };
  } catch (error) {
    console.error("❌ AT Send Error:", error.message);
    return { success: false, error: error.message };
  }
};

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

// ── Create Danger Alert ────────────────────────────────────────────────────
const createDangerAlert = asyncHandler(async (req, res) => {
  const { phone, message, severity, alert_type } = req.body;

  try {
    // 👇 1. LOOKUP USING PHONE HASH
    const phoneHash = hashForSearch(phone);
    const { rows } = await pool.query(
      `SELECT m.id, m.name, m.nurse_name, m.nurse_phone,
       COALESCE(m.partner_name, '') as partner_name,
       COALESCE(m.partner_phone, '') as partner_phone,
       COALESCE(m.facility_name, '') as facility_name
        FROM mothers m
        WHERE m.phone_hash = $1`,
      [phoneHash],
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

    // 👇 2. DECRYPT PII BEFORE SENDING SMS
    const decryptedMotherName = decrypt(mother.name);
    const decryptedNursePhone = mother.nurse_phone
      ? decrypt(mother.nurse_phone)
      : null;
    const decryptedPartnerPhone = mother.partner_phone
      ? decrypt(mother.partner_phone)
      : null;

    const recipients = [];
    if (decryptedNursePhone && decryptedNursePhone.length > 8)
      recipients.push(decryptedNursePhone);
    if (decryptedPartnerPhone && decryptedPartnerPhone.length > 8)
      recipients.push(decryptedPartnerPhone);

    let smsSent = false;

    if (recipients.length > 0 && sms) {
      const smsText =
        `MAMA NA MTOTO+ ALERT 🚨\n` +
        `Patient: ${decryptedMotherName || phone}\n` +
        `Symptom: ${message}\n` +
        `Severity: ${severity?.toUpperCase()}\n` +
        `Please respond IMMEDIATELY.\n` +
        `Mama na Mtoto+`;

      try {
        await sms.send({ to: recipients, message: smsText });
        smsSent = true;
      } catch (smsError) {
        console.error("SMS send failed:", smsError.message);
      }
    }

    // Send WhatsApp (non-blocking)
    if (decryptedNursePhone) {
      sendWhatsAppAlert(decryptedNursePhone, {
        motherName: decryptedMotherName || phone,
        symptom: message,
        severity: severity || "critical",
        riskLevel: "high",
        recommendation:
          severity === "critical"
            ? "Call mother immediately and prepare for referral."
            : "Follow up within 1 hour.",
      });
    }

    // 👇 3. ENCRYPT PII BEFORE SAVING TO ALERTS TABLE
    await pool.query(
      `INSERT INTO alerts
       (mother_id, mother_phone, symptom, severity, alert_type, nurse_phone, partner_phone, sms_sent, status, fired_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [
        mother.id,
        encrypt(phone), // Store encrypted phone
        message,
        severity,
        alert_type,
        mother.nurse_phone, // Already encrypted in DB
        mother.partner_phone, // Already encrypted in DB
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

// ── Get All Alerts (Enforces Facility Isolation) ───────────────────────────
const getAllAlerts = async (req, res) => {
  try {
    let query = `
      SELECT a.*, m.name as mother_name 
      FROM alerts a
      LEFT JOIN mothers m ON a.mother_id = m.id
      WHERE 1=1
    `;
    const params = [];

    // 👇 ENFORCE FACILITY ISOLATION
    if (req.facilityFilter) {
      query += " AND m.facility_code = $1";
      params.push(req.facilityFilter);
    }

    query +=
      " ORDER BY COALESCE(a.fired_at, a.created_at, NOW()) DESC LIMIT 100";

    const alertsResult = await pool.query(query, params);

    // 👇 DECRYPT PII BEFORE SENDING TO DASHBOARD
    const alerts = alertsResult.rows.map((alert) => ({
      id: alert.id,
      motherId: alert.mother_id,
      motherPhone: alert.mother_phone ? decrypt(alert.mother_phone) : null,
      motherName: alert.mother_name ? decrypt(alert.mother_name) : null,
      symptom: alert.symptom,
      dangerSign: alert.symptom,
      message: alert.message || alert.symptom,
      severity: alert.severity,
      status: alert.status,
      alertType: alert.alert_type,
      nursePhone: alert.nurse_phone ? decrypt(alert.nurse_phone) : null,
      partnerPhone: alert.partner_phone ? decrypt(alert.partner_phone) : null,
      smsSent: alert.sms_sent,
      firedAt: alert.fired_at,
      createdAt: alert.created_at,
      acknowledgedAt: alert.acknowledged_at,
      resolvedAt: alert.resolved_at,
    }));

    res.status(200).json({ success: true, data: alerts });
  } catch (error) {
    console.error("getAllAlerts error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Update Alert Status ────────────────────────────────────────────────────
const updateAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["open", "acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status." });
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid alert ID format" });
    }

    // 👇 Ensure the alert belongs to the nurse's facility
    if (req.facilityFilter) {
      const { rows } = await pool.query(
        `SELECT m.facility_code FROM alerts a JOIN mothers m ON a.mother_id = m.id WHERE a.id = $1`,
        [id],
      );
      if (rows.length === 0 || rows[0].facility_code !== req.facilityFilter) {
        return res
          .status(403)
          .json({ success: false, error: "Unauthorized to update this alert" });
      }
    }

    const result = await pool.query(
      `UPDATE alerts SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Alert not found" });
    }

    const alert = result.rows[0];

    if (status === "acknowledged") {
      await pool.query(
        `UPDATE alerts SET acknowledged_at = NOW() WHERE id = $1`,
        [id],
      );
    } else if (status === "resolved") {
      await pool.query(`UPDATE alerts SET resolved_at = NOW() WHERE id = $1`, [
        id,
      ]);
    }

    res.json({ success: true, data: alert });
  } catch (error) {
    console.error("updateAlert error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createDangerAlert,
  getAllAlerts,
  updateAlert,
  testSendSms: exports.testSendSms,
};
