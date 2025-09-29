const Subject = require("../models/Subject");

// Convierte horario a minutos para comparar superposiciones
const timeToMinutes = (time) => {
  const match = time.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error("Formato de horario inválido. Use HH:MM-HH:MM");
  }
  const [, startH, startM, endH, endM] = match;
  const start = parseInt(startH) * 60 + parseInt(startM);
  const end = parseInt(endH) * 60 + parseInt(endM);
  if (start >= end || start < 0 || end > 24 * 60) {
    throw new Error(
      "Horario inválido: inicio debe ser antes del fin y dentro de 00:00-23:59",
    );
  }
  return { start, end };
};

// Verifica superposición de horarios
const hasScheduleOverlap = (
  newSchedule,
  existingSchedules,
  currentId = null,
) => {
  for (const existing of existingSchedules) {
    for (const newSlot of newSchedule) {
      if (existing.day === newSlot.day) {
        try {
          const existingTime = timeToMinutes(existing.time);
          const newTime = timeToMinutes(newSlot.time);
          if (
            (newTime.start >= existingTime.start &&
              newTime.start < existingTime.end) ||
            (newTime.end > existingTime.start &&
              newTime.end <= existingTime.end) ||
            (newTime.start <= existingTime.start &&
              newTime.end >= existingTime.end)
          ) {
            return true;
          }
        } catch (err) {
          continue;
        }
      }
    }
  }
  return false;
};

exports.showCreateSubject = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/auth/login");
  }
  try {
    const subjects = await Subject.find().select("name _id");
    const subject = null;
    const isEdit = false;
    res.render("createSubject", {
      user: req.session.user,
      subjects,
      subject,
      isEdit,
      error: null,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al mostrar creación de materia: ${error.message}`,
    );
    const subjects = [];
    const subject = null;
    const isEdit = false;
    res.render("createSubject", {
      user: req.session.user,
      subjects,
      subject,
      isEdit,
      error: "Error al cargar materias",
    });
  }
};

exports.createSubject = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/auth/login");
  }
  try {
    const {
      code,
      name,
      credits,
      semester,
      scheduleDays: scheduleDaysArray,
      scheduleTimes: scheduleTimesArray,
      prerequisites: prerequisitesArray,
      prerequisiteTypes: prerequisiteTypesArray,
    } = req.body;

    if (!code || !name || credits === undefined || !semester) {
      const subjects = await Subject.find().select("name _id");
      const subject = null;
      const isEdit = false;
      return res.render("createSubject", {
        user: req.session.user,
        subjects,
        subject,
        isEdit,
        error: "Código, nombre, créditos y semestre son obligatorios",
      });
    }
    const parsedCredits = parseInt(credits);
    if (parsedCredits < 0) {
      const subjects = await Subject.find().select("name _id");
      const subject = null;
      const isEdit = false;
      return res.render("createSubject", {
        user: req.session.user,
        subjects,
        subject,
        isEdit,
        error: "Los créditos deben ser 0 o más",
      });
    }

    let schedule = [];
    if (
      scheduleDaysArray &&
      scheduleTimesArray &&
      Array.isArray(scheduleDaysArray) &&
      Array.isArray(scheduleTimesArray) &&
      scheduleDaysArray.length > 0
    ) {
      if (scheduleDaysArray.length !== scheduleTimesArray.length) {
        return res.render("createSubject", {
          user: req.session.user,
          subjects: await Subject.find().select("name _id"),
          subject: null,
          isEdit: false,
          error: "El número de días y horarios debe coincidir",
        });
      }
      schedule = scheduleDaysArray.map((day, i) => {
        const time = scheduleTimesArray[i];
        timeToMinutes(time);
        return { day: day.trim(), time: time.trim() };
      });
    }

    if (schedule.length > 0) {
      const existingSubjects = await Subject.find({
        semester: parseInt(semester),
      });
      const existingSchedules = existingSubjects.flatMap(
        (s) => s.schedule || [],
      );
      if (hasScheduleOverlap(schedule, existingSchedules)) {
        const subjects = await Subject.find().select("name _id");
        const subject = null;
        const isEdit = false;
        return res.render("createSubject", {
          user: req.session.user,
          subjects,
          subject,
          isEdit,
          error: "Conflicto de horario con otra materia del mismo semestre",
        });
      }
    }

    let formattedPrerequisites = [];
    if (
      prerequisitesArray &&
      prerequisiteTypesArray &&
      Array.isArray(prerequisitesArray) &&
      Array.isArray(prerequisiteTypesArray) &&
      prerequisitesArray.length > 0
    ) {
      if (prerequisitesArray.length !== prerequisiteTypesArray.length) {
        return res.render("createSubject", {
          user: req.session.user,
          subjects: await Subject.find().select("name _id"),
          subject: null,
          isEdit: false,
          error: "El número de previas y tipos debe coincidir",
        });
      }
      formattedPrerequisites = prerequisitesArray
        .map((subjectId, i) => {
          if (!subjectId) return null;
          return {
            subjectId,
            type: prerequisiteTypesArray[i],
          };
        })
        .filter((p) => p !== null);
    }

    const subjectData = new Subject({
      code: code.trim(),
      name: name.trim(),
      credits: parsedCredits,
      semester: parseInt(semester),
      schedule,
      prerequisites: formattedPrerequisites,
    });

    const savedSubject = await subjectData.save();

    const io = req.app.get("socketio");
    io.emit("newSubject", {
      message: `Nueva materia disponible: ${savedSubject.name}`,
      subject: {
        _id: savedSubject._id,
        code: savedSubject.code,
        name: savedSubject.name,
        credits: savedSubject.credits,
        semester: savedSubject.semester,
      },
    });

    // Log de dominio
    console.log(
      `[LOG ${new Date().toISOString()}] Materia creada: ${savedSubject.name} (Código: ${savedSubject.code}, Semestre: ${savedSubject.semester})`,
    );

    res.redirect("/subjects/list");
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al crear materia: ${error.message}`,
    );
    const subjects = await Subject.find().select("name _id");
    const subject = null;
    const isEdit = false;
    const errorMsg =
      error.message.includes("Formato") ||
      error.message.includes("Horario inválido")
        ? error.message
        : "Error al crear materia";
    res.render("createSubject", {
      user: req.session.user,
      subjects,
      subject,
      isEdit,
      error: errorMsg,
    });
  }
};

exports.listSubjects = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/auth/login");
  }
  try {
    const search = req.query.search || "";
    const query = search ? { name: { $regex: search, $options: "i" } } : {};
    const subjects = await Subject.find(query)
      .sort({ semester: 1, name: 1 })
      .populate("prerequisites.subjectId", "name");
    res.render("listSubjects", {
      user: req.session.user,
      subjects,
      search,
      error: null,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al listar materias: ${error.message}`,
    );
    res.render("listSubjects", {
      user: req.session.user,
      subjects: [],
      search: "",
      error: "Error al listar materias",
    });
  }
};

exports.showEditSubject = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/auth/login");
  }
  try {
    const subject = await Subject.findById(req.params.id).populate(
      "prerequisites.subjectId",
      "name",
    );
    if (!subject) {
      return res.redirect("/subjects/list");
    }
    const subjects = await Subject.find().select("name _id");
    const isEdit = true;
    const error = null;
    res.render("createSubject", {
      user: req.session.user,
      subject,
      subjects,
      isEdit,
      error,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al mostrar edición de materia: ${error.message}`,
    );
    res.redirect("/subjects/list");
  }
};

exports.editSubject = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/auth/login");
  }
  try {
    const subjectId = req.params.id;
    const {
      code,
      name,
      credits,
      semester,
      scheduleDays: scheduleDaysArray,
      scheduleTimes: scheduleTimesArray,
      prerequisites: prerequisitesArray,
      prerequisiteTypes: prerequisiteTypesArray,
    } = req.body;

    if (!code || !name || credits === undefined || !semester) {
      const subject = await Subject.findById(subjectId);
      const subjects = await Subject.find().select("name _id");
      const isEdit = true;
      return res.render("createSubject", {
        user: req.session.user,
        subject,
        subjects,
        isEdit,
        error: "Código, nombre, créditos y semestre son obligatorios",
      });
    }
    const parsedCredits = parseInt(credits);
    if (parsedCredits < 0) {
      const subject = await Subject.findById(subjectId);
      const subjects = await Subject.find().select("name _id");
      const isEdit = true;
      return res.render("createSubject", {
        user: req.session.user,
        subject,
        subjects,
        isEdit,
        error: "Los créditos deben ser 0 o más",
      });
    }

    let schedule = [];
    if (
      scheduleDaysArray &&
      scheduleTimesArray &&
      Array.isArray(scheduleDaysArray) &&
      Array.isArray(scheduleTimesArray) &&
      scheduleDaysArray.length > 0
    ) {
      if (scheduleDaysArray.length !== scheduleTimesArray.length) {
        const subject = await Subject.findById(subjectId);
        const subjects = await Subject.find().select("name _id");
        const isEdit = true;
        return res.render("createSubject", {
          user: req.session.user,
          subject,
          subjects,
          isEdit,
          error: "El número de días y horarios debe coincidir",
        });
      }
      schedule = scheduleDaysArray.map((day, i) => {
        const time = scheduleTimesArray[i];
        timeToMinutes(time);
        return { day: day.trim(), time: time.trim() };
      });
    }

    if (schedule.length > 0) {
      const existingSubjects = await Subject.find({
        semester: parseInt(semester),
        _id: { $ne: subjectId },
      });
      const existingSchedules = existingSubjects.flatMap(
        (s) => s.schedule || [],
      );
      if (hasScheduleOverlap(schedule, existingSchedules, subjectId)) {
        const subject = await Subject.findById(subjectId);
        const subjects = await Subject.find().select("name _id");
        const isEdit = true;
        return res.render("createSubject", {
          user: req.session.user,
          subject,
          subjects,
          isEdit,
          error: "Conflicto de horario con otra materia del mismo semestre",
        });
      }
    }

    let formattedPrerequisites = [];
    if (
      prerequisitesArray &&
      prerequisiteTypesArray &&
      Array.isArray(prerequisitesArray) &&
      Array.isArray(prerequisiteTypesArray) &&
      prerequisitesArray.length > 0
    ) {
      if (prerequisitesArray.length !== prerequisiteTypesArray.length) {
        const subject = await Subject.findById(subjectId);
        const subjects = await Subject.find().select("name _id");
        const isEdit = true;
        return res.render("createSubject", {
          user: req.session.user,
          subject,
          subjects,
          isEdit,
          error: "El número de previas y tipos debe coincidir",
        });
      }
      formattedPrerequisites = prerequisitesArray
        .map((subjectIdStr, i) => {
          if (!subjectIdStr) return null;
          return {
            subjectId: subjectIdStr,
            type: prerequisiteTypesArray[i],
          };
        })
        .filter((p) => p !== null);
    }

    await Subject.findByIdAndUpdate(subjectId, {
      code: code.trim(),
      name: name.trim(),
      credits: parsedCredits,
      semester: parseInt(semester),
      schedule,
      prerequisites: formattedPrerequisites,
    });

    // Log de dominio
    console.log(
      `[LOG ${new Date().toISOString()}] Materia editada: ${name} (ID: ${subjectId})`,
    );

    res.redirect("/subjects/list");
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al editar materia: ${error.message}`,
    );
    const subject = await Subject.findById(req.params.id);
    const subjects = await Subject.find().select("name _id");
    const isEdit = true;
    const errorMsg =
      error.message.includes("Formato") ||
      error.message.includes("Horario inválido")
        ? error.message
        : "Error al editar materia";
    res.render("createSubject", {
      user: req.session.user,
      subject,
      subjects,
      isEdit,
      error: errorMsg,
    });
  }
};

exports.deleteSubject = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/auth/login");
  }
  try {
    const deletedSubject = await Subject.findByIdAndDelete(req.params.id);

    // Log de dominio
    if (deletedSubject) {
      console.log(
        `[LOG ${new Date().toISOString()}] Materia eliminada: ${deletedSubject.name} (ID: ${req.params.id})`,
      );
    }

    res.redirect("/subjects/list");
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al eliminar materia: ${error.message}`,
    );
    res.redirect("/subjects/list");
  }
};

exports.showStudyPlan = async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/auth/login");
  }
  try {
    const subjects = await Subject.find()
      .sort({ semester: 1, name: 1 })
      .populate("prerequisites.subjectId", "name");
    const semesters = [...new Set(subjects.map((s) => s.semester))].sort(
      (a, b) => a - b,
    );
    const error = null;
    res.render("studyPlan", {
      user: req.session.user,
      subjects,
      semesters,
      error,
    });
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al mostrar plan de estudios: ${error.message}`,
    );
    res.render("studyPlan", {
      user: req.session.user,
      subjects: [],
      semesters: [],
      error: "Error al cargar el plan de estudios",
    });
  }
};
