const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");

// Rutas para historial
router.get("/history", studentController.showStudentHistory);
router.post("/history/add", studentController.addToHistory);
router.post("/history/edit/:historyId", studentController.editHistoryStatus);

// Rutas para verificador de elegibilidad
router.get("/eligibility", studentController.showEligibilityChecker);

// Rutas para selección de materias
router.get("/selection", studentController.showCourseSelection);
router.post("/selection", studentController.selectCourses);

// Ruta para confirmar inscripción
router.post("/confirm", studentController.confirmCourses);

module.exports = router;
