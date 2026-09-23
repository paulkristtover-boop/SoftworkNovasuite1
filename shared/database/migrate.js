const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();

  // Split on semicolons but keep DO $$ ... $$ blocks intact
  const statements = [];
  let buf = '';
  let inDo = false;
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDo) continue;
    if (trimmed.includes('DO $$')) inDo = true;
    buf += line + '\n';
    if (inDo && trimmed.includes('$$;')) {
      statements.push(buf.trim());
      buf = '';
      inDo = false;
    } else if (!inDo && trimmed.endsWith(';')) {
      statements.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) statements.push(buf.trim());

  let ok = 0;
  let fail = 0;
  try {
    for (const stmt of statements) {
      if (!stmt || stmt === ';') continue;
      try {
        await client.query(stmt);
        ok++;
      } catch (err) {
        // Ignore benign "already exists" style errors; log others
        const msg = err.message || '';
        if (
          /already exists/i.test(msg) ||
          /duplicate/i.test(msg)
        ) {
          ok++;
        } else {
          fail++;
          console.error('[migrate] stmt error:', msg.split('\n')[0]);
        }
      }
    }
    console.log(`[migrate] Done. ok=${ok} errors=${fail}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error('[migrate] Fatal:', e.message);
  process.exit(1);
});
