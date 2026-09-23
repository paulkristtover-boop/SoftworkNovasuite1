# Deploy SoftworkNovaSuite Admin CMS to Vercel

## Important: Root Directory

In Vercel project settings set:

**Root Directory** = `admin-cms`

(If the Git repo root is `telegram-bot/` or the monorepo root.)

If you deploy only the `admin-cms` folder as the repo, leave Root Directory empty.

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Required | Example |
|------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://...` |
| `ADMIN_CMS_PASSWORD` | Yes | strong password |
| `ADMIN_CMS_SECRET` | Yes | long random string |
| `BOT_TOKEN` | Yes | so CMS can notify users |
| `ADMIN_IDS` | Optional | telegram ids |
| `ADMIN_CMS_URL` | Optional | `https://your-app.vercel.app` |
| `NODE_ENV` | Auto | production |

## Deploy steps

1. Push code to GitHub/GitLab.
2. Vercel → New Project → import repo.
3. Set **Root Directory** to `admin-cms`.
4. Add env vars above.
5. Deploy.

## URLs after deploy

- `https://YOUR.vercel.app/` → redirects to login or dashboard
- `https://YOUR.vercel.app/login`
- `https://YOUR.vercel.app/dashboard`

## Local test

```bash
cd admin-cms
cp .env.example .env.local
# fill DATABASE_URL, ADMIN_CMS_PASSWORD, ADMIN_CMS_SECRET
npm install
npm run dev
# open http://localhost:3001
```
