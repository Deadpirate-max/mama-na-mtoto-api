const express = require("express");
const router = express.Router();
const { sendChatMessage } = require("../controllers/chatController");
const { requireMotherAuth } = require("../middleware/motherAuth");

router.post("/message", requireMotherAuth, sendChatMessage);

module.exports = router;
