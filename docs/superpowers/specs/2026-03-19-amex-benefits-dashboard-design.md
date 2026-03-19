# Amex Benefits Dashboard — Tampermonkey Script Design

## Problem

User has 11 Amex cards (2 personal Platinum, 5 Business Platinum, 3 Business Gold, 1 EveryDay Preferred) each with monthly/semi-annual/annual credits to track. Currently requires navigating to each card's benefits page individually — dozens of line items across 11 pages.

## Solution

A Tampermonkey userscript that injects a unified "All Benefits" dashboard page into the Amex website. It fetches credit tracker data for all cards via Amex's internal APIs and displays an aggregated view grouped by benefit type and reset period.

## Cards

| Card Type                | Count |
|--------------------------|-------|
| Amex EveryDay Preferred  | 1     |
| Platinum Card (personal) | 2     |
| Business Platinum Card   | 5     |
| Business Gold Card       | 3     |

## Architecture

### Interaction Model

- **Dedicated page injection**: script adds an "All Benefits" link to the Amex top navigation bar
- Clicking it replaces the main content area with a full-page dashboard
- Dashboard uses Amex's own DLS (Design Language System) CSS to look native

### Data Flow

1. User clicks "All Benefits" nav link
2. Script calls `POST ReadLoyaltyAccounts.v1` to get all card accounts
3. For each card, calls `POST ReadBestLoyaltyBenefitsTrackers.v1` in parallel (concurrency-limited) to get credit tracker data
4. Aggregator groups trackers by benefit name, merges identical benefits across cards, computes totals
5. Renderer builds the dashboard DOM and injects it, rendering progressively as data arrives

All API calls go to `functions.americanexpress.com` using the browser's existing session cookies (same-origin, no auth tokens needed).

### API Endpoints

| Endpoint                                | Method | Purpose                                    |
|-----------------------------------------|--------|--------------------------------------------|
| `ReadLoyaltyAccounts.v1`                | POST   | List all card accounts                     |
| `ReadBestLoyaltyBenefitsTrackers.v1`    | POST   | Credit tracker data per card (used/total/reset date) |

Additional endpoints discovered but not required for MVP:
- `ReadLoyaltyBenefitsCardProduct.v1` — card product metadata
- `ReadLoyaltyBenefits.v2` — full benefits list (includes non-credit benefits)

### API Contracts

Request/response schemas are not yet captured because Amex blocks `eval()` on their pages, preventing JavaScript injection to intercept payloads. The implementation plan includes a **discovery phase** as the first step:

1. Install a minimal Tampermonkey script that monkey-patches `fetch` before Amex's app.js loads (`@run-at document-start`)
2. Log request bodies and response payloads for `ReadLoyaltyAccounts.v1` and `ReadBestLoyaltyBenefitsTrackers.v1` to the console
3. Document the exact field names, nesting, and join keys
4. Update this spec with the captured schemas before proceeding to implementation

**Known from network observation:**
- Both endpoints use `POST` with `Content-Type: application/json`
- Headers include `ce-source: web.loyalty.benefits-view-all.benefits-dashboard`
- The benefits page also calls `ReadLoyaltyAccounts.v1` on load, confirming it provides the account list used to fan out tracker requests
- The join key between accounts and trackers is likely an account token or index returned in the accounts response (to be confirmed in discovery)

### Benefit Name Grouping

Trackers will be grouped by a stable identifier from the API (benefit ID or code) rather than display name string matching. If the API does not provide a stable ID, fallback to normalized display name (lowercase, stripped of card-specific prefixes). This will be confirmed during the discovery phase.

### SPA Routing Strategy

Amex uses a React SPA with client-side routing. The dashboard will:
- Use `history.pushState` to create a virtual route at `/card-benefits/view-all/dashboard`
- Listen for `popstate` events to tear down the dashboard when the user navigates away
- Use a `MutationObserver` on the nav container to re-inject the "All Benefits" link if the nav re-renders on route changes

### Loading State

While data is loading:
- Show a skeleton UI with placeholder rows (count based on number of accounts returned from step 2)
- Fill in rows progressively as each card's tracker data resolves
- Show a subtle progress indicator: "Loading 3 of 11 cards..."

### Session Expiration Detection

Session expiration is detected by:
- HTTP 401 or 403 status codes
- HTTP 200 with a response body containing an error/redirect pattern (e.g., login URL in response). The exact pattern will be confirmed during the discovery phase.
- If detected on any API call, stop all pending fetches and show the login prompt.

## UI Design

### Layout

- **Header**: title, card/credit count, summary badges (expiring soon / fully used / unused)
- **Period filter tabs**: All Periods | Monthly | Semi-Annual | Annual | Expiring This Week
- **Content sections**: grouped by reset period (Monthly first, then Semi-Annual, then Annual)
- Each section has a period header with "resets in X days" urgency badge

### Benefit Rows (Aggregated)

Each row represents one benefit type across all cards that have it:
- Benefit name + card count
- Aggregated progress: total used / total available
- Color-coded progress bar: red (unused), orange (partial), green (fully used)
- Expandable per-card breakdown showing individual card status

### Color Coding

| Status       | Color  | Progress Bar |
|--------------|--------|-------------|
| Unused       | Red    | #ef5350     |
| Partial      | Orange | #ffa726     |
| Fully used   | Green  | #66bb6a     |

### Urgency Badges on Period Headers

| Days Until Reset | Color       |
|------------------|-------------|
| <= 7 days        | Red badge   |
| <= 30 days       | Orange badge|
| > 30 days        | Green badge |

## Script Structure

Single `.user.js` file with four logical modules:

1. **API Client** — wraps `fetch` calls, handles retry/backoff, concurrency pool
2. **Data Aggregator** — groups trackers by benefit name, computes totals, sorts by urgency
3. **UI Renderer** — builds dashboard DOM, handles expand/collapse and period filters
4. **Nav Injector** — adds "All Benefits" link to Amex nav, handles routing

### Configuration Constants (top of script)

```
CONCURRENCY = 3        // max parallel API calls (tune if rate-limited)
MAX_RETRIES = 3        // per-request retry limit
RETRY_BASE_DELAY = 2000 // ms, doubles on each retry
```

## Rate Limiting Strategy

- Default concurrency: 3 parallel API calls (matches Amex's own batching pattern)
- On 429/503 response: exponential backoff (2s → 4s → 8s), max 3 retries
- If multiple 429s detected: auto-reduce concurrency to 1 (sequential mode)
- Configurable via constant at top of script

## Error Handling

| Scenario           | Behavior                                                    |
|--------------------|-------------------------------------------------------------|
| Session expired    | Show "Please log in again" with link to login page          |
| Per-card API failure | Show inline error for that card, don't block others       |
| Rate limited (429) | Exponential backoff, auto-reduce concurrency                |
| No trackers found  | Silently skip card (e.g., EveryDay Preferred has no credits)|

## Scope

### In Scope
- Nav link injection into Amex navigation
- Full-page dashboard replacing main content
- API fetching with concurrency control and retry
- Benefit aggregation across cards
- Period-based grouping and filtering
- Expand/collapse per-card breakdown
- Progressive rendering as data loads
- Color-coded progress bars and urgency badges

### Out of Scope
- Persistent storage or caching (always fetches fresh)
- Push notifications or reminders
- Settings UI (use script constants)
- Mobile responsiveness (desktop only)
- Non-credit benefits (lounge access, hotel status, etc.)

## Tampermonkey Metadata

```
@match https://global.americanexpress.com/*
@match https://www.americanexpress.com/*
@grant none
@run-at document-start
```

`@grant none` allows the script to use the page's native `fetch` with existing session cookies. No special GM permissions needed.

`@run-at document-start` is required so the script can monkey-patch `fetch` before Amex's app.js loads (needed for the discovery phase and for intercepting API responses during normal operation).
