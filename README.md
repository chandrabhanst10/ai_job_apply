# JobPilot

Free, AI-assisted job applying. Reads your resume, scores job URLs, applies at score ≥ 70, emails you the successes. Runs daily on GitHub Actions. Cost: ₹0.

## 1. Free keys
- **Gemini:** aistudio.google.com/apikey → Create API key (free tier, no card).
- **Gmail app password:** enable 2-Step Verification → myaccount.google.com/apppasswords → create → copy the 16 chars.

## 2. Setup (use a PRIVATE repo — it contains your resume)
1. Put your resume at `resume/resume.pdf`; edit `config/settings.json` (set `currentSalary`).
2. Push to a private GitHub repo.
3. Repo → Settings → Secrets and variables → Actions → add `GEMINI_API_KEY`, `SMTP_USER` (your Gmail), `SMTP_PASS` (app password).
4. Repo → Settings → Actions → General → Workflow permissions → **Read and write**.

## 3. Add jobs
Edit `jobs.txt` on GitHub, one URL per line. Runs daily 08:30 IST, or Actions → apply → Run workflow (tick *dry_run* first to test: fills forms, submits nothing).

## Local
```bash
npm i && npx playwright install chromium
cp .env.example .env
DRY_RUN=1 npm run apply   # safe test
npm run apply
npm test
```

## Rules
- Resume is the only source of facts. Parsed once per run via Gemini (`GEMINI_MODEL` to change model); limit 10 calls/min, retries on 429.
- Gemini down/out of quota → nothing is applied that run (URLs stay in `jobs.txt` for the next run); never crashes. Form answers use fixed rules first, Gemini only for leftovers; unanswerable required questions → job skipped.
- Jobs outside `preferredCities` are skipped (remote/hybrid/unknown location pass).
- CAPTCHA / login / MFA → job skipped silently. Success = confirmation text detected.
- `applied.json` (URL hashes) prevents repeats; processed URLs leave `jobs.txt`; failed (no confirmation) stay for retry.
- One email per run, only when ≥1 success, to the address on your resume.
- Note: sites often block GitHub's datacenter IPs; those jobs get skipped.
