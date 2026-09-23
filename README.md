# NovaSuite v2

PTC platform — **flat structure**, all **JavaScript**.

| Component | Path | Deploy |
|-----------|------|--------|
| Telegram bot | `bot.js` + handlers/… | **Railway** |
| Admin CMS | `admin-cms/` | **Vercel** (Root Directory = `admin-cms`) |
| Schema | `postgres/schema.sql` | Shared PostgreSQL |

## Structure

```
NovaSuite/
├── bot.js
├── package.json
├── railway.json
├── .env.example
├── config/
├── database/
├── handlers/          # user/ + admin/
├── keyboards/
├── middleware/
├── services/
├── jobs/
├── utils/
├── webhooks/
├── receipts/
├── scripts/           # migrate.js, backup.js
├── admin-cms/         # Next.js (JS)
├── postgres/
│   └── schema.sql
├── docs/
└── README.md
```

## Hardening (v2)

- **Session security (CMS):** JWT + server-side `cms_sessions` table, `sameSite=strict`, TTL, revoke on logout, timing-safe password compare  
- **Deposit review UI:** checklist (amount, explorer, address, no duplicate) required before credit  
- **Campaign verification:** start view → token → minimum duration → complete (anti-instant-claim)  
- **Anti-fraud:** daily view/earn limits, cooldown, fraud_score, fraud_events  
- **Idempotency:** unique keys on deposits/withdrawals/transactions/treasury  
- **Backups:** `npm run backup` (JSON snapshot; use `pg_dump` in production)  
- **Monitoring:** health checks table + cron heartbeats; `/health` on webhook mode  
- **Legal:** Terms & Privacy in bot + CMS settings URLs  

## Env

**Railway**
```
BOT_TOKEN=
ADMIN_IDS=
DATABASE_URL=
ADMIN_CMS_URL=https://YOUR.vercel.app
NODE_ENV=production
```

**Vercel** (`admin-cms`)
```
DATABASE_URL=
ADMIN_CMS_PASSWORD=
ADMIN_CMS_SECRET=
BOT_TOKEN=
SESSION_MAX_AGE_HOURS=8
NODE_ENV=production
```

## Local

```bash
cp .env.example .env
npm install
npm run migrate
npm run bot:dev
cd admin-cms && npm install && npm run dev
```

## Currency

**USDT only.** Admin pays withdrawals from Trust wallet. Payment addresses managed in CMS (no payment API).
