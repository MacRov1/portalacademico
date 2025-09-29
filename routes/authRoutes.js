const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.get("/register", authController.showRegister);
router.post("/register", authController.register);
router.get("/login", authController.showLogin);
router.post("/login", authController.login);
router.get("/student", authController.studentDashboard);
router.get("/admin", authController.adminDashboard);
router.get("/logout", authController.logout);

// Nuevas rutas para aprobación de admins
router.get("/pending-admins", authController.showPendingAdmins);
router.post("/approve-admin/:id", authController.approveAdmin);

module.exports = router;
