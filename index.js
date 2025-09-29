const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const morgan = require("morgan");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const authRoutes = require("./routes/authRoutes");
const subjectRoutes = require("./routes/subjectRoutes");
const studentRoutes = require("./routes/studentRoutes");
const http = require("http"); // Necesario para WebSockets
const { Server } = require("socket.io"); // Importar socket.io

dotenv.config();

const app = express();
const server = http.createServer(app); // Crear servidor HTTP
const io = new Server(server); // Inicializar socket.io con el servidor HTTP

// Conexión a MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => console.error("Error de conexión a MongoDB:", err));

// Middleware
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static("public"));

// Configuración de sesiones
app.use(
  session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 días
  }),
);

// Rutas
app.use("/auth", authRoutes);
app.use("/subjects", subjectRoutes);
app.use("/student", studentRoutes);

// Ruta raíz
app.get("/", (req, res) => {
  res.redirect("/auth/login");
});

// Configuración de WebSockets
io.on("connection", (socket) => {
  console.log("Nuevo cliente conectado:", socket.id);

  // Evento cuando un cliente se desconecta
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

// Exportar io para usarlo en otros módulos
app.set("socketio", io); // Hacer que io esté disponible en req.app.get("socketio")

// Middleware de manejo de errores centralizado
app.use((err, req, res, next) => {
  console.error(
    `[ERROR ${new Date().toISOString()}] ${err.message} | Path: ${req.path} | Stack: ${err.stack}`,
  );
  res
    .status(500)
    .render("error", {
      error: "Error interno del servidor. Por favor, intente nuevamente.",
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
