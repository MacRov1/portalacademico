const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
    },
    approved: {
      // Nuevo campo para aprobación de admins
      type: Boolean,
      default: true, // Default true para students y admins existentes
    },
    history: [
      {
        subjectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Subject",
          required: true,
        },
        status: {
          type: String,
          enum: [
            "pending",
            "in_progress",
            "completed_course_exam_pending",
            "approved",
          ],
          required: true,
        },
        semester: { type: Number, required: true },
        creditsEarned: { type: Number, default: 0 }, // Créditos obtenidos si aprobado
      },
    ],
  },
  { timestamps: true },
);

// Método para calcular créditos totales obtenidos
userSchema.methods.calculateTotalCredits = function () {
  return this.history.reduce((total, entry) => {
    return entry.status === "approved" ? total + entry.creditsEarned : total;
  }, 0);
};

module.exports = mongoose.model("User", userSchema);
