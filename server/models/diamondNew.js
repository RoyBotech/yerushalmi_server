const mongoose = require("mongoose");

const diamondNewSchema = new mongoose.Schema({
  VendorStockNumber: { type: String, required: true },
  Shape: { type: String, required: true },
  Weight: { type: String, required: true },
  Color: { type: String, required: true },
  Clarity: { type: String, required: true },
  Cut: { type: String, required: true },
  Polish: { type: String, required: true },
  Symmetry: { type: String, required: true },
  FluorescenceIntensity: { type: String, required: true },
  Lab: { type: String, required: true },
  ROUGH_CT: { type: String, required: true },
  ROUGH_DATE: { type: String, required: true },
  CertificateUrl: { type: String, required: true },
  RoughVideo: { type: String, required: true },
  PolishedVideo: { type: String, required: true },
});

const DiamondNew = mongoose.model("Diamond_new", diamondNewSchema);

module.exports = DiamondNew;
