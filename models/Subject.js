const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  credits: {
    type: Number,
    required: true,
    min: 0,
  },
  semester: {
    type: Number,
    required: true,
    min: 1,
  },
  schedule: [
    {
      day: {
        type: String,
        enum: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],
        required: true,
      },
      time: { type: String, required: true }, // Formato: "HH:MM-HH:MM"
    },
  ],
  prerequisites: [
    {
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
      type: { type: String, enum: ["exam", "course"], required: true },
    },
  ],
});

module.exports = mongoose.model("Subject", subjectSchema);
