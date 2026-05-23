# إعداد Supabase لنظام الموارد البشرية

## خطوات إنشاء الجداول في Supabase

### 1. الدخول إلى Supabase Dashboard
- افتح المتصفح واذهب إلى: https://supabase.com/dashboard
- سجل الدخول باستخدام حسابك
- اختر المشروع: `hzzbkyqcxyjqfwvtcizq`

### 2. تنفيذ SQL Schema
- من القائمة الجانبية، اختر **SQL Editor**
- انقر على **New Query**
- انسخ محتوى الملف `supabase/schema.sql` والصقه في المحرر
- انقر على **Run** لتنفيذ الأوامر

### 3. التحقق من الجداول
- من القائمة الجانبية، اختر **Table Editor**
- تأكد من ظهور الجداول التالية:
  - employees
  - attendance
  - leaves
  - performances
  - tasks
  - documents
  - disciplinary
  - payroll_history
  - audit_logs
  - notifications
  - app_users
  - app_settings

### 4. تفعيل Realtime (اختياري)
- من القائمة الجانبية، اختر **Replication**
- تأكد من تفعيل Realtime للجداول المطلوبة:
  - employees
  - attendance
  - leaves
  - tasks
  - notifications

### 5. إعدادات RLS (Row Level Security) - اختياري
- إذا كنت تريد إضافة أمان إضافي، يمكنك تفعيل RLS من القسم **Authentication** > **Policies**

## بعد الإعداد

بعد تنفيذ SQL، النظام جاهز للعمل مع Supabase. عند فتح `index.html` في المتصفح، سيتم:
- الاتصال التلقائي بـ Supabase
- تحميل البيانات من السحابة
- حفظ جميع التغييرات في Supabase

## بيانات الاتصال

- **Project URL**: https://hzzbkyqcxyjqfwvtcizq.supabase.co
- **Anon Key**: تمت إضافته في ملف `src/js/config.js`

## مستخدمون افتراضيون

النظام يحتوي على مستخدمين افتراضيين:
- **admin** / كلمة المرور: `admin123` (مدير النظام)
- **manager** / كلمة المرور: `mgr123` (مدير مشروع)
- **employee** / كلمة المرور: `emp123` (موظف)
