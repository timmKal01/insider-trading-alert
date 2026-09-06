# Insider Trading Alert — Executive Buy & Sell Signals

Track SEC Form 4 filings: which company executives, directors, and 10%+
owners just bought or sold stock, how many shares, at what price, and how
many shares they hold now. Search one company by ticker, or scan the
market-wide feed of the newest insider filings across all companies.

Built for investors and analysts screening for insider conviction (or
concern), and sales/research teams using insider buying as a signal
alongside other buying-intent data. Replaces manually paging through EDGAR's
Form 4 feed or a ticker's individual filing history by hand.

## Input

```json
{
  "ticker": "AAPL",
  "transactionType": "disposed",
  "minTransactionValue": 100000,
  "maxFilings": 20
}
```

| Field | Type | Description |
|---|---|---|
| `ticker` | string | Stock ticker for one company. Leave blank to scan the market-wide feed of the newest Form 4 filings across all companies. |
| `transactionType` | string | `all`, `acquired` (buys), or `disposed` (sells). Default `all`. |
| `minTransactionValue` | number | Only return transactions worth at least this much (shares × price). Leave blank for no minimum. |
| `maxFilings` | number | How many recent filings to fetch and parse (each can contain multiple transactions). Default `20`, max `50`. Market-wide scans draw from SEC's latest ~100-filing buffer, so very high values may return fewer unique filings than requested when filing activity is low. |

## Output

One record per transaction:

```json
{
  "filingUrl": "https://www.sec.gov/Archives/edgar/data/320193/000114036126025622/0001140361-26-025622-index.htm",
  "accessionNumber": "0001140361-26-025622",
  "issuerName": "Apple Inc.",
  "issuerTicker": "AAPL",
  "issuerCik": 320193,
  "reportingOwnerName": "Newstead Jennifer",
  "reportingOwnerCik": 1780525,
  "coReportingOwners": [],
  "isOfficer": true,
  "officerTitle": "SVP, GC and Secretary",
  "isDirector": false,
  "isTenPercentOwner": false,
  "securityTitle": "Common Stock",
  "transactionDate": "2026-06-15",
  "transactionCode": "F",
  "acquiredDisposedCode": "D",
  "shares": 16238,
  "pricePerShare": 296.42,
  "transactionValue": 4813267.96,
  "sharesOwnedAfter": 41546
}
```

`transactionCode` is SEC's own code (`P` open-market purchase, `S` open-market
sale, `A` grant/award, `M` option exercise, `F` shares withheld for taxes,
`G` gift, etc.) — `acquiredDisposedCode` (`A`/`D`) is the simpler acquired-vs-disposed
split used by the `transactionType` filter. This actor covers non-derivative
(common stock) transactions; option/derivative exercises are not included.

## How it works

Reads directly from the official [SEC EDGAR](https://www.sec.gov/edgar) system:
the public filings feed to discover recent Form 4 filings, then the filing's
own XML ownership document for full transaction detail. No proxy, no login,
no scraping of rendered pages — this is the same structured data EDGAR
itself is built on.

## Pricing note

Billed per **search**, not per transaction returned — one charge whether
the search returns 1 transaction or 50.

## Related products

Looking for company-level buying signals instead of insider trades?

- [Company Buying Signal Report](https://github.com/timmKal01/company-buying-signal-report) — hiring, tech stack & contact info combined per company
- [Federal Contract Award Tracker](https://github.com/timmKal01/federal-contract-award-tracker) — who just won government contracts
