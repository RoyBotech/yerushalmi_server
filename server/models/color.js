const mongoose = require("mongoose");

const colorSchema = new mongoose.Schema(
  {
    date: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { strict: false }
);

const Color = mongoose.model("color", colorSchema);

module.exports = Color;
