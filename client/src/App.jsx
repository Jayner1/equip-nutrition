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

const defaultFormState = {
  name: "",
  weight: "",
  heightFeet: "",
  heightInchesPart: "",
  age: "",
  activityMultiplier: 15,
  goal: "Maintenance",
  fatPercent: 25,
  overrideCalorieTarget: "",
  overrideProteinGrams: "",
  overrideFatGrams: "",
  overrideCarbGrams: "",
  customPlan: "",
  notes: "",
};

const defaultCheckInState = {
  weight: "",
  notes: "",
  date: new Date().toISOString().split("T")[0],
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

function calculateMaintenanceCalories(weight, activityMultiplier) {
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
  const maintenanceCalories = calculateMaintenanceCalories(
    payload.weight,
    payload.activityMultiplier
  );
  const calorieTarget = calculateCalorieTarget(
    maintenanceCalories,
    payload.goal,
    payload.overrideCalorieTarget
  );

  const proteinData = getProteinReferenceWeight(payload.weight, totalHeightInches);
  const autoProteinGrams = round(proteinData.referenceWeight);
  const fatPercent = Number(payload.fatPercent || 25);
  const fatCalories = round(calorieTarget * (fatPercent / 100));
  const autoFatGrams = round(fatCalories / 9);
  const autoCarbGrams = Math.max(
    round((calorieTarget - autoProteinGrams * 4 - fatCalories) / 4),
    0
  );

  const recommendation = suggestCalorieAdjustment(payload.goal, payload.checkIns ?? []);

  return {
    ...payload,
    totalHeightInches,
    maintenanceCalories,
    calorieTarget,
    autoProteinGrams,
    autoFatGrams,
    autoCarbGrams,
    proteinGrams:
      payload.overrideProteinGrams !== null && payload.overrideProteinGrams !== undefined
        ? round(payload.overrideProteinGrams)
        : autoProteinGrams,
    fatGrams:
      payload.overrideFatGrams !== null && payload.overrideFatGrams !== undefined
        ? round(payload.overrideFatGrams)
        : autoFatGrams,
    carbGrams:
      payload.overrideCarbGrams !== null && payload.overrideCarbGrams !== undefined
        ? round(payload.overrideCarbGrams)
        : autoCarbGrams,
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
    age: data.age ?? null,
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
    return Math.round(parsedWeight * Number(formData.activityMultiplier));
  }, [formData.weight, formData.activityMultiplier]);

  const targetPreview = useMemo(() => {
    if (!maintenancePreview) {
      return 0;
    }
    if (formData.goal === "Cut") {
      return maintenancePreview - 400;
    }
    if (formData.goal === "Bulk") {
      return maintenancePreview + 350;
    }
    return maintenancePreview;
  }, [maintenancePreview, formData.goal]);

  const macroPreview = useMemo(() => {
    if (!targetPreview || !formData.weight) {
      return { protein: 0, fat: 0, carbs: 0 };
    }

    const proteinAuto = getProteinReferenceWeight(
      formData.weight,
      Number(formData.heightFeet || 0) * 12 + Number(formData.heightInchesPart || 0)
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
    formData.overrideProteinGrams,
    formData.overrideFatGrams,
    formData.overrideCarbGrams,
    targetPreview,
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
      const now = new Date().toISOString();
      const payload = {
        name: formData.name.trim(),
        weight: Number(formData.weight),
        age: toNullableNumber(formData.age),
        heightFeet: Number(formData.heightFeet),
        heightInchesPart: Number(formData.heightInchesPart),
        activityMultiplier: Number(formData.activityMultiplier),
        goal: formData.goal,
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
            Age (optional)
            <input
              name="age"
              value={formData.age}
              onChange={handleChange}
              type="number"
              min="1"
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
            <p>Maintenance: {maintenancePreview || "-"} kcal/day</p>
            <p>Target: {targetPreview || "-"} kcal/day</p>
            <p>Protein: {macroPreview.protein || "-"} g</p>
            <p>Fats: {macroPreview.fat || "-"} g</p>
            <p>Carbs: {macroPreview.carbs || "-"} g</p>
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
                  <span>{client.calorieTarget} kcal/day</span>
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
    activityMultiplier: 15,
    goal: "Maintenance",
    fatPercent: 25,
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
      activityMultiplier: data.activityMultiplier ?? 15,
      goal: data.goal ?? "Maintenance",
      fatPercent: data.fatPercent ?? 25,
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
          activityMultiplier: data.activityMultiplier ?? 15,
          goal: data.goal ?? "Maintenance",
          fatPercent: data.fatPercent ?? 25,
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
      await updateDoc(doc(db, "clients", id), {
        weight: Number(formData.weight),
        heightFeet: Number(formData.heightFeet),
        heightInchesPart: Number(formData.heightInchesPart),
        activityMultiplier: Number(formData.activityMultiplier),
        goal: formData.goal,
        fatPercent: Number(formData.fatPercent || 25),
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
            <strong>Age:</strong> {client.age || "-"}
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
            <strong>Maintenance Calories:</strong> {client.maintenanceCalories} kcal
          </p>
          <p>
            <strong>Calorie Target:</strong> {client.calorieTarget} kcal
          </p>
          <p>
            <strong>BMI:</strong> {client.bmi}
          </p>
          <p>
            <strong>Protein Reference:</strong> {client.proteinReferenceWeight} lbs (
            {client.proteinReferenceMethod})
          </p>
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
