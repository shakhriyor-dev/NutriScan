const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const sessions = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

function makeCode() {
  return crypto.randomBytes(12).toString("hex");
}

io.on("connection", (socket) => {
  socket.on("desktop:create-session", (callback) => {
    const code = makeCode();
    const room = `nutriscan:${code}`;
    sessions.set(code, { room, desktopId: socket.id, createdAt: Date.now() });
    socket.join(room);
    if (typeof callback === "function") callback({ ok: true, code });
  });

  socket.on("phone:join-session", ({ code } = {}, callback) => {
    const session = sessions.get(String(code || ""));
    if (!session) {
      if (typeof callback === "function") callback({ ok: false, message: "Ulanish kodi topilmadi yoki muddati tugagan." });
      return;
    }
    socket.join(session.room);
    socket.data.sessionCode = code;
    socket.to(session.room).emit("phone:connected");
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("phone:barcode", ({ code, barcode } = {}) => {
    const session = sessions.get(String(code || ""));
    if (!session || !/^\d{8,14}$/.test(String(barcode || ""))) return;
    io.to(session.desktopId).emit("product:barcode", { barcode: String(barcode), scannedAt: Date.now() });
  });

  socket.on("disconnect", () => {
    for (const [code, session] of sessions.entries()) {
      if (session.desktopId === socket.id) {
        io.to(session.room).emit("session:closed");
        sessions.delete(code);
      }
    }
  });
});

// Remove abandoned pairing sessions after 2 hours.
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, session] of sessions.entries()) {
    if (session.createdAt < cutoff) sessions.delete(code);
  }
}, 30 * 60 * 1000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NutriScan is running at http://localhost:${PORT}`);
  console.log("For phone pairing on the same Wi-Fi, open the site using your computer's LAN IP address.");
});