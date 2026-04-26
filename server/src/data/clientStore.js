const { randomUUID } = require("crypto");

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
  withTimestamps,
};
