# Anonymous Rating Poll — Setup Guide

A privacy-preserving, multi-poll anonymous rating app hosted on GitHub Pages, backed by Google Sheets and Google Apps Script.

---

## Architecture Overview

| Component | Role |
|---|---|
| `vote.html?poll=TOKEN` | Voter-facing form — loads poll metadata, collects email + 1–9 rating + comment |
| `manage-polls.html` | Superuser dashboard — create polls, copy obfuscated URLs, open/close polls |
| `view-results.html?poll=TOKEN` | Attribution page — reveal the email behind each anonymous ID for a specific poll |
| `apps-script-backend.gs` | Apps Script backend — hashes emails server-side, stores votes, manages poll registry |
| Google Sheets | Persistent storage: one `Votes_TOKEN` + `Summary_TOKEN` sheet per poll |

**Privacy model:** Voter emails are sent over HTTPS to Apps Script and immediately hashed with HMAC-SHA256 using a secret salt you control. Only the first 4 hex characters of the hash (e.g. `3F9A`) are stored. The raw email is **never written anywhere**. Charts and public results show only anonymous IDs.

**Multi-poll model:** Each poll is identified by an 8-character random hex token (e.g. `a3f8c2d1`). Multiple polls can run simultaneously and be independently opened or closed from `manage-polls.html`.

> **If you are signed into multiple Google accounts**, read the [Multiple Google Accounts](TROUBLESHOOTING.md#multiple-google-accounts) section in `TROUBLESHOOTING.md` before proceeding. Account mismatch is the most common cause of setup errors.

---

## Step 1 — Create the Google Sheet

1. Sign in to the **one Google account** you will use for this entire setup (see above note).
2. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
3. Name it **Anonymous Rating Poll** (or any name you prefer).

---

## Step 2 — Set Up the Apps Script Backend

1. In your Google Sheet, click **Extensions → Apps Script**.
2. Confirm the account shown in the Apps Script editor top-right matches the account that owns the sheet.
3. Delete any existing code in the editor and paste the entire contents of `apps-script-backend.gs`.
4. Set your secrets near the top of the file:

```javascript
var HMAC_SECRET   = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';
var SUPERUSER_KEY = 'REPLACE_WITH_A_STRONG_SUPERUSER_PASSWORD';
```

Generate strong values at [uuidgenerator.net](https://www.uuidgenerator.net/). **Keep these private — never commit them to a public repo.**

5. Click **Save** (Ctrl+S / Cmd+S).

---

## Step 3 — Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the **gear icon** next to "Select type" → choose **Web App**.
3. Configure:
   - **Description:** e.g. `v1`
   - **Execute as:** Me *(the account currently signed in)*
   - **Who has access:** Anyone
4. Click **Deploy**.
5. When the OAuth consent screen appears, click **Authorise access**. If you see a **"Google hasn't verified this app"** warning, see [Authorising the Script](TROUBLESHOOTING.md#authorising-the-script-oauth-consent-screen) in `TROUBLESHOOTING.md`.
6. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb…/exec
   ```
7. Verify the deployment by opening the URL in an **Incognito / Private window**. You should see the API index page with no login prompt. If you see a 400 error instead, see [400 Bad Request After Deploying](TROUBLESHOOTING.md#400-bad-request-after-deploying).

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
git remote add origin https://github.com/YOUR_USERNAME/anonymous-rating-poll.git
git push -u origin main
```

In GitHub: **Settings → Pages → Source → Deploy from branch → main → / (root) → Save**.

Your site will be live at `https://YOUR_USERNAME.github.io/anonymous-rating-poll/`.

> **Security note:** `poll-config.js` contains your Apps Script URL but **not** your `HMAC_SECRET` or `SUPERUSER_KEY`. It is safe to commit to a public repo.

---

## Step 6 — Create Your First Poll

1. Open `https://YOUR_USERNAME.github.io/anonymous-rating-poll/manage-polls.html`
2. Enter your Apps Script URL and Superuser Key → click **Connect**.
3. Click **+ New Poll**, fill in the title, subject, and scale anchors, then click **Create Poll**.
4. The poll card shows two URLs:
   - **Vote URL** — share this with voters (e.g. `vote.html?poll=a3f8c2d1`)
   - **Admin URL** — for attribution (e.g. `view-results.html?poll=a3f8c2d1`)
5. Use **Close Poll** / **Reopen Poll** buttons to control voting access at any time.

You can create as many polls as needed — each runs independently with its own token and vote sheet.

---

## Step 7 — Build the Results Chart in Google Sheets

1. In the Apps Script editor, set `CHART_POLL_TOKEN` to your poll's token:
   ```javascript
   var CHART_POLL_TOKEN = 'a3f8c2d1';
   ```
2. Select the function **`createChartForPoll`** from the function dropdown and click **Run**.
3. A bar chart appears on the `Summary_a3f8c2d1` sheet and auto-updates with each new vote.

---

## Step 8 — Embed the Chart in Slack

1. In Google Sheets, click the `Summary_TOKEN` tab.
2. Click the chart → **⋮ (three dots) → Publish chart**.
3. Choose **Interactive** format → **Publish** → copy the URL.
4. Paste the URL into your private Slack channel — Slack unfurls it as a live embedded chart.

> The published chart URL is accessible to anyone with the link. Do not share it outside your intended audience if vote counts are sensitive.

---

## Step 9 — Attribute Votes (Admin)

1. Open `view-results.html?poll=TOKEN` (or click the Admin URL in `manage-polls.html`).
2. Enter your Apps Script URL, Superuser Key, and poll token.
3. Paste known voter emails (one per line) into the attribution box.
4. Click **Fetch Results** — the table matches anonymous IDs to emails where possible.
5. Use **Export CSV** to download the full attributed table.

---

## Re-deploying After Code Changes

If you edit `apps-script-backend.gs`, you must publish a new version for changes to take effect. See [Re-deploying After Code Changes](TROUBLESHOOTING.md#re-deploying-after-code-changes) in `TROUBLESHOOTING.md`.

---

## File Reference

| File | Description |
|---|---|
| `vote.html` | Voter-facing poll form (reads `?poll=TOKEN` from URL) |
| `manage-polls.html` | Superuser poll management dashboard |
| `view-results.html` | Superuser vote attribution dashboard |
| `poll-config.js` | Site configuration (Apps Script URL only) |
| `apps-script-backend.gs` | Google Apps Script backend (paste into Apps Script editor) |
| `README.md` | This file |
| `TROUBLESHOOTING.md` | Solutions for common setup and runtime errors |
