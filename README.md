# Sistema de Gestión de Materias y Estudiantes

Aplicación web para gestionar materias, inscripciones de estudiantes y verificación de elegibilidad.  
Desarrollada con **Node.js, Express, MongoDB, EJS** y **Socket.io**.

---

## 🚀 Setup

### Requisitos
- Node.js
- MongoDB (local o en la nube, como MongoDB Atlas)

### Instalación
```bash
npm install
```

### Variables de Entorno
Ejemplo de archivo `.env`:

```env
MONGO_URI=mongodb+srv://user2:user2@cluster0.58lvizv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
PORT=3000
JWT_SECRET=miSuperSecretoSeguro123
JWT_REFRESH_SECRET=miSuperSecretoRefresh456
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d
```

### Ejecución
```bash
node index.js
```
Abrir en el navegador: [http://localhost:3000](http://localhost:3000)

---

## 🏗️ Decisiones de Diseño

- **Arquitectura MVC**: modelos, controladores, rutas y vistas (EJS).  
- **Autenticación** con JWT y sesiones en MongoStore.  
- **Roles**: `student` y `admin`.  
- **Validaciones**: verificación de prerrequisitos y conflictos de horarios.  
- **Notificaciones en tiempo real** con Socket.io.  
- **Seguridad**: bcrypt para contraseñas, sesiones con cookies seguras.  
- **Logs**: Morgan y middleware de manejo de errores.

---

## 📌 Endpoints

### Autenticación (/auth)
- GET /register → Formulario de registro
- POST /register → Crear usuario
- GET /login → Formulario de login
- POST /login → Iniciar sesión
- GET /logout → Cerrar sesión
- GET /student → Dashboard estudiante
- GET /admin → Dashboard admin

### Estudiantes (/student)
- GET /history → Ver historial
- POST /history/add → Añadir materia al historial
- POST /history/edit/:id → Editar estado de materia en historial
- GET /eligibility → Verificar elegibilidad
- GET /selection → Selección de cursos
- POST /selection → Seleccionar cursos
- POST /confirm → Confirmar inscripción

### Materias (/subjects) (solo admin)
- GET /create → Formulario de creación
- POST /create → Crear materia
- GET /list → Listar materias
- GET /edit/:id → Editar materia
- POST /edit/:id → Guardar cambios
- GET /delete/:id → Eliminar materia
- GET /study-plan → Plan de estudios

### Otros
- GET / → Redirige a `/auth/login`
