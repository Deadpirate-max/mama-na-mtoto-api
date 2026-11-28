const express = require("express");
const router = express.Router();
const { requireMotherAuth } = require("../middleware/motherAuth");
const {
  sendChatMessage,
  transcribeVoice,
  generateTTS,
} = require("../controllers/chatController");

// ── Routes (No consent middleware) ────────────────────────────────────────
router.post("/message", requireMotherAuth, sendChatMessage);
router.post("/voice", requireMotherAuth, transcribeVoice);
router.post("/tts", requireMotherAuth, generateTTS);

module.exports = router;
