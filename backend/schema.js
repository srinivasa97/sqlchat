// schema.js - Per-DB schema cache
const mysql = require('mysql2/promise');

const cache = {}; // { dbId: { schema, lastFetched } }
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getSchema(dbConfig) {
  const { id: dbId } = dbConfig;
  const now = Date.now();

  if (cache[dbId] && now - cache[dbId].lastFetched < CACHE_TTL_MS) {
    return cache[dbId].schema;
  }

  const conn = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const [columns] = await conn.query(
      'SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_KEY, c.IS_NULLABLE, c.COLUMN_COMMENT ' +
      'FROM information_schema.COLUMNS c ' +
      'WHERE c.TABLE_SCHEMA = ? ' +
      'ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION',
      [dbConfig.database]
    );

    const tables = {};
    for (const row of columns) {
      if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
      const pk = row.COLUMN_KEY === 'PRI' ? ' [PK]' : '';
      const nullable = row.IS_NULLABLE === 'YES' ? '' : ' NOT NULL';
      const comment = row.COLUMN_COMMENT ? ' -- ' + row.COLUMN_COMMENT : '';
      tables[row.TABLE_NAME].push('  ' + row.COLUMN_NAME + ' (' + row.DATA_TYPE + pk + nullable + ')' + comment);
    }

    let schemaText = 'Database: ' + dbConfig.database + '\n\nTables:\n';
    for (const [tableName, cols] of Object.entries(tables)) {
      schemaText += '\n' + tableName + ':\n' + cols.join('\n') + '\n';
    }

    cache[dbId] = { schema: schemaText, lastFetched: now };
    console.log('[schema] Loaded ' + Object.keys(tables).length + ' tables from ' + dbConfig.database);
    return schemaText;
  } finally {
    await conn.end();
  }
}

function clearSchemaCache(dbId) {
  if (dbId) delete cache[dbId];
  else Object.keys(cache).forEach(k => delete cache[k]);
}

module.exports = { getSchema, clearSchemaCache };