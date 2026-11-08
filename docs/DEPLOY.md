# Deploy: backend on AWS, frontend on Vercel, extension zip

Commands are for **Windows PowerShell**, run from the repo root (`Oracle-Jedi\`) unless a step says otherwise.

**Secrets rule:** secret values go only into the AWS console. Never put them in the frontend, the extension, git, chat, or a screenshot. `.env*` files are git-ignored; never commit them. `git status` must never list a `.env` file.

---

## 0. Write these down first (worksheet)

| Name | Example | Where it comes from |
|---|---|---|
| `REGION` | `us-east-1` | Pick one AWS region and use it everywhere |
| `APP_URL` | `https://oracle-jedi.vercel.app` | Vercel production URL (step 1) |
| `API_URL` | `https://oracle-jedi-api.ecs.us-east-1.on.aws` | ECS "Application URL" (step 2.4) |
| `API_BASE` | `API_URL` + `/api` | Used by the frontend and the extension |
| `OFFICE_DOMAIN` | `maplestreettax.xyz` | The demo-office domain (see `docs/DEMO_SETUP.md`, part 1) |

No trailing slash on any of them. Buy the domain first if you can (it takes 5 minutes) so `DEMO_OFFICE_DOMAIN` can be set when the AWS service is created.

**Order:** step 1 (Vercel, to learn `APP_URL`) → step 2 (AWS) → step 3 (finish Vercel) → step 4 (extension) → step 5 (smoke test).

**AWS account:** right away, create a **25 USD monthly budget** alert (Billing → Budgets → Create budget → Monthly cost budget) so the credits can't run out unnoticed. Expect about 1 to 2 USD a day for ECS plus the load balancer. If the console says ECS Express Mode isn't available on your Free plan, upgrade to the Paid plan (Billing → **Upgrade plan**): your remaining credits carry over and are used first. Do step 2 after the backend feature freeze: every AWS update is a rolling canary deploy that takes several minutes.

---

## 1. Vercel, part 1: create the project and learn `APP_URL`

1. Make sure the latest code is pushed to GitHub (you do this yourself; `.env` files are ignored by git).
2. https://vercel.com/new → **Import Git Repository** → pick the repo.
3. **Root Directory** → **Edit** → choose `frontend`.
4. **Framework Preset:** Vite (auto-detected). Leave **Build Command** (`npm run build` / `vite build`), **Output Directory** (`dist`) and **Install Command** (`npm install`) at their defaults.
   - `npm install` run inside `frontend/` installs from the repo-root `package-lock.json` in workspace mode, which links `@oj/core` from `../core`. This was verified with a clean Linux build.
5. Leave environment variables empty for now. **Deploy.**
6. Copy the production domain from the project page (for example `https://oracle-jedi.vercel.app`). That is `APP_URL`.
7. Project → **Settings**:
   - **Build and Deployment** → **Root Directory**: make sure **Include files outside the root directory in the Build Step** is **Enabled** (the default). The build needs `core/`.
   - **Build and Deployment** → **Node.js Version**: `22.x` or `24.x`.
   - Leave **Analytics** and **Speed Insights** off (no third-party scripts on request pages).

The first deploy loads, but it can't reach the API yet. That's expected.

Don't deploy with the `vercel` CLI from your laptop. It uploads files that git ignores, including `.env`. Use the Git integration.

---

> **Our AWS account only works in us-east-2 (Ohio).** The AWS path we use is a single EC2 server, click by click in `docs/DEPLOY_EC2.md`. Sections 2 (ECS Express) and 2A (Vercel) below are alternatives.

## 2A. Backend on Vercel (what we use: our AWS credits account blocks every compute service)

The AWS account we were given is an organization-managed credits sandbox. Its service control policy denies ECS, ECR, Lambda, EC2, Lightsail, Elastic Beanstalk, App Runner, Amplify, S3, SSM and Secrets Manager. So the backend runs as a Vercel function instead. `backend/src/vercel.ts` wraps the same Hono app, and `npm run vercel-build` bundles it with esbuild into Vercel's Build Output format (`backend/.vercel/output`). Uploads go straight to Supabase, so no large bodies pass through the function. Expired files are purged at most once a minute, on incoming requests.

1. Vercel → **Add New** → **Project** → import the same GitHub repo again.
2. **Project name:** `avaran-api`. **Root Directory:** `backend`. **Framework Preset:** Other. **Build Command:** override with `npm run vercel-build`. Leave Output Directory and Install Command at their defaults.
3. **Environment Variables:** open your local `.env`, copy all of it, click the first **Key** box and paste. Vercel splits it into rows. Then remove any `PORT`, `ALLOWED_ORIGINS` or `PUBLIC_APP_URL` rows that came with it, and add:
   - `ALLOWED_ORIGINS` = `APP_URL`
   - `PUBLIC_APP_URL` = `APP_URL`
   - `DEMO_OFFICE_DOMAIN` = `OFFICE_DOMAIN`
4. **Deploy.** `API_URL` is the production domain, for example `https://avaran-api.vercel.app`, and `API_BASE` is `API_URL/api`. Check `API_URL/api/health`: every `configured` flag you need, plus `schema` and `bucket`, must be `true`.
5. Optional: Settings → **Functions** → **Function Region**: the region closest to your Supabase project.

Then continue with step 3. The CSP in `frontend/vercel.json` already allows `https://*.vercel.app`, so no CSP change is needed.

## 2. Backend on AWS: Amazon ECS Express Mode (needs an account that allows ECS and ECR)

**Why ECS Express Mode:** AWS App Runner stopped accepting new customers on **30 April 2026** (AWS "App Runner availability change" page, checked 8 Nov 2026). AWS recommends **ECS Express Mode** instead (launched 21 Nov 2025, all regions). You give it one container image and it creates Fargate, an HTTPS load balancer with a certificate, autoscaling, logs and a URL like `https://<service>.ecs.<region>.on.aws`. Express Mode itself is free. You pay for Fargate plus the load balancer, roughly 1 to 2 USD a day at 1 task. Delete it after judging (step 6).

### 2.1 Tools (one time)

1. Start **Docker Desktop** and wait until it says "Engine running".
2. Install the AWS CLI v2, then **close and reopen** PowerShell:
   ```powershell
   winget install -e --id Amazon.AWSCLI
   aws --version
   ```
   You need version 2.32 or newer for `aws login`.
3. Sign in with your AWS console identity (a browser window opens):
   ```powershell
   aws configure set region us-east-1
   aws login
   aws sts get-caller-identity
   ```
   Fallback for an older CLI: `aws configure` with an IAM user's access key. Never use root access keys.

### 2.2 Build and push the image to ECR

The repo-root `Dockerfile` builds **only the backend**: Node 24 Alpine, `core/src` + `backend/src`, run with `tsx` on port 8080. `.dockerignore` is an allow-list, so no `.env*`, keys or recovery kits can enter the image. This build was tested locally: `/api/health` answered 200.

```powershell
$REGION   = "us-east-1"
$ACCOUNT  = aws sts get-caller-identity --query Account --output text
$REGISTRY = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
$IMAGE    = "$REGISTRY/oracle-jedi-backend:v1"

aws ecr create-repository --repository-name oracle-jedi-backend --region $REGION
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build --platform linux/amd64 -t $IMAGE .
docker push $IMAGE
```

Use a new tag (`v2`, `v3`…) for every later push. In PowerShell write `"${REPO}:v1"`, not `"$REPO:v1"`: a variable followed by a colon breaks.

Optional local check before pushing (no secrets needed):
```powershell
docker run --rm -d --name oj-api -p 8080:8080 $IMAGE
curl.exe -s http://localhost:8080/api/health
docker stop oj-api
```

### 2.3 Environment variables for production

Copy the secret values from your local backend env file. You can read it yourself; don't paste it anywhere else.

| Variable | Production value | Secret? |
|---|---|---|
| `PORT` | `8080` (also baked into the image) | no |
| `ALLOWED_ORIGINS` | `APP_URL`, for example `https://oracle-jedi.vercel.app`. Comma-separated, exact origins, no trailing slash. Add a custom app domain here too if you add one. Extensions (`chrome-extension://`) are always allowed by the code | no |
| `PUBLIC_APP_URL` | `APP_URL` | no |
| `SUPABASE_URL` | same as local | no |
| `SUPABASE_SERVICE_ROLE_KEY` | same as local | **YES** |
| `TAVILY_API_KEY` | same as local | **YES** |
| `EXA_API_KEY` | same as local | **YES** |
| `SERVER_SECRET` | Only if you set it locally, and then the **same** value. If it's unset, the backend derives its ML-DSA receipt key and session HMAC key from `SUPABASE_SERVICE_ROLE_KEY`. Either way it must never change during the demo | **YES** |
| `CRON_SECRET` | any random string of 32+ characters | **YES** |
| `DEMO_OFFICE_DOMAIN` | `OFFICE_DOMAIN`, for example `maplestreettax.xyz` | no |
| `DOH_RESOLVER_URL` | `https://cloudflare-dns.com/dns-query` | no |
| `CHECK_TIMEOUT_MS` | `8000` (the code default; the README's `5000` is tighter for a cold check of a new site) | no |
| `CHECK_CACHE_TTL_HOURS` | `24` | no |

Notes:
- `SERVER_MLDSA_SECRET_KEY` / `SERVER_MLDSA_PUBLIC_KEY` are listed in the README, but `backend/src/env.ts` doesn't read them today. You can skip them.
- `SUPABASE_ANON_KEY` is optional. It only shows as `supabaseAnon` in `/api/health`.
- To generate a `CRON_SECRET`: `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})`

### 2.4 Create the service (console)

1. Open https://console.aws.amazon.com/ecs/v2 and check that the region selector (top right) shows `REGION`.
2. Left menu → **Express mode** → **Create**.
3. **Image URI** → **Browse ECR images** → repository `oracle-jedi-backend` → select the image. Choose it by **Image digest** (recommended) or tag `v1`.
4. **Task execution role** → **Create new role**. **Infrastructure role** → **Create new role**.
5. Open **Additional configurations - optional**:
   - **Name:** `oracle-jedi-api`. This name is part of the URL.
   - **Container port:** `8080`
   - **Health check path:** `/api/health` (the default `/` returns 404 and the deploy would fail)
   - **Environment variables:** add every row from 2.3. **Value type:** Environment variable. If you prefer, use **Secret** with a Secrets Manager ARN for the four secrets.
   - **Compute:** defaults (1 vCPU, 2 GB, X86_64) are fine.
   - **Auto scaling:** Minimum `1`, Maximum `2`
   - Networking and logs: defaults (default VPC, public subnets).
6. **Create.** If you see `Unable to assume the service linked role`, wait one minute and press **Create** again.
7. Watch the **Resources** tab until everything is complete or ACTIVE (usually 5 to 10 minutes: load balancer + certificate).
8. Copy the **Application URL**. That is `API_URL`. Then check it:
   ```powershell
   $API_URL = "https://oracle-jedi-api.ecs.us-east-1.on.aws"
   curl.exe -s "$API_URL/api/health"
   ```
   Expect `"ok":true` and, under `configured`, `supabaseUrl`, `supabaseServiceRole`, `tavily`, `exa` and `serverSecret` all `true`, plus `"schema":true,"bucket":true`. If something is `false`, fix that env var (2.6).
9. CORS check (must echo your Vercel origin):
   ```powershell
   curl.exe -s -i -X OPTIONS -H "Origin: https://oracle-jedi.vercel.app" -H "Access-Control-Request-Method: POST" "$API_URL/api/check"
   ```
   Look for `access-control-allow-origin: https://oracle-jedi.vercel.app`.

Logs: service page → **Logs** tab, or CloudWatch. The backend logs only `METHOD /route/pattern status ms`: no bodies, headers or query strings.

### 2.5 Optional: the same with the CLI

```powershell
$tmp = "$env:TEMP\oj-aws"; New-Item -ItemType Directory -Force $tmp | Out-Null
'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content -Encoding ascii "$tmp\exec-trust.json"
'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content -Encoding ascii "$tmp\infra-trust.json"
aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document "file://$tmp\exec-trust.json"
aws iam create-role --role-name ecsInfrastructureRoleForExpressServices --assume-role-policy-document "file://$tmp\infra-trust.json"
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam attach-role-policy --role-name ecsInfrastructureRoleForExpressServices --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices
notepad "$tmp\container.json"
```

Paste this into Notepad, fill in the values, and save:

```json
{
  "image": "<ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/oracle-jedi-backend:v1",
  "containerPort": 8080,
  "environment": [
    { "name": "PORT", "value": "8080" },
    { "name": "ALLOWED_ORIGINS", "value": "https://oracle-jedi.vercel.app" },
    { "name": "PUBLIC_APP_URL", "value": "https://oracle-jedi.vercel.app" },
    { "name": "SUPABASE_URL", "value": "" },
    { "name": "SUPABASE_SERVICE_ROLE_KEY", "value": "" },
    { "name": "TAVILY_API_KEY", "value": "" },
    { "name": "EXA_API_KEY", "value": "" },
    { "name": "CRON_SECRET", "value": "" },
    { "name": "DEMO_OFFICE_DOMAIN", "value": "maplestreettax.xyz" },
    { "name": "DOH_RESOLVER_URL", "value": "https://cloudflare-dns.com/dns-query" },
    { "name": "CHECK_TIMEOUT_MS", "value": "8000" },
    { "name": "CHECK_CACHE_TTL_HOURS", "value": "24" }
  ]
}
```

Then create the service and **delete the file that holds secrets**:

```powershell
aws ecs create-express-gateway-service --service-name oracle-jedi-api `
  --execution-role-arn "arn:aws:iam::${ACCOUNT}:role/ecsTaskExecutionRole" `
  --infrastructure-role-arn "arn:aws:iam::${ACCOUNT}:role/ecsInfrastructureRoleForExpressServices" `
  --primary-container "file://$tmp\container.json" `
  --health-check-path /api/health `
  --scaling-target minTaskCount=1,maxTaskCount=2 `
  --monitor-resources
Remove-Item -Recurse -Force $tmp
```

If the first call fails with an assume-role error, wait a minute and retry: new IAM roles take a moment to propagate.

### 2.6 Updating later (new code or env change)

1. Build and push a new tag (`...:v2`) as in 2.2.
2. ECS console → **Clusters** → `default` → the service with the **Express** badge → **Update** → pick the new image (by digest) and/or edit environment variables → **Update**.
3. The update is a canary deploy with automatic rollback on 5xx, so allow several minutes. Re-run the health check afterwards.

---

## 3. Vercel, part 2: point the frontend at the API

1. Vercel project → **Settings** → **Environment Variables** (Production, and Preview if you use previews):
   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `API_BASE`, for example `https://oracle-jedi-api.ecs.us-east-1.on.aws/api` |
   | `VITE_APP_URL` | `APP_URL`, for example `https://oracle-jedi.vercel.app` |

   Vite inlines these **at build time**, so you must redeploy after any change. No Supabase key is needed in the frontend. Never add a secret here: everything in `VITE_*` ships to every browser.
2. **Tighten the Content-Security-Policy (required step).** `frontend/vercel.json` currently allows the API with the wildcard `https://*.on.aws` inside `connect-src`, so the first deploy works. Replace that wildcard with your exact API origin, for example:
   - before: `... https://*.vercel.app https://*.on.aws; frame-ancestors ...`
   - after: `... https://*.vercel.app https://oracle-jedi-api.ecs.us-east-1.on.aws; frame-ancestors ...`

   Use the origin only: no `/api`, no trailing slash. If you later put the API on a custom domain, use that origin instead. Commit and push only `frontend/vercel.json` (never `.env*`).
3. Redeploy: **Deployments** → latest → **⋯** → **Redeploy** (or let the push trigger it).
4. Open `APP_URL`. The home page footer must say **API online**. Browser DevTools → Console must show no CSP errors.
5. SPA routes are handled by the rewrite in `frontend/vercel.json`: `/office`, `/check`, `/r/<id>` and `/h/<id>` all load directly. Check one by pasting `APP_URL/check` into a new tab.
6. Only the production domain is in `ALLOWED_ORIGINS`. Preview URLs (`*-git-*.vercel.app`) will get CORS errors, and Vercel protects previews behind login by default. Give judges `APP_URL` only.

---

## 4. Extension: rebuild against production and zip it

The extension reads `WXT_*` values at build time. `extension/wxt.config.ts` turns `WXT_API_BASE_URL` into the manifest's `host_permissions`, so a build against localhost **cannot** reach production. Rebuild it. Shell variables override the values in your local env file:

```powershell
$env:WXT_API_BASE_URL     = "https://oracle-jedi-api.ecs.us-east-1.on.aws/api"
$env:WXT_APP_URL          = "https://oracle-jedi.vercel.app"
$env:WXT_DOH_RESOLVER_URL = "https://cloudflare-dns.com/dns-query"
npm run zip -w extension
Remove-Item Env:WXT_API_BASE_URL, Env:WXT_APP_URL, Env:WXT_DOH_RESOLVER_URL
```

Check the result before shipping:

```powershell
Get-Content extension\.output\chrome-mv3\manifest.json
Get-ChildItem extension\.output\*.zip
```

`host_permissions` must be exactly `https://mail.google.com/*`, `https://web.whatsapp.com/*`, `https://<your-api-host>/*` and `https://cloudflare-dns.com/*`, with **no `localhost`**. The zip is `extension\.output\avaran-0.1.0-chrome.zip`. Only public URLs go into the extension: never a key, because anyone can unzip it and read it.

**Publishing it** (GitHub release for judges today, Chrome Web Store in parallel): see `docs/PUBLISH_EXTENSION.md`.

**Judge install steps** (put these on Devpost next to the zip):
1. Download the zip and **extract it** to a folder. Chrome can't load an unpacked extension from a zip directly.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the extracted folder (the one that contains `manifest.json`). Dragging that folder onto the page also works.
4. Pin **Avaran** from the puzzle-piece menu and open Gmail.
5. What it can access is explained in `extension/PERMISSIONS.md`.

After every rebuild, press the reload icon on the extension card and refresh Gmail.

---

## 5. Final smoke checklist

Tick each one, in order:

- [ ] `curl.exe -s "$API_URL/api/health"`: `ok:true`, `schema:true`, `bucket:true`, every `configured` flag you need is `true`.
- [ ] CORS preflight from `APP_URL` echoes the origin (2.4 step 9).
- [ ] `APP_URL` home shows **API online**, and there are no CSP errors in DevTools.
- [ ] `APP_URL/office`: register or unlock the office. The badge shows **Verified** after the DNS step (`docs/DEMO_SETUP.md`).
- [ ] **Request link from a phone:** create a request, scan the QR code with a phone on mobile data, add a sample document, **Trim** it, **Seal** it. It appears live in the dashboard. Open it, then **revoke** it and watch it disappear.
- [ ] `APP_URL/check`: **Load training sample** gives **Doesn't match**, with verified quotes from `https://OFFICE_DOMAIN/`. Then From `Maple Street Tax <frontdesk@OFFICE_DOMAIN>` with a short request gives **Verified**.
- [ ] **Extension card:** in Gmail (test inbox), open the `[TRAINING SAMPLE]` email. The "Who's asking?" card shows **Doesn't match**, the official phone `(617) 555-0118` and the official upload link, and the fake link is outlined. The side-panel **Privacy Ledger** lists only calls to `API_URL` and `cloudflare-dns.com`.
- [ ] Optional full API flow: `$env:API = "$API_URL/api"; npm run smoke -w backend; Remove-Item Env:API`.

---

## 6. After judging: tear down

- ECS console → Clusters → `default` → the Express service → **Delete**. This removes the load balancer, certificate and scaling.
- ECR → `oracle-jedi-backend` → delete the repository.
- Rotate the Supabase service-role, Tavily and Exa keys if they were ever shown on screen.

## Troubleshooting

| Symptom | Fix |
|---|---|
| ECS deploy rolls back / tasks keep restarting | Health check path must be `/api/health` and container port `8080`. Read the service **Logs** tab |
| `/api/health` shows `schema:false` | Run `backend/supabase/schema.sql` in Supabase → SQL Editor. Check `SUPABASE_URL` and the service-role key |
| Browser: `blocked by CORS policy` | `ALLOWED_ORIGINS` must contain exactly `APP_URL` (scheme + host, no slash). Update the service (2.6) |
| Browser: `Refused to connect ... Content Security Policy` | Put the API origin into `connect-src` in `frontend/vercel.json` (step 3.2) and redeploy |
| Frontend still calls `localhost:8787` | `VITE_API_BASE_URL` missing at build time. Set it, then **Redeploy** |
| Extension calls fail / ledger shows `localhost` | Rebuild with the `$env:WXT_*` lines in step 4 and reload the extension |
| Vercel build can't find `@oj/core` | Root Directory must be `frontend` with **Include files outside the root directory** enabled, and Install Command left at the default `npm install` |
