import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
const activityOptions = [
  { value: 14, label: "14 - Very inactive" },
  { value: 15, label: "15 - Light activity" },
  { value: 16, label: "16 - Light activity (high end)" },
  { value: 17, label: "17 - Moderate activity" },
  { value: 18, label: "18 - Extremely active" },
];

const goals = ["Cut", "Bulk", "Maintenance"];

/** Optional coach visual estimate → protein blend toward goal weight & light maintenance tweak */
const estimatedBodyFatOptions = [
  { value: "", label: "Not specified (neutral)" },
  { value: "very_lean", label: "~10–13% (very lean)" },
  { value: "lean", label: "~14–17% (lean)" },
  { value: "athletic", label: "~18–22% (athletic)" },
  { value: "fitness", label: "~23–27% (fitness)" },
  { value: "average", label: "~28–32% (average)" },
  { value: "above_average", label: "~33–38% (above average)" },
  { value: "high", label: "~39–45%+ (high)" },
];

/** 0 = full bodyweight tilt; 1 = max blend toward BMI-24.9 goal weight */
function proteinBlendFromEstimatedBodyFat(key) {
  switch (String(key ?? "")) {
    case "very_lean":
      return 0.05;
    case "lean":
      return 0.12;
    case "athletic":
      return 0.22;
    case "fitness":
      return 0.35;
    case "average":
      return 0.48;
    case "above_average":
      return 0.62;
    case "high":
      return 0.75;
    default:
      return 0;
  }
}

/** Capped refinement on maintenance (~±3% from mid; total spread within ~6%) */
function maintenanceMultiplierFromEstimatedBodyFat(key) {
  switch (String(key ?? "")) {
    case "very_lean":
      return 1.03;
    case "lean":
      return 1.02;
    case "athletic":
      return 1.01;
    case "fitness":
      return 1;
    case "average":
      return 0.99;
    case "above_average":
      return 0.975;
    case "high":
      return 0.96;
    default:
      return 1;
  }
}

function labelForEstimatedBodyFat(key) {
  const row = estimatedBodyFatOptions.find((o) => o.value === String(key ?? ""));
  return row ? row.label : "—";
}

function getProteinReferenceWeightWithBodyFatEstimate(weightLbs, totalHeightInches, estimateKey) {
  const base = getProteinReferenceWeight(weightLbs, totalHeightInches);
  const blend = proteinBlendFromEstimatedBodyFat(estimateKey);

  if (blend === 0) {
    return {
      ...base,
      bodyFatProteinBlend: 0,
      estimatedBodyFatKey: estimateKey || null,
    };
  }

  if (base.referenceMethod === "goal bodyweight") {
    return {
      ...base,
      bodyFatProteinBlend: 0,
      estimatedBodyFatKey: estimateKey || null,
    };
  }

  const goalWeight = getGoalWeightFromHeight(totalHeightInches);
  const fullW = Number(weightLbs);
  const blended = round(fullW * (1 - blend) + goalWeight * blend);
  let method = "coach body-fat blend (toward goal/adiposity proxy)";
  if (blend <= 0.15) {
    method = "current bodyweight (minor lean/adiposity blend)";
  }

  return {
    bmi: base.bmi,
    referenceWeight: blended,
    referenceMethod: method,
    bodyFatProteinBlend: blend,
    estimatedBodyFatKey: estimateKey || null,
  };
}

/** Stored as "male" | "female"; unknown / legacy omit → neutral multiplier */
const sexStoredValues = [
  { value: "", label: "Select sex…" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const defaultFormState = {
  name: "",
  weight: "",
  heightFeet: "",
  heightInchesPart: "",
  sex: "",
  age: "",
  activityMultiplier: 15,
  goal: "Maintenance",
  trainingDaysPerWeek: 5,
  fatPercent: 25,
  overrideCalorieTarget: "",
  overrideProteinGrams: "",
  overrideFatGrams: "",
  overrideCarbGrams: "",
  estimatedBodyFatEstimate: "",
  customPlan: "",
  notes: "",
};

const defaultCheckInState = {
  weight: "",
  notes: "",
  date: new Date().toISOString().split("T")[0],
};

const macroGuideTabs = [
  { key: "protein", label: "Protein" },
  { key: "carbs", label: "Carbs" },
  { key: "fats", label: "Fats" },
];

const macroFoodGuide = {
  protein: {
    title: "Top Protein Foods",
    topFoods: [
      { name: "Chicken breast", serving: "4 oz cooked", macroGrams: "35 g protein" },
      { name: "Nonfat Greek yogurt", serving: "1 cup", macroGrams: "23 g protein" },
      { name: "Egg whites", serving: "1 cup", macroGrams: "26 g protein" },
      { name: "Lean ground turkey (93/7)", serving: "4 oz cooked", macroGrams: "22 g protein" },
      { name: "Tuna", serving: "1 can (5 oz drained)", macroGrams: "30 g protein" },
    ],
    vegetarianFoods: [
      { name: "Low-fat cottage cheese", serving: "1 cup", macroGrams: "26 g protein" },
      { name: "Eggs", serving: "2 whole eggs", macroGrams: "12 g protein" },
      { name: "Skyr", serving: "1 cup", macroGrams: "20 g protein" },
      { name: "Paneer (low-fat)", serving: "3 oz", macroGrams: "18 g protein" },
      { name: "Tempeh", serving: "3 oz", macroGrams: "16 g protein" },
    ],
    veganFoods: [
      { name: "Extra-firm tofu", serving: "4 oz", macroGrams: "14 g protein" },
      { name: "Tempeh", serving: "3 oz", macroGrams: "16 g protein" },
      { name: "Seitan", serving: "3 oz", macroGrams: "21 g protein" },
      { name: "Edamame", serving: "1 cup shelled", macroGrams: "18 g protein" },
      { name: "Lentils", serving: "1 cup cooked", macroGrams: "18 g protein" },
    ],
  },
  carbs: {
    title: "Top Carb Foods",
    topFoods: [
      { name: "Jasmine rice", serving: "1 cup cooked", macroGrams: "45 g carbs" },
      { name: "Rolled oats", serving: "1/2 cup dry", macroGrams: "27 g carbs" },
      { name: "Sweet potato", serving: "1 medium", macroGrams: "26 g carbs" },
      { name: "Sourdough bread", serving: "2 slices", macroGrams: "34 g carbs" },
      { name: "Banana", serving: "1 medium", macroGrams: "27 g carbs" },
    ],
  },
  fats: {
    title: "Top Fat Foods",
    topFoods: [
      { name: "Avocado", serving: "1/2 medium", macroGrams: "15 g fat" },
      { name: "Extra-virgin olive oil", serving: "1 tbsp", macroGrams: "14 g fat" },
      { name: "Almonds", serving: "1 oz", macroGrams: "14 g fat" },
      { name: "Natural peanut butter", serving: "2 tbsp", macroGrams: "16 g fat" },
      { name: "Chia seeds", serving: "2 tbsp", macroGrams: "9 g fat" },
    ],
  },
};

function round(value) {
  return Math.round(Number(value));
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalize persisted sex for calculations and compares */
function normalizeSex(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "male" || s === "m") {
    return "male";
  }
  if (s === "female" || s === "f") {
    return "female";
  }
  return null;
}

/**
 * Scales baseline (weight × activity) maintenance upward for men vs women and adjusts
 * for age vs a reference adult (~32). Legacy clients missing sex behave like the old formula.
 */
function demographicMaintenanceMultipliers(sex, ageYears) {
  let sexMultiplier = 1;
  const s = normalizeSex(sex);
  if (s === "male") {
    sexMultiplier = 1.04;
  } else if (s === "female") {
    sexMultiplier = 0.96;
  }

  let ageMultiplier = 1;
  if (ageYears != null && Number.isFinite(Number(ageYears))) {
    const a = Number(ageYears);
    if (a >= 14 && a <= 100) {
      const referenceAge = 32;
      ageMultiplier = 1 + (a - referenceAge) * -0.0012;
      ageMultiplier = Math.max(0.9, Math.min(1.055, ageMultiplier));
    }
  }

  return {
    sexMultiplier,
    ageMultiplier,
    combinedMultiplier: sexMultiplier * ageMultiplier,
  };
}

function baselineMaintenanceCalories(weight, activityMultiplier) {
  return round(Number(weight) * Number(activityMultiplier));
}

function calculateCalorieTarget(maintenanceCalories, goal, overrideCalorieTarget) {
  if (overrideCalorieTarget !== null && overrideCalorieTarget !== undefined) {
    return round(overrideCalorieTarget);
  }
  if (goal === "Cut") {
    return maintenanceCalories - 400;
  }
  if (goal === "Bulk") {
    return maintenanceCalories + 350;
  }
  return maintenanceCalories;
}

function getBmi(weightLbs, totalHeightInches) {
  if (!weightLbs || !totalHeightInches) {
    return 0;
  }
  return (Number(weightLbs) / (Number(totalHeightInches) * Number(totalHeightInches))) * 703;
}

function getGoalWeightFromHeight(totalHeightInches) {
  return (24.9 * Number(totalHeightInches) * Number(totalHeightInches)) / 703;
}

function getProteinReferenceWeight(weightLbs, totalHeightInches) {
  const bmi = getBmi(weightLbs, totalHeightInches);
  const goalWeight = getGoalWeightFromHeight(totalHeightInches);
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

/**
 * Split weekly calorie budget into training-day and rest-day targets so the weekly
 * sum matches calorieTarget × 7 while keeping the averaged daily calorie line (goal) unchanged.
 * Protein stays equal every day — variation is mostly via carbs vs rest-day calories.
 */
function clampTrainingDays(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) {
    return 5;
  }
  return Math.min(7, Math.max(1, n));
}

function computeTrainingRestDaysCalories(calorieTarget, trainingDaysPerWeek) {
  const D = round(Number(calorieTarget));
  const weeklyTotal = D * 7;
  const nTrain = clampTrainingDays(trainingDaysPerWeek);
  const nRest = 7 - nTrain;

  if (nTrain === 7) {
    return {
      weeklyCalorieBudget: weeklyTotal,
      trainingDaysPerWeek: nTrain,
      restDaysPerWeek: 0,
      trainDayCalories: D,
      restDayCalories: D,
    };
  }

  const preferredTrain =
    D + Math.min(250, Math.max(50, Math.round(D * 0.08)));

  /** Integer train/rest kcal/day with N*T + R*r = weeklyTotal (exact weekly alignment). */
  let bestTrain = null;
  let bestRest = null;
  let bestScore = Infinity;

  const ceilSearch = Math.min(Math.floor(weeklyTotal / nTrain), preferredTrain + 200);
  const floorSearch = Math.max(D + 5, preferredTrain - 350);

  for (let trainCal = ceilSearch; trainCal >= floorSearch; trainCal--) {
    const residue = weeklyTotal - trainCal * nTrain;
    if (residue <= 0) {
      continue;
    }
    if (residue % nRest !== 0) {
      continue;
    }
    const restCal = residue / nRest;
    if (restCal < 200 || restCal >= trainCal) {
      continue;
    }

    const score = Math.abs(trainCal - preferredTrain);
    if (score < bestScore) {
      bestScore = score;
      bestTrain = trainCal;
      bestRest = restCal;
      if (score === 0) {
        break;
      }
    }
  }

  if (bestTrain === null) {
    for (let trainCal = Math.floor(weeklyTotal / nTrain); trainCal >= D; trainCal -= 1) {
      const residue = weeklyTotal - trainCal * nTrain;
      if (residue <= 0 || residue % nRest !== 0) {
        continue;
      }
      const restCal = residue / nRest;
      if (restCal < 200 || restCal >= trainCal) {
        continue;
      }
      bestTrain = trainCal;
      bestRest = restCal;
      break;
    }
  }

  const trainDayCalories = Math.round(bestTrain ?? D);
  const restDayCalories = Math.round(bestRest ?? D);

  return {
    weeklyCalorieBudget: weeklyTotal,
    trainingDaysPerWeek: nTrain,
    restDaysPerWeek: nRest,
    trainDayCalories,
    restDayCalories,
  };
}

function computeMacrosForDailyCalories(dailyCalories, proteinGrams, fatPercent) {
  const proteinCalories = proteinGrams * 4;
  const fatCalories = Math.round(Number(dailyCalories) * (Number(fatPercent) / 100));
  const fatGrams = round(fatCalories / 9);
  const carbCalories = Math.max(Number(dailyCalories) - proteinCalories - fatCalories, 0);
  const carbGrams = round(carbCalories / 4);
  return {
    calories: Math.round(Number(dailyCalories)),
    proteinGrams: Math.round(Number(proteinGrams)),
    fatGrams,
    carbGrams,
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

function hydrateClient(payload) {
  const totalHeightInches =
    Number(payload.heightFeet || 0) * 12 + Number(payload.heightInchesPart || 0);
  const ageVal =
    payload.age !== null && payload.age !== undefined && Number.isFinite(Number(payload.age))
      ? Number(payload.age)
      : null;
  const maintenanceBaseline = baselineMaintenanceCalories(payload.weight, payload.activityMultiplier);
  const demo = demographicMaintenanceMultipliers(payload.sex, ageVal);
  const bfMaintMult = maintenanceMultiplierFromEstimatedBodyFat(payload.estimatedBodyFatEstimate);

  const maintenanceCalories = round(maintenanceBaseline * demo.combinedMultiplier * bfMaintMult);
  const calorieTarget = calculateCalorieTarget(
    maintenanceCalories,
    payload.goal,
    payload.overrideCalorieTarget
  );

  const trainingDaysPerWeek = clampTrainingDays(
    payload.trainingDaysPerWeek !== undefined ? payload.trainingDaysPerWeek : 5
  );

  const split = computeTrainingRestDaysCalories(calorieTarget, trainingDaysPerWeek);

  const proteinData = getProteinReferenceWeightWithBodyFatEstimate(
    payload.weight,
    totalHeightInches,
    payload.estimatedBodyFatEstimate
  );
  const autoProteinGrams = round(proteinData.referenceWeight);
  const fatPercent = Number(payload.fatPercent || 25);

  const effectiveProtein =
    payload.overrideProteinGrams !== null && payload.overrideProteinGrams !== undefined
      ? round(payload.overrideProteinGrams)
      : autoProteinGrams;

  const trainMacrosAuto = computeMacrosForDailyCalories(split.trainDayCalories, effectiveProtein, fatPercent);
  const restMacrosAuto = computeMacrosForDailyCalories(split.restDayCalories, effectiveProtein, fatPercent);

  const aveFatCalories = round(calorieTarget * (fatPercent / 100));
  const autoFatGrams = round(aveFatCalories / 9);
  const autoCarbGrams = Math.max(
    round((calorieTarget - effectiveProtein * 4 - aveFatCalories) / 4),
    0
  );

  const recommendation = suggestCalorieAdjustment(payload.goal, payload.checkIns ?? []);

  return {
    ...payload,
    sex: normalizeSex(payload.sex),
    age: payload.age ?? null,
    maintenanceBaselineCalories: maintenanceBaseline,
    demographicSexMultiplier: demo.sexMultiplier,
    demographicAgeMultiplier: demo.ageMultiplier,
    demographicMultiplier: demo.combinedMultiplier,
    bodyFatMaintenanceMultiplier: bfMaintMult,
    bodyFatProteinBlend: proteinData.bodyFatProteinBlend ?? 0,
    estimatedBodyFatEstimate: payload.estimatedBodyFatEstimate
      ? String(payload.estimatedBodyFatEstimate)
      : null,
    trainingDaysPerWeek,
    totalHeightInches,
    maintenanceCalories,
    calorieTarget,
    weeklyCalorieBudget: split.weeklyCalorieBudget,
    trainDayCalories: split.trainDayCalories,
    restDayCalories: split.restDayCalories,
    restDaysPerWeek: split.restDaysPerWeek,

    trainDayMacros: trainMacrosAuto,
    restDayMacros: restMacrosAuto,

    autoProteinGrams,
    autoFatGrams,
    autoCarbGrams,
    proteinGrams: effectiveProtein,
    fatGrams:
      payload.overrideFatGrams !== null && payload.overrideFatGrams !== undefined
        ? round(payload.overrideFatGrams)
        : autoFatGrams,
    carbGrams:
      payload.overrideCarbGrams !== null && payload.overrideCarbGrams !== undefined
        ? round(payload.overrideCarbGrams)
        : autoCarbGrams,
    trainDayFatGrams: trainMacrosAuto.fatGrams,
    trainDayCarbGrams: trainMacrosAuto.carbGrams,
    restDayFatGrams: restMacrosAuto.fatGrams,
    restDayCarbGrams: restMacrosAuto.carbGrams,
    bmi: proteinData.bmi,
    proteinReferenceWeight: proteinData.referenceWeight,
    proteinReferenceMethod: proteinData.referenceMethod,
    recommendedAdjustment: recommendation.recommendedAdjustment,
    recommendationReason: recommendation.reason,
  };
}

function normalizeClientRecord(id, data) {
  return hydrateClient({
    ...data,
    _id: id,
    sex: data.sex,
    age: data.age ?? null,
    estimatedBodyFatEstimate: data.estimatedBodyFatEstimate ?? null,
    trainingDaysPerWeek: data.trainingDaysPerWeek ?? 5,
    fatPercent: data.fatPercent ?? 25,
    overrideCalorieTarget: data.overrideCalorieTarget ?? null,
    overrideProteinGrams: data.overrideProteinGrams ?? null,
    overrideFatGrams: data.overrideFatGrams ?? null,
    overrideCarbGrams: data.overrideCarbGrams ?? null,
    checkIns: Array.isArray(data.checkIns) ? data.checkIns : [],
  });
}

function App() {
  return (
    <div className="app-layout">
      <header className="page-header">
        <h1>Equip Nutrition Coaching</h1>
        <p>Manage clients and generate calorie targets in seconds.</p>
      </header>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients/:id" element={<ClientProfile />} />
      </Routes>
    </div>
  );
}

function Dashboard() {
  const [clients, setClients] = useState([]);
  const [formData, setFormData] = useState(defaultFormState);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const clientsQuery = query(collection(db, "clients"), orderBy("createdAt", "desc"));

    getDocs(clientsQuery)
      .then((snapshot) => {
        if (!isMounted) {
          return;
        }
        const rows = snapshot.docs.map((item) => normalizeClientRecord(item.id, item.data()));
        setClients(rows);
      })
      .catch(() => {
        if (isMounted) {
          setError("Unable to load clients from Firebase.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const maintenancePreview = useMemo(() => {
    const parsedWeight = Number(formData.weight);
    if (!parsedWeight || parsedWeight <= 0) {
      return 0;
    }
    const base = baselineMaintenanceCalories(parsedWeight, Number(formData.activityMultiplier));
    let ageForDemo = null;
    if (formData.age !== "" && formData.age != null && Number.isFinite(Number(formData.age))) {
      ageForDemo = Number(formData.age);
    }
    const { combinedMultiplier } = demographicMaintenanceMultipliers(formData.sex || null, ageForDemo);
    const bfMaint = maintenanceMultiplierFromEstimatedBodyFat(formData.estimatedBodyFatEstimate);
    return round(base * combinedMultiplier * bfMaint);
  }, [
    formData.weight,
    formData.activityMultiplier,
    formData.sex,
    formData.age,
    formData.estimatedBodyFatEstimate,
  ]);

  const targetPreview = useMemo(() => {
    if (!maintenancePreview) {
      return 0;
    }
    if (formData.overrideCalorieTarget !== "" && Number.isFinite(Number(formData.overrideCalorieTarget))) {
      return Math.round(Number(formData.overrideCalorieTarget));
    }
    if (formData.goal === "Cut") {
      return maintenancePreview - 400;
    }
    if (formData.goal === "Bulk") {
      return maintenancePreview + 350;
    }
    return maintenancePreview;
  }, [maintenancePreview, formData.goal, formData.overrideCalorieTarget]);

  const macroPreview = useMemo(() => {
    if (!targetPreview || !formData.weight) {
      return { protein: 0, fat: 0, carbs: 0 };
    }

    const tin = Number(formData.heightFeet || 0) * 12 + Number(formData.heightInchesPart || 0);
    const proteinAuto = getProteinReferenceWeightWithBodyFatEstimate(
      formData.weight,
      tin,
      formData.estimatedBodyFatEstimate
    ).referenceWeight;
    const fatPercent = Number(formData.fatPercent || 25);
    const fatCalories = Math.round(targetPreview * (fatPercent / 100));
    const fatAuto = Math.round(fatCalories / 9);
    const carbAuto = Math.max(Math.round((targetPreview - proteinAuto * 4 - fatCalories) / 4), 0);

    return {
      protein: formData.overrideProteinGrams === "" ? proteinAuto : Number(formData.overrideProteinGrams),
      fat: formData.overrideFatGrams === "" ? fatAuto : Number(formData.overrideFatGrams),
      carbs: formData.overrideCarbGrams === "" ? carbAuto : Number(formData.overrideCarbGrams),
    };
  }, [
    formData.weight,
    formData.heightFeet,
    formData.heightInchesPart,
    formData.fatPercent,
    formData.estimatedBodyFatEstimate,
    formData.overrideProteinGrams,
    formData.overrideFatGrams,
    formData.overrideCarbGrams,
    targetPreview,
  ]);

  const trainRestSplitPreview = useMemo(() => {
    if (!targetPreview || !formData.weight) {
      return null;
    }
    const split = computeTrainingRestDaysCalories(targetPreview, formData.trainingDaysPerWeek ?? 5);
    const tin =
      Number(formData.heightFeet || 0) * 12 + Number(formData.heightInchesPart || 0);
    const protBase = getProteinReferenceWeightWithBodyFatEstimate(
      Number(formData.weight),
      tin,
      formData.estimatedBodyFatEstimate
    ).referenceWeight;
    const proteinGm =
      formData.overrideProteinGrams !== "" && Number(formData.overrideProteinGrams) >= 0
        ? Number(formData.overrideProteinGrams)
        : protBase;
    const fp = Number(formData.fatPercent || 25);
    return {
      ...split,
      trainMacros: computeMacrosForDailyCalories(split.trainDayCalories, proteinGm, fp),
      restMacros: computeMacrosForDailyCalories(split.restDayCalories, proteinGm, fp),
    };
  }, [
    targetPreview,
    formData.weight,
    formData.heightFeet,
    formData.heightInchesPart,
    formData.fatPercent,
    formData.estimatedBodyFatEstimate,
    formData.overrideProteinGrams,
    formData.trainingDaysPerWeek,
  ]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: [
        "weight",
        "heightFeet",
        "heightInchesPart",
        "age",
        "activityMultiplier",
        "fatPercent",
        "trainingDaysPerWeek",
        "overrideCalorieTarget",
        "overrideProteinGrams",
        "overrideFatGrams",
        "overrideCarbGrams",
      ].includes(name)
        ? value === ""
          ? ""
          : Number(value)
        : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const sexNorm = normalizeSex(formData.sex);
      if (!sexNorm) {
        setError("Choose sex (male or female) for maintenance calories.");
        setIsSubmitting(false);
        return;
      }
      const now = new Date().toISOString();
      const payload = {
        name: formData.name.trim(),
        weight: Number(formData.weight),
        sex: sexNorm,
        age: toNullableNumber(formData.age),
        heightFeet: Number(formData.heightFeet),
        heightInchesPart: Number(formData.heightInchesPart),
        activityMultiplier: Number(formData.activityMultiplier),
        goal: formData.goal,
        trainingDaysPerWeek: clampTrainingDays(formData.trainingDaysPerWeek ?? 5),
        estimatedBodyFatEstimate:
          formData.estimatedBodyFatEstimate === "" ? null : formData.estimatedBodyFatEstimate,
        customPlan: formData.customPlan || "",
        notes: formData.notes || "",
        fatPercent: Number(formData.fatPercent || 25),
        overrideCalorieTarget: toNullableNumber(formData.overrideCalorieTarget),
        overrideProteinGrams: toNullableNumber(formData.overrideProteinGrams),
        overrideFatGrams: toNullableNumber(formData.overrideFatGrams),
        overrideCarbGrams: toNullableNumber(formData.overrideCarbGrams),
        checkIns: [],
        createdAt: now,
        updatedAt: now,
      };

      const ref = doc(collection(db, "clients"));
      await setDoc(ref, payload);
      setFormData(defaultFormState);
      const clientsQuery = query(collection(db, "clients"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(clientsQuery);
      const rows = snapshot.docs.map((item) => normalizeClientRecord(item.id, item.data()));
      setClients(rows);
    } catch {
      setError("Unable to create client in Firebase.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="dashboard-grid">
      <section className="panel">
        <h2>New Client Setup</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              type="text"
              placeholder="Client name"
            />
          </label>
          <label>
            Weight (lbs)
            <input
              name="weight"
              value={formData.weight}
              onChange={handleChange}
              required
              type="number"
              min="1"
            />
          </label>
          <div className="inline-field-row">
            <label>
              Height (ft)
              <input
                name="heightFeet"
                value={formData.heightFeet}
                onChange={handleChange}
                required
                type="number"
                min="3"
                max="8"
              />
            </label>
            <label>
              Height (in)
              <input
                name="heightInchesPart"
                value={formData.heightInchesPart}
                onChange={handleChange}
                required
                type="number"
                min="0"
                max="11"
              />
            </label>
          </div>
          <label>
            Sex
            <select
              name="sex"
              required
              value={formData.sex}
              onChange={handleChange}
            >
              {sexStoredValues.map((opt) => (
                <option key={opt.label} value={opt.value} disabled={opt.value === ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Age (recommended for accuracy; optional)
            <input
              name="age"
              value={formData.age}
              onChange={handleChange}
              type="number"
              min="14"
              max="100"
            />
          </label>
          <label>
            Activity level
            <select
              name="activityMultiplier"
              value={formData.activityMultiplier}
              onChange={handleChange}
            >
              {activityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Goal
            <select name="goal" value={formData.goal} onChange={handleChange}>
              {goals.map((goal) => (
                <option key={goal} value={goal}>
                  {goal}
                </option>
              ))}
            </select>
          </label>
          <label>
            Training / high-activity days per week (1–7)
            <input
              name="trainingDaysPerWeek"
              type="number"
              min="1"
              max="7"
              value={formData.trainingDaysPerWeek}
              onChange={handleChange}
            />
          </label>
          <label>
            Fat % for macro calculation
            <input
              name="fatPercent"
              value={formData.fatPercent}
              onChange={handleChange}
              type="number"
              min="10"
              max="45"
            />
          </label>
          <label>
            Estimated body fat % (optional, coach visual)
            <select
              name="estimatedBodyFatEstimate"
              value={formData.estimatedBodyFatEstimate}
              onChange={handleChange}
            >
              {estimatedBodyFatOptions.map((opt) => (
                <option key={opt.value || "none"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Override calorie target (optional)
            <input
              name="overrideCalorieTarget"
              value={formData.overrideCalorieTarget}
              onChange={handleChange}
              type="number"
              min="800"
              placeholder="Leave blank for auto target"
            />
          </label>
          <label>
            Override protein (g, optional)
            <input
              name="overrideProteinGrams"
              value={formData.overrideProteinGrams}
              onChange={handleChange}
              type="number"
              min="0"
            />
          </label>
          <label>
            Override fats (g, optional)
            <input
              name="overrideFatGrams"
              value={formData.overrideFatGrams}
              onChange={handleChange}
              type="number"
              min="0"
            />
          </label>
          <label>
            Override carbs (g, optional)
            <input
              name="overrideCarbGrams"
              value={formData.overrideCarbGrams}
              onChange={handleChange}
              type="number"
              min="0"
            />
          </label>
          <label>
            Custom nutrition plan (optional)
            <textarea
              name="customPlan"
              value={formData.customPlan}
              onChange={handleChange}
              rows={3}
              placeholder="Macro split, meal timing, carb cycling..."
            />
          </label>
          <label>
            Coaching notes (optional)
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Lifestyle notes, adherence feedback..."
            />
          </label>
          <div className="preview-card">
            <strong>Preview</strong>
            <p>
              Maintenance: {maintenancePreview || "-"} kcal/day{" "}
              <span className="muted-text">
                (baseline × activity × sex/age × optional estimated body-fat tweak)
              </span>
            </p>
            <p>
              Target (weekly average): {targetPreview || "-"} kcal/day — weekly budget{" "}
              {trainRestSplitPreview ? trainRestSplitPreview.weeklyCalorieBudget : "(—)"} kcal
            </p>
            {trainRestSplitPreview && trainRestSplitPreview.trainingDaysPerWeek < 7 && (
              <>
                <p className="muted-text" style={{ marginTop: "0.5rem" }}>
                  Cycling: {trainRestSplitPreview.trainingDaysPerWeek} train @{" "}
                  {trainRestSplitPreview.trainDayCalories} kcal / {trainRestSplitPreview.restDaysPerWeek}{" "}
                  rest @ {trainRestSplitPreview.restDayCalories} kcal (sums to same weekly surplus/deficit
                  line as {(trainRestSplitPreview.weeklyCalorieBudget / 7).toFixed(0)} kcal/day average).
                </p>
                <p style={{ marginTop: "0.35rem" }}>
                  <strong>Training day</strong> — P {trainRestSplitPreview.trainMacros.proteinGrams} g · F{" "}
                  {trainRestSplitPreview.trainMacros.fatGrams} g · C {trainRestSplitPreview.trainMacros.carbGrams}{" "}
                  g
                </p>
                <p>
                  <strong>Rest day</strong> — P {trainRestSplitPreview.restMacros.proteinGrams} g · F{" "}
                  {trainRestSplitPreview.restMacros.fatGrams} g · C {trainRestSplitPreview.restMacros.carbGrams} g
                </p>
              </>
            )}
            {trainRestSplitPreview && trainRestSplitPreview.trainingDaysPerWeek >= 7 && (
              <p className="muted-text" style={{ marginTop: "0.35rem" }}>
                All seven days treated as training — single daily target ({trainRestSplitPreview.trainDayCalories}{" "}
                kcal).
              </p>
            )}
            <p style={{ marginTop: "0.75rem" }}>
              Average-day macros (baseline): Protein {macroPreview.protein || "-"} g · Fat {macroPreview.fat || "-"}{" "}
              g · Carb {macroPreview.carbs || "-"} g
            </p>
          </div>
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating..." : "Create Client"}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>

      <section className="panel">
        <h2>Client Profiles</h2>
        {clients.length === 0 ? (
          <p>No clients yet. Add your first client.</p>
        ) : (
          <ul className="client-list">
            {clients.map((client) => (
              <li key={client._id}>
                <Link to={`/clients/${client._id}`}>
                  <strong>{client.name}</strong>
                  <span>{client.goal}</span>
                  <span>
                    {client.trainDayCalories !== client.restDayCalories ? (
                      <>
                        Train {client.trainDayCalories} · Rest {client.restDayCalories}
                        kcal/day
                      </>
                    ) : (
                      <>{client.calorieTarget} kcal/day avg</>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [formData, setFormData] = useState({
    weight: "",
    heightFeet: "",
    heightInchesPart: "",
    sex: "",
    age: "",
    activityMultiplier: 15,
    goal: "Maintenance",
    fatPercent: 25,
    trainingDaysPerWeek: 5,
    estimatedBodyFatEstimate: "",
    overrideCalorieTarget: "",
    overrideProteinGrams: "",
    overrideFatGrams: "",
    overrideCarbGrams: "",
    customPlan: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [checkInForm, setCheckInForm] = useState(defaultCheckInState);
  const [checkInStatus, setCheckInStatus] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeMacroGuideTab, setActiveMacroGuideTab] = useState("protein");

  const loadClient = async () => {
    const snapshot = await getDoc(doc(db, "clients", id));
    if (!snapshot.exists()) {
      throw new Error("Could not load client.");
    }
    const data = normalizeClientRecord(snapshot.id, snapshot.data());
    setClient(data);
    setFormData({
      weight: data.weight ?? "",
      heightFeet: data.heightFeet ?? "",
      heightInchesPart: data.heightInchesPart ?? "",
      sex: normalizeSex(data.sex) ?? "",
      age: data.age ?? "",
      activityMultiplier: data.activityMultiplier ?? 15,
      goal: data.goal ?? "Maintenance",
      fatPercent: data.fatPercent ?? 25,
      trainingDaysPerWeek: data.trainingDaysPerWeek ?? 5,
      estimatedBodyFatEstimate: data.estimatedBodyFatEstimate ?? "",
      overrideCalorieTarget: data.overrideCalorieTarget ?? "",
      overrideProteinGrams: data.overrideProteinGrams ?? "",
      overrideFatGrams: data.overrideFatGrams ?? "",
      overrideCarbGrams: data.overrideCarbGrams ?? "",
      customPlan: data.customPlan || "",
      notes: data.notes || "",
    });
  };

  useEffect(() => {
    let isMounted = true;
    getDoc(doc(db, "clients", id))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          throw new Error("Could not load client.");
        }
        if (!isMounted) {
          return;
        }
        const data = normalizeClientRecord(snapshot.id, snapshot.data());
        setClient(data);
        setFormData({
          weight: data.weight ?? "",
          heightFeet: data.heightFeet ?? "",
          heightInchesPart: data.heightInchesPart ?? "",
          sex: normalizeSex(data.sex) ?? "",
          age: data.age ?? "",
          activityMultiplier: data.activityMultiplier ?? 15,
          goal: data.goal ?? "Maintenance",
          fatPercent: data.fatPercent ?? 25,
          trainingDaysPerWeek: data.trainingDaysPerWeek ?? 5,
          estimatedBodyFatEstimate: data.estimatedBodyFatEstimate ?? "",
          overrideCalorieTarget: data.overrideCalorieTarget ?? "",
          overrideProteinGrams: data.overrideProteinGrams ?? "",
          overrideFatGrams: data.overrideFatGrams ?? "",
          overrideCarbGrams: data.overrideCarbGrams ?? "",
          customPlan: data.customPlan || "",
          notes: data.notes || "",
        });
      })
      .catch(() => {
        if (isMounted) {
          setError("Could not load this client profile.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    setSavedMessage("");
    try {
      const sexNorm = normalizeSex(formData.sex);
      if (!sexNorm) {
        setError("Select sex (male or female) before saving.");
        return;
      }
      await updateDoc(doc(db, "clients", id), {
        weight: Number(formData.weight),
        heightFeet: Number(formData.heightFeet),
        heightInchesPart: Number(formData.heightInchesPart),
        sex: sexNorm,
        age: toNullableNumber(formData.age),
        activityMultiplier: Number(formData.activityMultiplier),
        goal: formData.goal,
        fatPercent: Number(formData.fatPercent || 25),
        trainingDaysPerWeek: clampTrainingDays(formData.trainingDaysPerWeek ?? 5),
        estimatedBodyFatEstimate:
          formData.estimatedBodyFatEstimate === "" ? null : formData.estimatedBodyFatEstimate,
        overrideCalorieTarget: toNullableNumber(formData.overrideCalorieTarget),
        overrideProteinGrams: toNullableNumber(formData.overrideProteinGrams),
        overrideFatGrams: toNullableNumber(formData.overrideFatGrams),
        overrideCarbGrams: toNullableNumber(formData.overrideCarbGrams),
        customPlan: formData.customPlan || "",
        notes: formData.notes || "",
        updatedAt: new Date().toISOString(),
      });
      await loadClient();
      setSavedMessage("Changes saved.");
    } catch {
      setError("Unable to save updates to Firebase.");
    }
  };

  const handleCheckInSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setCheckInStatus("");

    try {
      const nextCheckIns = [
        ...(Array.isArray(client.checkIns) ? client.checkIns : []),
        {
          _id: crypto.randomUUID(),
          weight: Number(checkInForm.weight),
          notes: checkInForm.notes || "",
          date: new Date(checkInForm.date).toISOString(),
        },
      ];

      await updateDoc(doc(db, "clients", id), {
        checkIns: nextCheckIns,
        updatedAt: new Date().toISOString(),
      });
      await loadClient();
      setCheckInForm({
        ...defaultCheckInState,
        date: new Date().toISOString().split("T")[0],
      });
      setCheckInStatus("Weekly check-in saved.");
    } catch {
      setError("Unable to save weekly check-in to Firebase.");
    }
  };

  const handleDeleteClient = async () => {
    const confirmed = window.confirm(
      "Delete this client profile permanently? This action cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    setError("");
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "clients", id));
      navigate("/");
    } catch {
      setError("Unable to delete this client profile from Firebase.");
      setIsDeleting(false);
    }
  };

  if (!client) {
    return <p className="panel">Loading profile...</p>;
  }

  const activeMacroGuide = macroFoodGuide[activeMacroGuideTab] ?? macroFoodGuide.protein;

  const renderMacroFoodItems = (items) => (
    <ul className="check-in-list">
      {items.map((item) => (
        <li key={`${item.name}-${item.serving}`}>
          <div className="check-in-row">
            <strong>{item.name}</strong>
            <span>{item.macroGrams}</span>
          </div>
          {item.serving && <p className="muted-text">Serving: {item.serving}</p>}
        </li>
      ))}
    </ul>
  );

  return (
    <main className="profile-layout">
      <button className="back-button" type="button" onClick={() => navigate("/")}>
        Back to clients
      </button>
      <section className="panel">
        <h2>{client.name}</h2>
        <div className="stats-grid">
          <p>
            <strong>Weight:</strong> {client.weight} lbs
          </p>
          <p>
            <strong>Sex:</strong>{" "}
            {client.sex === "male" ? "Male" : client.sex === "female" ? "Female" : "Not set"}
          </p>
          <p>
            <strong>Age:</strong> {client.age != null ? client.age : "(not specified)"}
          </p>
          <p>
            <strong>Height:</strong> {client.heightFeet} ft {client.heightInchesPart} in
          </p>
          <p>
            <strong>Goal:</strong> {client.goal}
          </p>
          <p>
            <strong>Activity Multiplier:</strong> {client.activityMultiplier}
          </p>
          <p>
            <strong>Est. body fat % (coach visual):</strong>{" "}
            {labelForEstimatedBodyFat(client.estimatedBodyFatEstimate)}
          </p>
          <p>
            <strong>Maintenance baseline:</strong> {client.maintenanceBaselineCalories ?? "—"} kcal/day{" "}
            <span className="muted-text">(bodyweight × activity)</span>
          </p>
          <p>
            <strong>Adjusted maintenance:</strong> {client.maintenanceCalories} kcal/day{" "}
            <span className="muted-text">
              (baseline × sex/age × {client.demographicMultiplier?.toFixed(3) ?? "1.000"} × estimated body-fat tweak{" "}
              {client.bodyFatMaintenanceMultiplier?.toFixed(3) ?? "1.000"}; light refinement only)
            </span>
          </p>
          <p>
            <strong>Calorie Target:</strong> {client.calorieTarget} kcal/day average ({client.weeklyCalorieBudget}{" "}
            kcal / week)
          </p>
          {client.trainingDaysPerWeek >= 7 || client.trainDayCalories === client.restDayCalories ? (
            <p>
              <strong>Weekly calorie split:</strong> All days equal at {client.calorieTarget} kcal (no cycling).
            </p>
          ) : (
            <>
              <p>
                <strong>Training / rest split:</strong> {client.trainingDaysPerWeek} training day
                {client.trainingDaysPerWeek !== 1 ? "s" : ""} @ {client.trainDayCalories} kcal ·{" "}
                {client.restDaysPerWeek} rest day
                {client.restDaysPerWeek !== 1 ? "s" : ""} @ {client.restDayCalories} kcal
              </p>
              <p>
                <strong>Training day macros:</strong> P {client.trainDayMacros?.proteinGrams ?? "-"} · F{" "}
                {client.trainDayMacros?.fatGrams ?? "-"} · C {client.trainDayMacros?.carbGrams ?? "-"} g · same
                protein every day · higher carbs on training for fueling / recovery.
              </p>
              <p>
                <strong>Rest day macros:</strong> P {client.restDayMacros?.proteinGrams ?? "-"} · F{" "}
                {client.restDayMacros?.fatGrams ?? "-"} · C {client.restDayMacros?.carbGrams ?? "-"} g
              </p>
            </>
          )}
          <p>
            <strong>BMI:</strong> {client.bmi}
          </p>
          <p>
            <strong>Protein Reference:</strong> {client.proteinReferenceWeight} lbs (
            {client.proteinReferenceMethod})
          </p>
          {Number(client.bodyFatProteinBlend) > 0 && (
            <p className="muted-text">
              Coach BF estimate adjusts protein anchor ~{(Number(client.bodyFatProteinBlend) * 100).toFixed(0)}%
              toward goal-weight emphasis (skipped when BMI-based obesity rule applies).
            </p>
          )}
          <p>
            <strong>Protein:</strong> {client.proteinGrams} g
          </p>
          <p>
            <strong>Fats:</strong> {client.fatGrams} g ({client.fatPercent}%)
          </p>
          <p>
            <strong>Carbs:</strong> {client.carbGrams} g
          </p>
          <p>
            <strong>Auto Macros:</strong> P {client.autoProteinGrams} / F {client.autoFatGrams} / C{" "}
            {client.autoCarbGrams}
          </p>
        </div>
        <div className="preview-card recommendation-card">
          <strong>Coaching Suggestion</strong>
          <p>
            Recommended adjustment: {client.recommendedAdjustment > 0 ? "+" : ""}
            {client.recommendedAdjustment} kcal/day
          </p>
          <p>{client.recommendationReason || "No recommendation yet."}</p>
          <p className="muted-text">Coach can always override this recommendation.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Coach Controls + Notes</h2>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Current weight (lbs)
            <input
              name="weight"
              type="number"
              min="1"
              value={formData.weight}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  weight: event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <div className="inline-field-row">
            <label>
              Height (ft)
              <input
                name="heightFeet"
                type="number"
                min="3"
                max="8"
                value={formData.heightFeet}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    heightFeet: event.target.value === "" ? "" : Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Height (in)
              <input
                name="heightInchesPart"
                type="number"
                min="0"
                max="11"
                value={formData.heightInchesPart}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    heightInchesPart: event.target.value === "" ? "" : Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
          <label>
            Sex
            <select
              required
              name="sex"
              value={formData.sex === "" ? "" : normalizeSex(formData.sex) ?? ""}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, sex: event.target.value }))
              }
            >
              {sexStoredValues.map((opt) => (
                <option key={opt.label} value={opt.value} disabled={opt.value === ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Age <span className="muted-text">(optional; improves adjustment)</span>
            <input
              name="age"
              type="number"
              min="14"
              max="100"
              value={formData.age === null || formData.age === undefined ? "" : formData.age}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  age: event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Activity multiplier
            <select
              name="activityMultiplier"
              value={formData.activityMultiplier}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  activityMultiplier: Number(event.target.value),
                }))
              }
            >
              {activityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Goal
            <select
              name="goal"
              value={formData.goal}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  goal: event.target.value,
                }))
              }
            >
              {goals.map((goal) => (
                <option key={goal} value={goal}>
                  {goal}
                </option>
              ))}
            </select>
          </label>
          <label>
            Training / high-activity days per week (1–7)
            <input
              name="trainingDaysPerWeek"
              type="number"
              min="1"
              max="7"
              value={formData.trainingDaysPerWeek}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  trainingDaysPerWeek:
                    event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Fat % for macro calculation
            <input
              name="fatPercent"
              type="number"
              min="10"
              max="45"
              value={formData.fatPercent}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  fatPercent: event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Estimated body fat % (optional, coach visual)
            <select
              value={formData.estimatedBodyFatEstimate}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, estimatedBodyFatEstimate: event.target.value }))
              }
            >
              {estimatedBodyFatOptions.map((opt) => (
                <option key={opt.value || "none"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Override calorie target (optional)
            <input
              name="overrideCalorieTarget"
              type="number"
              min="800"
              placeholder="Leave blank for auto target"
              value={formData.overrideCalorieTarget}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  overrideCalorieTarget:
                    event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Override protein (g, optional)
            <input
              name="overrideProteinGrams"
              type="number"
              min="0"
              value={formData.overrideProteinGrams}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  overrideProteinGrams:
                    event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Override fats (g, optional)
            <input
              name="overrideFatGrams"
              type="number"
              min="0"
              value={formData.overrideFatGrams}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  overrideFatGrams: event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Override carbs (g, optional)
            <input
              name="overrideCarbGrams"
              type="number"
              min="0"
              value={formData.overrideCarbGrams}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  overrideCarbGrams: event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Nutrition plan
            <textarea
              name="customPlan"
              value={formData.customPlan}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, customPlan: event.target.value }))
              }
              rows={6}
            />
          </label>
          <label>
            Coaching notes
            <textarea
              name="notes"
              value={formData.notes}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={6}
            />
          </label>
          <button type="submit">Save Coach Updates</button>
          <button
            className="danger-button"
            disabled={isDeleting}
            onClick={handleDeleteClient}
            type="button"
          >
            {isDeleting ? "Deleting..." : "Delete Client Profile"}
          </button>
          {savedMessage && <p className="success-text">{savedMessage}</p>}
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>

      <section className="panel">
        <h2>Macro Food Guide</h2>
        <p className="muted-text">
          Quick food ideas matched to macro targets. Pick a macro to see top options.
        </p>
        <div className="inline-field-row" style={{ marginTop: "12px" }}>
          {macroGuideTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeMacroGuideTab === tab.key ? "" : "macro-tab-inactive"}
              onClick={() => setActiveMacroGuideTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="preview-card" style={{ marginTop: "12px" }}>
          <strong>{activeMacroGuide.title}</strong>
          {renderMacroFoodItems(activeMacroGuide.topFoods)}

          {activeMacroGuideTab === "protein" && (
            <>
              <div style={{ marginTop: "12px" }}>
                <strong>Vegetarian Protein Sources</strong>
                {renderMacroFoodItems(macroFoodGuide.protein.vegetarianFoods)}
              </div>
              <div style={{ marginTop: "12px" }}>
                <strong>Vegan Protein Sources</strong>
                {renderMacroFoodItems(macroFoodGuide.protein.veganFoods)}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Weekly Check-Ins</h2>
        <form className="form-grid" onSubmit={handleCheckInSubmit}>
          <label>
            Check-in date
            <input
              type="date"
              name="date"
              value={checkInForm.date}
              onChange={(event) =>
                setCheckInForm((prev) => ({ ...prev, date: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Current bodyweight (lbs)
            <input
              type="number"
              min="1"
              name="weight"
              value={checkInForm.weight}
              onChange={(event) =>
                setCheckInForm((prev) => ({
                  ...prev,
                  weight: event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
              required
            />
          </label>
          <label>
            Check-in notes
            <textarea
              name="notes"
              value={checkInForm.notes}
              onChange={(event) =>
                setCheckInForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={4}
              placeholder="Recovery, energy, adherence, training output..."
            />
          </label>
          <button type="submit">Save Weekly Check-In</button>
          {checkInStatus && <p className="success-text">{checkInStatus}</p>}
        </form>

        {Array.isArray(client.checkIns) && client.checkIns.length > 0 ? (
          <ul className="check-in-list">
            {[...client.checkIns]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((checkIn) => (
                <li key={checkIn._id}>
                  <div className="check-in-row">
                    <strong>{new Date(checkIn.date).toLocaleDateString()}</strong>
                    <span>{checkIn.weight} lbs</span>
                  </div>
                  {checkIn.notes && <p>{checkIn.notes}</p>}
                </li>
              ))}
          </ul>
        ) : (
          <p>No weekly check-ins yet.</p>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

export default App;
