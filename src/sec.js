import { XMLParser } from 'fast-xml-parser';

const UA = 'InsiderTradingAlert/0.1 (+contact: insider-trading-alert-admin@example.com)';
const feedParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const docParser = new XMLParser({ ignoreAttributes: true, trimValues: true });

async function secFetch(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`SEC request failed: ${url} (${res.status})`);
    return res;
}

export async function lookupCik(ticker) {
    const res = await secFetch('https://www.sec.gov/files/company_tickers.json');
    const data = await res.json();
    const match = Object.values(data).find((t) => t.ticker.toUpperCase() === ticker.toUpperCase());
    if (!match) throw new Error(`Ticker not found: ${ticker}`);
    return String(match.cik_str).padStart(10, '0');
}

/** Returns deduped {accessionNumber, indexUrl} entries, newest first, from an Atom filings feed. */
export async function fetchFilingList({ cik, count }) {
    const url = cik
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=${count}&output=atom`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=${count}&output=atom`;
    const res = await secFetch(url);
    const xml = feedParser.parse(await res.text());
    let entries = xml?.feed?.entry ?? [];
    if (!Array.isArray(entries)) entries = [entries];

    const seen = new Set();
    const filings = [];
    for (const entry of entries) {
        const idText = String(entry.id ?? '');
        const m = idText.match(/accession-number=([\d-]+)/);
        if (!m) continue;
        const accessionNumber = m[1];
        if (seen.has(accessionNumber)) continue;
        seen.add(accessionNumber);
        const link = Array.isArray(entry.link) ? entry.link[0] : entry.link;
        filings.push({ accessionNumber, indexUrl: link?.['@_href'] });
    }
    return filings;
}

function toArray(v) {
    if (v === undefined || v === null || v === '') return [];
    return Array.isArray(v) ? v : [v];
}

/** SEC filings inconsistently encode booleans as 1/0, "1"/"0", or true/(absent). */
function isFlagSet(v) {
    return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

/** Fetches a filing's directory listing and returns its ownership XML document URL, or null if not found. */
async function findOwnershipXmlUrl(indexUrl) {
    const dirUrl = indexUrl.replace(/\/[^/]+$/, '');
    const res = await secFetch(`${dirUrl}/index.json`);
    const json = await res.json();
    const xmlItem = (json.directory?.item ?? []).find(
        (i) => i.name.toLowerCase().endsWith('.xml') && !i.name.toLowerCase().includes('index'),
    );
    return xmlItem ? `${dirUrl}/${xmlItem.name}` : null;
}

/** Fetches and parses one Form 4 filing into flat transaction rows. */
export async function fetchFilingTransactions({ accessionNumber, indexUrl }) {
    const xmlUrl = await findOwnershipXmlUrl(indexUrl);
    if (!xmlUrl) return [];

    const res = await secFetch(xmlUrl);
    const doc = docParser.parse(await res.text())?.ownershipDocument;
    if (!doc) return [];

    const issuer = doc.issuer ?? {};
    const owners = toArray(doc.reportingOwner);
    const primaryOwner = owners[0]?.reportingOwnerId ?? {};
    const relationship = owners[0]?.reportingOwnerRelationship ?? {};
    const coOwners = owners.slice(1).map((o) => o.reportingOwnerId?.rptOwnerName).filter(Boolean);

    const transactions = toArray(doc.nonDerivativeTable?.nonDerivativeTransaction);

    return transactions.map((t) => {
        const shares = Number(t.transactionAmounts?.transactionShares?.value ?? 0);
        const price = Number(t.transactionAmounts?.transactionPricePerShare?.value ?? 0);
        return {
            filingUrl: indexUrl,
            accessionNumber,
            issuerName: issuer.issuerName,
            issuerTicker: issuer.issuerTradingSymbol,
            issuerCik: issuer.issuerCik,
            reportingOwnerName: primaryOwner.rptOwnerName,
            reportingOwnerCik: primaryOwner.rptOwnerCik,
            coReportingOwners: coOwners,
            isOfficer: isFlagSet(relationship.isOfficer),
            officerTitle: relationship.officerTitle || null,
            isDirector: isFlagSet(relationship.isDirector),
            isTenPercentOwner: isFlagSet(relationship.isTenPercentOwner),
            securityTitle: t.securityTitle?.value,
            transactionDate: t.transactionDate?.value,
            transactionCode: t.transactionCoding?.transactionCode,
            acquiredDisposedCode: t.transactionAmounts?.transactionAcquiredDisposedCode?.value,
            shares,
            pricePerShare: price || null,
            transactionValue: price ? Math.round(shares * price * 100) / 100 : null,
            sharesOwnedAfter: Number(t.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value ?? 0) || null,
        };
    });
}
