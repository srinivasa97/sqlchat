// ollama.js - Converts natural language to SQL using Ollama
const axios = require('axios');
const { getSchema } = require('./schema');

const OLLAMA_BASE_URL = 'http://192.168.1.10:11434';
const MODEL = 'qwen3-coder:30b';

async function questionToSQL(question) {
  const schema = await getSchema();

  const prompt =
    'You are a MySQL expert. Convert the question below to a MySQL SELECT query.\n\n' +
    'SCHEMA:\n' + schema + '\n\n' +
    'RULES:\n' +
    '- Reply with ONLY a raw SQL SELECT query. No explanation, no markdown, no backticks.\n' +
    '- Never use DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE.\n' +
    '- Always add LIMIT 200 unless the user asks for more.\n' +
    '- Use JOINs when data spans multiple tables.\n' +
    '- If unclear, make a reasonable guess.\n\n' +
    'Question: ' + question + '\n\nSQL:';

  const response = await axios.post(OLLAMA_BASE_URL + '/api/generate', {
    model: MODEL,
    prompt: prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 500 },
  });

  let sql = response.data.response.trim();

  // Strip markdown fences
  sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  // Strip <think> blocks (qwen3 thinking mode)
  sql = sql.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Keep only first statement
  const semi = sql.indexOf(';');
  if (semi !== -1) sql = sql.substring(0, semi + 1);

  console.log('[ollama] SQL:', sql);
  return sql;
}

module.exports = { questionToSQL };
