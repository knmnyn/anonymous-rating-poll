# Postdoc Hire Poll — Setup Guide

A privacy-preserving, multi-poll voting app hosted on GitHub Pages, backed by Google Sheets.

---

## Architecture Overview

| Component | Role |
|---|---|
| `vote.html?poll=TOKEN` | Voter-facing form — loads poll metadata, collects email + 1–9 rating |
| `manage-polls.html` | Superuser dashboard — create polls, copy obfuscated URLs, open/close polls |
| `view-results.html?poll=TOKEN` | Attribution page — reveal email behind each anonymous ID for a specific poll |
| `apps-script-backend.gs` | Apps Script backend — hashes emails, stores votes, manages poll registry |
| Google Sheets | Persistent storage: one `Votes_TOKEN` + `Summary_TOKEN` sheet per poll |

**Privacy model:** Voter emails are sent over HTTPS to Apps Script and immediately hashed with HMAC-SHA256 using a secret salt you control. Only the first 4 hex characters of the hash (e.g. `3F9A`) are stored. The raw email is never written anywhere. Charts and public results show only anonymous IDs.

**Multi-poll model:** Each poll is identified by an 8-character random hex token (e.g. `a3f8c2d1`). The vote URL is `vote.html?poll=a3f8c2d1`. Multiple polls can run simultaneously and be independently opened or closed from `manage-polls.html`.

---

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it **Postdoc Poll** (or any name you prefer).

---

## Step 2 — Set Up the Apps Script Backend

1. In your Google Sheet, click **Extensions → Apps Script**.
2. Delete any existing code and paste the entire contents of `apps-script-backend.gs`.
3. Set your secrets near the top of the file:

```javascript
var HMAC_SECRET   = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';
var SUPERUSER_KEY = 'REPLACE_WITH_A_STRONG_SUPERUSER_PASSWORD';
```

Generate strong values at [uuidgenerator.net](https://www.uuidgenerator.net/). **Keep these private — never commit them to a public repo.**

4. Click **Save** (Ctrl+S / Cmd+S).

---

## Step 3 — Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon → choose **Web App**.
3. Configure:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** and authorise when prompted.
5. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb…/exec
   ```

---

## Step 4 — Configure the Static Site

Open `poll-config.js` and paste your Web App URL:

```javascript
window.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb…/exec';
```

---

## Step 5 — Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Initial poll setup"
git remote add origin https://github.com/YOUR_USERNAME/postdoc-poll.git
git push -u origin main
```

In GitHub: **Settings → Pages → Source → Deploy from branch → main → / (root) → Save**.

Your site will be live at `https://YOUR_USERNAME.github.io/postdoc-poll/`.

> **Security note:** `poll-config.js` contains your Apps Script URL but **not** your `HMAC_SECRET` or `SUPERUSER_KEY`. It is safe to commit to a public repo.

---

## Step 6 — Create Your First Poll

1. Open `https://YOUR_USERNAME.github.io/postdoc-poll/manage-polls.html`
2. Enter your Apps Script URL and Superuser Key → click **Connect**.
3. Click **+ New Poll**, fill in the title and candidate name, click **Create Poll**.
4. The poll card shows two URLs:
   - **Vote URL** — share this with committee members (e.g. `vote.html?poll=a3f8c2d1`)
   - **Admin URL** — for attribution (e.g. `view-results.html?poll=a3f8c2d1`)
5. Use **Close Poll** / **Reopen Poll** buttons to control voting access.

You can create as many polls as needed — each runs independently with its own token and vote sheet.

---

## Step 7 — Build the Results Chart in Google Sheets

1. In the Apps Script editor, set `CHART_POLL_TOKEN` to your poll's token:
   ```javascript
   var CHART_POLL_TOKEN = 'a3f8c2d1';
   ```
2. Select the function **`createChartForPoll`** from the dropdown and click **Run**.
3. A bar chart appears on the `Summary_a3f8c2d1` sheet, auto-updating with each new vote.

---

## Step 8 — Embed the Chart in Slack

1. In Google Sheets, click the `Summary_TOKEN` tab.
2. Click the chart → **⋮ → Publish chart**.
3. Choose **Interactive** format → **Publish** → copy the URL.
4. Paste the URL into your private Slack channel — Slack unfurls it as a live chart.

> The chart URL is publicly accessible to anyone with the link. Do not share outside your committee if vote counts are sensitive.

---

## Step 9 — Attribute Votes (Admin)

1. Open `view-results.html?poll=TOKEN` (or click the Admin URL in `manage-polls.html`).
2. Enter your Apps Script URL, Superuser Key, and poll token.
3. Paste known voter emails (one per line).
4. Click **Fetch Results** — the table matches anonymous IDs to emails where possible.
5. Use **Export CSV** to download the full attributed table.

---

## Re-deploying After Code Changes

If you edit `apps-script-backend.gs`, create a new deployment version:

1. Apps Script editor → **Deploy → Manage deployments**.
2. Click the pencil icon → version: **"New version"** → **Deploy**.
3. The Web App URL stays the same.

---

## File Reference

| File | Description |
|---|---|
| `vote.html` | Voter-facing poll form (reads `?poll=TOKEN` from URL) |
| `manage-polls.html` | Superuser poll management dashboard |
| `view-results.html` | Superuser vote attribution dashboard |
| `poll-config.js` | Site configuration (Apps Script URL) |
| `apps-script-backend.gs` | Google Apps Script backend |
| `SETUP.md` | This file |
