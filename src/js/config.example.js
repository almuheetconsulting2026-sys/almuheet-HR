/**
 * ⚙️ Example Supabase config — copy to `src/js/config.js` and fill values
 *
 * Steps:
 * 1. Create a Supabase project at https://supabase.com
 * 2. In your project go to Settings → API and copy Project URL and anon/public key
 * 3. Create `src/js/config.js` (not committed) and paste your values there
 */

const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

const STORAGE_MODE = (SUPABASE_URL.includes('YOUR_PROJECT_ID')) ? 'local' : 'supabase';

// Copy this file to `src/js/config.js` and replace the URL and key above.
