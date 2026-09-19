# Deploy Admin CMS on Vercel

If you see **“No Next.js version detected”**, Root Directory is wrong.

1. Import repo → **Settings → General → Root Directory** = **`cms`**.
2. Framework: Next.js (auto).
3. Environment variables:

```
DATABASE_URL=
ADMIN_CMS_PASSWORD=
ADMIN_CMS_SECRET=
BOT_TOKEN=
NODE_ENV=production
```

Use the **same** `DATABASE_URL` as Railway.

4. Deploy → open the URL → sign in with `ADMIN_CMS_PASSWORD`.

CLI:

```bash
cd cms && npx vercel
```
