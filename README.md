# The Pizza Box NY — Staff Scheduler

A 7shifts-style scheduling app for The Pizza Box NY on Bleecker Street.

## Features
- Staff signup with name, availability, and 4-digit PIN
- Pending approval flow — manager assigns role + rate on approval
- Weekly schedule builder (manager grid view)
- Labor cost tracking with manual sales input and labor % calculation
- Shift swap requests with manager approval
- Staff see only their own schedule

## Roles
FOH · BOH · FOH Assist · BOH Assist

## Hours
- Monday: Closed
- Tue–Thu: 11am–10pm
- Fri–Sat: 11am–midnight
- Sunday: 11am–9pm

## Setup

```bash
npm install
npm start
```

## Environment Variables (Railway)

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | Server port (Railway sets this automatically) |
| `MANAGER_PIN` | `0000` | Manager login PIN — **change this in Railway** |

## Deploy to Railway

1. Push this repo to GitHub
2. Create new Railway project → Deploy from GitHub repo
3. Add environment variable: `MANAGER_PIN` = your chosen PIN
4. Done — Railway auto-detects Node.js and deploys

## Data

All data is stored in `data/db.json`. On Railway, this persists within a deployment but resets on redeploy. For production persistence, consider adding a Railway Volume or migrating to a database.
