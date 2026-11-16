// src/routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const { requireMotherAuth } = require("../middleware/motherAuth");

const {
  sendChatMessage,
  transcribeVoice,
} = require("../controllers/chatController");

// Existing text route
router.post("/message", requireMotherAuth, sendChatMessage);

//  Use the correct middleware name (requireMotherAuth) for the voice route
router.post("/voice", requireMotherAuth, transcribeVoice);

module.exports = router;
