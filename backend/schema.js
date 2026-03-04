// schema.js - Loads and caches live MySQL schema for use in Ollama prompts
const pool = require('./db');

let cachedSchema = null;
let lastFetched = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getSchema() {
  const now = Date.now();
  if (cachedSchema && lastFetched && now - lastFetched < CACHE_TTL_MS) {
    return cachedSchema;
  }

  const sql =
    "SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_KEY, c.IS_NULLABLE " +
    "FROM information_schema.COLUMNS c " +
    "WHERE c.TABLE_SCHEMA = 'allocation' " +
    "ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION";

  const [columns] = await pool.query(sql);

  const tables = {};
  for (const row of columns) {
    if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
    const pk = row.COLUMN_KEY === 'PRI' ? ' [PK]' : '';
    const nullable = row.IS_NULLABLE === 'YES' ? '' : ' NOT NULL';
    tables[row.TABLE_NAME].push('  ' + row.COLUMN_NAME + ' (' + row.DATA_TYPE + pk + nullable + ')');
  }

  let schemaText = 'Database: allocation\n\nTables:\n';
  for (const [tableName, cols] of Object.entries(tables)) {
    schemaText += '\n' + tableName + ':\n' + cols.join('\n') + '\n';
  }

  cachedSchema = schemaText;
  lastFetched = now;
  console.log('[schema] Loaded ' + Object.keys(tables).length + ' tables');
  return cachedSchema;
}

function clearSchemaCache() {
  cachedSchema = null;
  lastFetched = null;
}

module.exports = { getSchema, clearSchemaCache };
