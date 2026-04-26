require("dotenv").config();
const express = require("express");
const cors = require("cors");
const clientsRouter = require("./routes/clients");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/clients", clientsRouter);

app.use((err, _req, res, _next) => {
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid request value" });
  }

  console.error(err);
  return res.status(500).json({ message: "Server error" });
});

module.exports = app;
