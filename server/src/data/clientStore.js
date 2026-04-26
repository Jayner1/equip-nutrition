const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const dataDir = path.join(__dirname);
const dataFile = path.join(dataDir, "clients.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]", "utf-8");
  }
}

async function readClients() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeClients(clients) {
  await ensureStore();
  await fs.writeFile(dataFile, JSON.stringify(clients, null, 2), "utf-8");
}

function withTimestamps(payload, existing) {
  const now = new Date().toISOString();
  return {
    ...payload,
    _id: existing?._id || randomUUID(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

module.exports = {
  readClients,
  writeClients,
  withTimestamps,
};
