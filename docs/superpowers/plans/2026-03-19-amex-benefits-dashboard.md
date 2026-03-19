# Amex Benefits Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tampermonkey userscript that injects a unified benefits credit tracker dashboard into the Amex website, aggregating data across all 11 cards.

**Architecture:** Single `.user.js` file running at `document-idle`. On "All Benefits" nav click, it calls `ReadLoyaltyAccounts.v1` and fans out `ReadBestLoyaltyBenefitsTrackers.v1` per card with concurrency control, then renders an aggregated dashboard grouped by benefit type and reset period.

**Tech Stack:** Vanilla JavaScript (Tampermonkey userscript), Amex DLS CSS (native styles), Amex internal APIs (`functions.americanexpress.com`)

**Spec:** `docs/superpowers/specs/2026-03-19-amex-benefits-dashboard-design.md`

---

## File Structure

```
src/
  amex-benefits-dashboard.user.js   # The complete Tampermonkey userscript
tools/
  api-discovery.user.js             # Temporary script to capture API schemas (Task 1 only)
docs/
  api-schemas.md                    # Captured API request/response schemas
```

All production code lives in a single file (`amex-benefits-dashboard.user.js`). The discovery script is a temporary tool used once and kept for reference.

---

## Task 0: Project Setup

**Files:**
- Create: `src/amex-benefits-dashboard.user.js`

- [ ] **Step 1: Create the userscript skeleton with Tampermonkey metadata**

```javascript
// ==UserScript==
// @name         Amex Benefits Dashboard
// @namespace    https://github.com/amex-benefits-dashboard
// @version      0.1.0
// @description  Unified benefits credit tracker across all Amex cards
// @match        https://global.americanexpress.com/*
// @match        https://www.americanexpress.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // Configuration
  // ============================================================
  const CONFIG = {
    CONCURRENCY: 3,
    MAX_RETRIES: 3,
    RETRY_BASE_DELAY: 2000,
    API_BASE: 'https://functions.americanexpress.com',
    DASHBOARD_PATH: '/card-benefits/view-all/dashboard',
  };

  // Module-level state guard to prevent duplicate dashboard renders
  let dashboardActive = false;

  console.log('[AmexDash] Script loaded');
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/amex-benefits-dashboard.user.js
git commit -m "feat: scaffold userscript with Tampermonkey metadata and config"
```

---

## Task 1: API Discovery — Capture Request/Response Schemas

**IMPORTANT:** This task requires manual interaction with the Amex website. The developer must be logged into their Amex account.

**Files:**
- Create: `tools/api-discovery.user.js`
- Create: `docs/api-schemas.md`

- [ ] **Step 1: Write the discovery script**

This script monkey-patches `fetch` to log request/response payloads for the target APIs.

```javascript
// ==UserScript==
// @name         Amex API Discovery
// @namespace    https://github.com/amex-benefits-dashboard
// @version      0.1.0
// @description  Capture API schemas for benefits dashboard development
// @match        https://global.americanexpress.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const TARGET_ENDPOINTS = [
    'ReadLoyaltyAccounts.v1',
    'ReadBestLoyaltyBenefitsTrackers.v1',
    'ReadLoyaltyBenefitsCardProduct.v1',
    'ReadLoyaltyBenefits.v2',
  ];

  const captured = {};

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [url, options] = args;
    const urlStr = typeof url === 'string' ? url : url.url;

    const matchedEndpoint = TARGET_ENDPOINTS.find((ep) => urlStr.includes(ep));

    if (matchedEndpoint) {
      let requestBody = null;
      if (options && options.body) {
        try {
          requestBody = JSON.parse(options.body);
        } catch {
          requestBody = options.body;
        }
      }

      const response = await originalFetch.apply(this, args);
      const clone = response.clone();

      try {
        const responseBody = await clone.json();

        if (!captured[matchedEndpoint]) {
          captured[matchedEndpoint] = [];
        }
        captured[matchedEndpoint].push({
          url: urlStr,
          method: options?.method || 'GET',
          headers: Object.fromEntries(
            Object.entries(options?.headers || {}).filter(
              ([k]) => !k.toLowerCase().includes('cookie')
            )
          ),
          requestBody,
          responseBody,
          status: response.status,
        });

        console.group(`[API Discovery] ${matchedEndpoint}`);
        console.log('Request:', JSON.stringify(requestBody, null, 2));
        console.log('Response:', JSON.stringify(responseBody, null, 2));
        console.log('Status:', response.status);
        console.groupEnd();
      } catch (e) {
        console.warn(`[API Discovery] Failed to parse response for ${matchedEndpoint}:`, e);
      }

      return response;
    }

    return originalFetch.apply(this, args);
  };

  // Expose a helper to dump all captured data
  window.__amexApiDump = () => {
    console.log('[API Discovery] Full dump:');
    console.log(JSON.stringify(captured, null, 2));
    return captured;
  };

  console.log('[API Discovery] Monitoring:', TARGET_ENDPOINTS.join(', '));
  console.log('[API Discovery] Navigate to a card benefits page to capture data.');
  console.log('[API Discovery] Call window.__amexApiDump() to get all captured data.');
})();
```

- [ ] **Step 2: Install in Tampermonkey and capture data**

1. Install the script in Tampermonkey
2. Navigate to `https://global.americanexpress.com/card-benefits/view-all/platinum`
3. Open browser DevTools console
4. Wait for API calls to complete (watch for `[API Discovery]` log groups)
5. Run `window.__amexApiDump()` in console
6. Copy the output

- [ ] **Step 3: Document the captured schemas in `docs/api-schemas.md`**

Create `docs/api-schemas.md` with the captured request/response structures. Key fields to document:

```markdown
# Amex API Schemas

## ReadLoyaltyAccounts.v1

### Request
- Method: POST
- URL: `https://functions.americanexpress.com/ReadLoyaltyAccounts.v1`
- Body: (document captured body or note if empty)

### Response
(Paste sanitized response structure with field names, types, and descriptions)

Key fields to identify:
- Account identifier (the join key for other API calls)
- Card product name
- Card last digits
- Account status

## ReadBestLoyaltyBenefitsTrackers.v1

### Request
(Document how the account identifier from above is passed)

### Response
Key fields to identify:
- Benefit/tracker name
- Benefit ID or code (for grouping)
- Total credit amount
- Used credit amount
- Reset date
- Reset period type (monthly/semi-annual/annual)
- Credit status
```

- [ ] **Step 4: Commit**

```bash
git add tools/api-discovery.user.js docs/api-schemas.md
git commit -m "feat: add API discovery script and captured schemas"
```

---

## Task 2: API Client Module

**Files:**
- Modify: `src/amex-benefits-dashboard.user.js`

**Depends on:** Task 1 (need API schemas to know exact field names and request bodies)

- [ ] **Step 1: Add the concurrency-limited fetch pool**

Add inside the IIFE, after CONFIG:

```javascript
// ============================================================
// API Client
// ============================================================

class FetchPool {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    if (this.running >= this.concurrency) {
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        this.queue.shift()();
      }
    }
  }

  reduceConcurrency() {
    this.concurrency = Math.max(1, this.concurrency - 1);
    console.warn(`[AmexDash] Reduced concurrency to ${this.concurrency}`);
  }
}

async function amexApiFetch(endpoint, body = {}, retries = CONFIG.MAX_RETRIES) {
  const url = `${CONFIG.API_BASE}/${endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // NOTE: ce-source header and other headers will be populated
          // based on captured schemas from Task 1
        },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (response.status === 401 || response.status === 403) {
        throw new SessionExpiredError();
      }

      if (response.status === 429 || response.status === 503) {
        if (attempt < retries) {
          const delay = CONFIG.RETRY_BASE_DELAY * Math.pow(2, attempt);
          console.warn(`[AmexDash] Rate limited, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new RateLimitError(`Rate limited after ${retries} retries`);
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Check for session expiration in response body
      // NOTE: exact pattern to be confirmed from Task 1 discovery
      if (data?.error?.code === 'SESSION_EXPIRED' || data?.redirectUrl?.includes('login')) {
        throw new SessionExpiredError();
      }

      return data;
    } catch (e) {
      if (e instanceof SessionExpiredError) throw e;
      if (attempt === retries) throw e;
    }
  }
}

class SessionExpiredError extends Error {
  constructor() {
    super('Session expired — please log in again');
    this.name = 'SessionExpiredError';
  }
}

class RateLimitError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'RateLimitError';
  }
}
```

- [ ] **Step 2: Add the account and tracker fetch functions**

```javascript
// NOTE: Request bodies below use placeholder field names.
// Replace with actual field names captured in Task 1.

async function fetchAllAccounts() {
  const data = await amexApiFetch('ReadLoyaltyAccounts.v1', {});
  // NOTE: Adjust field path based on captured schema
  // e.g., data.accounts, data.data.accounts, etc.
  return data;
}

async function fetchTrackersForAccount(pool, accountToken, rateLimitTracker) {
  return pool.add(async () => {
    try {
      const data = await amexApiFetch('ReadBestLoyaltyBenefitsTrackers.v1', {
        // NOTE: Replace with actual request body structure from Task 1
        // e.g., { accountToken } or { accountIndex } etc.
      });
      return { accountToken, data, error: null };
    } catch (e) {
      if (e instanceof RateLimitError) {
        rateLimitTracker.count++;
        if (rateLimitTracker.count >= 3) {
          pool.reduceConcurrency();
        }
      }
      if (e instanceof SessionExpiredError) throw e;
      return { accountToken, data: null, error: e.message };
    }
  });
}

async function fetchAllData(accountsData, onProgress) {
  const pool = new FetchPool(CONFIG.CONCURRENCY);
  const rateLimitTracker = { count: 0 };

  // NOTE: Extract account list from accountsData — adjust path per schema
  const accounts = accountsData; // placeholder

  // Fan out tracker fetches
  const total = accounts.length;
  let completed = 0;

  const results = await Promise.all(
    accounts.map(async (account) => {
      // NOTE: Extract account token — adjust per schema
      const token = account;
      const result = await fetchTrackersForAccount(pool, token, rateLimitTracker);
      completed++;
      if (onProgress) onProgress(completed, total);
      return result;
    })
  );

  return { accounts: accountsData, trackers: results };
}
```

- [ ] **Step 3: Verify the script still loads without errors**

Install the script in Tampermonkey, navigate to `global.americanexpress.com`, open DevTools console. Verify `[AmexDash] Script loaded, waiting for DOM...` appears with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/amex-benefits-dashboard.user.js
git commit -m "feat: add API client with concurrency pool and retry logic"
```

---

## Task 3: Data Aggregator Module

**Files:**
- Modify: `src/amex-benefits-dashboard.user.js`

**Depends on:** Task 1 (need field names), Task 2 (provides raw data)

- [ ] **Step 1: Add the aggregator**

Add after the API client section:

```javascript
// ============================================================
// Data Aggregator
// ============================================================

function aggregateTrackers(accounts, trackerResults) {
  // Map of benefitKey -> { name, period, resetDate, cards: [{cardName, last4, used, total, error}] }
  const benefitMap = new Map();

  for (const result of trackerResults) {
    if (result.error || !result.data) continue;

    // NOTE: Adjust field paths per captured schema from Task 1
    const account = result.account; // account info for card name/last4
    const trackers = result.data; // array of tracker objects

    if (!Array.isArray(trackers)) continue;

    for (const tracker of trackers) {
      // NOTE: Replace these placeholder field names with actual ones from schema
      const benefitKey = tracker.benefitId || normalizeName(tracker.benefitName);
      const benefitName = tracker.benefitName;
      const period = tracker.period; // 'monthly', 'semi-annual', 'annual'
      const resetDate = tracker.resetDate; // ISO date string or similar
      const used = tracker.usedAmount || 0;
      const total = tracker.totalAmount || 0;

      if (!benefitMap.has(benefitKey)) {
        benefitMap.set(benefitKey, {
          key: benefitKey,
          name: benefitName,
          period: period,
          resetDate: resetDate,
          cards: [],
        });
      }

      benefitMap.get(benefitKey).cards.push({
        cardName: account.cardName,
        last4: account.last4,
        used,
        total,
      });
    }
  }

  // Compute aggregated totals and sort
  const benefits = Array.from(benefitMap.values()).map((b) => ({
    ...b,
    totalUsed: b.cards.reduce((sum, c) => sum + c.used, 0),
    totalAvailable: b.cards.reduce((sum, c) => sum + c.total, 0),
    cardCount: b.cards.length,
    daysUntilReset: daysUntil(b.resetDate),
  }));

  // Group by period
  const grouped = {
    monthly: benefits.filter((b) => b.period === 'monthly'),
    'semi-annual': benefits.filter((b) => b.period === 'semi-annual'),
    annual: benefits.filter((b) => b.period === 'annual'),
  };

  // Sort each group by days until reset (ascending = most urgent first)
  for (const period of Object.keys(grouped)) {
    grouped[period].sort((a, b) => a.daysUntilReset - b.daysUntilReset);
  }

  return grouped;
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[®™©‡♦*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function computeSummary(grouped) {
  const all = Object.values(grouped).flat();
  return {
    totalCards: new Set(all.flatMap((b) => b.cards.map((c) => c.last4))).size,
    totalCredits: all.length,
    expiringSoon: all.filter((b) => b.daysUntilReset <= 7).length,
    fullyUsed: all.filter((b) => b.totalUsed >= b.totalAvailable && b.totalAvailable > 0).length,
    unused: all.filter((b) => b.totalUsed === 0 && b.totalAvailable > 0).length,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/amex-benefits-dashboard.user.js
git commit -m "feat: add data aggregator with period grouping and urgency sorting"
```

---

## Task 4: UI Renderer Module

**Files:**
- Modify: `src/amex-benefits-dashboard.user.js`

- [ ] **Step 1: Add CSS styles**

Add after the aggregator section:

```javascript
// ============================================================
// UI Renderer
// ============================================================

const STYLES = `
  .amex-dash {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 32px;
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
    color: #333;
  }
  .amex-dash-header {
    padding: 24px 0 16px;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 16px;
  }
  .amex-dash-header h1 {
    font-size: 22px;
    color: #1a1a1a;
    margin: 0 0 4px;
  }
  .amex-dash-header .subtitle {
    color: #666;
    font-size: 13px;
  }
  .amex-dash-badges {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .amex-dash-badge {
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
  }
  .amex-dash-badge--warning { background: #fff3e0; color: #e65100; }
  .amex-dash-badge--success { background: #e8f5e9; color: #2e7d32; }
  .amex-dash-badge--danger  { background: #fce4ec; color: #c62828; }

  .amex-dash-filters {
    display: flex;
    gap: 8px;
    padding: 12px 0;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .amex-dash-filter {
    background: #f0f0f0;
    border: none;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 13px;
    color: #555;
    cursor: pointer;
  }
  .amex-dash-filter--active {
    background: #006fcf;
    color: #fff;
  }

  .amex-dash-section {
    margin-bottom: 28px;
  }
  .amex-dash-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }
  .amex-dash-section-title {
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
    text-transform: uppercase;
  }
  .amex-dash-reset-badge {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 11px;
  }
  .amex-dash-reset--urgent  { background: #fce4ec; color: #c62828; }
  .amex-dash-reset--warning { background: #fff3e0; color: #e65100; }
  .amex-dash-reset--ok      { background: #e8f5e9; color: #2e7d32; }

  .amex-dash-row {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 10px;
  }
  .amex-dash-row-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .amex-dash-benefit-name {
    font-weight: 600;
    font-size: 15px;
  }
  .amex-dash-card-count {
    color: #888;
    font-size: 13px;
    margin-left: 8px;
  }
  .amex-dash-amount {
    font-size: 18px;
    font-weight: 700;
  }
  .amex-dash-amount-total {
    color: #888;
    font-size: 14px;
  }
  .amex-dash-amount--unused  { color: #c62828; }
  .amex-dash-amount--partial { color: #e65100; }
  .amex-dash-amount--full    { color: #2e7d32; }

  .amex-dash-progress {
    background: #f5f5f5;
    border-radius: 4px;
    height: 8px;
    margin-bottom: 8px;
    overflow: hidden;
  }
  .amex-dash-progress-bar {
    height: 8px;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .amex-dash-progress-bar--unused  { background: #ef5350; }
  .amex-dash-progress-bar--partial { background: #ffa726; }
  .amex-dash-progress-bar--full    { background: #66bb6a; }

  .amex-dash-expand {
    font-size: 12px;
    color: #999;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
  }
  .amex-dash-expand:hover { color: #006fcf; }
  .amex-dash-cards {
    display: none;
    gap: 16px;
    font-size: 12px;
    color: #666;
    flex-wrap: wrap;
    padding-top: 4px;
  }
  .amex-dash-cards--open { display: flex; }

  .amex-dash-loading {
    text-align: center;
    padding: 48px 0;
    color: #888;
    font-size: 15px;
  }
  .amex-dash-error {
    text-align: center;
    padding: 48px 0;
    color: #c62828;
    font-size: 15px;
  }
  .amex-dash-skeleton {
    background: #f0f0f0;
    border-radius: 8px;
    height: 80px;
    margin-bottom: 10px;
    animation: amex-dash-pulse 1.5s ease-in-out infinite;
  }
  @keyframes amex-dash-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .amex-dash-nav-link {
    cursor: pointer;
    font-weight: 600;
  }
`;
```

- [ ] **Step 2: Add render functions**

```javascript
function injectStyles() {
  if (document.getElementById('amex-dash-styles')) return;
  const style = document.createElement('style');
  style.id = 'amex-dash-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function getStatusClass(used, total) {
  if (total === 0) return 'full';
  const pct = used / total;
  if (pct >= 1) return 'full';
  if (pct > 0) return 'partial';
  return 'unused';
}

function getResetBadgeClass(days) {
  if (days <= 7) return 'urgent';
  if (days <= 30) return 'warning';
  return 'ok';
}

function formatCurrency(amount) {
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

function renderDashboard(container) {
  injectStyles();
  container.innerHTML = '';

  const dash = document.createElement('div');
  dash.className = 'amex-dash';
  dash.innerHTML = `
    <div class="amex-dash-header">
      <h1>Benefits Tracker</h1>
      <div class="subtitle">Loading accounts...</div>
      <div class="amex-dash-badges"></div>
    </div>
    <div class="amex-dash-filters"></div>
    <div class="amex-dash-content">
      <div class="amex-dash-loading">Loading your benefits...</div>
    </div>
  `;
  container.appendChild(dash);
  return dash;
}

function renderLoadingProgress(dash, completed, total) {
  const subtitle = dash.querySelector('.subtitle');
  if (subtitle) {
    subtitle.textContent = `Loading ${completed} of ${total} cards...`;
  }
}

function renderSkeletons(dash, count) {
  const content = dash.querySelector('.amex-dash-content');
  content.innerHTML = '';
  for (let i = 0; i < Math.min(count, 8); i++) {
    const skel = document.createElement('div');
    skel.className = 'amex-dash-skeleton';
    content.appendChild(skel);
  }
}

function renderResults(dash, grouped, summary) {
  // Update header
  const subtitle = dash.querySelector('.subtitle');
  subtitle.textContent = `${summary.totalCards} cards · ${summary.totalCredits} active credits`;

  // Badges
  const badges = dash.querySelector('.amex-dash-badges');
  badges.innerHTML = '';
  if (summary.expiringSoon > 0) {
    badges.innerHTML += `<span class="amex-dash-badge amex-dash-badge--warning">⚠ ${summary.expiringSoon} expiring soon</span>`;
  }
  if (summary.fullyUsed > 0) {
    badges.innerHTML += `<span class="amex-dash-badge amex-dash-badge--success">✓ ${summary.fullyUsed} fully used</span>`;
  }
  if (summary.unused > 0) {
    badges.innerHTML += `<span class="amex-dash-badge amex-dash-badge--danger">✗ ${summary.unused} unused</span>`;
  }

  // Filters
  const filters = dash.querySelector('.amex-dash-filters');
  const periods = ['all', 'monthly', 'semi-annual', 'annual', 'expiring'];
  const periodLabels = {
    all: 'All Periods',
    monthly: 'Monthly',
    'semi-annual': 'Semi-Annual',
    annual: 'Annual',
    expiring: 'Expiring This Week',
  };
  filters.innerHTML = periods
    .map(
      (p) =>
        `<button class="amex-dash-filter ${p === 'all' ? 'amex-dash-filter--active' : ''}" data-period="${p}">${periodLabels[p]}</button>`
    )
    .join('');

  // Filter click handlers
  filters.querySelectorAll('.amex-dash-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.querySelectorAll('.amex-dash-filter').forEach((b) => b.classList.remove('amex-dash-filter--active'));
      btn.classList.add('amex-dash-filter--active');
      renderSections(dash, grouped, btn.dataset.period);
    });
  });

  // Render sections
  renderSections(dash, grouped, 'all');
}

function renderSections(dash, grouped, filter) {
  const content = dash.querySelector('.amex-dash-content');
  content.innerHTML = '';

  const periodOrder = ['monthly', 'semi-annual', 'annual'];
  const periodLabels = { monthly: 'Monthly', 'semi-annual': 'Semi-Annual', annual: 'Annual' };

  for (const period of periodOrder) {
    let benefits = grouped[period] || [];

    if (filter === 'expiring') {
      benefits = benefits.filter((b) => b.daysUntilReset <= 7);
    } else if (filter !== 'all' && filter !== period) {
      continue;
    }

    if (benefits.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'amex-dash-section';

    const resetDays = benefits.length > 0 ? Math.min(...benefits.map((b) => b.daysUntilReset)) : Infinity;
    const resetClass = getResetBadgeClass(resetDays);

    section.innerHTML = `
      <div class="amex-dash-section-header">
        <span class="amex-dash-section-title">${periodLabels[period]}</span>
        <span class="amex-dash-reset-badge amex-dash-reset--${resetClass}">
          resets in ${resetDays === Infinity ? '?' : resetDays} days
        </span>
      </div>
    `;

    for (const benefit of benefits) {
      section.appendChild(renderBenefitRow(benefit));
    }

    content.appendChild(section);
  }

  if (content.children.length === 0) {
    content.innerHTML = '<div class="amex-dash-loading">No benefits match this filter.</div>';
  }
}

function renderCardErrors(dash, trackerResults) {
  const errors = trackerResults.filter((r) => r.error);
  if (errors.length === 0) return;

  const content = dash.querySelector('.amex-dash-content');
  const section = document.createElement('div');
  section.className = 'amex-dash-section';
  section.innerHTML = `
    <div class="amex-dash-section-header">
      <span class="amex-dash-section-title" style="color:#c62828">Failed to Load</span>
    </div>
    ${errors.map((e) => `<div class="amex-dash-row" style="border-color:#fce4ec;color:#c62828;font-size:13px">Card ${e.accountToken}: ${e.error}</div>`).join('')}
  `;
  content.appendChild(section);
}

function renderBenefitRow(benefit) {
  const status = getStatusClass(benefit.totalUsed, benefit.totalAvailable);
  const pct = benefit.totalAvailable > 0 ? Math.round((benefit.totalUsed / benefit.totalAvailable) * 100) : 0;
  const rowId = `amex-dash-cards-${benefit.key.replace(/\W/g, '-')}`;

  const row = document.createElement('div');
  row.className = 'amex-dash-row';
  row.innerHTML = `
    <div class="amex-dash-row-top">
      <div>
        <span class="amex-dash-benefit-name">${benefit.name}</span>
        <span class="amex-dash-card-count">${benefit.cardCount} card${benefit.cardCount > 1 ? 's' : ''}</span>
      </div>
      <div style="text-align:right">
        <span class="amex-dash-amount amex-dash-amount--${status}">${formatCurrency(benefit.totalUsed)}</span>
        <span class="amex-dash-amount-total"> / ${formatCurrency(benefit.totalAvailable)} used</span>
        ${status === 'full' ? '<span style="color:#2e7d32;font-size:12px;margin-left:4px">✓</span>' : ''}
      </div>
    </div>
    <div class="amex-dash-progress">
      <div class="amex-dash-progress-bar amex-dash-progress-bar--${status}" style="width:${pct}%"></div>
    </div>
    ${
      benefit.cardCount > 2
        ? `<button class="amex-dash-expand" data-target="${rowId}">▶ Show ${benefit.cardCount} cards</button>`
        : ''
    }
    <div class="amex-dash-cards ${benefit.cardCount <= 2 ? 'amex-dash-cards--open' : ''}" id="${rowId}">
      ${benefit.cards
        .map((c) => {
          const cs = getStatusClass(c.used, c.total);
          return `<span>${c.cardName} (-${c.last4}): <b style="color:${cs === 'full' ? '#2e7d32' : cs === 'partial' ? '#e65100' : '#c62828'}">${formatCurrency(c.used)}/${formatCurrency(c.total)}${cs === 'full' ? ' ✓' : ''}</b></span>`;
        })
        .join('')}
    </div>
  `;

  // Expand/collapse handler
  const expandBtn = row.querySelector('.amex-dash-expand');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      const cards = row.querySelector(`#${rowId}`);
      const isOpen = cards.classList.toggle('amex-dash-cards--open');
      expandBtn.textContent = isOpen ? `▼ Hide ${benefit.cardCount} cards` : `▶ Show ${benefit.cardCount} cards`;
    });
  }

  return row;
}

function renderError(container, message) {
  injectStyles();
  container.innerHTML = `
    <div class="amex-dash">
      <div class="amex-dash-error">
        ${message}
        <br><br>
        <a href="https://global.americanexpress.com/login" style="color:#006fcf">Log in again</a>
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/amex-benefits-dashboard.user.js
git commit -m "feat: add UI renderer with styles, progress bars, and period filters"
```

---

## Task 5: Nav Injector and SPA Routing

**Files:**
- Modify: `src/amex-benefits-dashboard.user.js`

- [ ] **Step 1: Add the nav injector and routing logic**

Add after the UI renderer section:

```javascript
// ============================================================
// Nav Injector & Routing
// ============================================================

function injectNavLink() {
  // Find the Amex navigation bar
  // NOTE: Selector may need adjustment based on actual DOM structure
  const nav = document.querySelector('[role="navigation"]') ||
    document.querySelector('.nav-menu') ||
    document.querySelector('header nav');

  if (!nav) return false;
  if (nav.querySelector('.amex-dash-nav-link')) return true; // already injected

  const link = document.createElement('a');
  link.className = 'amex-dash-nav-link';
  link.textContent = 'All Benefits ✦';
  link.href = CONFIG.DASHBOARD_PATH;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateToDashboard();
  });

  // Insert before the last nav item
  const navItems = nav.querySelectorAll('a, button');
  if (navItems.length > 0) {
    const lastItem = navItems[navItems.length - 1];
    lastItem.parentNode.insertBefore(link, lastItem);
  } else {
    nav.appendChild(link);
  }

  return true;
}

function navigateToDashboard() {
  history.pushState({ amexDash: true }, '', CONFIG.DASHBOARD_PATH);
  showDashboard();
}

async function showDashboard() {
  // Guard against duplicate renders
  if (dashboardActive) return;
  dashboardActive = true;

  // Find the main content area and replace it
  const main = document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('#main-content') ||
    document.querySelector('.body-wrapper');

  if (!main) {
    console.error('[AmexDash] Could not find main content area');
    dashboardActive = false;
    return;
  }

  const dash = renderDashboard(main);

  try {
    // Step 1: Fetch accounts (single call, reused below)
    const accountsData = await fetchAllAccounts();
    // NOTE: Adjust account list extraction per schema
    const accountCount = Array.isArray(accountsData) ? accountsData.length : 0;
    renderSkeletons(dash, accountCount);

    // Step 2: Fan out tracker fetches, passing pre-fetched accounts
    const { accounts, trackers } = await fetchAllData(accountsData, (completed, total) => {
      renderLoadingProgress(dash, completed, total);
    });

    const grouped = aggregateTrackers(accounts, trackers);
    const summary = computeSummary(grouped);
    renderResults(dash, grouped, summary);
    renderCardErrors(dash, trackers);
  } catch (e) {
    dashboardActive = false; // allow retry on next click
    if (e instanceof SessionExpiredError) {
      renderError(main, 'Your session has expired. Please log in again to view your benefits.');
    } else {
      renderError(main, `Failed to load benefits: ${e.message}`);
    }
  }
}

function leaveDashboard() {
  dashboardActive = false;
  // Let Amex's React router handle re-rendering by navigating away
  // Don't try to restore saved DOM nodes — React owns the DOM
}

// Listen for browser back/forward
window.addEventListener('popstate', () => {
  if (!location.pathname.includes(CONFIG.DASHBOARD_PATH)) {
    leaveDashboard();
  }
});

// Debounce helper
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Initialize: watch for nav to appear and inject the link
function init() {
  injectNavLink();

  // Debounced observer to re-inject nav link after SPA re-renders
  const debouncedInject = debounce(() => {
    injectNavLink();
  }, 300);

  const observer = new MutationObserver(debouncedInject);

  // Observe only the header area if possible, fallback to body
  const target = document.querySelector('header') || document.body;
  observer.observe(target, {
    childList: true,
    subtree: true,
  });

  // Check if we're already on the dashboard URL (e.g., page refresh)
  if (location.pathname === CONFIG.DASHBOARD_PATH) {
    setTimeout(() => showDashboard(), 1000);
  }
}

// Start when DOM is ready (script runs at document-idle so DOM is available)
init();
```

- [ ] **Step 2: Commit**

```bash
git add src/amex-benefits-dashboard.user.js
git commit -m "feat: add nav injection, SPA routing, and dashboard orchestration"
```

---

## Task 6: Integration — Wire Up with Real API Schemas

**Files:**
- Modify: `src/amex-benefits-dashboard.user.js`

**Depends on:** Task 1 (captured schemas must be available in `docs/api-schemas.md`)

- [ ] **Step 1: Read `docs/api-schemas.md` and update all placeholder field names**

Go through the script and replace every `// NOTE:` comment that says "adjust per schema" with the actual field names and paths from the captured API schemas. Key areas to update:

1. `fetchAllAccounts()` — response field path to get account list
2. `fetchTrackersForAccount()` — request body structure (account token field)
3. `aggregateTrackers()` — all tracker field names (benefitId, benefitName, period, resetDate, usedAmount, totalAmount)
4. `aggregateTrackers()` — verify the **grouping key**: use stable benefit ID/code if available, otherwise normalized display name
5. `amexApiFetch()` — session expiration detection pattern
6. `amexApiFetch()` — required headers (ce-source, etc.)

- [ ] **Step 2: Test in the browser**

1. Install the updated script in Tampermonkey
2. Navigate to `https://global.americanexpress.com/overview`
3. Look for "All Benefits ✦" in the nav (may need DOM selector adjustment)
4. Click it
5. Verify data loads and renders correctly
6. Check console for any errors

- [ ] **Step 3: Fix any selector issues for nav injection**

The nav selectors (`[role="navigation"]`, `.nav-menu`, etc.) may not match the actual Amex DOM. Use DevTools to find the correct selector and update `injectNavLink()`.

- [ ] **Step 4: Fix any data mapping issues**

If the aggregated view looks wrong (missing benefits, wrong amounts), check the console logs and adjust field paths in the aggregator.

- [ ] **Step 5: Commit**

```bash
git add src/amex-benefits-dashboard.user.js
git commit -m "feat: wire up real API schemas and fix selectors"
```

---

## Task 7: Polish and Final Testing

**Files:**
- Modify: `src/amex-benefits-dashboard.user.js`

- [ ] **Step 1: Test all period filters**

Click each filter tab (All Periods, Monthly, Semi-Annual, Annual, Expiring This Week) and verify correct filtering.

- [ ] **Step 2: Test expand/collapse**

Click "Show N cards" on aggregated rows, verify per-card breakdown appears. Click again to collapse.

- [ ] **Step 3: Test error states**

1. Log out of Amex, click "All Benefits" — verify session expired message
2. Test with DevTools throttling to simulate slow network — verify loading state shows properly

- [ ] **Step 4: Test SPA navigation**

1. Click "All Benefits" to load dashboard
2. Click browser back button — verify original Amex page restores
3. Navigate to `global.americanexpress.com/card-benefits/view-all/dashboard` directly — verify dashboard loads

- [ ] **Step 5: Bump version and commit**

Update `@version` to `1.0.0` in the userscript metadata.

```bash
git add src/amex-benefits-dashboard.user.js
git commit -m "feat: polish UI and bump to v1.0.0"
```

---

## Execution Notes

- **Task 1 is a blocking gate.** Tasks 2-5 contain placeholder field names that cannot be finalized until the API schemas are captured. Tasks 2-5 can be written with placeholders and then updated in Task 6.
- **Task 6 is the integration step** where all placeholders are replaced with real values.
- **No automated tests** for this project — the "test" is manual browser verification against the live Amex site. The script has no dependencies, no build step, and runs in Tampermonkey directly.
- **Nav selector discovery** — the exact CSS selectors for the Amex nav will likely need trial-and-error adjustment in Task 6. Use DevTools `Elements` tab on the live site.
