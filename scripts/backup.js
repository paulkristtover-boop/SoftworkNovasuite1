/**
 * Logical backup helper – dumps key tables to JSON (use pg_dump in production).
 * Cron: node scripts/backup.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../database');
const config = require('../config');

async function backup() {
  const dir = config.backupDir || './backups';
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tables = ['users', 'deposits', 'withdrawals', 'ads', 'transactions', 'treasury_logs', 'settings', 'payment_addresses'];
  const out = { ts, tables: {} };
  for (const t of tables) {
    try {
      const res = await pool.query(`SELECT * FROM ${t}`);
      out.tables[t] = res.rows;
    } catch (e) {
      out.tables[t] = { error: e.message };
    }
  }
  const file = path.join(dir, `novasuite-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('[NovaSuite] Backup written', file);
  await pool.query(
    `INSERT INTO health_checks (service, status, detail) VALUES ('backup','ok',$1)`,
    [file]
  );
  await pool.end();
}

backup().catch((e) => {
  console.error(e);
  process.exit(1);
});
