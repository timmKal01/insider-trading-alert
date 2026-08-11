import { Actor, log } from 'apify';
import { lookupCik, fetchFilingList, fetchFilingTransactions } from './sec.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { ticker, transactionType = 'all', minTransactionValue, maxFilings = 20 } = input;

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const INSIDER_SEARCH_EVENT = 'insider-search';

let cik = null;
if (ticker) {
    cik = await lookupCik(ticker);
    log.info(`Resolved ${ticker} to CIK ${cik}`);
}

// The market-wide feed emits one entry per issuer/reporting-owner on each filing (not one
// per filing) and only supports fixed count buckets (10/40/100) that don't scale linearly
// with unique filings returned, so always request the max and dedup+slice locally. The
// company-specific (ticker) feed is ~1:1 already, so request only what's needed there.
const filings = await fetchFilingList({ cik, count: cik ? Math.min(maxFilings, 50) : 100 });
log.info(`Found ${filings.length} unique filing(s) available (requested up to ${maxFilings})`);

const filingsToScan = filings.slice(0, maxFilings);
let pushedCount = 0;
for (const filing of filingsToScan) {
    let transactions = [];
    try {
        transactions = await fetchFilingTransactions(filing);
    } catch (err) {
        log.warning(`Failed to parse filing`, { accessionNumber: filing.accessionNumber, error: err.message });
        continue;
    }

    for (const t of transactions) {
        if (transactionType === 'acquired' && t.acquiredDisposedCode !== 'A') continue;
        if (transactionType === 'disposed' && t.acquiredDisposedCode !== 'D') continue;
        if (minTransactionValue && (!t.transactionValue || t.transactionValue < minTransactionValue)) continue;

        await Actor.pushData(t);
        pushedCount += 1;
    }
}

await Actor.charge({ eventName: INSIDER_SEARCH_EVENT });

log.info(`Pushed ${pushedCount} transaction(s) from ${filingsToScan.length} filing(s) scanned`);

await Actor.exit();
