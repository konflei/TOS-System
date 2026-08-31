import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = readFileSync('.env', 'utf-8');
const getEnv = (key) => {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const anonKey = getEnv('VITE_SUPABASE_ANON_KEY');
if (!supabaseUrl || !anonKey) { console.error('Missing env vars'); process.exit(1); }
const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++;
    } else {
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { cur.push(field); field = ''; i++; continue; }
      if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      field += c; i++;
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
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
    headers.forEach((h, idx) => { obj[h] = (row[idx] || '').trim(); });
    data.push(obj);
  }
  return { headers, data };
}

const num = v => { if (!v || !v.trim()) return null; const n = parseFloat(v.replace(/,/g,'')); return isNaN(n) ? null : n; };
const int = v => { if (!v || !v.trim()) return null; const n = parseInt(v.replace(/,/g,'')); return isNaN(n) ? null : n; };
const amount = v => { if (!v || !v.trim()) return null; const n = parseFloat(v.replace(/[$,]/g,'').trim()); return isNaN(n) ? null : n; };
const cn = v => int(v);

const SC = 'scripts/';
console.log('Loading CSVs...');
const cData = loadCSV(SC + 'customers.csv').data;
const eData = loadCSV(SC + 'customer_emails.csv').data;
const tData = loadCSV(SC + 'transactions.csv').data;
const wData = loadCSV(SC + 'wallets.csv').data;
const sData = loadCSV(SC + 'wallet_screenings.csv').data;
const rData = loadCSV(SC + 'refunds.csv').data;
const cbData = loadCSV(SC + 'chargebacks.csv').data;
console.log(`  customers:${cData.length} emails:${eData.length} txns:${tData.length} wallets:${wData.length} screenings:${sData.length} refunds:${rData.length} chargebacks:${cbData.length}`);

// ── Clean ──
console.log('Cleaning existing data...');
const delTables = ['chargebacks','refunds','wallet_screenings','wallets','ip_device_events','customer_emails','transactions','customer_assessments','transaction_assessments','human_reviews','damage_assessments','audit_logs','import_batches','customers'];
for (const t of delTables) {
  const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error && !error.message.includes('does not exist')) console.error(`  del ${t}: ${error.message}`);
}

// ── Customers ──
console.log('Inserting customers...');
const cMap = {}; // customer_number -> id
const cRows = cData.map(r => ({
  customer_number: cn(r['customer_number']),
  name: r['name'] || '',
  email: r['primary_email'] || null,
  alt_emails: [],
  region: r['region_group'] || null,
  age: int(r['age_numeric']),
  compliance_status: ({'Yes':'Complete','Partial':'Partial','No':'No Compliance','Unable to Determine':'Unable to Determine'})[r['compliance_answered']] || 'Unknown',
  vpn: false, proxy: false, tor: false, mobile_ip: false, recent_abuse: false, crawler: false,
  geo_inconsistency: false, device_inconsistency: false,
  ai_assessment_status: 'Pending', human_review_status: 'Not Reviewed', is_demo: false,
  address: (r['address'] && !['Not provided','Cannot be determined','Not confirmed'].includes(r['address'])) ? r['address'] : null,
  profile_link: r['profile_url'] || null,
  notable_wallet_exposure: false,
}));

let cInserted = 0;
for (let i = 0; i < cRows.length; i += 50) {
  const batch = cRows.slice(i, i + 50);
  const { data, error } = await supabase.from('customers').insert(batch).select('id, customer_number');
  if (error) { console.error(`  batch ${i}: ${error.message}`); continue; }
  for (const c of data) cMap[c.customer_number] = c.id;
  cInserted += data.length;
}
console.log(`  Inserted ${cInserted} customers`);

// ── Transactions ──
console.log('Inserting transactions...');
const tMap = {}; // order_id -> id
const tRows = tData.map(r => {
  const sl = (r['status_normalized'] || '').toLowerCase();
  let status = 'Unknown';
  if (sl.includes('in progress')) status = 'In Progress';
  else if (sl.includes('complete')) status = 'Complete';
  else if (sl.includes('chargeback')) status = 'Chargeback Warning';
  else if (sl.includes('refund')) status = 'Refund Requested';
  else if (sl.includes('cancel')) status = 'Cancelled';
  else if (sl) status = r['status_normalized'].trim();
  const ful = r['fulfilled'].trim();
  return {
    customer_id: cMap[cn(r['customer_number'])],
    order_id: r['order_id'],
    txn_date: r['transaction_date'] || null,
    amount: amount(r['amount_numeric']) ?? 0,
    currency: r['currency'] || 'CAD',
    status,
    fulfilled: ful === 'true' ? 'True' : ful === 'false' ? 'False' : 'Unknown',
    refund_status: sl.includes('refund') ? 'Requested' : 'None',
    chargeback_status: sl.includes('chargeback') ? 'Warning' : 'None',
    tos_assessment_status: 'Pending',
    order_link: r['order_url'] || null,
  };
}).filter(r => r.customer_id);

let tInserted = 0;
for (const t of tRows) {
  const { data, error } = await supabase.from('transactions').insert(t).select('id, order_id');
  if (error) { console.error(`  txn ${t.order_id}: ${error.message}`); continue; }
  tMap[data[0].order_id] = data[0].id;
  tInserted++;
}
console.log(`  Inserted ${tInserted} transactions`);

// ── Customer emails ──
console.log('Inserting customer_emails...');
let eInserted = 0;
const eRows = eData.map(r => ({
  customer_id: cMap[cn(r['customer_number'])],
  from_email: r['email'] || null,
  subject: r['email_type'] ? `Customer email (${r['email_type']})` : 'Customer email',
  body_text: '',
  attachment_names: [],
})).filter(r => r.customer_id);
for (let i = 0; i < eRows.length; i += 50) {
  const batch = eRows.slice(i, i + 50);
  const { error } = await supabase.from('customer_emails').insert(batch);
  if (error) { console.error(`  email batch ${i}: ${error.message}`); continue; }
  eInserted += batch.length;
}
console.log(`  Inserted ${eInserted} customer_emails`);

// ── Wallets ──
console.log('Inserting wallets...');
const wMap = {}; // address -> id
const wRows = wData.map(r => ({
  customer_id: cMap[cn(r['customer_number'])],
  address: r['wallet_address'],
  network: r['mapped_currency_network'] || null,
  currency: r['mapped_currency_network'] || null,
  link_confidence: 'Associated with customer',
})).filter(r => r.customer_id);
let wInserted = 0;
for (let i = 0; i < wRows.length; i += 50) {
  const batch = wRows.slice(i, i + 50);
  const { data, error } = await supabase.from('wallets').insert(batch).select('id, address');
  if (error) { console.error(`  wallet batch ${i}: ${error.message}`); continue; }
  for (const w of data) wMap[w.address] = w.id;
  wInserted += data.length;
}
console.log(`  Inserted ${wInserted} wallets`);

// ── Wallet screenings ──
console.log('Inserting wallet_screenings...');
const sRows = sData.map(r => {
  const score = num(r['risk_score_pct']);
  const riskLevel = score === null ? 'Unknown' : score >= 75 ? 'High' : score >= 25 ? 'Medium' : 'Low';
  const cats = (r['notable_exposure_categories'] || '').trim();
  const exposures = cats ? cats.split(';').map(c => c.trim()).filter(c => c) : [];
  const nz = k => { const v = num(r[k]); return v !== null && v > 0; };
  return {
    wallet_id: wMap[r['wallet_address']],
    risk_score: score !== null ? Math.round(score) : null,
    risk_level: riskLevel,
    sanctions: nz('sanctions'),
    scam_fraud: nz('scam'),
    mixer: nz('mixer'),
    darknet: nz('dark_market') || nz('dark_service'),
    stolen_funds: nz('stolen_coins'),
    exposures: exposures,
    raw_findings: cats || null,
  };
}).filter(r => r.wallet_id);
let sInserted = 0;
for (let i = 0; i < sRows.length; i += 50) {
  const batch = sRows.slice(i, i + 50);
  const { error } = await supabase.from('wallet_screenings').insert(batch);
  if (error) { console.error(`  screening batch ${i}: ${error.message}`); continue; }
  sInserted += batch.length;
}
console.log(`  Inserted ${sInserted} wallet_screenings`);

// ── Refunds ──
console.log('Inserting refunds...');
const rRows = rData.map(r => {
  const sl = (r['status_normalized'] || '').toLowerCase();
  return {
    transaction_id: tMap[r['order_id']] || null,
    customer_id: cMap[cn(r['customer_number'])],
    status: sl.includes('refunded') ? 'Refunded' : 'Requested',
    amount: amount(r['amount_numeric']) ?? 0,
    requested_at: r['transaction_date'] || null,
  };
}).filter(r => r.customer_id);
let rInserted = 0;
for (let i = 0; i < rRows.length; i += 50) {
  const batch = rRows.slice(i, i + 50);
  const { error } = await supabase.from('refunds').insert(batch);
  if (error) { console.error(`  refund batch ${i}: ${error.message}`); continue; }
  rInserted += batch.length;
}
console.log(`  Inserted ${rInserted} refunds`);

// ── Chargebacks ──
console.log('Inserting chargebacks...');
const cbRows = cbData.map(r => ({
  transaction_id: tMap[r['order_id']] || null,
  customer_id: cMap[cn(r['customer_number'])],
  status: 'Unresolved',
  legitimacy: 'Undetermined',
})).filter(r => r.customer_id);
let cbInserted = 0;
const { error: cbErr } = await supabase.from('chargebacks').insert(cbRows);
if (cbErr) console.error(`  chargeback: ${cbErr.message}`);
else cbInserted = cbRows.length;
console.log(`  Inserted ${cbInserted} chargebacks`);

// ── Verify ──
console.log('\n=== Final row counts ===');
const tables = ['customers','transactions','customer_emails','ip_device_events','wallets','wallet_screenings','refunds','chargebacks'];
for (const t of tables) {
  const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t}: ${error ? 'ERROR: ' + error.message : count}`);
}
console.log('\nImport complete.');
