// Trace Supabase error format
const fs = require('fs');
const envContent = fs.readFileSync('./.env.local', 'utf-8').trim().split('\n');
const env = {};
envContent.forEach(line => { const [k,v] = line.split('='); if(k&&v) env[k.trim()] = v.trim(); });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

console.log('URL:', env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 15));
console.log('KEY starts with:', env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 8));

(async () => {
  // First test: does the creds work at all?
  try {
    // Try a simple select on books table
    const res = await supabase.from('books').select('isbn').limit(1);
    if (res.error) {
      console.log('\nSELECT FAILED - error type:', res.error.name);
      console.log('error.message:', JSON.stringify(res.error.message));
      console.log('error.keys:', Object.keys(res.error).join(', '));
      for (const key of Object.keys(res.error)) {
        console.log(`  ${key}:`, JSON.stringify(res.error[key]));
      }
    } else {
      console.log('\nSELECT OK — books count:', res.data?.length ?? 0);
    }

    // Now try the UPSERT that causes the toast issue
    const isbnTest = 'TRACE-' + Date.now();
    const upsertRes = await supabase.from('books').upsert({isbn: isbnTest, title: 'Trace-' + isbnTest});
    
    if (upsertRes.error) {
      console.log('\nUPSERT FAILED - error type:', upsertRes.error.name);
      console.log('error.message:', JSON.stringify(upsertRes.error.message));
      console.log('error.keys:', Object.keys(upsertRes.error).join(', '));
      for (const key of Object.keys(upsertRes.error)) {
        const val = upsertRes.error[key];
        let displayVal;
        if (typeof val === 'object') displayVal = JSON.stringify(val);
        else displayVal = String(val);
        console.log(`  ${key}: ${JSON.stringify(displayVal)}`);
      }
    } else {
      console.log('\nUPSERT SUCCEEDED — deleting test record');
      // Cleanup: delete the test record we just created
      await supabase.from('books').delete().eq('isbn', isbnTest);
    }

  } catch(err) {
    console.log('EXCEPTION:', err.name, '-', err.message.substring(0, 200));
    if (err.status) console.log('HTTP Status:', err.status);
  }
})();
