// studentcontroller.js (modificado)
const User = require("../models/User");
const Subject = require("../models/Subject");

// =========================
// HELPERS
// =========================

// Helper: obtiene siempre el id en formato string
const toIdString = (subjectRef) => {
  if (!subjectRef) return null;
  if (typeof subjectRef === "string") return subjectRef;
  if (subjectRef._id) return subjectRef._id.toString();
  return subjectRef.toString();
};

// Verifica si una materia es elegible basado en el historial
const isSubjectEligible = (subject, studentHistory) => {
  const subjectIdStr = toIdString(subject._id);

  const histEntryForThis = studentHistory.find(
    (entry) => toIdString(entry.subjectId) === subjectIdStr,
  );
  if (histEntryForThis) {
    switch (histEntryForThis.status) {
      case "approved":
        return {
          eligible: false,
          reasons: [
            "La materia ya fue aprobada. No puedes volver a inscribirte.",
          ],
          category: "alreadyProcessed",
        };
      case "in_progress":
        return {
          eligible: false,
          reasons: ["Ya estás cursando esta materia actualmente."],
          category: "alreadyProcessed",
        };
      case "completed_course_exam_pending":
        return {
          eligible: false,
          reasons: [
            "Ya completaste el curso, pero tienes el examen pendiente.",
          ],
          category: "alreadyProcessed",
        };
      case "pending":
        return {
          eligible: false,
          reasons: [
            "La materia ya está registrada como pendiente en tu historial.",
          ],
          category: "alreadyProcessed",
        };
    }
  }

  if (!subject.prerequisites || subject.prerequisites.length === 0) {
    return { eligible: true, reasons: [], category: "eligible" };
  }

  const reasons = [];
  for (const prereq of subject.prerequisites) {
    const prereqIdStr = toIdString(prereq.subjectId);
    const historyEntry = studentHistory.find(
      (entry) => toIdString(entry.subjectId) === prereqIdStr,
    );

    if (
      !historyEntry ||
      (prereq.type === "course" &&
        historyEntry.status !== "approved" &&
        historyEntry.status !== "completed_course_exam_pending") ||
      (prereq.type === "exam" && historyEntry.status !== "approved")
    ) {
      const prereqName =
        prereq.subjectId && prereq.subjectId.name
          ? prereq.subjectId.name
          : "Materia previa no encontrada";
      reasons.push(
        `Falta ${prereq.type === "exam" ? "aprobar examen de" : "aprobar curso de"} ${prereqName}`,
      );
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    category: reasons.length > 0 ? "prerequisitesPending" : "eligible",
  };
};

// Detecta choques de horario
const detectScheduleConflicts = (selectedSubjects) => {
  const conflicts = [];
  for (let i = 0; i < selectedSubjects.length; i++) {
    for (let j = i + 1; j < selectedSubjects.length; j++) {
      const conflictsPair = checkPairConflict(
        selectedSubjects[i],
        selectedSubjects[j],
      );
      if (conflictsPair) conflicts.push(conflictsPair);
    }
  }
  return conflicts;
};

const checkPairConflict = (sub1, sub2) => {
  for (const slot1 of sub1.schedule || []) {
    for (const slot2 of sub2.schedule || []) {
      if (slot1.day === slot2.day) {
        const time1 = {
          start:
            parseInt(slot1.time.split("-")[0].split(":")[0]) * 60 +
            parseInt(slot1.time.split("-")[0].split(":")[1]),
          end:
            parseInt(slot1.time.split("-")[1].split(":")[0]) * 60 +
            parseInt(slot1.time.split("-")[1].split(":")[1]),
        };
        const time2 = {
          start:
            parseInt(slot2.time.split("-")[0].split(":")[0]) * 60 +
            parseInt(slot2.time.split("-")[0].split(":")[1]),
          end:
            parseInt(slot2.time.split("-")[1].split(":")[0]) * 60 +
            parseInt(slot2.time.split("-")[1].split(":")[1]),
        };
        if (
          Math.max(time1.start, time2.start) < Math.min(time1.end, time2.end)
        ) {
          return {
            subjects: [sub1.name, sub2.name],
            day: slot1.day,
            time1: slot1.time,
            time2: slot2.time,
          };
        }
      }
    }
  }
  return null;
};

// Helper para obtener materias en progreso
async function getInProgressSubjects(studentHistory) {
  const inProgressIds = (studentHistory || [])
    .filter((entry) => entry.status === "in_progress")
    .map((entry) => toIdString(entry.subjectId));

  if (inProgressIds.length === 0) return [];

  const subjects = await Subject.find({ _id: { $in: inProgressIds } }).populate(
    "prerequisites.subjectId",
  );

  return subjects.map((subject) => ({
    ...subject._doc,
    id: toIdString(subject._id),
  }));
}

// Helper: devuelve todas las materias con flags
async function getSubjectsWithFlags(studentHistory) {
  const subjects = await Subject.find()
    .populate("prerequisites.subjectId")
    .sort({ semester: 1, name: 1 })
    .lean();

  const processStates = [
    "approved",
    "in_progress",
    "completed_course_exam_pending",
    "pending",
  ];
  const processedSet = new Set(
    (studentHistory || [])
      .filter((e) => processStates.includes(e.status))
      .map((e) => toIdString(e.subjectId)),
  );

  const approvedSet = new Set(
    (studentHistory || [])
      .filter((e) => e.status === "approved")
      .map((e) => toIdString(e.subjectId)),
  );

  return subjects.map((subject) => {
    const eligibility = isSubjectEligible(subject, studentHistory || []);
    const isProcessed = processedSet.has(toIdString(subject._id));
    const isApproved = approvedSet.has(toIdString(subject._id));
    const isInProcess = isProcessed && !isApproved;

    return {
      ...subject,
      eligible: eligibility.eligible,
      reasons: eligibility.reasons,
      isApproved,
      isInProcess,
    };
  });
}

// Helper: obtener elegibilidad por semestre
async function getEligibilityBySemester(studentId) {
  const student = await User.findById(studentId).populate("history.subjectId");
  const studentHistory = student.history;
  const subjects = await Subject.find().populate("prerequisites.subjectId");

  const eligibilityBySemester = {};
  subjects.forEach((subject) => {
    const eligibility = isSubjectEligible(subject, studentHistory);
    const semester = subject.semester;
    if (!eligibilityBySemester[semester]) {
      eligibilityBySemester[semester] = {
        eligible: [],
        alreadyProcessed: [],
        prerequisitesPending: [],
      };
    }
    if (eligibility.eligible) {
      eligibilityBySemester[semester].eligible.push(subject);
    } else {
      const subjectWithReasons = {
        ...subject._doc,
        reasons: eligibility.reasons,
      };
      if (eligibility.category === "alreadyProcessed") {
        eligibilityBySemester[semester].alreadyProcessed.push(
          subjectWithReasons,
        );
      } else if (eligibility.category === "prerequisitesPending") {
        eligibilityBySemester[semester].prerequisitesPending.push(
          subjectWithReasons,
        );
      }
    }
  });
  return eligibilityBySemester;
}

exports.showStudentDashboard = (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  res.render("studentDashboard", { user: req.session.user });
};

exports.showStudentHistory = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  try {
    const user = await User.findById(req.session.user.id).populate(
      "history.subjectId",
    );
    const studentHistory = user.history || [];

    // Obtener todas las materias y filtrar las elegibles
    const allSubjectsRaw = await Subject.find()
      .select("name _id code semester credits")
      .populate("prerequisites.subjectId")
      .sort({ semester: 1, code: 1 });

    // Filtrar materias elegibles y no en el historial en ningún estado
    const allSubjects = allSubjectsRaw.filter((subject) => {
      const eligibility = isSubjectEligible(subject, studentHistory);
      return eligibility.eligible;
    });

    const historyBySemester = {};
    let totalCredits = 0;

    user.history.forEach((entry) => {
      const semester = entry.semester;
      if (!historyBySemester[semester]) historyBySemester[semester] = [];
      historyBySemester[semester].push(entry);
      if (entry.status === "approved") {
        totalCredits += entry.creditsEarned;
      }
    });

    const semesters = Object.keys(historyBySemester).sort((a, b) => a - b);

    let success = req.query.success
      ? decodeURIComponent(req.query.success)
      : null;
    let error = req.query.error ? decodeURIComponent(req.query.error) : null;

    res.render("studentHistory", {
      user: req.session.user,
      historyBySemester,
      semesters,
      totalCredits,
      allSubjects,
      error,
      success,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al mostrar historial: ${error.message}`,
    );
    const allSubjects = [];
    res.render("studentHistory", {
      user: req.session.user,
      historyBySemester: {},
      semesters: [],
      totalCredits: 0,
      allSubjects,
      error: "Error al cargar historial",
      success: null,
    });
  }
};

exports.addToHistory = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  try {
    const { subjectId, status } = req.body;
    const user = await User.findById(req.session.user.id).populate(
      "history.subjectId",
    );
    const studentHistory = user.history || [];

    const allSubjectsRaw = await Subject.find()
      .select("name _id code semester credits")
      .populate("prerequisites.subjectId")
      .sort({ semester: 1, code: 1 });
    const allSubjects = allSubjectsRaw.filter((subject) => {
      const eligibility = isSubjectEligible(subject, studentHistory);
      return eligibility.eligible;
    });

    const subjectExists = await Subject.findById(subjectId).populate(
      "prerequisites.subjectId",
    );
    if (!subjectExists) {
      return res.render("studentHistory", {
        user: req.session.user,
        historyBySemester: {},
        semesters: [],
        totalCredits: 0,
        allSubjects,
        error: "Materia no encontrada",
      });
    }

    // Verificar elegibilidad
    const eligibility = isSubjectEligible(subjectExists, studentHistory);
    if (!eligibility.eligible) {
      return res.render("studentHistory", {
        user: req.session.user,
        historyBySemester: {},
        semesters: [],
        totalCredits: 0,
        allSubjects,
        error: `No puedes añadir esta materia: ${eligibility.reasons.join(", ")}`,
      });
    }

    user.history.push({
      subjectId,
      status,
      semester: subjectExists.semester,
      creditsEarned: status === "approved" ? subjectExists.credits : 0,
    });

    await user.save();

    // Log de dominio
    console.log(
      `[LOG ${new Date().toISOString()}] Materia añadida al historial del estudiante ${req.session.user.id}: ${subjectExists.name} (Estado: ${status})`,
    );

    res.redirect(
      "/student/history?success=" +
        encodeURIComponent("Materia añadida al historial con éxito"),
    );
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al añadir al historial: ${error.message}`,
    );
    const allSubjects = [];
    res.render("studentHistory", {
      user: req.session.user,
      historyBySemester: {},
      semesters: [],
      totalCredits: 0,
      allSubjects,
      error: "Error al añadir al historial",
    });
  }
};

exports.editHistoryStatus = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  try {
    const { historyId } = req.params;
    const { status } = req.body;
    const user = await User.findById(req.session.user.id).populate(
      "history.subjectId",
    );

    const historyEntry = user.history.id(historyId);
    if (!historyEntry) {
      return res.redirect(
        "/student/history?error=Entrada de historial no encontrada",
      );
    }

    if (historyEntry.status === "approved") {
      return res.redirect(
        "/student/history?error=No se pueden editar materias aprobadas",
      );
    }

    const subject = await Subject.findById(historyEntry.subjectId);
    if (!subject) {
      return res.redirect(
        "/student/history?error=Materia asociada no encontrada",
      );
    }

    const validStatuses = [
      "pending",
      "in_progress",
      "completed_course_exam_pending",
      "approved",
    ];
    if (!validStatuses.includes(status)) {
      return res.redirect("/student/history?error=Estado inválido");
    }

    historyEntry.status = status;
    historyEntry.creditsEarned = status === "approved" ? subject.credits : 0;

    await user.save();

    // Log de dominio
    console.log(
      `[LOG ${new Date().toISOString()}] Estado de historial actualizado para estudiante ${req.session.user.id}: Materia ${subject.name} (Nuevo estado: ${status})`,
    );

    res.redirect(
      "/student/history?success=" +
        encodeURIComponent("Estado actualizado exitosamente"),
    );
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al actualizar estado: ${error.message}`,
    );
    res.redirect(
      "/student/history?error=Error al actualizar el estado de la materia",
    );
  }
};

exports.showEligibilityChecker = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  try {
    const user = await User.findById(req.session.user.id).populate(
      "history.subjectId",
    );
    const subjects = await Subject.find().populate("prerequisites.subjectId");
    const studentHistory = user.history;

    const eligibilityBySemester = await getEligibilityBySemester(
      req.session.user.id,
    );

    const semesters = Object.keys(eligibilityBySemester).sort((a, b) => a - b);
    res.render("eligibilityChecker", {
      user: req.session.user,
      eligibilityBySemester,
      semesters,
      error: null,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al verificar elegibilidad: ${error.message}`,
    );
    res.render("eligibilityChecker", {
      user: req.session.user,
      eligibilityBySemester: {},
      semesters: [],
      error: "Error al verificar elegibilidad",
    });
  }
};

// Helper: devuelve todas las materias con flags
async function getSubjectsWithFlags(studentHistory) {
  const subjects = await Subject.find()
    .populate("prerequisites.subjectId")
    .sort({ semester: 1, name: 1 })
    .lean();

  const processStates = [
    "approved",
    "in_progress",
    "completed_course_exam_pending",
    "pending",
  ];
  const processedSet = new Set(
    (studentHistory || [])
      .filter((e) => processStates.includes(e.status))
      .map((e) => toIdString(e.subjectId)),
  );

  const approvedSet = new Set(
    (studentHistory || [])
      .filter((e) => e.status === "approved")
      .map((e) => toIdString(e.subjectId)),
  );

  return subjects.map((subject) => {
    const eligibility = isSubjectEligible(subject, studentHistory || []);
    const isProcessed = processedSet.has(toIdString(subject._id));
    const isApproved = approvedSet.has(toIdString(subject._id));
    const isInProcess = isProcessed && !isApproved;

    return {
      ...subject,
      eligible: eligibility.eligible,
      reasons: eligibility.reasons,
      isApproved,
      isInProcess,
    };
  });
}

exports.showCourseSelection = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  try {
    const user = await User.findById(req.session.user.id).populate(
      "history.subjectId",
    );
    const studentHistory = user.history || [];

    const subjectsWithFlags = await getSubjectsWithFlags(studentHistory);
    const inProgressSubjects = await getInProgressSubjects(studentHistory);

    const groupedSubjects = {};
    subjectsWithFlags.forEach((s) => {
      if (!groupedSubjects[s.semester]) groupedSubjects[s.semester] = [];
      groupedSubjects[s.semester].push(s);
    });

    res.render("courseSelection", {
      user: req.session.user,
      groupedSubjects,
      selectedSubjects: [],
      selectedIds: [],
      inProgressSubjects,
      allScheduledSubjects: [],
      totalCredits: 0,
      totalLoad: 0,
      conflicts: [],
      globalConflicts: [],
      error: null,
      success: null,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al mostrar selección de cursos: ${error.message}`,
    );
    res.render("courseSelection", {
      user: req.session.user,
      groupedSubjects: {},
      selectedSubjects: [],
      selectedIds: [],
      inProgressSubjects: [],
      allScheduledSubjects: [],
      totalCredits: 0,
      totalLoad: 0,
      conflicts: [],
      globalConflicts: [],
      error: "Error al cargar materias disponibles",
      success: null,
    });
  }
};

exports.selectCourses = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  try {
    let { selectedSubjects } = req.body;
    if (!selectedSubjects) selectedSubjects = [];
    const selectedIds = Array.isArray(selectedSubjects)
      ? selectedSubjects
      : [selectedSubjects].filter(Boolean);

    console.log("Selected IDs from POST:", selectedIds);

    const user = await User.findById(req.session.user.id).populate(
      "history.subjectId",
    );
    const studentHistory = user.history || [];
    const inProgressSubjects = await getInProgressSubjects(studentHistory);

    const invalidStates = [
      "approved",
      "in_progress",
      "completed_course_exam_pending",
      "pending",
    ];
    const invalidSet = new Set(
      (studentHistory || [])
        .filter((e) => invalidStates.includes(e.status))
        .map((e) => toIdString(e.subjectId)),
    );

    let selectedSubjectsData = [];
    let selectedWithId = [];

    if (selectedIds.length > 0) {
      selectedSubjectsData = await Subject.find({
        _id: { $in: selectedIds },
      }).populate("prerequisites.subjectId");

      const validSubjectsData = selectedSubjectsData.filter(
        (sub) => !invalidSet.has(toIdString(sub._id)),
      );

      selectedWithId = validSubjectsData.map((subject) => ({
        ...subject._doc,
        id: toIdString(subject._id),
      }));

      if (selectedSubjectsData.length > validSubjectsData.length) {
        const invalidSelections = selectedSubjectsData.filter((sub) =>
          invalidSet.has(toIdString(sub._id)),
        );
        console.warn(
          "Invalid selections:",
          invalidSelections.map((s) => s.name),
        );
      }
    }

    const newCredits = selectedWithId.reduce(
      (sum, sub) => sum + sub.credits,
      0,
    );
    const totalLoad =
      newCredits +
      inProgressSubjects.reduce((sum, sub) => sum + sub.credits, 0);

    const conflicts = detectScheduleConflicts(selectedWithId);
    const allScheduledSubjects = [...inProgressSubjects, ...selectedWithId];
    const globalConflicts = detectScheduleConflicts(allScheduledSubjects);

    const subjectsWithFlags = await getSubjectsWithFlags(studentHistory);
    const groupedSubjects = {};
    subjectsWithFlags.forEach((s) => {
      if (!groupedSubjects[s.semester]) groupedSubjects[s.semester] = [];
      groupedSubjects[s.semester].push(s);
    });

    const selectedIdsForTemplate = selectedWithId.map((s) => s._id);

    // Log de dominio
    if (selectedWithId.length > 0) {
      console.log(
        `[LOG ${new Date().toISOString()}] Estudiante ${req.session.user.id} seleccionó materias: ${selectedWithId.map((s) => s.name).join(", ")}`,
      );
    }

    res.render("courseSelection", {
      user: req.session.user,
      groupedSubjects,
      selectedSubjects: selectedWithId,
      selectedIds: selectedIdsForTemplate,
      inProgressSubjects,
      allScheduledSubjects,
      totalCredits: newCredits,
      totalLoad,
      conflicts,
      globalConflicts,
      success:
        selectedWithId.length > 0
          ? `Materias seleccionadas con éxito. Carga horaria nueva: ${newCredits} créditos. Carga total: ${totalLoad} créditos.` +
            (globalConflicts.length > 0
              ? " Hay choques de horario en el cronograma propuesto."
              : "")
          : null,
      error:
        selectedWithId.length === 0 && selectedIds.length > 0
          ? "Las materias seleccionadas no son válidas o ya están en tu historial."
          : null,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al seleccionar materias: ${error.message}`,
    );
    res.render("courseSelection", {
      user: req.session.user,
      groupedSubjects: {},
      selectedSubjects: [],
      selectedIds: [],
      inProgressSubjects: [],
      allScheduledSubjects: [],
      totalCredits: 0,
      totalLoad: 0,
      conflicts: [],
      globalConflicts: [],
      error: "Error al seleccionar materias",
      success: null,
    });
  }
};

exports.confirmCourses = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  try {
    let { selectedSubjects } = req.body;
    console.log(
      "POST confirm - selectedSubjects:",
      selectedSubjects,
      "Type:",
      typeof selectedSubjects,
      "IsArray:",
      Array.isArray(selectedSubjects),
    );

    if (
      !selectedSubjects ||
      !Array.isArray(selectedSubjects) ||
      selectedSubjects.length === 0
    ) {
      console.log("No valid selectedSubjects in confirm");
      return res.redirect(
        "/student/selection?error=No hay materias para confirmar. Primero selecciona y verifica las materias.",
      );
    }

    const user = await User.findById(req.session.user.id);
    const studentHistory = user.history || [];

    const subjectsToAdd = await Subject.find({
      _id: { $in: selectedSubjects },
    }).lean();

    console.log("Subjects found for add:", subjectsToAdd.length);

    if (subjectsToAdd.length !== selectedSubjects.length) {
      return res.redirect(
        "/student/selection?error=Algunas materias no existen o no son válidas.",
      );
    }

    const addedIds = [];
    let addedCount = 0;
    for (const subject of subjectsToAdd) {
      const existing = studentHistory.find(
        (h) => toIdString(h.subjectId) === toIdString(subject._id),
      );
      if (!existing) {
        user.history.push({
          subjectId: subject._id,
          status: "in_progress",
          semester: subject.semester,
          creditsEarned: 0,
        });
        addedIds.push(subject._id);
        addedCount++;
      } else {
        console.log(`Subject ${subject.name} already exists in history`);
      }
    }

    if (addedCount === 0) {
      return res.redirect(
        "/student/selection?error=No se pudo agregar ninguna materia nueva. Verifica tu historial.",
      );
    }

    await user.save();
    console.log(`Successfully added ${addedCount} subjects to history`);

    // Log de dominio
    console.log(
      `[LOG ${new Date().toISOString()}] Estudiante ${req.session.user.id} confirmó inscripción en ${addedCount} materias: ${subjectsToAdd.map((s) => s.name).join(", ")}`,
    );

    const successMsg = `Inscrito exitosamente en ${addedCount} materia(s).`;
    return res.redirect(
      "/student/history?success=" + encodeURIComponent(successMsg),
    );
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al confirmar inscripción: ${error.message}`,
    );
    return res.redirect(
      "/student/selection?error=Error al confirmar la inscripción",
    );
  }
};
