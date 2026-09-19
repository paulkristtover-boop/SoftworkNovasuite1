const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(
  config.databaseUrl
    ? {
        connectionString: config.databaseUrl,
        ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
        max: 15,
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: int(process.env.PGPORT, 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'novasuite',
      }
);

function int(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

pool.on('error', (err) => console.error('[NovaSuite] PG pool error', err.message));

module.exports = { pool };
