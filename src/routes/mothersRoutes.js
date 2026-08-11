const express = require("express");
const { validate } = require("../middleware/validate");
const {
  createMother,
  getMotherByPhone,
  updateMother,
} = require("../controllers/mothersController");
const { updateVisit } = require("../controllers/visitsController");
const { updateLabResult } = require("../controllers/labsController");
const { updateVaccination } = require("../controllers/vaccinationsController");
const mothersController = require('../controllers/mothersController');

const router = express.Router();

const createMotherSchema = {
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  name: { required: true, type: "string" },
  age: { type: "number", min: 10, max: 60 },
  gravida: { type: "number", min: 0, max: 20 },
  para: { type: "number", min: 0, max: 20 },
};

router.post(
  "/",
  validate(createMotherSchema),
  createMother,
);

router.get("/:phone", getMotherByPhone);

router.put("/:phone", updateMother);

router.patch("/:phone/visits/:number", updateVisit);

router.patch("/:phone/labs/:id", updateLabResult);

router.patch("/:phone/vaccinations/:id", updateVaccination);

router.post('/upload-photo', mothersController.uploadProfilePhoto);

module.exports = router;
