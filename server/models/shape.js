const mongoose = require("mongoose");

const shapeSchema = new mongoose.Schema(
  {
    date: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { strict: false }
);

const Shape = mongoose.model("shape", shapeSchema);

module.exports = Shape;
