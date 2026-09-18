# NovaSuite

Professional **Paid-To-Click (PTC)** platform in one folder:

| Component | Stack | Deploy |
|-----------|--------|--------|
| **Telegram bot** | Telegraf – user UI + **admin notifications** | **Railway** |
| **Admin CMS** | Next.js – professional dark dashboard | **Vercel** |
| **Database** | One shared **PostgreSQL** | Railway Postgres (or any) |

Currency: **USDT only**. Admin pays withdrawals manually from a dedicated Trust wallet. Payment addresses are managed in the CMS (no external payment API).

---

## Architecture

```
┌──────────────────────┐          ┌──────────────────────┐
│  Telegram Bot        │          │  Next.js Admin CMS   │
│  (Railway)           │          │  (Vercel)            │
│  • User PTC UI       │          │  • Professional UI   │
│  • Admin notifications│         │  • Full controls     │
└──────────┬───────────┘          └──────────┬───────────┘
           │                                 │
           └──────────────┬──────────────────┘
                          │
                   ┌──────▼──────┐
                   │  PostgreSQL │
                   │  (shared)   │
                   └─────────────┘
```

---

## Features

### User bot
- `/start` + referral deep links  
- Balance (USDT)  
- Earn – view ads (bots / websites / channels)  
- Advertise – create ads with budget from balance  
- Referrals – configurable % bonus  
- Deposit – pick network → admin address → submit TxID → admin approves  
- Withdraw – request → balance held → admin pays manually → mark paid  
- Submit Idea / Feedback  
- Support contact  
- Terms of Use & Privacy  
- Distinct keyboard UI; banned users blocked with clear message  

### Admin bot (notifications only – different UI)
- Pending deposits / withdrawals with Approve / Reject / Mark Paid  
- Ad moderation  
- Stats & treasury glance  
- Search user  

### Web Admin CMS (professional)
- Dashboard metrics  
- Users (ban / unban) + audit  
- Deposits & withdrawals queues  
- Ads moderation  
- **Payment addresses** – add / delete (no API dependency)  
- **Treasury / Trust wallet** – balance, address, manual in/out for accounting  
- Full transaction ledger  
- Ideas, Support tickets, Audit logs  
- Platform settings  

---

## Environment variables (production)

### Railway (Bot)

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `ADMIN_IDS` | ✅ | Comma-separated Telegram user IDs for admin notifications |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ADMIN_CMS_URL` | ✅ | Public URL of Vercel CMS, e.g. `https://your.vercel.app` |
| `NODE_ENV` | ✅ | `production` |
| `USE_WEBHOOK` | | `true` in production if using webhook |
| `WEBHOOK_URL` | | Public Railway URL, e.g. `https://xxx.up.railway.app` |
| `WEBHOOK_PATH` | | Default `/webhook/telegram` |
| `BOT_PORT` / `PORT` | | Default `3001` |
| `CURRENCY` | | Default `USDT` |
| `CURRENCY_SYMBOL` | | Default `$` |
| `MIN_WITHDRAW` | | Default `5` |
| `MIN_DEPOSIT` | | Default `1` |
| `REFERRAL_BONUS_PERCENT` | | Default `10` |
| `DEFAULT_AD_REWARD` | | Default `0.01` |
| `MAX_ADS_PER_USER` | | Default `20` |
| `AD_VIEW_COOLDOWN_SECONDS` | | Default `30` |
| `RATE_LIMIT_WINDOW_MS` | | Default `3000` |
| `RATE_LIMIT_MAX_HITS` | | Default `8` |
| `BAN_MESSAGE` | | Message shown to banned users |
| `SUPPORT_USERNAME` | | e.g. `YourSupport` |
| `SUPPORT_EMAIL` | | Optional email |
| `TERMS_URL` | | Optional external terms page |
| `PRIVACY_URL` | | Optional external privacy page |
| `PLATFORM_NAME` | | Default `NovaSuite` |
| `TRUST_WALLET_ADDRESS` | | Default Trust wallet (editable in CMS) |
| `DEFAULT_NETWORK` | | Default `TRC20` |
| `LOG_LEVEL` | | `info` / `debug` / `warn` / `error` |

### Vercel (Admin CMS) — Root Directory = `cms`

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | **Same** Postgres as Railway |
| `ADMIN_CMS_PASSWORD` | ✅ | Login password for the CMS |
| `ADMIN_CMS_SECRET` | ✅ | Long random string (≥32 chars) for JWT sessions |
| `BOT_TOKEN` | recommended | Same bot token (future CMS→user notifies) |
| `ADMIN_CMS_USERNAME` | | Display name, default `admin` |
| `NEXT_PUBLIC_PLATFORM_NAME` | | Default `NovaSuite` |
| `NEXT_PUBLIC_CURRENCY` | | Default `USDT` |
| `NODE_ENV` | | `production` |
| `TELEGRAM_NOTIFY_ON_CMS_ACTION` | | `true` to enable Telegram notifies from CMS |

Copy templates from:
- Root: `.env.example`
- Bot: `bot/.env.example`
- CMS: `cms/.env.example`

---

## Local development

```bash
cd NovaSuite
cp .env.example .env
# Fill BOT_TOKEN, ADMIN_IDS, DATABASE_URL, ADMIN_CMS_PASSWORD, ADMIN_CMS_SECRET

npm run db:migrate
npm run bot:dev          # Telegram bot (polling)
npm run cms:dev          # http://localhost:3000  (password = ADMIN_CMS_PASSWORD)
```

---

## Deploy

### 1. PostgreSQL
Create a database (Railway Postgres plugin is ideal). Run once:

```bash
DATABASE_URL=postgresql://... npm run db:migrate
```

### 2. Railway – Bot
1. New project from this repo.  
2. `railway.json` installs deps, migrates, starts `bot/bot.js`.  
3. Set all **Railway** env vars above.  
4. Optional: enable webhook (`USE_WEBHOOK=true` + `WEBHOOK_URL`).

### 3. Vercel – CMS

**Important:** If you see *“No Next.js version detected”*, the Root Directory is wrong.

1. Import the repo in Vercel.  
2. **Settings → General → Root Directory** → set to **`cms`**  
   (or `NovaSuite/cms` if `NovaSuite` is not the Git root).  
   This folder contains `package.json` with `"next"`.  
3. Framework preset: **Next.js** (auto-detected once Root Directory is `cms`).  
4. Environment variables (Production):
   ```
   DATABASE_URL=
   ADMIN_CMS_PASSWORD=
   ADMIN_CMS_SECRET=
   BOT_TOKEN=
   NODE_ENV=production
   ```
5. Deploy → open `https://YOUR.vercel.app` → sign in with `ADMIN_CMS_PASSWORD`.

See also `cms/DEPLOY.md`.

---

## Project structure

```
NovaSuite/
├── bot/                      # Telegraf bot (Railway)
│   ├── bot.js
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── config/
│       ├── database/
│       ├── handlers/         # user + admin (notifications)
│       ├── keyboards/        # user UI ≠ admin UI
│       ├── middleware/       # ban, rate limit
│       ├── services/
│       ├── jobs/
│       ├── inline/
│       ├── utils/
│       ├── webhooks/
│       └── receipts/
├── cms/                      # Next.js Admin CMS (Vercel)
│   ├── app/                  # pages + API routes
│   ├── components/
│   ├── lib/                  # db, auth
│   ├── middleware.ts
│   ├── package.json
│   └── vercel.json
├── database/                 # shared schema
│   ├── migrate.js
│   ├── seed.js
│   └── package.json
├── railway.json
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Security notes

- Never commit `.env`  
- Use a strong `ADMIN_CMS_SECRET` and `ADMIN_CMS_PASSWORD`  
- Keep private keys **off** the server – admin pays from Trust wallet manually  
- Rate limiting + ban middleware on the bot  
- Audit log for admin actions in CMS  
- HTTPS only in production (Railway / Vercel)

---

## License

MIT
