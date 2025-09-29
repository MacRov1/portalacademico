const express = require("express");
const router = express.Router();
const subjectController = require("../controllers/subjectController");

router.get("/create", subjectController.showCreateSubject);
router.post("/create", subjectController.createSubject);
router.get("/list", subjectController.listSubjects);
router.get("/edit/:id", subjectController.showEditSubject);
router.post("/edit/:id", subjectController.editSubject);
router.get("/delete/:id", subjectController.deleteSubject);
router.get("/study-plan", subjectController.showStudyPlan);

module.exports = router;
