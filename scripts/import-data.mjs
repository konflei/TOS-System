import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// Read the CSV
const csvPath = 'data/Elderlie_AI_Dashboard_Final_-_Customer_Data.csv';
let csvText;
try {
  csvText = readFileSync(csvPath, 'utf-8');
} catch(e) {
  console.error('Cannot read CSV from disk:', e.message);
  process.exit(1);
}

// Simple CSV parser that handles quoted fields with embedded newlines
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < text.length) {
    const char = text[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (text[i+1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  
  return rows;
}

const rows = parseCSV(csvText);
const headers = rows[0].map(h2 => h2.trim());
console.log('Headers:', headers.length, 'columns');
console.log('Data rows:', rows.length - 1);

const h = {};
headers.forEach((header, idx) => { h[header] = idx; });

function parseAmount(val) {
  if (!val || val.trim() === '') return null;
  const cleaned = val.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (!val || val.trim() === '') return null;
  const months = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };
  const monthsShort = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Sept:9, Oct:10, Nov:11, Dec:12 };
  const m = val.match(/(\w+)\s+(\d+)/);
  if (m) {
    const monthName = m[1];
    const day = parseInt(m[2]);
    const month = months[monthName] || monthsShort[monthName];
    if (month && day) return `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return null;
}

function parseBool(val) {
  if (!val) return false;
  return val.trim().toLowerCase() === 'yes' || val.trim().toLowerCase() === 'true' || val.trim() === '1';
}

function parseNum(val) {
  if (!val || val.trim() === '') return null;
  const num = parseFloat(val.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function parseInt2(val) {
  if (!val || val.trim() === '') return null;
  const num = parseInt(val.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function parseTransactions(row) {
  const amountRaw = row[h['Amount (Raw)']] || '';
  const dateRaw = row[h['Transaction Date (Raw)']] || '';
  const statusRaw = row[h['Status']] || '';
  const orderLinks = row[h['Order Links']] || '';
  const txnDate = row[h['Transaction Date']] || '';
  const links = orderLinks.split('\n').map(l => l.trim()).filter(l => l);
  const amountLines = amountRaw.split('\n').map(l => l.trim()).filter(l => l);
  const transactions = [];
  
  if (amountLines.length > 1 && amountLines[0].includes(':')) {
    for (const line of amountLines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const orderId = parts[0].trim();
        const amountStr = parts.slice(1).join(':').trim();
        const amount = parseAmount(amountStr.replace(/[A-Za-z]+$/, '').trim());
        const currency = (amountStr.match(/[A-Za-z]+$/) || ['CAD'])[0].trim();
        const link = links.find(l => l.includes(orderId)) || '';
        transactions.push({ order_id: orderId, amount: amount || 0, currency, txn_date: parseDate(txnDate) || parseDate(dateRaw), status: 'Unknown', fulfilled: 'Unknown', order_link: link });
      }
    }
  } else {
    const amount = parseAmount(row[h['Amount Numeric']]);
    const currency = (row[h['Currency']] || 'CAD').trim();
    const date = parseDate(txnDate) || parseDate(dateRaw);
    const firstLink = links[0] || '';
    const orderIdMatch = firstLink.match(/\/(\d+)$/);
    const orderId = orderIdMatch ? orderIdMatch[1] : `TXN-${Date.now()}`;
    let status = 'Unknown', fulfilled = 'Unknown';
    const sl = statusRaw.toLowerCase();
    if (sl.includes('in progress')) status = 'In Progress';
    else if (sl.includes('complete') && sl.includes('fulfilled: true')) { status = 'Complete'; fulfilled = 'True'; }
    else if (sl.includes('complete') && sl.includes('fulfilled: false')) { status = 'Complete'; fulfilled = 'False'; }
    else if (sl.includes('complete')) { status = 'Complete'; fulfilled = 'Unknown'; }
    else if (sl.includes('refund')) { status = 'Refund Requested'; }
    else if (sl.includes('cancel')) { status = 'Cancelled'; }
    else if (sl.includes('chargeback')) { status = 'Chargeback Warning'; }
    transactions.push({ order_id: orderId, amount: amount || 0, currency, txn_date: date, status, fulfilled, order_link: firstLink });
  }
  return transactions;
}

const customers = [];
const allTransactions = [];

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.length < 5) continue;
  const customerNum = parseInt2(row[h['Customer #']]);
  const name = (row[h['Name']] || '').trim();
  if (!name && !customerNum) continue;
  
  const email = (row[h['Primary Email']] || '').trim();
  const otherEmails = (row[h['Other Emails']] || '').trim();
  const altEmails = otherEmails ? otherEmails.split(',').map(e => e.trim()).filter(e => e) : [];
  const age = parseInt2(row[h['Age Numeric']]);
  const region = (row[h['Region Group']] || '').trim();
  const address = (row[h['Address']] || '').trim();
  const reviewFlag = (row[h['Review Flag']] || '').trim();
  const aiSummary = (row[h['AI Summary']] || '').trim();
  const profileLink = (row[h['Profile Link']] || '').trim();
  const tosReviewPriority = (row[h['TOS Review Priority']] || '').trim();
  const walletsListed = parseInt2(row[h['Wallets Listed']]);
  const walletsScreened = parseInt2(row[h['Wallets Screened']]);
  const maxWalletRisk = parseNum(row[h['Max Wallet Risk Score %']]);
  const walletsScored25 = parseInt2(row[h['Wallets Score >=25%']]);
  const notableExposure = parseBool(row[h['Any Notable Wallet Exposure?']]);
  const notableExposureDetail = (row[h['Notable Wallet Exposure']] || '').trim();
  const preliminaryTosPosition = (row[h['Preliminary TOS Position']] || '').trim();
  const tosAssessmentNotes = (row[h['TOS Assessment Notes']] || '').trim();
  const transactionsLinked = (row[h['Transactions Linked to Evidence']] || '').trim();
  const complianceAnswer = (row[h['Provided All Compliance Answers?']] || '').trim();
  let complianceStatus = 'Unknown';
  if (complianceAnswer === 'Yes') complianceStatus = 'Complete';
  else if (complianceAnswer === 'Partial') complianceStatus = 'Partial';
  else if (complianceAnswer === 'No') complianceStatus = 'No Compliance';
  else if (complianceAnswer === 'Unable to Determine') complianceStatus = 'Unable to Determine';
  const vpn = parseBool(row[h['VPN True']]);
  const tor = parseBool(row[h['TOR True']]);
  const proxy = parseBool(row[h['Proxy True']]);
  const recentAbuse = parseBool(row[h['Recent Abuse True']]);
  const ipFlag = parseBool(row[h['IP/Device Flag?']]);
  
  customers.push({
    customer_number: customerNum, name, email, alt_emails: altEmails, region, age, address,
    compliance_status: complianceStatus, vpn, proxy, tor, mobile_ip: false, recent_abuse: recentAbuse,
    crawler: false, geo_inconsistency: ipFlag, device_inconsistency: false,
    ai_assessment_status: 'Not Assessed', human_review_status: 'Pending', is_demo: false, notes: '',
    review_flag: reviewFlag, ai_summary: aiSummary, profile_link: profileLink, tos_review_priority: tosReviewPriority,
    wallets_listed: walletsListed, wallets_screened: walletsScreened, max_wallet_risk_score: maxWalletRisk,
    wallets_scored_25: walletsScored25, notable_wallet_exposure: notableExposure,
    notable_wallet_exposure_detail: notableExposureDetail, preliminary_tos_position: preliminaryTosPosition,
    tos_assessment_notes: tosAssessmentNotes, transactions_linked_to_evidence: transactionsLinked,
  });
  
  const txns = parseTransactions(row);
  for (const t of txns) allTransactions.push({ ...t, customerIndex: customers.length - 1 });
}

console.log(`Parsed ${customers.length} customers and ${allTransactions.length} transactions`);

// Delete existing data
console.log('Deleting existing data...');
await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await supabase.from('wallets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await supabase.from('customer_assessments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

// Insert customers in batches
console.log('Inserting customers...');
const BATCH_SIZE = 20;
const customerIds = [];

for (let i = 0; i < customers.length; i += BATCH_SIZE) {
  const batch = customers.slice(i, i + BATCH_SIZE);
  const { data, error } = await supabase.from('customers').insert(batch).select('id, customer_number');
  if (error) {
    console.error(`Error inserting batch ${i}:`, error.message);
    for (const c of batch) {
      const { data: d, error: e2 } = await supabase.from('customers').insert(c).select('id, customer_number');
      if (e2) console.error(`  Failed: ${c.name} (#${c.customer_number}): ${e2.message}`);
      else if (d) customerIds.push(d[0]);
    }
  } else if (data) {
    customerIds.push(...data);
  }
}
console.log(`Inserted ${customerIds.length} customers`);

// Insert transactions
console.log('Inserting transactions...');
let txnCount = 0;
for (let i = 0; i < allTransactions.length; i++) {
  const t = allTransactions[i];
  const customerRecord = customerIds.find(c => c.customer_number === customers[t.customerIndex].customer_number);
  if (!customerRecord) continue;
  const { error } = await supabase.from('transactions').insert({
    customer_id: customerRecord.id, order_id: t.order_id, txn_date: t.txn_date,
    amount: t.amount, currency: t.currency, status: t.status, fulfilled: t.fulfilled, order_link: t.order_link,
  });
  if (error) console.error(`  Txn error for ${t.order_id}: ${error.message}`);
  else txnCount++;
}
console.log(`Inserted ${txnCount} transactions`);

// Verify
const { count: cc } = await supabase.from('customers').select('*', { count: 'exact', head: true });
const { count: tc } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
console.log(`\nFinal: ${cc} customers, ${tc} transactions`);
console.log('Import complete!');
