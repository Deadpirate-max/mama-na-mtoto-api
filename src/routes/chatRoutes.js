const express = require("express");
const router = express.Router();
const { sendChatMessage } = require("../controllers/chatController");
const { requireMotherAuth } = require("../middleware/motherAuth");
const { transcribeVoice } = require("../controllers/chatController");
// Ensure it looks exactly like this:
router.post("/message", requireMotherAuth, sendChatMessage);

module.exports = router;
router.post("/voice", authenticate, transcribeVoice);
