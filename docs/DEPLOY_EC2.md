# Backend on one AWS EC2 server (Ohio), by hand in the dashboard

Our AWS credits account only works in **us-east-2 (Ohio)**. Every other region is blocked by the organization's policy. Make sure the region selector (top right of the console) says **US East (Ohio) us-east-2** for every step.

**What you end up with:** one `t3.small` server running the backend in Docker, with Caddy in front of it giving a free HTTPS certificate on `https://api.maplestreettax.site`. Cost: about 0.5 USD a day from your credits.

**Secrets rule:** your keys go only into one file on the server (step 6), typed or pasted by you. Not into the launch wizard's "User data", not into chat, not into git.

---

## 1. Launch the server

Console → **EC2** → **Launch instance**:

| Field | Value |
|---|---|
| Name | `avaran-api` |
| Application and OS image | **Amazon Linux 2023** (the default, free tier eligible label) |
| Architecture | 64-bit (x86) |
| Instance type | **t3.small** (2 GB RAM; t3.micro runs out of memory while building) |
| Key pair | **Create new key pair** → name `avaran` → type RSA → format **.pem** → Create. The file downloads: keep it, you can't download it again |
| Network settings → Edit | Keep the default VPC. **Auto-assign public IP: Enable** |
| Security group | **Create security group** `avaran-api-sg` with three rules: SSH (22) from **My IP**; HTTP (80) from **Anywhere**; HTTPS (443) from **Anywhere** |
| Storage | **20 GiB**, gp3 |

Leave everything else as it is, then **Launch instance**. Open the instance and wait for **Instance state: Running** and **Status check: 2/2 passed** (about 2 minutes).

## 2. Give it a fixed address (Elastic IP)

Without this, the address changes every time the server restarts.

EC2 → left menu **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**. Select it → **Actions** → **Associate Elastic IP address** → Instance: `avaran-api` → **Associate**. Write the IP down: `SERVER_IP`.

## 3. Point the name at it (Cloudflare)

Cloudflare → `maplestreettax.site` → **DNS** → **Records** → **Add record**:
- **Type:** `A`
- **Name:** `api`
- **IPv4 address:** `SERVER_IP`
- **Proxy status:** **DNS only** (grey cloud). Orange would break the certificate step.
- **TTL:** Auto → **Save**.

Check from PowerShell (can take a minute): `Resolve-DnsName api.maplestreettax.site -Type A -Server 1.1.1.1` must show `SERVER_IP`.

## 4. Connect

In PowerShell on your laptop (the key file is probably in Downloads):

```powershell
icacls "$env:USERPROFILE\Downloads\avaran.pem" /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i "$env:USERPROFILE\Downloads\avaran.pem" ec2-user@SERVER_IP
```

Type `yes` at the fingerprint question. The prompt becomes `[ec2-user@ip-... ~]$`. Everything in steps 5 to 8 is typed **there**. (Browser alternative: select the instance → **Connect** → **EC2 Instance Connect** → **Connect**.)

## 5. Install Docker and get the code

```bash
sudo dnf install -y docker git
sudo systemctl enable --now docker
git clone https://github.com/Dogtags27/Oracle-Jedi.git
cd Oracle-Jedi
sudo docker build -t avaran-backend .
```

The build takes 2 to 4 minutes. If `git clone` asks for a username and password, the repo is private: in GitHub → repo **Settings** → **General** → **Danger Zone** → **Change visibility** → Public for the event (it contains no secrets; `.env` is git-ignored), then clone again.

## 6. Put the secrets in a file on the server

```bash
sudo nano /etc/avaran.env
```

On your laptop open your local `.env`, select everything, copy it, and paste it into the nano window (right-click pastes in most terminals). Then **delete any line starting with `PORT=`, `ALLOWED_ORIGINS=`, `PUBLIC_APP_URL=` or `DEMO_OFFICE_DOMAIN=`** (step 7 sets those). Save with **Ctrl+O**, **Enter**, **Ctrl+X**. Then:

```bash
sudo chmod 644 /etc/avaran.env
```

This file only exists on this server. Never paste its contents anywhere else.

## 7. Start the backend

```bash
sudo docker run -d --name avaran-api --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v /etc/avaran.env:/app/.env:ro \
  -e PORT=8080 \
  -e ALLOWED_ORIGINS=https://oracle-jedi.vercel.app \
  -e PUBLIC_APP_URL=https://oracle-jedi.vercel.app \
  -e DEMO_OFFICE_DOMAIN=maplestreettax.site \
  avaran-backend
sleep 3
curl -s http://127.0.0.1:8080/api/health
```

Expect `"ok":true` and, under `configured`, `supabaseUrl`, `supabaseServiceRole`, `tavily`, `exa` and `serverSecret` all `true`, plus `"schema":true,"bucket":true`. If a flag is `false`, a key is missing in `/etc/avaran.env`: fix it with `sudo nano /etc/avaran.env`, then `sudo docker restart avaran-api`. Logs: `sudo docker logs avaran-api`.

## 8. HTTPS with Caddy

```bash
sudo mkdir -p /etc/caddy
printf 'api.maplestreettax.site {\n  reverse_proxy 127.0.0.1:8080\n}\n' | sudo tee /etc/caddy/Caddyfile
sudo docker run -d --name caddy --restart unless-stopped --network host \
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data \
  caddy:2
sleep 15
curl -s https://api.maplestreettax.site/api/health
```

The same health JSON must come back over **https**. If it fails: `sudo docker logs caddy`. The usual causes are the DNS record not matching yet (step 3), the Cloudflare cloud being orange, or ports 80/443 missing in the security group (step 1).

From your laptop, check that only your website is allowed to call it:

```powershell
curl.exe -s -i -X OPTIONS -H "Origin: https://oracle-jedi.vercel.app" -H "Access-Control-Request-Method: POST" https://api.maplestreettax.site/api/check
```
Look for `access-control-allow-origin: https://oracle-jedi.vercel.app`.

## 9. Point the website at it

1. Commit and push `frontend/vercel.json` (it now allows `https://api.maplestreettax.site` in `connect-src`).
2. Vercel → project `oracle-jedi` → **Settings** → **Environment Variables**:
   - `VITE_API_BASE_URL` = `https://api.maplestreettax.site/api`
   - `VITE_APP_URL` = `https://oracle-jedi.vercel.app`
3. **Redeploy**. Open the site: the footer must say **API online**.

`API_BASE` for the extension build is `https://api.maplestreettax.site/api`.

## Updating later (new code)

```bash
cd ~/Oracle-Jedi && git pull
sudo docker build -t avaran-backend .
sudo docker rm -f avaran-api
```
then run the step 7 `docker run` command again. A config change only needs `sudo docker restart avaran-api`.

## After the event

EC2 → Instances → `avaran-api` → **Instance state** → **Terminate**. EC2 → Elastic IPs → **Release** the address (an unattached one is billed). Delete the `api` DNS record in Cloudflare. Rotate the Supabase service-role, Tavily and Exa keys.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Console shows "not authorized" | The region selector isn't on **us-east-2** |
| `ssh` says permission denied (publickey) | Wrong key file, or the user isn't `ec2-user` |
| `ssh` times out | Security group SSH rule isn't your current IP: edit it to **My IP** again |
| Docker build killed or "no space left" | Instance is t3.micro or the disk is 8 GiB: use t3.small and 20 GiB |
| Health shows a flag `false` | Missing line in `/etc/avaran.env` (step 6), then `sudo docker restart avaran-api` |
| Browser: blocked by CORS | `ALLOWED_ORIGINS` isn't exactly `https://oracle-jedi.vercel.app` (no slash): re-run step 7 |
| Browser: refused by Content Security Policy | `frontend/vercel.json` change not pushed and redeployed (step 9) |
