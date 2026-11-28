// src/routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const { requireMotherAuth } = require("../middleware/motherAuth");

const {
  sendChatMessage,
  transcribeVoice,
  generateTTS,
} = require("../controllers/chatController");
const { requireConsent } = require("../controllers/consentController");

router.post(
  "/message",
  requireMotherAuth,
  requireConsent("ai_chat"),
  sendChatMessage,
);
router.post("/voice", requireMotherAuth, transcribeVoice);
router.post("/tts", requireMotherAuth, requireConsent("voice"), generateTTS);

module.exports = router;
