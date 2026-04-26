const mongoose = require("mongoose");
const {
  calculateMaintenanceCalories,
  calculateCalorieTarget,
  calculateMacroTargets,
  suggestCalorieAdjustment,
} = require("../utils/calories");

const activityLevels = [14, 15, 16, 17, 18];
const goals = ["Cut", "Bulk", "Maintenance"];

const checkInSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    weight: { type: Number, required: true, min: 1 },
    notes: { type: String, default: "" },
  },
  { _id: true }
);

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 1 },
    age: { type: Number, min: 1 },
    activityMultiplier: { type: Number, required: true, enum: activityLevels },
    goal: { type: String, required: true, enum: goals },
    maintenanceCalories: { type: Number, required: true },
    calorieTarget: { type: Number, required: true },
    proteinGrams: { type: Number, required: true },
    fatGrams: { type: Number, required: true },
    carbGrams: { type: Number, required: true },
    fatPercent: { type: Number, required: true, default: 25 },
    recommendedAdjustment: { type: Number, default: 0 },
    recommendationReason: { type: String, default: "" },
    customPlan: { type: String, default: "" },
    notes: { type: String, default: "" },
    checkIns: { type: [checkInSchema], default: [] },
  },
  { timestamps: true }
);

clientSchema.pre("validate", function calculateTargets(next) {
  this.maintenanceCalories = calculateMaintenanceCalories(
    this.weight,
    this.activityMultiplier
  );
  this.calorieTarget = calculateCalorieTarget(this.maintenanceCalories, this.goal);
  const macroTargets = calculateMacroTargets(this.weight, this.calorieTarget);
  this.proteinGrams = macroTargets.proteinGrams;
  this.fatGrams = macroTargets.fatGrams;
  this.carbGrams = macroTargets.carbGrams;
  this.fatPercent = macroTargets.fatPercent;

  const recommendation = suggestCalorieAdjustment(this.goal, this.checkIns);
  this.recommendedAdjustment = recommendation.recommendedAdjustment;
  this.recommendationReason = recommendation.reason;
  next();
});

module.exports = mongoose.model("Client", clientSchema);
