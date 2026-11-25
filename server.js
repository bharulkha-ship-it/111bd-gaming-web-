const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database("data.sqlite");
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.error("Set SESSION_SECRET before starting the server.");
  process.exit(1);
}

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    balance INTEGER NOT NULL DEFAULT 1000,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "";
if (adminEmail && adminPassword) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare("INSERT INTO users (username,email,password_hash,role,balance) VALUES (?,?,?,?,?)")
      .run("Administrator", adminEmail, hash, "admin", 0);
  }
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: "bg.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false
}));

const publicUser = u => ({
  id: u.id, username: u.username, email: u.email,
  role: u.role, balance: u.balance
});
function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in." });
  next();
}
function admin(req, res, next) {
  const u = db.prepare("SELECT role FROM users WHERE id = ?").get(req.session.userId);
  if (!u || u.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function addTransaction(userId, kind, amount, note) {
  db.prepare("INSERT INTO transactions (user_id,kind,amount,note) VALUES (?,?,?,?)")
    .run(userId, kind, amount, note);
}

app.post("/api/register", async (req, res) => {
  const username = String(req.body.username || "").trim().slice(0, 30);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(req.body.password || "");
  if (username.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return res.status(400).json({ error: "Enter a username, valid email and password (8+ characters)." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users (username,email,password_hash,balance) VALUES (?,?,?,1000)")
      .run(username, email, hash);
    addTransaction(info.lastInsertRowid, "bonus", 1000, "Welcome demo credits");
    req.session.userId = info.lastInsertRowid;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
    res.json({ user: publicUser(user) });
  } catch {
    res.status(409).json({ error: "That email is already registered." });
  }
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/me", auth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Session expired." });
  res.json({ user: publicUser(user) });
});
app.get("/api/transactions", auth, (req, res) => {
  const rows = db.prepare(
    "SELECT kind,amount,note,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 30"
  ).all(req.session.userId);
  res.json({ transactions: rows });
});

// Virtual-credit game only. No real-money deposits, withdrawals, or cash prizes.
app.post("/api/game/slot", auth, (req, res) => {
  const bet = Number(req.body.bet);
  if (!Number.isInteger(bet) || bet < 1 || bet > 100) {
    return res.status(400).json({ error: "Bet must be 1–100 demo credits." });
  }
  const run = db.transaction(() => {
    const user = db.prepare("SELECT balance FROM users WHERE id=?").get(req.session.userId);
    if (!user || user.balance < bet) throw new Error("Not enough demo credits.");
    const symbols = ["🍒", "🍋", "🔔", "⭐", "💎"];
    const result = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
    const payout = result.every(x => x === result[0])
      ? bet * 5
      : (result[0] === result[1] || result[1] === result[2] ? bet * 2 : 0);
    const delta = payout - bet;
    db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(delta, req.session.userId);
    addTransaction(req.session.userId, "game", delta,
      `Demo slots: ${result.join(" ")}; bet ${bet}; payout ${payout}`);
    return { result, bet, payout, balance: user.balance + delta };
  });
  try { res.json(run()); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/admin/users", auth, admin, (req, res) => {
  const users = db.prepare(
    "SELECT id,username,email,role,balance,created_at FROM users ORDER BY id DESC LIMIT 200"
  ).all();
  res.json({ users });
});
app.post("/api/admin/credits", auth, admin, (req, res) => {
  const userId = Number(req.body.userId);
  const amount = Number(req.body.amount);
  if (!Number.isInteger(userId) || !Number.isInteger(amount) ||
      amount < -100000 || amount > 100000 || amount === 0) {
    return res.status(400).json({ error: "Invalid user or credit amount." });
  }
  const run = db.transaction(() => {
    const user = db.prepare("SELECT id,balance FROM users WHERE id=?").get(userId);
    if (!user || user.balance + amount < 0) {
      throw new Error("User not found or balance cannot go below zero.");
    }
    db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(amount, userId);
    addTransaction(userId, "admin_adjustment", amount, "Admin demo-credit adjustment");
  });
  try { run(); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, "public")));
app.listen(PORT, () => console.log(`Black Gold Demo running at http://localhost:${PORT}`));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`111BD running on port ${PORT}`);
});
