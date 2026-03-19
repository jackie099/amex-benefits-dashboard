# Amex API Schemas

Reference schemas for the Amex internal APIs used by this script. Account tokens and numbers below are sanitized examples.

## ReadLoyaltyBenefitsCardProduct.v1

Maps account tokens to card product names.

### Request
```json
{
  "accountTokens": ["TOKEN1", "TOKEN2", ...],
  "cardNames": [],
  "productType": "AEXP_CARD_ACCOUNT"
}
```

### Response
```json
{
  "cardDetails": [
    {
      "cardName": "platinum",           // "platinum", "business-platinum", "business-gold", "amex-everyday-preferred"
      "accountToken": "XXXXXXXXXXX1234",
      "iaCode": "2X",
      "pmcCode": "137",
      "relationship": "BASIC",
      "cardType": "CCSG"                // "CCSG" = consumer, "OPEN" = business
    }
  ]
}
```

## ReadLoyaltyAccounts.v1

Gets loyalty account info including all related card account tokens and display numbers.

### Request
```json
{
  "accountTokens": ["TOKEN1"],
  "productType": "AEXP_CARD_ACCOUNT"
}
```

### Response
```json
[
  {
    "status": { "code": "0000", "message": "SUCCESS" },
    "accountToken": "XXXXXXXXXXX1234",
    "loyaltyAccountStatus": "ACTIVE",
    "relationships": [
      {
        "accountToken": "XXXXXXXXXXX5678",
        "primary": false,
        "status": "ACTIVE",
        "displayAccountNumber": "XXXXX",
        "productRelationshipType": "CREDIT_CARD_ACCOUNT"
      }
    ]
  }
]
```

## ReadBestLoyaltyBenefitsTrackers.v1

Gets credit/benefit trackers for one or more accounts.

### Request
```json
[
  {
    "accountToken": "XXXXXXXXXXX1234",
    "locale": "en-US",
    "limit": "ALL"
  }
]
```

### Response
```json
[
  {
    "accountToken": "XXXXXXXXXXX1234",
    "trackers": [
      {
        "benefitId": "200-afc-tracker",
        "benefitName": "$200 Airline Fee Credit",
        "category": "usage",
        "status": "IN_PROGRESS",
        "trackerDuration": "CalenderYear",
        "periodStartDate": "2026-01-01",
        "periodEndDate": "2026-12-31",
        "tracker": {
          "targetAmount": "200.00",
          "spentAmount": "0.00",
          "remainingAmount": "200.00",
          "targetUnit": "MONETARY",
          "targetCurrency": "USD",
          "targetCurrencySymbol": "$"
        },
        "progress": {
          "title": "$200 Airline Fee Credit",
          "message": "...",
          "usedLabel": "Earned",
          "togoLabel": "To Go",
          "totalSavingsYearToDate": "0.00",
          "hideProgressBar": false
        }
      }
    ]
  }
]
```

### Key Fields

| Field | Description |
|-------|-------------|
| `benefitId` | Stable string ID for grouping (e.g., "200-afc-tracker", "digital-entertainment") |
| `benefitName` | Display name (e.g., "$200 Airline Fee Credit") |
| `category` | "usage" = credit trackers, "spend" = spending thresholds |
| `status` | "IN_PROGRESS", "ACHIEVED" |
| `trackerDuration` | "Monthly", "HalfYear", "CalenderYear" (note: Amex typo "Calender") |
| `periodStartDate` / `periodEndDate` | Current period boundaries |
| `tracker.targetAmount` | Total credit available (string) |
| `tracker.spentAmount` | Amount used (string) |
| `tracker.remainingAmount` | Amount remaining (string) |

### Data Flow

1. Call `ReadLoyaltyBenefitsCardProduct.v1` with all account tokens → get `cardDetails[]` mapping tokens to card names
2. For each card, call `ReadBestLoyaltyBenefitsTrackers.v1` → get `trackers[]` per card
3. Filter trackers where `category === "usage"` (skip "spend" thresholds like Centurion lounge)
4. Group by `benefitId` across cards, aggregate amounts
5. Use `displayAccountNumber` from `ReadLoyaltyAccounts.v1` relationships for display
