// server/server.js
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import pkg from "./package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve everything in /client (your index.html, css, js, images)
app.use(express.static(path.join(__dirname, "..", "client")));

// Example API: expose version/name to the client
app.get("/api/version", (req, res) => {
  res.json({ name: pkg.name, version: pkg.version });
});

// Start HTTP server
const server = http.createServer(app);

// WebSocket server (ws)
const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  ws.send("connected ✅");

  ws.on("message", (msg) => {
    // echo back
    ws.send(`you said: ${msg}`);
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Open http://127.0.0.1:3000");
});

