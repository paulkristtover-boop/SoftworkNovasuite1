# Deploy bot on Railway

1. Create project from this repo (root = `NovaSuite`).
2. **Root Directory:** leave empty.
3. Add **PostgreSQL** plugin → copy `DATABASE_URL` to the bot service.
4. Set variables:

```
BOT_TOKEN=
ADMIN_IDS=
DATABASE_URL=
ADMIN_CMS_URL=https://YOUR.vercel.app
NODE_ENV=production
```

5. Deploy. Start command (from `railway.json` / `package.json`):

```
node database/migrate.js && node bot/bot.js
```

Logs should show Postgres connected and bot started (polling or webhook).
