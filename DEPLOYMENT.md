# Deploying TijaPass V12 (GitHub → Netlify)

V9 and V10 stay untouched: V12 gets its own repository, its own Netlify site and its own browser storage key (`tijapass-v12`), so testers start with empty data.

## 1. Create the GitHub repository

**Option A: in the browser (no tools needed)**

The package has 82 files, fewer than 100, so it goes up in one drag-and-drop (GitHub's website takes at most 100 files at a time).

1. On GitHub, click **New repository**. Name: `Tijapass-V12`. Private is fine. Do **not** add a README, .gitignore or licence.
2. Unzip `TijaPass-V12.zip` on your computer and open the `tijapass-v12` folder.
3. In the new repository, click **uploading an existing file**. Select **everything inside** the `tijapass-v12` folder (not the folder itself) and drag it into the page. Wait until every file is listed.
4. Click **Commit changes**. Check that `package.json`, `netlify.toml`, `index.html`, `src`, `public`, `netlify`, `tests`, `scripts` and `docs` sit at the top level of the repository.

The website skips hidden files whose names start with a dot (`.gitignore`, `.env.example`). Netlify does not need them.

**Option B: with git**

```bash
cd tijapass-v12
git init -b main
git add .
git commit -m "TijaPass V12 web MVP"
git remote add origin https://github.com/<your-account>/Tijapass-V12.git
git push -u origin main
```

## 2. Create the Netlify site

1. In Netlify: **Add new site → Import an existing project → GitHub**, and pick `Tijapass-V12`.
2. Site name: `tijapass-v12` (if available), giving https://tijapass-v12.netlify.app.
3. Build settings are read from `netlify.toml`; check they show:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Click **Deploy**. The first build takes about a minute.

## 3. Turn on AI reading (optional but recommended)

Without a key the app works fully with its built-in rules and labels readings "built-in rules". To use the AI:

1. Netlify → **Site configuration → Environment variables → Add a variable**:
   - `AI_API_KEY` = your Anthropic API key (scope: Functions)
   - `AI_MODEL` = `claude-haiku-5-5` (optional; any current Claude model id works)
2. **Never** name them with a `VITE_` prefix: Vite copies `VITE_` variables into the browser bundle, which would expose the key.
3. **Deploys → Trigger deploy → Deploy site** so the function picks up the key.
4. Check: on the Record screen, type "nimeuza mboga elfu ishirini cash". The note "Reading by built-in rules" should no longer appear. In Netlify → **Logs → Functions → ai** you can see any AI errors; on any error the app falls back to the rules.

## 4. After deploying

- Open the site, use **Test accounts**, and follow [TESTING.md](TESTING.md).
- Each tester's data lives in their own browser. To share a scenario, sign in as **Super user → Test data** and load the same sample data, or use **Settings → Test tools** to generate sample activity.
- Pushing to `main` redeploys automatically.
- V12 starts with empty data on its own site. To test with businesses straight away, sign in as **Super user → Test data → Load** (test businesses use PIN 2468).

## Troubleshooting

| Problem | Fix |
|---|---|
| Build fails on Node version | `netlify.toml` sets Node 20; check no other `NODE_VERSION` is set in the Netlify UI |
| Blank page after deploy | Check the publish directory is `dist`, not `build` |
| A screen address gives "Page not found" | The `/*` redirect in `netlify.toml` must be present |
| AI never used | Variable must be exactly `AI_API_KEY`, set for Functions, and the site redeployed after adding it |
| Location or camera not offered on a phone | The site must be opened over https (Netlify does this) and the browser permission allowed |
| "Browser storage is full" | System Admin → Settings → Test tools → Reset all data |
