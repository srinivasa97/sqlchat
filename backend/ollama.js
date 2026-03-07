// ollama.js - Converts question to SQL using Ollama + live schema
const axios = require('axios');
const { getSchema } = require('./schema');

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://192.168.1.10:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen3-coder:30b';

async function questionToSQL(question, dbConfig) {
  const schema = await getSchema(dbConfig);

  const prompt =
    'You are a MySQL expert. Convert the question to a MySQL SELECT query.\n\n' +
    'SCHEMA:\n' + schema + '\n\n' +
    'RULES:\n' +
      '- Reply with ONLY a raw SQL SELECT query. No explanation, no markdown, no backticks.\n' +
      '- Never use DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE.\n' +
      '- Always add LIMIT 500 unless user asks for specific number.\n' +
      '- If question asks to count AND list, use SELECT * with WHERE clause only - do not use COUNT(). The UI shows row count automatically.\n' +
      '- Use JOINs when data spans multiple tables.\n' +
      '- Column comments after -- show valid values. Always use those exact values in WHERE clauses.\n' +
      '- For text columns, use case-insensitive matching with LOWER() when filtering.\n' +
      '- If question asks to both count AND list, prioritize listing (SELECT *) with a COUNT in a subquery or just SELECT the rows - user can count from results.\n' +
      '- If question asks to "list them" or "show them", always return individual rows not just aggregates.\n\n' +
    'Question: ' + question + '\n\nSQL:';

  const response = await axios.post(OLLAMA_BASE_URL + '/api/generate', {
    model: MODEL,
    prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 500 },
  });

  let sql = response.data.response.trim();
  sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  sql = sql.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const semi = sql.indexOf(';');
  if (semi !== -1) sql = sql.substring(0, semi + 1);

  console.log('[ollama] SQL:', sql);
  return sql;
}

module.exports = { questionToSQL };
