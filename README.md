# Amex Benefits Dashboard

A Tampermonkey userscript that adds a unified benefits credit tracker dashboard to the American Express website. Track all your card credits in one place instead of navigating to each card's benefits page individually.

## Features

- **Unified view** — see all credit benefits across all your Amex cards on one page
- **Grouped by period** — Monthly, Semi-Annual, and Annual sections with urgency badges
- **Responsive card grid** — adapts from 1 column on mobile to many on wide screens
- **"Needs Action" filter** — one-click to see only incomplete credits, sorted by urgency
- **Current period + annual tracking** — progress bars show current period, annual total shown as secondary info
- **Per-card breakdown** — click any benefit to expand and see per-card status
- **Auto-discovery** — intercepts page API calls to capture card data automatically
- **Self-tracking YTD** — stores period data in localStorage for year-to-date calculation

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Create a new script in Tampermonkey
3. Copy the contents of `src/amex-benefits-dashboard.user.js` and paste it
4. Save and navigate to [americanexpress.com](https://global.americanexpress.com)

## Usage

1. Log into your Amex account
2. Visit any card's benefits page once (e.g., `/card-benefits/view-all/platinum`) to prime the data cache
3. Click the **"All Benefits"** floating button (bottom-left corner)
4. The dashboard loads with all your cards' credit trackers

After the first visit, the card data is cached in localStorage and the dashboard works from any Amex page.

## How It Works

The script intercepts the page's own API calls to `functions.americanexpress.com` to capture account tokens and card details. When the dashboard is triggered, it fans out `ReadBestLoyaltyBenefitsTrackers.v1` calls for each card with concurrency control, aggregates the results by benefit type, and renders the dashboard overlay.

### APIs Used

| Endpoint | Purpose |
|----------|---------|
| `ReadLoyaltyBenefitsCardProduct.v1` | Discover all cards and their product types |
| `ReadLoyaltyAccounts.v1` | Get display account numbers for card labels |
| `ReadBestLoyaltyBenefitsTrackers.v1` | Get credit tracker data per card |

All API calls use the browser's existing session cookies (same-origin). No credentials are stored or transmitted externally.

## Configuration

Edit the `CONFIG` object at the top of the script:

```javascript
const CONFIG = {
  CONCURRENCY: 3,        // max parallel API calls
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
