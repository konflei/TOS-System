import { readFileSync, writeFileSync } from 'fs';
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

const csvPath = 'scripts/ip_device_events.csv';
console.log('Loading CSV from disk...');
const { headers, data } = loadCSV(csvPath);
console.log(`Loaded ${data.length} rows`);
console.log('Headers:', headers.join(', '));

// Build customer_number -> id map from DB
console.log('Fetching customer IDs...');
const { data: customers, error: cErr } = await supabase.from('customers').select('id, customer_number');
if (cErr) { console.error('Failed to fetch customers:', cErr.message); process.exit(1); }
const cMap = {};
for (const c of customers) cMap[c.customer_number] = c.id;
console.log(`Got ${customers.length} customer IDs`);

// Clean existing ip_device_events
console.log('Cleaning existing ip_device_events...');
const { error: delErr } = await supabase.from('ip_device_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (delErr) console.error('Delete error:', delErr.message);

// Map CSV rows to ip_device_events rows
const boolVal = (v) => v.toLowerCase() === 'true';
const rows = [];
let skipped = 0;
for (const r of data) {
  const cn = parseInt(r['customer_number']);
  const customerId = cMap[cn];
  if (!customerId) { skipped++; continue; }
  const flagRead = r['flag_data_read'] === 'Yes';
  const classification = r['preliminary_classification'] || '';
  
  rows.push({
    customer_id: customerId,
    ip_address: '',
    vpn: flagRead ? boolVal(r['vpn']) : false,
    proxy: flagRead ? boolVal(r['proxy']) : false,
    tor: flagRead ? boolVal(r['tor']) : false,
    mobile_ip: flagRead ? boolVal(r['mobile_ip']) : false,
    recent_abuse: flagRead ? boolVal(r['recent_abuse']) : false,
    crawler: flagRead ? boolVal(r['crawler']) : false,
    geo_note: classification,
    device_note: flagRead ? '' : 'Incomplete source record',
    raw_evidence: r['source_image'] + ':' + r['record_number_in_image'],
  });
}
console.log(`Prepared ${rows.length} rows, skipped ${skipped} (no matching customer)`);

// Insert in batches of 100
let inserted = 0;
for (let i = 0; i < rows.length; i += 100) {
  const batch = rows.slice(i, i + 100);
  const { error } = await supabase.from('ip_device_events').insert(batch);
  if (error) {
    console.error(`Batch ${i} error: ${error.message}`);
    // Try smaller batches
    for (let j = 0; j < batch.length; j += 10) {
      const smallBatch = batch.slice(j, j + 10);
      const { error: e2 } = await supabase.from('ip_device_events').insert(smallBatch);
      if (e2) console.error(`  small batch ${i+j}: ${e2.message}`);
      else inserted += smallBatch.length;
    }
  } else {
    inserted += batch.length;
  }
  if (i % 500 === 0) console.log(`  Progress: ${inserted}/${rows.length}`);
}
console.log(`Inserted ${inserted} ip_device_events`);

// Verify
const { count } = await supabase.from('ip_device_events').select('*', { count: 'exact', head: true });
console.log(`\nFinal ip_device_events count: ${count}`);
