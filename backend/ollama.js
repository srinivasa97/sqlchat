// ollama.js - Converts question to SQL using Ollama + live schema
const axios = require('axios');
const { getSchema } = require('./schema');

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://192.168.1.10:11434';
const MODEL = process.env.OLLAMA_MODEL || 'mysql-agent-qwen:latest';
// To switch models, change the line above to:
//   'sqlcoder:7b'         - best for complex SQL, specific prompt format
//   'qwen2.5:14b'         - good general purpose
//   'qwen3-coder:30b'     - best quality, needs lots of RAM

const isSQLCoder = MODEL.includes('sqlcoder');
const isQwen3    = MODEL.includes('qwen3');

function buildPrompt(question, schema) {

  // ── SQLCoder format (defog/sqlcoder models) ──────────────────────────────
  if (isSQLCoder) {
    return (
      '### Task\n' +
      'Generate a SQL query to answer the following question: ' + question + '\n\n' +
      '### Database Schema\n' +
      'The query will run on a MySQL database with the following schema:\n' +
      schema + '\n\n' +
      '### Rules\n' +
      '- Only SELECT queries. Never DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE.\n' +
      '- If question asks HOW MANY or COUNT, use COUNT(*).\n' +
      '- If question asks to LIST or SHOW, use SELECT * with LIMIT 500.\n' +
      '- Column comments after -- show exact valid values. Use them in WHERE clauses.\n' +
      '- Use LOWER() for case-insensitive text filtering.\n\n' +
      '### Answer\n' +
      'SELECT'
    );
  }

  // ── Qwen3 / reasoning models (outputs <think> blocks) ────────────────────
  if (isQwen3) {
    return (
      'You are a MySQL expert. Convert the question to a single MySQL SELECT query.\n\n' +
      'SCHEMA:\n' + schema + '\n\n' +
      'RULES:\n' +
      '- Reply with ONLY the raw SQL. No explanation, no markdown, no backticks.\n' +
      '- Never use DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE.\n' +
      '- If question asks HOW MANY or COUNT, use COUNT(*).\n' +
      '- If question asks to LIST or SHOW, use SELECT * with LIMIT 500.\n' +
      '- If question asks to count AND list, use SELECT * with LIMIT 500 — UI shows row count.\n' +
      '- Column comments after -- show exact valid values. Use them in WHERE clauses.\n' +
      '- Use LOWER() for case-insensitive text filtering.\n' +
      '- Use JOINs when data spans multiple tables.\n\n' +
      'Question: ' + question + '\n\nSQL:'
    );
  }

  // ── Default: mysql-agent-qwen / qwen2.5 / general models ─────────────────
  return (
    'You are a MySQL expert. Convert the question to a MySQL SELECT query.\n\n' +
    'SCHEMA:\n' + schema + '\n\n' +
    'RULES:\n' +
    '- Reply with ONLY a raw SQL SELECT query. No explanation, no markdown, no backticks.\n' +
    '- Never use DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE.\n' +
    '- If the question asks to COUNT or asks HOW MANY, use COUNT(*) — do NOT list rows.\n' +
    '- If the question asks to LIST or SHOW candidates/records, use SELECT * with LIMIT 500.\n' +
    '- If the question asks to count AND list, use SELECT * with LIMIT 500 — UI shows row count.\n' +
    '- Use JOINs when data spans multiple tables.\n' +
    '- Column comments after -- show exact valid values. Always use those in WHERE clauses.\n' +
    '- Use LOWER() for case-insensitive text filtering.\n\n' +
    '- If question asks for a chart/graph and has a filter condition, return grouped results showing both matching and non-matching counts for comparison.\n' +
    'Question: ' + question + '\n\nSQL:'
  );
}

async function questionToSQL(question, dbConfig) {
  const schema = await getSchema(dbConfig);
  const prompt = buildPrompt(question, schema);

  const response = await axios.post(OLLAMA_BASE_URL + '/api/generate', {
    model: MODEL,
    prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 2000, num_ctx: 4096 },
  });

  let sql = response.data.response.trim();

  // Strip markdown code fences
  sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  // Strip <think>...</think> blocks (qwen3 reasoning models)
  sql = sql.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // SQLCoder: prompt ends with "SELECT" so response starts mid-query — prepend it
  if (isSQLCoder && !sql.toUpperCase().startsWith('SELECT')) {
    sql = 'SELECT ' + sql;
  }

  // Fix missing SELECT keyword (mysql-agent-qwen sometimes omits it)
  if (!isSQLCoder && sql && !sql.toUpperCase().startsWith('SELECT') && !sql.toUpperCase().startsWith('WITH')) {
    sql = 'SELECT ' + sql;
  }

  // Fix "SELECT COUNT(*), * FROM" → "SELECT * FROM" (model combines count+list incorrectly)
  sql = sql.replace(/SELECT\s+COUNT\(\*\)\s*,\s*\*/i, 'SELECT *');
  sql = sql.replace(/SELECT\s+COUNT\(\*\)\s*,\s*/i, 'SELECT ');

  // Trim to first statement only (stop at semicolon or second SELECT)
  const semi = sql.indexOf(';');
  if (semi !== -1) sql = sql.substring(0, semi + 1);

  // Remove any second SELECT statement the model appended
  const secondSelect = sql.search(/\n\s*SELECT\s+/i);
  if (secondSelect !== -1) sql = sql.substring(0, secondSelect).trim();

  console.log('[ollama] Model:', MODEL);
  console.log('[ollama] SQL:', sql);
  return sql;
}

module.exports = { questionToSQL };
