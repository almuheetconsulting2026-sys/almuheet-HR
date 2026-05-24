-- ====================================================
-- إصلاح سياسات RLS للسماح بالوصول
-- شغّل هذا الملف في SQL Editor في Supabase Dashboard
-- ====================================================

-- تعطيل RLS مؤقتاً للسماح بالوصول (الخيار الأسهل)
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaves DISABLE ROW LEVEL SECURITY;
ALTER TABLE performances DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinary DISABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

-- ====================================================
-- إذا كنت تفضل تفعيل RLS مع سياسات، استخدم هذا بدلاً من ذلك:
-- ====================================================

/*
-- تفعيل RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- سياسة للسماح للجميع بالقراءة والكتابة
CREATE POLICY "Enable all access for employees" 
ON employees FOR ALL 
USING (true) 
WITH CHECK (true);

-- كرر للجداول الأخرى
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for attendance" 
ON attendance FOR ALL 
USING (true) 
WITH CHECK (true);

ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for leaves" 
ON leaves FOR ALL 
USING (true) 
WITH CHECK (true);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for tasks" 
ON tasks FOR ALL 
USING (true) 
WITH CHECK (true);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for documents" 
ON documents FOR ALL 
USING (true) 
WITH CHECK (true);
*/
