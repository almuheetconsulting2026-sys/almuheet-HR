/**
 * 🗄️ طبقة التخزين — تدعم Supabase والتخزين المحلي
 * يُختار التخزين تلقائياً بناءً على STORAGE_MODE في config.js
 */

// ===================== SUPABASE CLIENT =====================
let supabaseClient = null;

function initSupabase() {
  if (STORAGE_MODE !== 'supabase') return;
  if (typeof supabase === 'undefined') {
    console.warn('Supabase SDK not loaded, falling back to localStorage');
    return;
  }
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase connected');
  } catch (e) {
    console.error('Supabase init error:', e);
  }
}

// ===================== GENERIC CRUD =====================
const DB_API = {

  async fetchAll(table) {
    if (!supabaseClient) return localGet(table);
    const { data, error } = await supabaseClient.from(table).select('*').order('id', { ascending: true });
    if (error) { console.error(`fetchAll ${table}:`, error); return localGet(table); }
    return data || [];
  },

  async insert(table, row) {
    if (!supabaseClient) {
      const rows = localGet(table);
      const newRow = { ...row, id: Date.now() };
      rows.push(newRow);
      localSet(table, rows);
      return newRow;
    }
    const { data, error } = await supabaseClient.from(table).insert(row).select().single();
    if (error) {
      console.error(`insert ${table}:`, error);
      if (error.details || error.hint) {
        console.error('Supabase error details:', error.details, error.hint);
      }
      if (error.code === '42501') {
        console.error('Supabase RLS blocked the insert. تأكد من إعداد سياسة row-level security على جدول', table);
      }
      return null;
    }
    console.log(`✅ Supabase insert ${table} success`, data);
    return data;
  },

  async update(table, id, updates) {
    if (!supabaseClient) {
      const rows = localGet(table);
      const idx = rows.findIndex(r => r.id === id);
      if (idx !== -1) { rows[idx] = { ...rows[idx], ...updates }; localSet(table, rows); return rows[idx]; }
      return null;
    }
    const { data, error } = await supabaseClient.from(table).update(updates).eq('id', id).select().single();
    if (error) { console.error(`update ${table}:`, error); return null; }
    return data;
  },

  async delete(table, id) {
    if (!supabaseClient) {
      const rows = localGet(table).filter(r => r.id !== id);
      localSet(table, rows);
      return true;
    }
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if (error) { console.error(`delete ${table}:`, error); return false; }
    return true;
  },

  // جلب إعداد واحد
  async getSetting(key) {
    if (!supabaseClient) return localGetSetting(key);
    const { data } = await supabaseClient.from('app_settings').select('value').eq('key', key).single();
    return data?.value ?? null;
  },

  async setSetting(key, value) {
    if (!supabaseClient) { localSetSetting(key, value); return; }
    await supabaseClient.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  },

  async getAllSettings() {
    if (!supabaseClient) return localGetAllSettings();
    const { data } = await supabaseClient.from('app_settings').select('*');
    const obj = {};
    (data || []).forEach(r => { obj[r.key] = r.value; });
    return obj;
  },

  // إشعارات الوقت الحقيقي
  subscribeToTable(table, callback) {
    if (!supabaseClient) return () => {};
    const channel = supabaseClient.channel(`${table}_changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
    return () => supabaseClient.removeChannel(channel);
  },

  // مزامنة كاملة
  async syncAll() {
    const [employees, attendance, leaves, performances, tasks, documents, disciplinary, payrollHistory, auditLogs, notifications] = await Promise.all([
      this.fetchAll('employees'),
      this.fetchAll('attendance'),
      this.fetchAll('leaves'),
      this.fetchAll('performances'),
      this.fetchAll('tasks'),
      this.fetchAll('documents'),
      this.fetchAll('disciplinary'),
      this.fetchAll('payroll_history'),
      this.fetchAll('audit_logs'),
      this.fetchAll('notifications'),
    ]);
    return { employees, attendance, leaves, performances, tasks, documents, disciplinary, payrollHistory, auditLogs, notifications };
  }
};

// ===================== LOCAL STORAGE FALLBACK =====================
const LOCAL_PREFIX = 'almuhit_';

function localGet(table) {
  try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + table) || '[]'); }
  catch { return []; }
}
function localSet(table, data) {
  try { localStorage.setItem(LOCAL_PREFIX + table, JSON.stringify(data)); }
  catch (e) { console.error('localStorage full:', e); }
}
function localGetSetting(key) {
  try {
    const s = JSON.parse(localStorage.getItem(LOCAL_PREFIX + 'settings') || '{}');
    return s[key] ?? null;
  } catch { return null; }
}
function localSetSetting(key, value) {
  try {
    const s = JSON.parse(localStorage.getItem(LOCAL_PREFIX + 'settings') || '{}');
    s[key] = value;
    localStorage.setItem(LOCAL_PREFIX + 'settings', JSON.stringify(s));
  } catch {}
}
function localGetAllSettings() {
  try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + 'settings') || '{}'); }
  catch { return {}; }
}

// ===================== MIGRATION: localStorage → Supabase =====================
async function migrateLocalToSupabase() {
  if (!supabaseClient) return { migrated: 0, failed: 0 };
  const oldData = localStorage.getItem('mueheet_hr_v2');
  if (!oldData) return { migrated: 0, failed: 0 };
  try {
    const db = JSON.parse(oldData);
    let migrated = 0;
    let failed = 0;

    // Migrate employees
    if (db.employees?.length) {
      for (const e of db.employees) {
        const saved = await DB_API.insert('employees', {
          name: e.name, title: e.title, dept: e.dept, phone: e.phone,
          email: e.email, join_date: e.joinDate, salary: e.salary || 0,
          housing: e.housing || 0, transport: e.transport || 0,
          other_allowance: e.otherAllowance || 0, deductions: e.deductions || 0,
          status: e.status || 'نشط', notes: e.notes
        });
        if (saved && saved.id) {
          migrated++;
        } else {
          failed++;
          console.warn('⚠️ Employee migration failed for:', e.name);
        }
      }
    }
    console.log(`✅ Migrated ${migrated} employees to Supabase${failed ? `, failed ${failed}` : ''}`);
    if (migrated > 0 && failed === 0) {
      localStorage.setItem('almuhit_migrated', '1');
    }
    return { migrated, failed };
  } catch (e) {
    console.error('Migration error:', e);
    return { migrated: 0, failed: 0 };
  }
}

// ===================== TEST CONNECTION =====================
async function testSupabaseConnection() {
  if (!supabaseClient) {
    console.warn('❌ Supabase client not initialized');
    return false;
  }
  
  try {
    console.log('🔄 Testing Supabase connection...');
    // اختبار بسيط: جلب أول 1 سجل من employees
    const { data, error, count } = await supabaseClient
      .from('employees')
      .select('*', { count: 'exact' })
      .limit(1);
    
    if (error) {
      console.error('❌ Test failed:', error.message);
      return false;
    }
    
    console.log('✅ Connection test successful!');
    console.log(`📊 Total employees in database: ${count}`);
    return true;
  } catch (e) {
    console.error('❌ Connection test error:', e.message);
    return false;
  }
}
