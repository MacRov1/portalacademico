const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.showRegister = (req, res) => {
  res.render("register", { error: null, success: null });
};

exports.register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Validar entrada
    if (!username || !email || !password) {
      return res.render("register", {
        error: "Todos los campos son obligatorios",
        success: null,
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.render("register", {
        error: "El usuario o email ya está registrado",
        success: null,
      });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role: role || "student",
      approved: role === "admin" ? false : true, // Admins nuevos pendientes de aprobación
    });

    await user.save();

    // Log de dominio
    console.log(
      `[LOG ${new Date().toISOString()}] Usuario registrado: ${username} (Rol: ${user.role})`,
    );

    if (user.role === "admin") {
      // No generar tokens ni iniciar sesión para admins pendientes
      return res.render("register", {
        error: null,
        success:
          "Registro exitoso. Tu cuenta está pendiente de aprobación por un administrador.",
      });
    }

    // Generar tokens para students o admins aprobados
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN },
    );
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN },
    );

    // Guardar refreshToken en la sesión
    req.session.refreshToken = refreshToken;
    req.session.user = {
      id: user._id,
      role: user.role,
      approved: user.approved,
    };

    // Redirigir según rol
    res.redirect(user.role === "admin" ? "/auth/admin" : "/auth/student");
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al registrar usuario: ${error.message}`,
    );
    res.render("register", {
      error: "Error al registrar usuario",
      success: null,
    });
  }
};

exports.showLogin = (req, res) => {
  res.render("login", { error: null });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar entrada
    if (!email || !password) {
      return res.render("login", {
        error: "Email y contraseña son obligatorios",
      });
    }

    // Buscar usuario
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("login", { error: "Credenciales inválidas" });
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: "Credenciales inválidas" });
    }

    // Verificar aprobación si es admin
    if (user.role === "admin" && !user.approved) {
      return res.render("login", { error: "Cuenta pendiente de aprobación" });
    }

    // Generar tokens
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN },
    );
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN },
    );

    // Guardar en sesión (agregado approved)
    req.session.refreshToken = refreshToken;
    req.session.user = {
      id: user._id,
      role: user.role,
      approved: user.approved,
    };

    // Log de dominio
    console.log(
      `[LOG ${new Date().toISOString()}] Inicio de sesión exitoso: ${email} (Rol: ${user.role})`,
    );

    // Redirigir según rol
    res.redirect(user.role === "admin" ? "/auth/admin" : "/auth/student");
  } catch (error) {
    console.error(
      `[ERROR ${new Date().toISOString()}] Error al iniciar sesión: ${error.message}`,
    );
    res.render("login", { error: "Error al iniciar sesión" });
  }
};

exports.studentDashboard = (req, res) => {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.redirect("/auth/login");
  }
  res.render("studentDashboard", { user: req.session.user });
};

exports.adminDashboard = (req, res) => {
  if (
    !req.session.user ||
    req.session.user.role !== "admin" ||
    !req.session.user.approved
  ) {
    return res.redirect("/auth/login");
  }
  res.render("adminDashboard", { user: req.session.user });
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
};

// Nuevas funciones para aprobación de admins
exports.showPendingAdmins = async (req, res) => {
  if (
    !req.session.user ||
    req.session.user.role !== "admin" ||
    !req.session.user.approved
  ) {
    return res.redirect("/auth/login");
  }
  const pendingAdmins = await User.find({ role: "admin", approved: false });
  res.render("pending-admins", { pendingAdmins });
};

exports.approveAdmin = async (req, res) => {
  if (
    !req.session.user ||
    req.session.user.role !== "admin" ||
    !req.session.user.approved
  ) {
    return res.redirect("/auth/login");
  }
  const { id } = req.params;
  await User.findByIdAndUpdate(id, { approved: true });
  res.redirect("/auth/pending-admins");
};
