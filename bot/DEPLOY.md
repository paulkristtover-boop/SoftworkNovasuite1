# Deploy NovaSuite Bot on Railway

Railway must run **`bot/bot.js`** (Telegraf). The shared schema lives in **`database/`**.

## Option A – Recommended (Root Directory = repo / NovaSuite)

1. New Railway project → deploy from Git (repo root = `NovaSuite`).
2. **Do not** set Root Directory to a subfolder (leave empty / service root).
3. `railway.json` + `nixpacks.toml` + root `package.json` `"start"` all point at:
   ```
   node database/migrate.js && node bot/bot.js
   ```
4. Variables → set:

```
BOT_TOKEN=
ADMIN_IDS=
DATABASE_URL=
ADMIN_CMS_URL=https://YOUR.vercel.app
NODE_ENV=production
```

5. Deploy. Logs should show: `PostgreSQL connected` then `Bot started (polling)`.

## Option B – Root Directory = `bot`

1. Service **Settings → Root Directory** = `bot`
2. Then either:
   - Use `bot/railway.json` start command (runs `../database/migrate.js` then `bot.js`), or
   - Set custom start: `node bot.js` and run migrate once manually
3. Same env vars as above.

## Verify

- `main` in root `package.json` → `bot/bot.js`
- `scripts.start` → migrate + `bot/bot.js`
- `Procfile` → `web: node database/migrate.js && node bot/bot.js`
- Health: with webhook mode, `GET /health` on `BOT_PORT`

## Postgres

Add Railway **PostgreSQL** plugin → copy `DATABASE_URL` into the bot service variables (same URL as Vercel CMS).
