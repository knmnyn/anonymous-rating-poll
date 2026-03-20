// ═══════════════════════════════════════════════════════════════════════════════
// Anonymous Rating Poll — Google Apps Script Backend
// ═══════════════════════════════════════════════════════════════════════════════
//
// QUICK SETUP (full details in SETUP.md):
//   1. Google Sheet → Extensions → Apps Script → paste this file
//   2. Set HMAC_SECRET and SUPERUSER_KEY below
//   3. Deploy → New deployment → Web App
//        Execute as: Me  |  Who has access: Anyone
//   4. Copy Web App URL → paste into config.js
//   5. Open manage.html to create your first poll
//
// PRIVACY MODEL:
//   • Raw email → HMAC-SHA256(email, HMAC_SECRET) → first 4 hex chars stored
//   • Superuser calls ?action=admin&key=…&poll=… to get attributed table
//
// POLL METADATA (Polls sheet columns):
//   Token | Title | Subject | Subtitle | Badge | Status | Created At |
//   Scale Low (1) | Scale Mid (5) | Scale High (9)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ⚙️  CONFIGURE THESE BEFORE DEPLOYING ────────────────────────────────────
var HMAC_SECRET   = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';
var SUPERUSER_KEY = 'REPLACE_WITH_A_STRONG_SUPERUSER_PASSWORD';
// ─────────────────────────────────────────────────────────────────────────────

var POLLS_SHEET = 'Polls';

// Column indices in the Polls sheet (0-based)
var COL = {
  TOKEN:      0,
  TITLE:      1,
  SUBJECT:    2,
  SUBTITLE:   3,
  BADGE:      4,
  STATUS:     5,
  CREATED_AT: 6,
  SCALE_LOW:  7,   // anchor for rating 1
  SCALE_MID:  8,   // anchor for rating 5
  SCALE_HIGH: 9    // anchor for rating 9
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
function doGet(e) {
  var p      = e.parameter;
  var action = (p.action || '').trim();

  if (action === 'vote')          return handleVote(p);
  if (action === 'pollInfo')      return handlePollInfo(p);
  if (action === 'results')       return handleResults(p);
  if (action === 'createPoll')    return handleCreatePoll(p);
  if (action === 'setPollStatus') return handleSetPollStatus(p);
  if (action === 'listPolls')     return handleListPolls(p);
  if (action === 'admin')         return handleAdmin(p);

  return HtmlService.createHtmlOutput(
    '<h2>Anonymous Rating Poll API ✅</h2>' +
    '<ul>' +
    '<li><code>?action=pollInfo&poll=TOKEN</code></li>' +
    '<li><code>?action=vote&poll=TOKEN&email=…&rating=…&comment=…</code></li>' +
    '<li><code>?action=results&poll=TOKEN</code></li>' +
    '<li><code>?action=createPoll&key=…&title=…&subject=…&subtitle=…&badge=…&scaleLow=…&scaleMid=…&scaleHigh=…</code></li>' +
    '<li><code>?action=setPollStatus&key=…&poll=TOKEN&status=open|closed</code></li>' +
    '<li><code>?action=listPolls&key=…</code></li>' +
    '<li><code>?action=admin&key=…&poll=TOKEN&emails=…</code></li>' +
    '</ul>'
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Poll metadata (includes rubric anchors)
// ═══════════════════════════════════════════════════════════════════════════════
function handlePollInfo(p) {
  var token = (p.poll || '').trim();
  if (!token) return jsonResponse({ ok: false, error: 'Missing poll token' });

  var poll = getPollByToken(token);
  if (!poll)  return jsonResponse({ ok: false, error: 'Poll not found' });

  return jsonResponse({
    ok:         true,
    token:      poll.token,
    title:      poll.title,
    subject:    poll.subject,
    subtitle:   poll.subtitle,
    badge:      poll.badge,
    status:     poll.status,
    createdAt:  poll.createdAt,
    scaleLow:   poll.scaleLow,
    scaleMid:   poll.scaleMid,
    scaleHigh:  poll.scaleHigh
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Submit a vote
// ═══════════════════════════════════════════════════════════════════════════════
function handleVote(p) {
  var token   = (p.poll      || '').trim();
  var email   = (p.email     || '').trim().toLowerCase();
  var rating  = parseInt(p.rating, 10);
  var comment = (p.comment   || '').trim();
  var ts      = p.timestamp  || new Date().toISOString();

  if (!token)                                    return jsonResponse({ ok: false, error: 'Missing poll token' });
  if (!email || isNaN(rating) || rating < 1 || rating > 9)
                                                 return jsonResponse({ ok: false, error: 'Invalid parameters' });

  var poll = getPollByToken(token);
  if (!poll)                                     return jsonResponse({ ok: false, error: 'Poll not found' });
  if (poll.status === 'closed')                  return jsonResponse({ ok: false, error: 'Poll is closed' });

  var anonId = makeAnonId(email);
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheet  = getOrCreateVotesSheet(ss, token);

  // Duplicate check
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === anonId) return jsonResponse({ ok: false, error: 'Already voted' });
  }

  sheet.appendRow([ts, anonId, rating, comment]);
  refreshSummary(ss, token);

  return jsonResponse({ ok: true, anonId: anonId });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Anonymous results summary
// ═══════════════════════════════════════════════════════════════════════════════
function handleResults(p) {
  var token = (p.poll || '').trim();
  if (!token) return jsonResponse({ ok: false, error: 'Missing poll token' });

  var poll = getPollByToken(token);
  if (!poll)  return jsonResponse({ ok: false, error: 'Poll not found' });

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var rows   = getVoteRows(ss, token);
  var counts = { '1':0,'2':0,'3':0,'4':0,'5':0,'6':0,'7':0,'8':0,'9':0 };
  var sum = 0, n = 0;

  rows.forEach(function(row) {
    var r = parseInt(row[2], 10);
    if (r >= 1 && r <= 9) { counts[String(r)]++; sum += r; n++; }
  });

  return jsonResponse({
    ok:      true,
    poll:    { token: token, title: poll.title, subject: poll.subject, status: poll.status },
    total:   n,
    average: n ? Math.round(sum / n * 100) / 100 : null,
    counts:  counts
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERUSER: Create a new poll
// ═══════════════════════════════════════════════════════════════════════════════
function handleCreatePoll(p) {
  if (!checkKey(p.key)) return jsonResponse({ ok: false, error: 'Unauthorized' });

  var title      = (p.title      || 'Poll').trim();
  var subject    = (p.subject    || '').trim();
  var subtitle   = (p.subtitle   || '').trim();
  var badge      = (p.badge      || 'Vote').trim();
  var scaleLow   = (p.scaleLow   || 'Strongly Disagree').trim();
  var scaleMid   = (p.scaleMid   || 'Neutral').trim();
  var scaleHigh  = (p.scaleHigh  || 'Strongly Agree').trim();
  var token      = generateToken();
  var ts         = new Date().toISOString();

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreatePollsSheet(ss);

  sheet.appendRow([token, title, subject, subtitle, badge, 'open', ts, scaleLow, scaleMid, scaleHigh]);

  getOrCreateVotesSheet(ss, token);
  getOrCreateSummarySheet(ss, token);

  return jsonResponse({
    ok: true, token: token, title: title, subject: subject,
    subtitle: subtitle, badge: badge, status: 'open', createdAt: ts,
    scaleLow: scaleLow, scaleMid: scaleMid, scaleHigh: scaleHigh
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERUSER: Open or close a poll
// ═══════════════════════════════════════════════════════════════════════════════
function handleSetPollStatus(p) {
  if (!checkKey(p.key)) return jsonResponse({ ok: false, error: 'Unauthorized' });

  var token  = (p.poll   || '').trim();
  var status = (p.status || '').trim();

  if (!token)                                      return jsonResponse({ ok: false, error: 'Missing poll token' });
  if (status !== 'open' && status !== 'closed')    return jsonResponse({ ok: false, error: 'status must be open or closed' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreatePollsSheet(ss);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][COL.TOKEN] === token) {
      sheet.getRange(i + 1, COL.STATUS + 1).setValue(status);
      return jsonResponse({ ok: true, token: token, status: status });
    }
  }
  return jsonResponse({ ok: false, error: 'Poll not found' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERUSER: List all polls
// ═══════════════════════════════════════════════════════════════════════════════
function handleListPolls(p) {
  if (!checkKey(p.key)) return jsonResponse({ ok: false, error: 'Unauthorized' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreatePollsSheet(ss);
  var data  = sheet.getDataRange().getValues();

  var polls = data.slice(1).map(function(row) {
    var token   = row[COL.TOKEN];
    var rows    = getVoteRows(ss, token);
    var ratings = rows.map(function(r) { return parseInt(r[2], 10); }).filter(function(r) { return !isNaN(r); });
    var avg     = ratings.length ? Math.round(ratings.reduce(function(a,b){return a+b;},0) / ratings.length * 100) / 100 : null;
    return {
      token:     token,
      title:     row[COL.TITLE],
      subject:   row[COL.SUBJECT],
      subtitle:  row[COL.SUBTITLE],
      badge:     row[COL.BADGE],
      status:    row[COL.STATUS],
      createdAt: row[COL.CREATED_AT],
      scaleLow:  row[COL.SCALE_LOW],
      scaleMid:  row[COL.SCALE_MID],
      scaleHigh: row[COL.SCALE_HIGH],
      voteCount: rows.length,
      average:   avg
    };
  });

  return jsonResponse({ ok: true, polls: polls });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERUSER: Attributed vote table for a specific poll
// ═══════════════════════════════════════════════════════════════════════════════
function handleAdmin(p) {
  if (!checkKey(p.key)) return jsonResponse({ ok: false, error: 'Unauthorized' });

  var token = (p.poll || '').trim();
  if (!token) return jsonResponse({ ok: false, error: 'Missing poll token' });

  var poll = getPollByToken(token);
  if (!poll)  return jsonResponse({ ok: false, error: 'Poll not found' });

  var knownEmails = (p.emails || '').split(',').map(function(e) {
    return e.trim().toLowerCase();
  }).filter(Boolean);

  var lookup = {};
  knownEmails.forEach(function(email) { lookup[makeAnonId(email)] = email; });

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var rows = getVoteRows(ss, token);

  var attributed = rows.map(function(row) {
    var anonId = row[1];
    return {
      timestamp: row[0],
      anonId:    anonId,
      email:     lookup[anonId] || null,
      rating:    row[2],
      comment:   row[3]
    };
  });

  return jsonResponse({
    ok:    true,
    poll:  { token: token, title: poll.title, subject: poll.subject, status: poll.status,
             scaleLow: poll.scaleLow, scaleMid: poll.scaleMid, scaleHigh: poll.scaleHigh },
    total: attributed.length,
    votes: attributed
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HMAC HELPER
// ═══════════════════════════════════════════════════════════════════════════════
function makeAnonId(email) {
  var raw = Utilities.computeHmacSha256Signature(email, HMAC_SECRET);
  var hex = raw.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
  return hex.slice(0, 4).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN GENERATOR — 8 random hex chars
// ═══════════════════════════════════════════════════════════════════════════════
function generateToken() {
  var chars = '0123456789abcdef';
  var token = '';
  for (var i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * 16)];
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = getOrCreatePollsSheet(ss);
  var existing = sheet.getDataRange().getValues().slice(1).map(function(r) { return r[0]; });
  return existing.indexOf(token) !== -1 ? generateToken() : token;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function getOrCreatePollsSheet(ss) {
  var sheet = ss.getSheetByName(POLLS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(POLLS_SHEET);
    sheet.appendRow(['Token','Title','Subject','Subtitle','Badge','Status','Created At',
                     'Scale Low (1)','Scale Mid (5)','Scale High (9)']);
    sheet.setFrozenRows(1);
    styleHeader(sheet, 10);
    sheet.setColumnWidths(1, 10, 150);
  }
  return sheet;
}

function getOrCreateVotesSheet(ss, token) {
  var name  = 'Votes_' + token;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(['Timestamp', 'Anonymous ID', 'Rating (1-9)', 'Comment']);
    sheet.setFrozenRows(1);
    styleHeader(sheet, 4);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 120);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 400);
  }
  return sheet;
}

function getOrCreateSummarySheet(ss, token) {
  var name  = 'Summary_' + token;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(['Rating', 'Count']);
    for (var i = 1; i <= 9; i++) sheet.appendRow([i, 0]);
    sheet.setFrozenRows(1);
    styleHeader(sheet, 2);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 100);
  }
  return sheet;
}

function refreshSummary(ss, token) {
  var rows   = getVoteRows(ss, token);
  var counts = { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 };
  rows.forEach(function(row) {
    var r = parseInt(row[2], 10);
    if (r >= 1 && r <= 9) counts[r]++;
  });
  var sheet = getOrCreateSummarySheet(ss, token);
  for (var i = 1; i <= 9; i++) sheet.getRange(i + 1, 2).setValue(counts[i]);
}

function getVoteRows(ss, token) {
  var sheet = ss.getSheetByName('Votes_' + token);
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1);
}

function getPollByToken(token) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(POLLS_SHEET);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][COL.TOKEN] === token) {
      return {
        token:     data[i][COL.TOKEN],
        title:     data[i][COL.TITLE],
        subject:   data[i][COL.SUBJECT],
        subtitle:  data[i][COL.SUBTITLE],
        badge:     data[i][COL.BADGE],
        status:    data[i][COL.STATUS],
        createdAt: data[i][COL.CREATED_AT],
        scaleLow:  data[i][COL.SCALE_LOW],
        scaleMid:  data[i][COL.SCALE_MID],
        scaleHigh: data[i][COL.SCALE_HIGH]
      };
    }
  }
  return null;
}

function styleHeader(sheet, numCols) {
  var h = sheet.getRange(1, 1, 1, numCols);
  h.setBackground('#3b5bdb');
  h.setFontColor('#ffffff');
  h.setFontWeight('bold');
}

function checkKey(key) { return (key || '') === SUPERUSER_KEY; }

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-TIME: Create chart for a specific poll. Set token below, then run.
// ═══════════════════════════════════════════════════════════════════════════════
var CHART_POLL_TOKEN = 'YOUR_POLL_TOKEN_HERE';

function createChartForPoll() {
  var token = CHART_POLL_TOKEN;
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSummarySheet(ss, token);
  sheet.getCharts().forEach(function(c) { sheet.removeChart(c); });

  var poll  = getPollByToken(token);
  var title = poll
    ? (poll.subject ? poll.title + ': ' + poll.subject : poll.title)
    : 'Vote Distribution';

  // Build axis labels using rubric anchors if available
  var hAxisTitle = 'Rating (1–9)';
  if (poll && poll.scaleLow && poll.scaleHigh) {
    hAxisTitle = '1 = ' + poll.scaleLow + '  ·  5 = ' + poll.scaleMid + '  ·  9 = ' + poll.scaleHigh;
  }

  var chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('A1:B10'))
    .setPosition(2, 4, 0, 0)
    .setOption('title', title)
    .setOption('hAxis.title', hAxisTitle)
    .setOption('vAxis.title', 'Number of Votes')
    .setOption('vAxis.minValue', 0)
    .setOption('vAxis.format', '0')
    .setOption('legend.position', 'none')
    .setOption('colors', ['#3b5bdb'])
    .setOption('backgroundColor', '#ffffff')
    .setOption('chartArea.width', '80%')
    .setOption('chartArea.height', '70%')
    .setOption('width', 640)
    .setOption('height', 440)
    .build();

  sheet.insertChart(chart);

  SpreadsheetApp.getUi().alert(
    '✅ Chart created on sheet "Summary_' + token + '"!\n\n' +
    'To embed in Slack:\n' +
    '  1. Click the chart → ⋮ → "Publish chart"\n' +
    '  2. Choose "Interactive" → copy the URL\n' +
    '  3. Paste into Slack.'
  );
}
