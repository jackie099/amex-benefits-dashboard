# Amex Benefits Dashboard

A Tampermonkey userscript that adds a unified benefits credit tracker dashboard to the American Express website. Track all your card credits in one place instead of navigating to each card's benefits page individually.

## Features

- **Unified view** — see all credit benefits across all your Amex cards on one page
- **Responsive card grid** — adapts from 1 column on mobile to as many as fit on wide screens
- **Grouped by period** — Monthly, Quarterly, Semi-Annual, and Annual sections with color-coded urgency badges
- **"Needs Action" filter** — one-click to see only incomplete credits, sorted by most urgent first
- **Smart period detection** — detects actual period from dates, not Amex's sometimes-incorrect labels
- **Current period progress** — progress bars show current period completion at a glance
- **Annual tracking** — year-to-date totals shown as secondary info with `totalSavingsYearToDate` when available
- **Per-card breakdown** — click any benefit card to expand and see per-card status
- **Auto-discovery** — intercepts page API calls to capture card data automatically
- **Self-tracking YTD** — stores period data in localStorage for year-to-date calculation when the API doesn't provide it

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Create a new script in Tampermonkey
3. Copy the contents of `src/amex-benefits-dashboard.user.js` and paste it
4. Save and navigate to [americanexpress.com](https://global.americanexpress.com)

## Usage

1. Log into your Amex account
2. Visit any card's benefits page once (e.g., go to Rewards & Benefits for any card) to prime the data cache
3. Click the **"All Benefits"** floating button (bottom-left corner)
4. The dashboard loads with all your cards' credit trackers

After the first visit, the card data is cached in localStorage and the dashboard works from any Amex page.

## How It Works

The script runs at `document-start` and monkey-patches `fetch` to intercept the page's own API calls to `functions.americanexpress.com`. This captures account tokens and card details as the page loads. When you click "All Benefits", it fans out tracker API calls for each card with concurrency control, aggregates the results by benefit type, and renders a full-screen dashboard overlay.

### Key Design Decisions

- **`@grant none` + `@run-at document-start`** — runs in the page context to intercept fetch calls and use session cookies
- **Date-based period detection** — Amex sometimes mislabels durations (e.g., quarterly credits labeled as annual). The script calculates actual period length from `periodStartDate`/`periodEndDate`
- **Concurrency-limited API calls** — default 3 parallel requests with exponential backoff on rate limits
- **Progressive loading** — skeleton UI shown while cards load, with progress counter

## Configuration

Edit the `CONFIG` object at the top of the script:

```javascript
const CONFIG = {
  CONCURRENCY: 3,        // max parallel API calls (reduce if rate-limited)
  MAX_RETRIES: 3,        // per-request retry limit
  RETRY_BASE_DELAY: 2000, // ms, doubles on each retry
};
```

## Privacy

- No data is sent to any external server
- All data stays in your browser (localStorage)
- The script only communicates with `*.americanexpress.com` domains
- No analytics, no tracking, no telemetry

## License

MIT
