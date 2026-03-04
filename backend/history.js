// history.js - Chat history helpers
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const MAX_PER_USER = 50;

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeAll(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// List conversations for a user (summary only, no messages)
function listForUser(userId) {
  const all = readAll();
  return all
    .filter(c => c.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(c => ({
      id: c.id,
      title: c.title,
      dbId: c.dbId,
      dbLabel: c.dbLabel,
      messageCount: c.messages.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
}

// Get full conversation including messages
function getConversation(id, userId) {
  const all = readAll();
  const conv = all.find(c => c.id === id);
  if (!conv) throw new Error('Conversation not found');
  if (conv.userId !== userId) throw new Error('Access denied');
  return conv;
}

// Create new conversation
function createConversation(userId, dbId, dbLabel, firstQuestion) {
  const all = readAll();

  // Prune oldest if over limit
  const userConvs = all.filter(c => c.userId === userId);
  if (userConvs.length >= MAX_PER_USER) {
    const oldest = userConvs.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))[0];
    const pruned = all.filter(c => c.id !== oldest.id);
    writeAll(pruned);
  }

  const title = firstQuestion.length > 50
    ? firstQuestion.substring(0, 50) + '...'
    : firstQuestion;

  const conv = {
    id: 'ch_' + Date.now(),
    userId,
    dbId,
    dbLabel,
    title,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const fresh = readAll();
  fresh.push(conv);
  writeAll(fresh);
  return conv;
}

// Append a message to conversation
function appendMessage(id, userId, message) {
  const all = readAll();
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Conversation not found');
  if (all[idx].userId !== userId) throw new Error('Access denied');

  all[idx].messages.push(message);
  all[idx].updatedAt = new Date().toISOString();
  writeAll(all);
  return all[idx];
}

// Delete conversation
function deleteConversation(id, userId) {
  const all = readAll();
  const conv = all.find(c => c.id === id);
  if (!conv) throw new Error('Conversation not found');
  if (conv.userId !== userId) throw new Error('Access denied');
  writeAll(all.filter(c => c.id !== id));
}

module.exports = {
  listForUser,
  getConversation,
  createConversation,
  appendMessage,
  deleteConversation,
};
