# Troubleshooting

---

## Multiple Google Accounts

This is the most common source of setup errors. If you are signed into more than one Google account in your browser (e.g. a personal Gmail and a work Google Workspace account), you must keep everything on the **same account** throughout setup. Mixing accounts causes authorisation errors, unexpected permission prompts, and 400 Bad Request responses.

### Choose one account before you begin

Pick a single Google account and use it exclusively for all of the following:

- Creating the Google Sheet
- Opening the Apps Script editor
- Authorising and deploying the Web App
- Testing the deployed Web App URL

### Identifying your active account

When you open [sheets.google.com](https://sheets.google.com) or [script.google.com](https://script.google.com), check the account avatar in the top-right corner. If it shows the wrong account, click the avatar → **Switch account** before proceeding.

### Deploying from the correct account

The Web App runs **as the account that is signed in to the Apps Script editor at the moment of deployment**. If you later open the Web App URL in a browser tab where a different account is active, you may see a "You do not have permission" error even though the deployment is set to *Anyone*.

To avoid this:

1. Before clicking **Deploy**, confirm the account shown in the Apps Script editor top-right is the intended one.
2. After deploying, open the Web App URL in an **Incognito / Private window** (no signed-in accounts) to verify it loads correctly without a login prompt.

### Authorising the script (OAuth consent screen)

The first time you deploy, Google will ask you to authorise the script to access your spreadsheet. You may see a warning that reads **"Google hasn't verified this app"**. This is expected for personal scripts and is safe to proceed through.

1. Click **Advanced** (bottom-left of the warning screen).
2. Click **Go to [your project name] (unsafe)**.
3. Review the permissions (read/write access to your spreadsheets) → click **Allow**.

This authorisation is tied to the account you are signed in as at that moment. If you later switch accounts and re-deploy, you will need to re-authorise.

---

## 400 Bad Request After Deploying

A 400 error when calling the Web App almost always has one of three causes:

| Cause | Fix |
|---|---|
| **Wrong Google account in browser** | Open the Web App URL in an Incognito window. If it works there, the issue is an account mismatch in your main browser. Switch to the account that owns the Sheet and Script, then try again. |
| **Stale deployment** | After editing `apps-script-backend.gs`, you must publish a **new version** (Deploy → Manage deployments → pencil icon → New version → Deploy). Changes to the script do not take effect until a new version is deployed. |
| **Script not re-authorised after account switch** | Go to Deploy → Manage deployments, delete the existing deployment, and create a fresh one while signed in to the correct account. Re-authorise when prompted. |

---

## "This app isn't verified" Warning

This warning appears because the Apps Script project has not been submitted to Google for OAuth verification. It is normal for private, internal tools.

To proceed: click **Advanced → Go to [project name] (unsafe) → Allow**.

The script only requests access to the spreadsheet it is attached to. No data leaves Google's infrastructure except via the Web App endpoint you control.

---

## Poll Not Found / Token Errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `Poll not found` on `vote.html` | The `?poll=TOKEN` parameter is missing or incorrect | Use the Vote URL copied from `manage-polls.html` exactly as shown |
| `Poll not found` on `view-results.html` | Wrong poll token entered | Check the token in `manage-polls.html` and re-enter it |
| Poll loads but shows as closed | The poll was closed in `manage-polls.html` | Click **Reopen Poll** in the manager |

---

## Votes Not Appearing in the Sheet

1. Confirm the Web App URL in `poll-config.js` is correct and ends in `/exec` (not `/dev`).
2. Open the Web App URL directly in an Incognito window — if it shows the API index page, the script is running correctly.
3. Check the `Votes_TOKEN` sheet in Google Sheets for the relevant poll token. Votes are appended in real time.
4. If the sheet is missing, run `createPoll` again from `manage-polls.html` — this recreates the vote sheet without affecting existing polls.

---

## Chart Not Updating

The `Summary_TOKEN` sheet is refreshed automatically every time a vote is submitted. If the published chart appears stale:

1. In Google Sheets, click the `Summary_TOKEN` tab and verify the **Count** column values are current.
2. If counts are correct but the published chart is not updating, unpublish and republish the chart (chart → ⋮ → Publish chart → Stop publishing → republish).
3. Slack caches link previews. To force a refresh, remove the message and re-paste the chart URL.

---

## Re-deploying After Code Changes

Edits to `apps-script-backend.gs` do **not** take effect automatically. You must publish a new version:

1. Apps Script editor → **Deploy → Manage deployments**.
2. Click the **pencil (edit) icon** on your existing deployment.
3. Under Version, select **"New version"** → click **Deploy**.
4. The Web App URL remains the same — no changes needed in `poll-config.js`.
