const GOAL_ADJUSTMENTS = {
  Cut: -400,
  Bulk: 350,
  Maintenance: 0,
};

function calculateMaintenanceCalories(weight, activityMultiplier) {
  return Math.round(Number(weight) * Number(activityMultiplier));
}

function calculateCalorieTarget(maintenanceCalories, goal) {
  const adjustment = GOAL_ADJUSTMENTS[goal] ?? 0;
  return maintenanceCalories + adjustment;
}

function calculateMacroTargets(weight, calorieTarget) {
  const proteinGrams = Math.round(Number(weight));
  const proteinCalories = proteinGrams * 4;
  const fatCalories = Math.round(Number(calorieTarget) * 0.25);
  const fatGrams = Math.round(fatCalories / 9);
  const carbCalories = Math.max(Number(calorieTarget) - proteinCalories - fatCalories, 0);
  const carbGrams = Math.round(carbCalories / 4);

  return {
    proteinGrams,
    fatGrams,
    carbGrams,
    fatPercent: 25,
  };
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
        reason: "Weight is dropping quickly; consider slowing the deficit.",
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
      reason: "Weight trend is drifting from maintenance; consider a small correction.",
    };
  }

  return {
    recommendedAdjustment: 0,
    reason: "Current trend looks on track. Keep calories unchanged this week.",
  };
}

module.exports = {
  GOAL_ADJUSTMENTS,
  calculateMaintenanceCalories,
  calculateCalorieTarget,
  calculateMacroTargets,
  suggestCalorieAdjustment,
};
