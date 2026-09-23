# SoftworkNovaSuite

PTC platform built as **two apps**:

| App | Stack | Purpose | Host |
|-----|--------|---------|------|
| **Telegram bot** | **Telegraf** (npm) | Users (earn, advertise, wallet) + **admin notifications** | Railway / any Node |
| **Admin CMS** | **Next.js** | Full admin panel (campaigns, deposits, withdrawals, settings) | **Vercel** |

Same PostgreSQL database for both.

```
Users ──► Telegraf bot ──► PostgreSQL
                │
                └── notify ADMIN_IDS (same bot)

Admin ──► Next.js CMS (Vercel) ──► PostgreSQL
                │
                └── notify users via BOT_TOKEN API
```

---

## 1. Telegram bot (Telegraf)

```bash
# from repo root
cp .env.example .env
# set BOT_TOKEN, ADMIN_IDS, DATABASE_URL

npm install
npm run migrate
npm start          # runs user-bot/bot.js (Telegraf)
```

**User features:** Earn · Advertise · Daily bonus · Referrals · Leaderboard · Deposit · Withdraw · Support  

**Admin on Telegram:** notifications only (new deposit, withdrawal, campaign). No CMS menus in the bot.

---

## 2. Admin CMS (Next.js → Vercel)

```bash
cd admin-cms
npm install
# Vercel: Root Directory = admin-cms
# Env: DATABASE_URL, ADMIN_CMS_PASSWORD, ADMIN_CMS_SECRET, BOT_TOKEN
npx vercel --prod
```

Pages: `/login` · `/dashboard` · Campaigns · Deposits · Withdrawals · Addresses · Treasury · Users · Settings · Audit  

See `admin-cms/DEPLOY.md`.

---

## Env summary

| Variable | Used by |
|----------|---------|
| `BOT_TOKEN` | Telegraf bot + CMS (user notifications) |
| `ADMIN_IDS` | Who gets Telegram alerts |
| `DATABASE_URL` | Bot + CMS |
| `ADMIN_CMS_PASSWORD` | CMS login |
| `ADMIN_CMS_SECRET` | CMS session JWT |
| `ADMIN_CMS_URL` | Link in Telegram alerts |

---

## Project layout

```
telegram-bot/
├── user-bot/          # Telegraf bot (users + admin notifications)
├── admin-cms/         # Next.js Admin CMS → Vercel
├── shared/            # DB schema, services, config (used by bot)
├── package.json       # npm deps: telegraf, pg, ...
└── README.md
```

---

UNLICENSED — private commercial use.
