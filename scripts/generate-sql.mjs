import { readFileSync, writeFileSync } from 'fs';

function parseCSV(text) {
  const rows = [];
  let currentRow = [], currentField = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { currentField += '"'; i += 2; continue; }
        else { inQuotes = false; i++; continue; }
      } else { currentField += char; i++; continue; }
    } else {
      if (char === '"') { inQuotes = true; i++; continue; }
      else if (char === ',') { currentRow.push(currentField); currentField = ''; i++; continue; }
      else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ''; i++; continue; }
      else if (char === '\r') { i++; continue; }
      else { currentField += char; i++; continue; }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
  return rows;
}

function loadCSV(path) {
  const text = readFileSync(path, 'utf-8');
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = parseCSV(clean);
  const headers = rows[0].map(h => h.trim());
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => c.trim() === '')) continue;
    const obj = {};
    headers.forEach((header, idx) => { obj[header] = (row[idx] || '').trim(); });
    data.push(obj);
  }
  return { headers, data };
}

function sqlStr(val) {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function sqlNum(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const n = parseFloat(val);
  return isNaN(n) ? 'NULL' : String(n);
}

function sqlInt(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const n = parseInt(String(val).replace(/,/g, ''));
  return isNaN(n) ? 'NULL' : String(n);
}

function sqlBool(val) {
  return val ? 'true' : 'false';
}

function parseAmount(val) {
  if (!val || val.trim() === '') return null;
  const cleaned = val.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function complianceStatus(val) {
  const v = (val || '').trim();
  if (v === 'Yes') return 'Complete';
  if (v === 'Partial') return 'Partial';
  if (v === 'No') return 'No Compliance';
  if (v === 'Unable to Determine') return 'Unable to Determine';
  return 'Unknown';
}

function txnStatus(val) {
  const sl = (val || '').toLowerCase().trim();
  if (sl.includes('in progress')) return 'In Progress';
  if (sl.includes('complete')) return 'Complete';
  if (sl.includes('chargeback')) return 'Chargeback Warning';
  if (sl.includes('refund')) return 'Refund Requested';
  if (sl.includes('cancel')) return 'Cancelled';
  if (sl) return val.trim();
  return 'Unknown';
}

function fulfilledStatus(val) {
  const v = (val || '').trim();
  if (v === 'true') return 'True';
  if (v === 'false') return 'False';
  return 'Unknown';
}

function screeningRiskLevel(score) {
  if (score === null) return 'Unknown';
  if (score >= 75) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}

function refundStatus(val) {
  const sl = (val || '').toLowerCase().trim();
  if (sl.includes('refunded')) return 'Refunded';
  if (sl.includes('refund')) return 'Requested';
  return 'Requested';
}

const SC = 'scripts/';

// Load all CSVs
const customersCSV = loadCSV(SC + 'customers.csv');
const emailsCSV = loadCSV(SC + 'customer_emails.csv');
const txnsCSV = loadCSV(SC + 'transactions.csv');
const walletsCSV = loadCSV(SC + 'wallets.csv');
const screeningsCSV = loadCSV(SC + 'wallet_screenings.csv');
const refundsCSV = loadCSV(SC + 'refunds.csv');
const chargebacksCSV = loadCSV(SC + 'chargebacks.csv');

let sql = '';

// ── Clean existing data (preserve tos_rules, app_settings) ──
sql += `-- Clean existing data (preserve tos_rules & app_settings)\n`;
sql += `DELETE FROM chargebacks;\n`;
sql += `DELETE FROM refunds;\n`;
sql += `DELETE FROM wallet_screenings;\n`;
sql += `DELETE FROM wallets;\n`;
sql += `DELETE FROM ip_device_events;\n`;
sql += `DELETE FROM customer_emails;\n`;
sql += `DELETE FROM transactions;\n`;
sql += `DELETE FROM customer_assessments;\n`;
sql += `DELETE FROM transaction_assessments;\n`;
sql += `DELETE FROM human_reviews;\n`;
sql += `DELETE FROM damage_assessments;\n`;
sql += `DELETE FROM audit_logs;\n`;
sql += `DELETE FROM import_batches;\n`;
sql += `DELETE FROM customers;\n\n`;

// ── Customers ──
sql += `-- Customers (${customersCSV.data.length} rows)\n`;
sql += `INSERT INTO customers (customer_number, name, email, alt_emails, region, age, compliance_status, vpn, proxy, tor, mobile_ip, recent_abuse, crawler, geo_inconsistency, device_inconsistency, ai_assessment_status, human_review_status, is_demo, address, profile_link, notable_wallet_exposure) VALUES\n`;
const cVals = [];
for (const row of customersCSV.data) {
  const cn = sqlInt(row['customer_number']);
  const name = sqlStr(row['name']);
  const email = sqlStr(row['primary_email'] || null);
  const region = sqlStr(row['region_group'] || null);
  const age = sqlInt(row['age_numeric']);
  const cs = sqlStr(complianceStatus(row['compliance_answered']));
  const address = sqlStr(row['address'] && row['address'] !== 'Not provided' && row['address'] !== 'Cannot be determined' && row['address'] !== 'Not confirmed' ? row['address'] : null);
  const profile = sqlStr(row['profile_url'] || null);
  cVals.push(`(${cn}, ${name}, ${email}, ARRAY[]::text[], ${region}, ${age}, ${cs}, false, false, false, false, false, false, false, false, 'Pending', 'Not Reviewed', false, ${address}, ${profile}, false)`);
}
sql += cVals.join(',\n') + ';\n\n';

// ── Transactions ──
sql += `-- Transactions (${txnsCSV.data.length} rows)\n`;
sql += `INSERT INTO transactions (customer_id, order_id, txn_date, amount, currency, status, fulfilled, refund_status, chargeback_status, tos_assessment_status, order_link) VALUES\n`;
const tVals = [];
for (const row of txnsCSV.data) {
  const cn = parseInt(row['customer_number']);
  const orderId = sqlStr(row['order_id']);
  const amount = parseAmount(row['amount_numeric']) ?? 0;
  const currency = sqlStr(row['currency'] || 'CAD');
  const txnDate = sqlStr(row['transaction_date'] || null);
  const status = sqlStr(txnStatus(row['status_normalized']));
  const fulfilled = sqlStr(fulfilledStatus(row['fulfilled']));
  const orderUrl = sqlStr(row['order_url'] || null);
  const sl = (row['status_normalized'] || '').toLowerCase();
  const refundStatus = sl.includes('refund') ? "'Requested'" : "'None'";
  const cbStatus = sl.includes('chargeback') ? "'Warning'" : "'None'";
  tVals.push(`((SELECT id FROM customers WHERE customer_number = ${cn}), ${orderId}, ${txnDate}::date, ${amount}, ${currency}, ${status}, ${fulfilled}, ${refundStatus}, ${cbStatus}, 'Pending', ${orderUrl})`);
}
sql += tVals.join(',\n') + ';\n\n';

// ── Customer emails ──
sql += `-- Customer emails (${emailsCSV.data.length} rows)\n`;
sql += `INSERT INTO customer_emails (customer_id, from_email, subject, body_text, attachment_names) VALUES\n`;
const eVals = [];
for (const row of emailsCSV.data) {
  const cn = parseInt(row['customer_number']);
  const email = sqlStr(row['email'] || null);
  const emailType = row['email_type'] || '';
  const subject = sqlStr(emailType ? `Customer email (${emailType})` : 'Customer email');
  eVals.push(`((SELECT id FROM customers WHERE customer_number = ${cn}), ${email}, ${subject}, '', ARRAY[]::text[])`);
}
sql += eVals.join(',\n') + ';\n\n';

// ── Wallets ──
sql += `-- Wallets (${walletsCSV.data.length} rows)\n`;
sql += `INSERT INTO wallets (customer_id, address, network, currency, link_confidence) VALUES\n`;
const wVals = [];
for (const row of walletsCSV.data) {
  const cn = parseInt(row['customer_number']);
  const address = sqlStr(row['wallet_address']);
  const network = sqlStr(row['mapped_currency_network'] || null);
  const currency = sqlStr(row['mapped_currency_network'] || null);
  wVals.push(`((SELECT id FROM customers WHERE customer_number = ${cn}), ${address}, ${network}, ${currency}, 'Associated with customer')`);
}
sql += wVals.join(',\n') + ';\n\n';

// ── Wallet screenings ──
sql += `-- Wallet screenings (${screeningsCSV.data.length} rows)\n`;
sql += `INSERT INTO wallet_screenings (wallet_id, risk_score, risk_level, sanctions, scam_fraud, mixer, darknet, stolen_funds, exposures, raw_findings) VALUES\n`;
const sVals = [];
for (const row of screeningsCSV.data) {
  const address = sqlStr(row['wallet_address']);
  const riskScore = sqlInt(row['risk_score_pct']);
  const riskLevel = sqlStr(screeningRiskLevel(riskScore === 'NULL' ? null : parseInt(riskScore)));
  const sanctions = sqlBool(sqlNum(row['sanctions']) !== 'NULL' && parseFloat(row['sanctions']) > 0);
  const scam = sqlBool(sqlNum(row['scam']) !== 'NULL' && parseFloat(row['scam']) > 0);
  const mixer = sqlBool(sqlNum(row['mixer']) !== 'NULL' && parseFloat(row['mixer']) > 0);
  const darkMarket = sqlNum(row['dark_market']) !== 'NULL' ? parseFloat(row['dark_market']) : 0;
  const darkService = sqlNum(row['dark_service']) !== 'NULL' ? parseFloat(row['dark_service']) : 0;
  const darknet = sqlBool(darkMarket > 0 || darkService > 0);
  const stolen = sqlBool(sqlNum(row['stolen_coins']) !== 'NULL' && parseFloat(row['stolen_coins']) > 0);
  const cats = (row['notable_exposure_categories'] || '').trim();
  const exposuresArr = cats ? cats.split(';').map(c => c.trim()).filter(c => c) : [];
  const exposures = sqlStr(JSON.stringify(exposuresArr));
  const rawFindings = sqlStr(cats || null);
  sVals.push(`((SELECT id FROM wallets WHERE address = ${address}), ${riskScore}, ${riskLevel}, ${sanctions}, ${scam}, ${mixer}, ${darknet}, ${stolen}, ${exposures}::jsonb, ${rawFindings})`);
}
sql += sVals.join(',\n') + ';\n\n';

// ── Refunds ──
sql += `-- Refunds (${refundsCSV.data.length} rows)\n`;
sql += `INSERT INTO refunds (transaction_id, customer_id, status, amount, requested_at) VALUES\n`;
const rVals = [];
for (const row of refundsCSV.data) {
  const cn = parseInt(row['customer_number']);
  const orderId = sqlStr(row['order_id']);
  const amount = parseAmount(row['amount_numeric']) ?? 0;
  const status = sqlStr(refundStatus(row['status_normalized']));
  const txnDate = sqlStr(row['transaction_date'] || null);
  rVals.push(`((SELECT id FROM transactions WHERE order_id = ${orderId}), (SELECT id FROM customers WHERE customer_number = ${cn}), ${status}, ${amount}, ${txnDate}::date)`);
}
sql += rVals.join(',\n') + ';\n\n';

// ── Chargebacks ──
sql += `-- Chargebacks (${chargebacksCSV.data.length} rows)\n`;
sql += `INSERT INTO chargebacks (transaction_id, customer_id, status, legitimacy) VALUES\n`;
const cbVals = [];
for (const row of chargebacksCSV.data) {
  const cn = parseInt(row['customer_number']);
  const orderId = sqlStr(row['order_id']);
  cbVals.push(`((SELECT id FROM transactions WHERE order_id = ${orderId}), (SELECT id FROM customers WHERE customer_number = ${cn}), 'Unresolved', 'Undetermined')`);
}
sql += cbVals.join(',\n') + ';\n\n';

writeFileSync(SC + 'import.sql', sql);
console.log(`Generated import.sql (${sql.length} bytes)`);
console.log(`Customers: ${customersCSV.data.length}`);
console.log(`Transactions: ${txnsCSV.data.length}`);
console.log(`Emails: ${emailsCSV.data.length}`);
console.log(`Wallets: ${walletsCSV.data.length}`);
console.log(`Screenings: ${screeningsCSV.data.length}`);
console.log(`Refunds: ${refundsCSV.data.length}`);
console.log(`Chargebacks: ${chargebacksCSV.data.length}`);
