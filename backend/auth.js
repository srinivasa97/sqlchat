// auth.js - JWT helpers + user/db store
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'sqlchat-secret-change-in-production';
const JWT_EXPIRES = '8h';

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const DBS_FILE   = path.join(__dirname, 'data', 'databases.json');

// ── File helpers ──────────────────────────────
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function readDbs() {
  return JSON.parse(fs.readFileSync(DBS_FILE, 'utf8'));
}

function writeDbs(dbs) {
  fs.writeFileSync(DBS_FILE, JSON.stringify(dbs, null, 2), 'utf8');
}

// ── Auth helpers ──────────────────────────────
async function loginUser(username, password) {
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('Invalid username or password');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid username or password');

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, assignedDbs: user.assignedDbs },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  return {
    token,
    user: { id: user.id, username: user.username, role: user.role, assignedDbs: user.assignedDbs }
  };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── User management (admin only) ─────────────
async function createUser(username, password, role, assignedDbs) {
  const users = readUsers();
  if (users.find(u => u.username === username)) {
    throw new Error('Username already exists');
  }
  const hashed = await bcrypt.hash(password, 10);
  const newUser = {
    id: 'u' + Date.now(),
    username,
    password: hashed,
    role,
    assignedDbs: assignedDbs || [],
  };
  users.push(newUser);
  writeUsers(users);
  return { id: newUser.id, username, role, assignedDbs: newUser.assignedDbs };
}

async function updateUserPassword(userId, newPassword) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('User not found');
  users[idx].password = await bcrypt.hash(newPassword, 10);
  writeUsers(users);
}

function updateUserDbs(userId, assignedDbs) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('User not found');
  users[idx].assignedDbs = assignedDbs;
  writeUsers(users);
  return users[idx];
}

function deleteUser(userId) {
  const users = readUsers();
  const filtered = users.filter(u => u.id !== userId);
  if (filtered.length === users.length) throw new Error('User not found');
  writeUsers(filtered);
}

function listUsers() {
  return readUsers().map(u => ({
    id: u.id, username: u.username, role: u.role, assignedDbs: u.assignedDbs
  }));
}

// ── DB management (admin only) ────────────────
function listDbs() {
  return readDbs().map(db => ({
    id: db.id, label: db.label, host: db.host,
    port: db.port, database: db.database, ssl: db.ssl,
    user: db.user
    // password intentionally omitted from list
  }));
}

function addDb(label, host, port, user, password, database, ssl) {
  const dbs = readDbs();
  const newDb = {
    id: 'db' + Date.now(),
    label, host, port: parseInt(port), user, password, database, ssl: !!ssl
  };
  dbs.push(newDb);
  writeDbs(dbs);
  return { id: newDb.id, label, host, port: newDb.port, database, ssl: newDb.ssl, user };
}

function deleteDb(dbId) {
  const dbs = readDbs();
  const filtered = dbs.filter(d => d.id !== dbId);
  if (filtered.length === dbs.length) throw new Error('Database not found');
  writeDbs(filtered);
}

function getDbById(dbId) {
  const dbs = readDbs();
  return dbs.find(d => d.id === dbId);
}

module.exports = {
  loginUser, verifyToken,
  createUser, updateUserPassword, updateUserDbs, deleteUser, listUsers,
  listDbs, addDb, deleteDb, getDbById,
};
