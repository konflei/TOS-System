import { createClient } from '@supabase/supabase-js';

const envText = require('fs').readFileSync('.env', 'utf-8');
const getEnv = (key) => {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
};
const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });

// Read the CSV from the attachment that was written to disk
// The file should be at scripts/ip_device_events.csv
// If not found, we'll read from stdin or a temp location
const fs = require('fs');
const csvPath = 'scripts/ip_device_events.csv';

if (!fs.existsSync(csvPath)) {
  console.error('ERROR: scripts/ip_device_events.csv not found on disk.');
  console.error('The file was provided as a chat attachment but is not physically present.');
  console.error('Please ensure the file is saved to scripts/ip_device_events.csv');
  process.exit(1);
}

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

const text = fs.readFileSync(csvPath, 'utf-8');
const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
const rows = parseCSV(clean);
const headers = rows[0].map(h => h.trim());
console.log('Headers:', headers.join(', '));
console.log('Total rows (incl header):', rows.length);

const boolVal = (v) => v && v.toLowerCase() === 'true';

// Fetch customer IDs
const { data: customers, error: cErr } = await supabase.from('customers').select('id, customer_number');
if (cErr) { console.error('Failed to fetch customers:', cErr.message); process.exit(1); }
const cMap = {};
for (const c of customers) cMap[c.customer_number] = c.id;
console.log(`Got ${customers.length} customers`);

// Clean existing
console.log('Cleaning ip_device_events...');
await supabase.from('ip_device_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');

// Build rows
const ipRows = [];
let skipped = 0;
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.every(c => c.trim() === '')) continue;
  const cn = parseInt(row[0]);
  const customerId = cMap[cn];
  if (!customerId) { skipped++; continue; }
  const flagRead = row[4] === 'Yes';
  const classification = row[11] || '';
  ipRows.push({
    customer_id: customerId,
    ip_address: '',
    vpn: flagRead ? boolVal(row[7]) : false,
    proxy: flagRead ? boolVal(row[10]) : false,
    tor: flagRead ? boolVal(row[8]) : false,
    mobile_ip: flagRead ? boolVal(row[5]) : false,
    recent_abuse: flagRead ? boolVal(row[6]) : false,
    crawler: flagRead ? boolVal(row[9]) : false,
    geo_note: classification,
    device_note: flagRead ? '' : 'Incomplete source record',
    raw_evidence: row[2] + ':' + row[3],
  });
}
console.log(`Prepared ${ipRows.length} rows, skipped ${skipped}`);

// Insert in batches of 100
let inserted = 0;
for (let i = 0; i < ipRows.length; i += 100) {
  const batch = ipRows.slice(i, i + 100);
  const { error } = await supabase.from('ip_device_events').insert(batch);
  if (error) {
    console.error(`Batch ${i}: ${error.message}`);
    for (let j = 0; j < batch.length; j += 10) {
      const sb = batch.slice(j, j + 10);
      const { error: e2 } = await supabase.from('ip_device_events').insert(sb);
      if (e2) console.error(`  sub ${i+j}: ${e2.message}`);
      else inserted += sb.length;
    }
  } else {
    inserted += batch.length;
  }
  if (i % 500 === 0 && i > 0) console.log(`  Progress: ${inserted}/${ipRows.length}`);
}
console.log(`Inserted ${inserted} ip_device_events`);

const { count } = await supabase.from('ip_device_events').select('*', { count: 'exact', head: true });
console.log(`Final ip_device_events count: ${count}`);

// Print all table counts
const tables = ['customers','customer_emails','transactions','ip_device_events','wallets','wallet_screenings','refunds','chargebacks'];
console.log('\n=== All table counts ===');
for (const t of tables) {
  const { count: c } = await supabase.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t}: ${c}`);
}
