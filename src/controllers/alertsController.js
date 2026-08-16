const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

// Africa's Talking SMS utility
const AfricasTalking = require('africastalking');
const AT = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});
const sms = AT.SMS;

const createDangerAlert = asyncHandler(async (req, res) => {
  const { phone, message, severity, alert_type } = req.body;

  try {
    // 1. Get mother profile including nurse and partner details
    const { rows } = await pool.query(
      `SELECT m.name, m.nurse_name, m.nurse_phone,
              m.partner_name, m.partner_phone,
              m.facility_name
       FROM mothers m
       WHERE m.phone = $1`,
      [phone]
    );

    const mother = rows[0];

    // ── FIX A: Handle missing mother gracefully ──
    if (!mother) {
      // Mother not in DB yet — log locally
      return res.json({
        success: true,
        warning: 'Mother profile not found in database — alert logged locally only',
        sms_sent: false,
      });
    }

    // ── FIX B: Build recipients list (only valid phone numbers) ──
    const recipients = [];
    if (mother.nurse_phone && mother.nurse_phone !== 'N/A' && mother.nurse_phone.length > 8) {
      recipients.push(mother.nurse_phone);
    }
    if (mother.partner_phone && mother.partner_phone !== 'N/A' && mother.partner_phone.length > 8) {
      recipients.push(mother.partner_phone);
    }

    let smsSent = false;

    // 2. Send SMS (only if we have valid recipients)
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
        // ── FIX C: Don't crash if SMS fails — still save the alert ──
        console.error('SMS send failed:', smsError.message);
      }
    }

    // 3. Always save alert to database (regardless of SMS result)
    await pool.query(
      `INSERT INTO alerts
       (mother_phone, symptom, severity, alert_type,
        nurse_phone, partner_phone, sms_sent, status, fired_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        phone, message, severity, alert_type,
        mother.nurse_phone || null,
        mother.partner_phone || null,
        smsSent,
        smsSent ? 'sent' : 'logged_no_sms'
      ]
    );

    // 4. Return success to the client
    res.json({
      success: true,
      sms_sent: smsSent,
      recipients_notified: recipients.length,
      warning: recipients.length === 0
        ? 'No nurse or partner phone on file — alert saved locally'
        : null,
    });

  } catch (error) {
    console.error('Alert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { createDangerAlert };