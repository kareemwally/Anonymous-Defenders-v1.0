# Anonymous Defenders — Backend API

A malware analysis platform that lets users upload files (executables, archives, scripts) and receive static analysis reports powered by a PyTorch AI model. Supports guest access, registered users, subscription plans, team accounts, and a programmatic API key system.

**Production:** `https://anonymousdefenders.com`  
**Frontend:** `https://anonymous-defenders.vercel.app`  
**API Docs:** [`docs/API.md`](docs/API.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [Subscription Plans](#subscription-plans)
5. [Local Development](#local-development)
6. [Environment Variables](#environment-variables)
7. [Deployment](#deployment)
8. [API Overview](#api-overview)
9. [Project Structure](#project-structure)

---

## Architecture

```
Browser / API Client
        │
        ▼
   AWS ALB (HTTPS)
        │
        ▼
  ECS Fargate Task  ──── MongoDB Atlas (DB)
  (Node.js / Express)
        │
        ├── Paymob API (payments)
        ├── Google / GitHub OAuth
        ├── Nodemailer → Gmail SMTP
        └── AWS SageMaker Endpoint (AI inference)
                └── anonymous-endpoint-v1
                    └── PyTorch 2.1 (ml.g4dn.xlarge)
```

CI/CD is handled by GitHub Actions: on every push to `main`, the workflow builds a Docker image, pushes it to ECR, injects secrets via `jq`, and deploys a new ECS task revision.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, Express 5 |
| Database | MongoDB Atlas (Mongoose) |
| Auth | JWT, Passport.js (Google OAuth 2.0, GitHub OAuth) |
| Payments | Paymob (card + mobile wallet, HMAC-SHA512 webhook) |
| AI Inference | AWS SageMaker (PyTorch 2.1, GPU) |
| Static Analysis | Python 3 scripts (PE parsing, entropy, hashing, ssdeep) |
| Infrastructure | AWS ECS Fargate, ECR, ALB, CloudWatch |
| CI/CD | GitHub Actions |
| Container | Docker (non-root `node` user) |

---

## Features

- **Guest analysis** — up to 3 uploads/day, IP-based, no account required
- **Registered users** — persistent upload history, monthly quota, OAuth login
- **Subscription tiers** — 4 paid plans (A/B/C/D) with increasing upload quotas
- **Team accounts** — Plan C/D owners can invite members who share the subscription
- **API key access** — programmatic file uploads with per-key rate limits
- **Archive support** — ZIP, RAR, 7z with optional password; each extracted file counted individually
- **Duplicate detection** — MD5 hash deduplication per user; cached report returned instantly
- **AI reports** — predictions for file verdict (Malicious/Benign) and malware family classification
- **Security** — Helmet headers, global rate limiting, auth brute-force protection, HMAC webhook verification

---

## Subscription Plans

| Plan | Uploads / Month | API Keys | Requests / Day | Price (EGP) |
|---|---|---|---|---|
| Free | 3 / day | 0 | — | 0 |
| A | 10 | 2 | 50 | 300 |
| B | 25 | 5 | 150 | 600 |
| C | 50 + team (5 members) | 10 | 300 | 1,200 |
| D | 100 + team (10 members) | 20 | 500 | 2,400 |

Payments are processed via Paymob (card or mobile wallet). Subscriptions are activated automatically via a signed webhook after successful payment.

---

## Local Development

### Prerequisites

- Node.js 20+
- Python 3.10+ with `venv`
- MongoDB (local or Atlas connection string)
- `libfuzzy-dev` for ssdeep (Linux/macOS) or see Dockerfile for apt packages

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/kareemwally/Anonymous-Defenders-v1.0.git
cd Anonymous-Defenders-v1.0

# 2. Install Node dependencies
npm install

# 3. Set up Python virtual environment
python3 -m venv .venv
.venv/bin/pip install -r py-scripts/requirements.txt
.venv/bin/pip install -r py-scripts/requirements-extra.txt

# 4. Create config.env (see Environment Variables section)
cp config.env.example config.env   # edit with your values

# 5. Start the server
npm start
# or for auto-reload during development:
npx nodemon index2.js
```

The server starts on `http://localhost:3000`.

---

## Environment Variables

Create a `config.env` file in the project root (never committed — listed in `.gitignore`).

| Variable | Required | Description |
|---|---|---|
| `DB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens (min 64 chars) |
| `SESSION_SECRET` | Yes | Secret for express-session (min 64 chars, **must differ from JWT_SECRET**) |
| `EMAIL_HOST` | Yes | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | Yes | SMTP port (e.g. `587`) |
| `EMAIL_USER` | Yes | SMTP sender address |
| `EMAIL_PASS` | Yes | SMTP app password |
| `SUPPORT_EMAIL` | Yes | Address shown in complaint confirmations |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth client secret |
| `OAUTH_CALLBACK_BASE` | Yes | Base URL for OAuth callbacks (e.g. `https://anonymousdefenders.com`) |
| `FRONTEND_URL` | Yes | Frontend origin for CORS and redirects |
| `PAYMOB_API_KEY` | Yes | Paymob API key (base64 JWT) |
| `PAYMOB_CARD_INTEGRATION_ID` | Yes | Paymob card integration ID |
| `PAYMOB_WALLET_INTEGRATION_ID` | Yes | Paymob wallet integration ID |
| `PAYMOB_HMAC_SECRET` | Yes | Paymob HMAC secret for webhook verification |
| `PAYMOB_IFRAME_ID` | Yes | Paymob hosted iframe ID |
| `AI_SERVER_URL` | Yes* | External AI server URL (used when not on SageMaker) |
| `AI_MODEL_TOKEN` | Yes* | Bearer token for the external AI server |
| `PLOTS_BASE_URL` | No | Base URL for serving analysis plot images |
| `FREE_PLAN_DAILY_LIMIT` | No | Daily upload limit for free users (default: `3`) |
| `PLAN_A_DAILY_LIMIT` … `PLAN_D_DAILY_LIMIT` | No | Monthly quotas per plan |
| `PLAN_A_MONTHLY_PRICE` … `PLAN_D_MONTHLY_PRICE` | No | Plan prices in EGP |

> In production, all secrets are stored in **GitHub Secrets** and injected into the ECS task definition at deploy time — they are never written to any file in the repository.

---

## Deployment

Deployment is fully automated via GitHub Actions on push to `main`.

### Pipeline (`deploy-ecs-complete.yml`)

1. Build Docker image and push to ECR
2. Install `jq` and inject secrets from GitHub Secrets into `ecs-task-definition-simple.json`
3. Register a new ECS task definition revision
4. Deploy to ECS service and wait for stability

### Required GitHub Secrets

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
DB_URI
JWT_SECRET
SESSION_SECRET
EMAIL_PASS
PAYMOB_API_KEY
PAYMOB_HMAC_SECRET
GOOGLE_CLIENT_SECRET
GH_CLIENT_SECRET          ← Note: GitHub blocks GITHUB_ prefix
AI_MODEL_TOKEN
```

### Manual deploy check

```bash
# Check running ECS tasks
aws ecs list-tasks --cluster anonymous-defenders --region us-east-1

# Check service health
aws ecs describe-services \
  --cluster anonymous-defenders \
  --services anonymous-defenders-service \
  --region us-east-1 \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount}'
```

---

## API Overview

Full documentation with request/response examples is in [`docs/API.md`](docs/API.md).

| Group | Base Path | Auth |
|---|---|---|
| Authentication | `/auth` | None / JWT |
| File Upload & Analysis | `/api/upload` | Optional JWT |
| Guest | `/api/guest` | None (IP-based) |
| Subscriptions | `/api/subscriptions` | JWT |
| API Keys | `/api/keys` | JWT |
| Programmatic API | `/api/v1` | API Key |
| Teams | `/api/teams` | JWT |
| Complaints | `/complaints` | None / JWT |
| Health | `/health` | None |

A [Hoppscotch collection](docs/hoppscotch-collection.json) is included for quick endpoint testing.

---

## Project Structure

```
.
├── index2.js                        # Entry point — Express app setup
├── Dockerfile                       # Production container (non-root node user)
├── ecs-task-definition-simple.json  # ECS task definition template (no secrets)
├── config/
│   ├── db.js                        # MongoDB connection
│   └── passport.js                  # Google & GitHub OAuth strategies
├── routes/
│   ├── auth.js                      # /auth — login, signup, OAuth
│   ├── upload.js                    # /api/upload — file analysis
│   ├── guest.js                     # /api/guest — guest quota
│   ├── subscription.js              # /api/subscriptions — plans & payments
│   ├── apiKeys.js                   # /api/keys — API key management
│   ├── apiUpload.js                 # /api/v1 — programmatic access
│   ├── team.js                      # /api/teams — team management
│   ├── complaints.js                # /complaints — feedback
│   └── health.js                    # /health — load balancer check
├── controllers/
│   ├── authController.js
│   ├── uploadController.js
│   └── complaintController.js
├── middleware/
│   ├── auth.js                      # JWT verification (required)
│   ├── optionalAuth.js              # JWT verification (optional) + quota reset
│   ├── apiKeyAuth.js                # API key verification
│   └── guestAbuse.js               # IP-based guest tracking
├── models/
│   ├── User.js
│   ├── File.js
│   ├── AnalysisReport.js
│   ├── ApiKey.js
│   ├── Payment.js
│   └── Team.js
├── services/
│   └── payment.js                   # Paymob integration (auth, orders, webhooks)
├── helpers/
│   ├── sendToAIModel.js             # AI model HTTP client
│   ├── runPythonScript.js           # Python subprocess runner
│   └── isFileSizeSuitable.js        # File size gate for AI analysis
├── py-scripts/                      # Python static analysis scripts
│   ├── static_malware_analyzer.py
│   ├── get-hashes.py
│   ├── requirements.txt
│   └── requirements-extra.txt
├── docs/
│   ├── API.md                       # Full API reference
│   └── hoppscotch-collection.json
└── .github/
    └── workflows/
        └── deploy-ecs-complete.yml  # CI/CD pipeline
```
