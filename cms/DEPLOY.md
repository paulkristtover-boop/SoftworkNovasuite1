# Deploy NovaSuite CMS on Vercel

## Fix: "No Next.js version detected"

Vercel must use the **`cms`** folder as the project root (that is where `package.json` with `"next"` lives).

### Steps

1. Vercel Dashboard → your project → **Settings → General**
2. **Root Directory** → click **Edit** → set to:
   - `cms` — if your Git repo root is the `NovaSuite` folder
   - `NovaSuite/cms` — if your Git repo root is the parent of `NovaSuite`
3. Save
4. **Settings → Environment Variables** — add:
   ```
   DATABASE_URL=
   ADMIN_CMS_PASSWORD=
   ADMIN_CMS_SECRET=
   BOT_TOKEN=
   NODE_ENV=production
   ```
5. **Deployments → Redeploy**

### CLI alternative

```bash
cd NovaSuite/cms
npx vercel
```

When prompted, link the project from **inside `cms`**, not the monorepo root.
