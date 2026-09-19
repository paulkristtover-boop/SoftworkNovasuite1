# NovaSuite

Paid-To-Click (PTC) platform: **Telegram bot** + **Admin CMS** + **one PostgreSQL**.

| App | Stack | Deploy |
|-----|--------|--------|
| `bot/` | Telegraf (users + admin notifications) | **Railway** |
| `cms/` | Next.js (professional admin dashboard) | **Vercel** |
| `database/` | Shared schema | Same Postgres |

Currency: **USDT only**. Admin pays withdrawals manually from a Trust wallet. Payment addresses are edited in the CMS (no payment API).

---

## Structure

```
NovaSuite/
├── bot/                     # Telegram bot (Railway)
│   ├── bot.js               # Entry
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── config/
│       ├── database/
│       ├── handlers/        # user/ + admin/
│       ├── keyboards/       # user UI ≠ admin UI
│       ├── middleware/
│       ├── services/
│       ├── jobs/
│       ├── inline/
│       ├── webhooks/
│       ├── utils/
│       └── receipts/
├── cms/                     # Admin CMS (Vercel)
│   ├── app/                 # Pages + auth API
│   ├── components/
│   ├── lib/                 # db, auth
│   ├── package.json
│   ├── vercel.json
│   └── .env.example
├── database/                # Shared Postgres
│   ├── migrate.js
│   ├── seed.js
│   └── package.json
├── docs/
│   ├── DEPLOY_RAILWAY.md
│   └── DEPLOY_VERCEL.md
├── package.json             # Monorepo scripts
├── railway.json
├── nixpacks.toml
├── Procfile
├── .env.example
└── README.md
```

---

## Features

**User bot:** `/start`, balance, earn (view ads), advertise, referrals, deposit / withdraw (USDT), submit idea, support, terms, privacy.

**Admin bot:** notifications only — approve/reject deposits & withdrawals, mark paid, moderate ads, stats (different keyboard from users).

**CMS:** dashboard, users (ban), deposits, withdrawals, ads, payment addresses, treasury + balancing txs, ledger, ideas, support, audit, settings.

---

## Quick start (local)

```bash
cp .env.example .env
# Set BOT_TOKEN, ADMIN_IDS, DATABASE_URL, ADMIN_CMS_PASSWORD, ADMIN_CMS_SECRET

npm run db:migrate
npm run bot:dev      # bot
npm run cms:dev      # http://localhost:3000
```

---

## Environment

### Railway (bot)

```
BOT_TOKEN=
ADMIN_IDS=
DATABASE_URL=
ADMIN_CMS_URL=https://YOUR.vercel.app
NODE_ENV=production
```

Optional: `USE_WEBHOOK`, `WEBHOOK_URL`, `MIN_WITHDRAW`, `MIN_DEPOSIT`, `REFERRAL_BONUS_PERCENT`, `SUPPORT_USERNAME`, `TRUST_WALLET_ADDRESS`, …  
Full list: `.env.example` and `bot/.env.example`.

### Vercel (CMS) — **Root Directory = `cms`**

```
DATABASE_URL=
ADMIN_CMS_PASSWORD=
ADMIN_CMS_SECRET=
BOT_TOKEN=
NODE_ENV=production
```

Use the **same** `DATABASE_URL` on both platforms.

---

## Deploy

### Railway — bot

- Root Directory: **empty** (this folder)
- Start: `node database/migrate.js && node bot/bot.js`
- Details: [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md)

### Vercel — CMS

- Root Directory: **`cms`** (required — avoids “No Next.js version detected”)
- Details: [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Create tables |
| `npm run db:seed` | Sample payment address |
| `npm run bot` / `bot:dev` | Run Telegram bot |
| `npm run cms:dev` | Run Admin CMS |
| `npm start` | Migrate + start bot (production) |
