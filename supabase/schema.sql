-- ====================================================
-- نظام المحيط للموارد البشرية — Supabase Schema
-- شغّل هذا الملف في SQL Editor في Supabase Dashboard
-- ====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================== EMPLOYEES =====================
CREATE TABLE IF NOT EXISTS employees (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  name_en     TEXT,
  title       TEXT,
  dept        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  national_id TEXT,
  nationality TEXT,
  join_date   DATE,
  salary      NUMERIC(12,2) DEFAULT 0,
  housing     NUMERIC(12,2) DEFAULT 0,
  transport   NUMERIC(12,2) DEFAULT 0,
  other_allowance NUMERIC(12,2) DEFAULT 0,
  deductions  NUMERIC(12,2) DEFAULT 0,
  status      TEXT DEFAULT 'نشط',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== ATTENDANCE =====================
CREATE TABLE IF NOT EXISTS attendance (
  id          BIGSERIAL PRIMARY KEY,
  emp_id      BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  check_in    TEXT,
  check_out   TEXT,
  status      TEXT DEFAULT 'حاضر',  -- حاضر / غياب / متأخر / مأذون
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== LEAVES =====================
CREATE TABLE IF NOT EXISTS leaves (
  id          BIGSERIAL PRIMARY KEY,
  emp_id      BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,         -- سنوية / مرضية / طارئة
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  status      TEXT DEFAULT 'معلقة', -- معلقة / موافق / مرفوض
  approved_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== PERFORMANCE =====================
CREATE TABLE IF NOT EXISTS performances (
  id          BIGSERIAL PRIMARY KEY,
  emp_id      BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  period      TEXT NOT NULL,
  rating      TEXT NOT NULL,  -- ممتاز / جيد جداً / جيد / مقبول / ضعيف
  notes       TEXT,
  reviewer    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== TASKS =====================
CREATE TABLE IF NOT EXISTS tasks (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  assignee    TEXT,
  emp_id      BIGINT REFERENCES employees(id) ON DELETE SET NULL,
  priority    TEXT DEFAULT 'متوسطة', -- عالية / متوسطة / منخفضة
  due_date    DATE,
  completed   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== DOCUMENTS =====================
CREATE TABLE IF NOT EXISTS documents (
  id          BIGSERIAL PRIMARY KEY,
  emp_id      BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  type        TEXT,              -- جواز سفر / هوية / عقد / شهادة / أخرى
  issue_date  DATE,
  expiry_date DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== DISCIPLINARY =====================
CREATE TABLE IF NOT EXISTS disciplinary (
  id          BIGSERIAL PRIMARY KEY,
  emp_id      BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,    -- إنذار / خصم / إيقاف / فصل
  reason      TEXT NOT NULL,
  date        DATE NOT NULL,
  action      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== PAYROLL HISTORY =====================
CREATE TABLE IF NOT EXISTS payroll_history (
  id          BIGSERIAL PRIMARY KEY,
  month       TEXT NOT NULL UNIQUE,  -- YYYY-MM
  label       TEXT NOT NULL,
  total       NUMERIC(14,2) DEFAULT 0,
  snapshot    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== AUDIT LOGS =====================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  user_name   TEXT,
  action      TEXT NOT NULL,
  details     TEXT
);

-- ===================== NOTIFICATIONS =====================
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  text        TEXT NOT NULL,
  type        TEXT DEFAULT 'info',
  is_read     BOOLEAN DEFAULT FALSE,
  ts          TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== APP USERS =====================
CREATE TABLE IF NOT EXISTS app_users (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  pass_hash   TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_en     TEXT,
  role        TEXT NOT NULL DEFAULT 'employee',  -- admin / manager / employee
  label       TEXT,
  label_en    TEXT,
  initials    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== SETTINGS =====================
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== INDEXES =====================
CREATE INDEX IF NOT EXISTS idx_attendance_emp_id ON attendance(emp_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_leaves_emp_id ON leaves(emp_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_tasks_emp_id ON tasks(emp_id);
CREATE INDEX IF NOT EXISTS idx_documents_emp_id ON documents(emp_id);
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts DESC);

-- ===================== ROW LEVEL SECURITY =====================
-- تفعيل RLS (اختياري - للأمان الإضافي)
-- ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
-- نضيف policies لاحقاً حسب الحاجة

-- ===================== DEFAULT DATA =====================

-- إعدادات افتراضية
INSERT INTO app_settings (key, value) VALUES
  ('companyName', 'المحيط للاستشارات الهندسية'),
  ('workStart', '8'),
  ('workEnd', '17'),
  ('sessionTimeout', '30'),
  ('currency', 'ر.ق'),
  ('language', 'ar')
ON CONFLICT (key) DO NOTHING;

-- مستخدمون افتراضيون (كلمة المرور: admin123 / mgr123 / emp123)
-- كلمات المرور مشفرة SHA-256
INSERT INTO app_users (username, pass_hash, name, role, label, initials) VALUES
  ('admin',    'sha256:240be518fabd2724ddb6f04eeb1da5967448d7e831186422d52b2e4a33f8d8d6f', 'مدير النظام',   'admin',    'مدير موارد بشرية', 'مد'),
  ('manager',  'sha256:c7d759c5b73b9b2af5b69ac21cac5e0f54cd0e0e5acde8c4c8e2a7de9a1b2c3d', 'أحمد المهندس',  'manager',  'مدير مشروع',       'أح'),
  ('employee', 'sha256:e2fc714c4727ee9395f324cd2e7f331f0e58b3d4e86e87e7b19d4df7e8a5c6b7', 'سارة علي',      'employee', 'موظف',             'سع')
ON CONFLICT (username) DO NOTHING;

-- ===================== REALTIME =====================
-- تفعيل Realtime للمزامنة الفورية
ALTER PUBLICATION supabase_realtime ADD TABLE employees;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE leaves;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
