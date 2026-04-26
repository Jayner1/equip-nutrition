const express = require("express");
const { randomUUID } = require("crypto");
const { hydrateClient } = require("../utils/clientMath");
const { readClients, writeClients, withTimestamps } = require("../data/clientStore");
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

async function readAllClients() {
  if (!isFirebaseConfigured()) {
    return readClients();
  }

  try {
    const firestoreClients = await listClientsFromFirestore();
    if (Array.isArray(firestoreClients)) {
      return firestoreClients;
    }
  } catch (error) {
    console.warn("Falling back to local client store:", error.message);
  }

  return readClients();
}

async function readClientById(id) {
  if (isFirebaseConfigured()) {
    try {
      const firestoreClient = await getClientFromFirestore(id);
      if (firestoreClient) {
        return firestoreClient;
      }
    } catch (error) {
      console.warn("Falling back to local client store:", error.message);
    }
  }

  const localClients = await readClients();
  return localClients.find((item) => item._id === id);
}

async function persistClient(client) {
  const clients = await readClients();
  const index = clients.findIndex((item) => item._id === client._id);
  if (index >= 0) {
    clients[index] = client;
  } else {
    clients.push(client);
  }
  await writeClients(clients);

  if (isFirebaseConfigured()) {
    try {
      await upsertClientToFirestore(client);
    } catch (error) {
      console.warn("Could not sync client to Firestore:", error.message);
    }
  }
}

async function removeClientById(id) {
  const clients = await readClients();
  const nextClients = clients.filter((item) => item._id !== id);
  await writeClients(nextClients);

  if (isFirebaseConfigured()) {
    try {
      await deleteClientFromFirestore(id);
    } catch (error) {
      console.warn("Could not delete client from Firestore:", error.message);
    }
  }
}

router.get("/", async (_req, res) => {
  const clients = await readAllClients();
  const hydrated = clients.map(hydrateClient);
  hydrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(hydrated);
});

router.get("/:id", async (req, res) => {
  const client = await readClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ message: "Client not found" });
  }
  return res.json(hydrateClient(client));
});

router.post("/", async (req, res) => {
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
  const current = await readClientById(req.params.id);
  if (!current) {
    return res.status(404).json({ message: "Client not found" });
  }

  await removeClientById(req.params.id);
  return res.status(204).send();
});

module.exports = router;
