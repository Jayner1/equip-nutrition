const express = require("express");
const { randomUUID } = require("crypto");
const { hydrateClient } = require("../utils/clientMath");
const { withTimestamps } = require("../data/clientStore");
const {
  isFirebaseConfigured,
  listClientsFromFirestore,
  getClientFromFirestore,
  upsertClientToFirestore,
  deleteClientFromFirestore,
} = require("../data/firestoreMirror");

const router = express.Router();

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureFirebaseConfigured(res) {
  if (isFirebaseConfigured()) {
    return true;
  }

  res.status(500).json({
    message:
      "Firebase Admin credentials are missing. Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
  });
  return false;
}

async function readAllClients() {
  const firestoreClients = await listClientsFromFirestore();
  return Array.isArray(firestoreClients) ? firestoreClients : [];
}

async function readClientById(id) {
  return getClientFromFirestore(id);
}

async function persistClient(client) {
  await upsertClientToFirestore(client);
}

async function removeClientById(id) {
  await deleteClientFromFirestore(id);
}

router.get("/", async (_req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }
  const clients = await readAllClients();
  const hydrated = clients.map(hydrateClient);
  hydrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(hydrated);
});

router.get("/:id", async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }
  const client = await readClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ message: "Client not found" });
  }
  return res.json(hydrateClient(client));
});

router.post("/", async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }
  const {
    name,
    weight,
    age,
    heightFeet,
    heightInchesPart,
    heightInches,
    activityMultiplier,
    goal,
    customPlan,
    notes,
    fatPercent,
    overrideCalorieTarget,
    overrideProteinGrams,
    overrideFatGrams,
    overrideCarbGrams,
  } = req.body;

  const resolvedHeightInchesTotal =
    heightFeet !== undefined && heightInchesPart !== undefined
      ? Number(heightFeet) * 12 + Number(heightInchesPart)
      : Number(heightInches);
  const resolvedHeightFeet = Math.floor(resolvedHeightInchesTotal / 12);
  const resolvedHeightInchesPart = resolvedHeightInchesTotal % 12;

  if (
    !name ||
    !weight ||
    !activityMultiplier ||
    !goal ||
    !Number.isFinite(resolvedHeightInchesTotal) ||
    resolvedHeightInchesTotal <= 0
  ) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const created = withTimestamps({
    name: String(name).trim(),
    weight: Number(weight),
    age: age ? Number(age) : null,
    heightFeet: resolvedHeightFeet,
    heightInchesPart: resolvedHeightInchesPart,
    activityMultiplier: Number(activityMultiplier),
    goal,
    customPlan: customPlan || "",
    notes: notes || "",
    fatPercent: fatPercent ? Number(fatPercent) : 25,
    overrideCalorieTarget: toNullableNumber(overrideCalorieTarget),
    overrideProteinGrams: toNullableNumber(overrideProteinGrams),
    overrideFatGrams: toNullableNumber(overrideFatGrams),
    overrideCarbGrams: toNullableNumber(overrideCarbGrams),
    checkIns: [],
  });
  await persistClient(created);

  res.status(201).json(hydrateClient(created));
});

router.patch("/:id", async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }
  const allowedFields = [
    "name",
    "weight",
    "age",
    "heightFeet",
    "heightInchesPart",
    "activityMultiplier",
    "goal",
    "customPlan",
    "notes",
    "fatPercent",
    "overrideCalorieTarget",
    "overrideProteinGrams",
    "overrideFatGrams",
    "overrideCarbGrams",
  ];
  const updatePayload = {};
  for (const key of allowedFields) {
    if (key in req.body) {
      updatePayload[key] = req.body[key];
    }
  }

  const current = await readClientById(req.params.id);
  if (!current) {
    return res.status(404).json({ message: "Client not found" });
  }

  const updated = withTimestamps(
    {
      ...current,
      ...updatePayload,
      name: updatePayload.name ? String(updatePayload.name).trim() : current.name,
      weight:
        updatePayload.weight !== undefined ? Number(updatePayload.weight) : current.weight,
      age: updatePayload.age !== undefined ? Number(updatePayload.age) : current.age,
      heightFeet:
        updatePayload.heightFeet !== undefined
          ? Number(updatePayload.heightFeet)
          : current.heightFeet,
      heightInchesPart:
        updatePayload.heightInchesPart !== undefined
          ? Number(updatePayload.heightInchesPart)
          : current.heightInchesPart,
      activityMultiplier:
        updatePayload.activityMultiplier !== undefined
          ? Number(updatePayload.activityMultiplier)
          : current.activityMultiplier,
      fatPercent:
        updatePayload.fatPercent !== undefined
          ? Number(updatePayload.fatPercent)
          : current.fatPercent,
      overrideCalorieTarget:
        updatePayload.overrideCalorieTarget !== undefined
          ? toNullableNumber(updatePayload.overrideCalorieTarget)
          : current.overrideCalorieTarget,
      overrideProteinGrams:
        updatePayload.overrideProteinGrams !== undefined
          ? toNullableNumber(updatePayload.overrideProteinGrams)
          : current.overrideProteinGrams,
      overrideFatGrams:
        updatePayload.overrideFatGrams !== undefined
          ? toNullableNumber(updatePayload.overrideFatGrams)
          : current.overrideFatGrams,
      overrideCarbGrams:
        updatePayload.overrideCarbGrams !== undefined
          ? toNullableNumber(updatePayload.overrideCarbGrams)
          : current.overrideCarbGrams,
    },
    current
  );
  await persistClient(updated);

  return res.json(hydrateClient(updated));
});

router.post("/:id/check-ins", async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }
  const { weight, notes, date } = req.body;
  const current = await readClientById(req.params.id);
  if (!current) {
    return res.status(404).json({ message: "Client not found" });
  }

  const checkIns = Array.isArray(current.checkIns) ? current.checkIns : [];
  const newCheckIn = {
    _id: randomUUID(),
    weight: Number(weight),
    notes: notes || "",
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
  };

  const updated = withTimestamps(
    {
      ...current,
      checkIns: [...checkIns, newCheckIn],
    },
    current
  );
  await persistClient(updated);

  return res.status(201).json(hydrateClient(updated));
});

router.delete("/:id", async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }
  const current = await readClientById(req.params.id);
  if (!current) {
    return res.status(404).json({ message: "Client not found" });
  }

  await removeClientById(req.params.id);
  return res.status(204).send();
});

module.exports = router;
