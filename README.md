# Demo – Customer Database

[![Node.js 20](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](#)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
[![Deployed on Cloud Run](https://img.shields.io/badge/Deployed%20on-Cloud%20Run-4285F4?logo=googlecloud&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

> A compact full-stack demo that manages customers with **session login**, **client+server validation**, and a **1-command Cloud Run deploy**. Inactive customers automatically sink to the bottom for cleaner ops.

**Live Demo:** https://customer-database-273912255588.us-west1.run.app  
**Repository:** https://github.com/JustisDutt/Customer-Database

---

## Features

- 🔐 **Single-user auth** with session cookies (`express-session`) and password hashing (`bcrypt`)
- 🧾 **CRUD** for customers (name, email, phone, address, status)
- ✅ **Validation** on client **and** server
- ⬇️ **Inactive customers sink** to the bottom of the table
- 🚀 **One command** deploy to **Cloud Run** (buildpacks → Cloud Build → Artifact Registry → Cloud Run)
- 🗂️ Simple frontend: a single `public/index.html` calling JSON endpoints

---

## Architecture

Browser (HTML/CSS/JS)  
  |  
  v  
Express (Node.js 20) — session cookie auth → express-session  
                       ↳ bcrypt  
  v  
SQLite (local dev) ← Cloud Run writes DB at **/tmp** (ephemeral)  
  |  
  v  
Cloud Build → Artifact Registry → Cloud Run (HTTPS, scale-to-zero)

---

## Tech Stack

- **Backend:** Node.js 20, Express, express-session, bcrypt, dotenv, morgan, cors  
- **DB:** SQLite (local) / `/tmp` on Cloud Run via `DB_PATH`  
- **Frontend:** Plain HTML/CSS/JS (no framework)  
- **Infra:** Google Cloud Run, Cloud Build, Artifact Registry

---

## Quickstart — Local

### Prereqs
- Node.js 20+
- Git
- (Windows) PowerShell

### Install
    git clone https://github.com/yourname/customer-database
    cd customer-database
    npm install

### Configure env
Create a `.env` at the project root:

| Key              | Example                  | Notes                                |
|------------------|--------------------------|--------------------------------------|
| `SESSION_SECRET` | `a_long_random_hex`      | Signs session cookies                |
| `ADMIN_EMAIL`    | `you@example.com`        | Seeded admin on first run            |
| `ADMIN_PASSWORD` | `superstrong123`         | Seeded admin on first run            |
| `COOKIE_SECURE`  | `false`                  | `false` locally; `true` on Cloud Run |
| `DEMO_MODE`      | `false`                  | If `true`, enables Demo Login        |

Generate a random secret:
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

### Run
    npm run dev     # nodemon
    # or
    npm start       # node server.js

Open http://localhost:3000, log in with the admin you configured, and add a customer.

---

## Quickstart — Cloud Run (no Dockerfile)

> The app writes SQLite to **`/tmp`** on Cloud Run. That disk is **ephemeral**: redeploys/scale-to-zero will reset data. For production, migrate to Cloud SQL/Firestore.

### Enable + auth
    gcloud auth login
    gcloud config set project <YOUR_PROJECT_ID>
    gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

### Deploy (PowerShell-safe envs)
> **Important:** Cloud Run expects envs as a comma-separated list with **no spaces**. On Windows, build the list first:
    $envList = @(
      "SESSION_SECRET=<YOUR_RANDOM_HEX>",
      "ADMIN_EMAIL=demo@example.com",
      "ADMIN_PASSWORD=demo123",
      "COOKIE_SECURE=true",
      "DB_PATH=/tmp/barons.sqlite",
      "DEMO_MODE=true"    # optional: enables one-click Demo Login
    ) -join ","

    gcloud run deploy customer-database `
      --source . `
      --region us-west1 `
      --allow-unauthenticated `
      --set-env-vars $envList

After it finishes, open the printed **Service URL**.  
**Demo mode on?** Click **Demo Login**. Otherwise use your admin email/password.

### Verify / troubleshoot envs
    # Show envs (each should be its own row)
    gcloud run services describe customer-database --region us-west1 `
      --format="table(spec.template.spec.containers[].env[].name,spec.template.spec.containers[].env[].value)"

    # Route traffic to latest revision (if in doubt)
    gcloud run services update-traffic customer-database --region us-west1 --to-latest

    # Recent logs
    gcloud run services logs read customer-database --region us-west1 --limit=100

---

## API Reference

> All endpoints require an authenticated session (log in first). When `DEMO_MODE=true`, you can log in without a password via `/auth/demo`.

### Auth
| Method | Path          | Body                               | 200 Response                         |
|------:|----------------|------------------------------------|--------------------------------------|
| POST  | `/auth/login`  | `{ "email": "", "password": "" }`  | `{ "email": "..." }`                 |
| POST  | `/auth/logout` | —                                  | `{ "ok": true }`                     |
| GET   | `/me`          | —                                  | `{ "email": "..." }`                 |
| POST  | `/auth/demo`   | — *(when `DEMO_MODE=true`)*        | `{ "email": "...", "demo": true }`   |

### Customers
| Method | Path            | Body (JSON)                                            | 200 Response        |
|------:|------------------|--------------------------------------------------------|---------------------|
| GET   | `/clients`       | —                                                      | `[ { ...client } ]` |
| POST  | `/clients`       | `{ name, email?, phone?, address?, status? }`         | `{ id }`            |
| GET   | `/clients/:id`   | —                                                      | `{ ...client }`     |
| PUT   | `/clients/:id`   | Any subset of fields above                             | `{ updated: n }`    |
| DELETE| `/clients/:id`   | —                                                      | `{ deleted: n }`    |

**cURL demo (PowerShell):**
    # Login and save cookie
    curl -X POST https://customer-database-273912255588.us-west1.run.app/auth/login `
      -H "Content-Type: application/json" `
      -d '{ "email":"demo@example.com","password":"demo123" }' `
      -c cookies.txt

    # Add a customer
    curl -X POST https://customer-database-273912255588.us-west1.run.app/clients `
      -H "Content-Type: application/json" -b cookies.txt `
      -d '{ "name":"Acme Co", "email":"ops@acme.com", "phone":"209-555-1212", "address":"123 Main", "status":"active" }'

---

## Security Notes

- Session cookies are signed with `SESSION_SECRET`. Rotating the secret logs everyone out (expected).
- Use `COOKIE_SECURE=true` on Cloud Run (HTTPS) and `false` locally.
- Inputs are validated (email/phone regex, required `name`, length checks). Extend as needed for production.

---

## Troubleshooting

- **Can’t log in on Cloud Run:** Check the env table. If rows are “glued together,” you likely missed commas in `--set-env-vars`. Re-run using the `$envList` trick above.

- **Seeded wrong admin:** Logs show: `Seeded admin user: ...`. Redeploy/update envs with your desired `ADMIN_EMAIL`/`ADMIN_PASSWORD`, then `--to-latest`.

- **`SQLITE_CANTOPEN` on Cloud Run:** You must set `DB_PATH=/tmp/barons.sqlite`.

- **401 / “Please sign in.”:** Ensure the browser is sending the session cookie; on Cloud Run, `COOKIE_SECURE` must be `true`.

- **Port issues:** Server must listen on `process.env.PORT` (Cloud Run sets it).

---

## Roadmap

- Persist to **Cloud SQL** or **Firestore** (production-ready storage)  
- Role-based auth (admin/viewer)  
- Search & pagination  
- CSV import/export  
- Dockerfile (optional path), CI  
- Tests + seed sample data  
- “Reset demo data” endpoint (admin-only in demo mode)

---

## Development Notes

- The server seeds a single admin user on boot using `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Email match is case-sensitive as written; you can normalize to lowercase on seed+login if desired.
- Express-Session’s default MemoryStore is fine for demos; use Redis/Memorystore for prod.

---

## Screenshots (suggested)

- `screenshot-login.png` — the login card  
- `screenshot-table.png` — customer table with an “inactive” row at bottom  
- `screenshot-edit.png` — edit prompts in action  
- `screenshot-cloudrun-url.png` — service URL open in the browser  

---

## .gitignore

    node_modules/
    .env
    barons.sqlite
    *.sqlite*
    logs/
    *.log
    .DS_Store
    .vscode/

---

## License (MIT)

    MIT License

    Copyright (c) 2025 <Your Name>

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.


