const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const Subject = require("./models/Subject");
require("dotenv").config();

const seedData = async () => {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Conectado a MongoDB");

    // Limpiar colecciones existentes
    await User.deleteMany({});
    await Subject.deleteMany({});
    console.log("Colecciones limpiadas");

    // Crear materias de prueba primero
    const subjects = [
      {
        code: "MAT101",
        name: "Matemáticas I",
        credits: 4,
        semester: 1,
        schedule: [{ day: "Lunes", time: "08:00-10:00" }],
        prerequisites: [],
      },
      {
        code: "PROG101",
        name: "Programación I",
        credits: 4,
        semester: 1,
        schedule: [{ day: "Martes", time: "10:00-12:00" }],
        prerequisites: [],
      },
      {
        code: "PROG102",
        name: "Programación II",
        credits: 4,
        semester: 2,
        schedule: [{ day: "Miércoles", time: "08:00-10:00" }],
        prerequisites: [],
      },
    ];

    const savedSubjects = await Subject.insertMany(subjects);
    console.log("Materias creadas");

    // Crear usuarios de prueba
    const hashedPassword = await bcrypt.hash("password123", 10);
    const users = [
      {
        username: "estudiante1",
        email: "estudiante@example.com",
        password: hashedPassword,
        role: "student",
        history: [
          {
            subjectId: savedSubjects[0]._id, // MAT101
            status: "approved",
            semester: 1,
            creditsEarned: 4,
          },
          {
            subjectId: savedSubjects[1]._id, // PROG101
            status: "approved",
            semester: 1,
            creditsEarned: 4,
          },
        ],
      },
      {
        username: "admin1",
        email: "admin1@example.com",
        password: hashedPassword,
        role: "admin",
        history: [],
      },
    ];

    await User.insertMany(users);
    console.log("Usuarios creados");

    // Configurar previa para PROG102 (requiere PROG101 - curso aprobado)
    savedSubjects[2].prerequisites = [
      {
        subjectId: savedSubjects[1]._id,
        type: "course",
      },
    ];
    await savedSubjects[2].save();
    console.log("Previas configuradas");

    console.log("Seed completado");
    process.exit(0);
  } catch (error) {
    console.error("Error en el seed:", error);
    process.exit(1);
  }
};

seedData();
