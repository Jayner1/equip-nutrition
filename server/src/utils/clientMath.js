const GOAL_ADJUSTMENTS = {
  Cut: -400,
  Bulk: 350,
  Maintenance: 0,
};

function round(value) {
  return Math.round(Number(value));
}

function toTotalHeightInches(heightFeet, heightInchesPart) {
  return Number(heightFeet) * 12 + Number(heightInchesPart);
}

function calculateMaintenanceCalories(weight, activityMultiplier) {
  return round(Number(weight) * Number(activityMultiplier));
}

function calculateCalorieTarget(maintenanceCalories, goal, overrideCalorieTarget) {
  if (overrideCalorieTarget !== null && overrideCalorieTarget !== undefined) {
    return round(overrideCalorieTarget);
  }

  const adjustment = GOAL_ADJUSTMENTS[goal] ?? 0;
  return round(maintenanceCalories + adjustment);
}

function getBmi(weightLbs, heightInches) {
  if (!weightLbs || !heightInches) {
    return 0;
  }

  return (Number(weightLbs) / (Number(heightInches) * Number(heightInches))) * 703;
}

function getGoalWeightFromHeight(heightInches) {
  return (24.9 * Number(heightInches) * Number(heightInches)) / 703;
}

function getProteinReferenceWeight(weightLbs, heightInches) {
  const bmi = getBmi(weightLbs, heightInches);
  const goalWeight = getGoalWeightFromHeight(heightInches);
  let referenceWeight = Number(weightLbs);
  let referenceMethod = "current bodyweight";

  if (bmi >= 30) {
    referenceWeight = goalWeight;
    referenceMethod = "goal bodyweight";
  }

  return {
    bmi: Number(bmi.toFixed(1)),
    referenceWeight: round(referenceWeight),
    referenceMethod,
  };
}

function calculateMacroTargets(weightLbs, heightInches, calorieTarget, fatPercent = 25) {
  const proteinData = getProteinReferenceWeight(weightLbs, heightInches);
  const proteinGrams = round(proteinData.referenceWeight);
  const proteinCalories = proteinGrams * 4;
  const appliedFatPercent = Number(fatPercent);
  const fatCalories = round(Number(calorieTarget) * (appliedFatPercent / 100));
  const fatGrams = round(fatCalories / 9);
  const carbCalories = Math.max(Number(calorieTarget) - proteinCalories - fatCalories, 0);
  const carbGrams = round(carbCalories / 4);

  return {
    proteinGrams,
    fatGrams,
    carbGrams,
    fatPercent: appliedFatPercent,
    bmi: proteinData.bmi,
    proteinReferenceWeight: proteinData.referenceWeight,
    proteinReferenceMethod: proteinData.referenceMethod,
  };
}

function applyMacroOverrides(macros, input) {
  const proteinGrams =
    input.overrideProteinGrams !== null && input.overrideProteinGrams !== undefined
      ? round(input.overrideProteinGrams)
      : macros.proteinGrams;
  const fatGrams =
    input.overrideFatGrams !== null && input.overrideFatGrams !== undefined
      ? round(input.overrideFatGrams)
      : macros.fatGrams;
  const carbGrams =
    input.overrideCarbGrams !== null && input.overrideCarbGrams !== undefined
      ? round(input.overrideCarbGrams)
      : macros.carbGrams;

  return { proteinGrams, fatGrams, carbGrams };
}

function suggestCalorieAdjustment(goal, latestCheckIns = []) {
  if (latestCheckIns.length < 2) {
    return {
      recommendedAdjustment: 0,
      reason: "Need at least 2 weekly check-ins for a suggestion.",
    };
  }

  const sorted = [...latestCheckIns].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const previous = Number(sorted[sorted.length - 2].weight);
  const current = Number(sorted[sorted.length - 1].weight);
  const weightDelta = current - previous;

  if (goal === "Cut") {
    if (weightDelta >= -0.25) {
      return {
        recommendedAdjustment: -150,
        reason: "Fat loss appears stalled; consider a small calorie reduction.",
      };
    }
    if (weightDelta <= -2) {
      return {
        recommendedAdjustment: 150,
        reason: "Weight is dropping too quickly; consider slowing the deficit.",
      };
    }
  }

  if (goal === "Bulk") {
    if (weightDelta <= 0.25) {
      return {
        recommendedAdjustment: 150,
        reason: "Weight gain appears slow; consider a small calorie increase.",
      };
    }
    if (weightDelta >= 2) {
      return {
        recommendedAdjustment: -150,
        reason: "Weight gain appears rapid; consider reducing calories slightly.",
      };
    }
  }

  if (goal === "Maintenance" && Math.abs(weightDelta) >= 1.5) {
    return {
      recommendedAdjustment: weightDelta > 0 ? -150 : 150,
      reason: "Weight is drifting from maintenance; consider a small correction.",
    };
  }

  return {
    recommendedAdjustment: 0,
    reason: "Current trend looks on track. Keep calories unchanged this week.",
  };
}

function hydrateClient(input) {
  const totalHeightInches =
    input.heightFeet !== undefined || input.heightInchesPart !== undefined
      ? toTotalHeightInches(input.heightFeet ?? 0, input.heightInchesPart ?? 0)
      : Number(input.heightInches ?? 0);
  const normalizedHeightFeet = Math.floor(totalHeightInches / 12);
  const normalizedHeightInchesPart = totalHeightInches % 12;
  const maintenanceCalories = calculateMaintenanceCalories(
    input.weight,
    input.activityMultiplier
  );
  const calorieTarget = calculateCalorieTarget(
    maintenanceCalories,
    input.goal,
    input.overrideCalorieTarget
  );
  const macros = calculateMacroTargets(
    input.weight,
    totalHeightInches,
    calorieTarget,
    input.fatPercent ?? 25
  );
  const effectiveMacros = applyMacroOverrides(macros, input);
  const recommendation = suggestCalorieAdjustment(input.goal, input.checkIns ?? []);

  return {
    ...input,
    heightFeet: input.heightFeet ?? normalizedHeightFeet,
    heightInchesPart: input.heightInchesPart ?? normalizedHeightInchesPart,
    totalHeightInches,
    maintenanceCalories,
    calorieTarget,
    autoProteinGrams: macros.proteinGrams,
    autoFatGrams: macros.fatGrams,
    autoCarbGrams: macros.carbGrams,
    proteinGrams: effectiveMacros.proteinGrams,
    fatGrams: effectiveMacros.fatGrams,
    carbGrams: effectiveMacros.carbGrams,
    fatPercent: macros.fatPercent,
    bmi: macros.bmi,
    proteinReferenceWeight: macros.proteinReferenceWeight,
    proteinReferenceMethod: macros.proteinReferenceMethod,
    recommendedAdjustment: recommendation.recommendedAdjustment,
    recommendationReason: recommendation.reason,
  };
}

module.exports = {
  hydrateClient,
};
