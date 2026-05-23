# 🏢 نظام المحيط للموارد البشرية — v6

نظام إدارة موارد بشرية متكامل مبني بـ HTML/CSS/JavaScript مع تخزين سحابي على Supabase.

## ✨ المميزات

- 👥 **إدارة الموظفين** — إضافة، تعديل، حذف، بحث وتصفية
- 💰 **الرواتب** — مسير الرواتب الشهري، قسيمة الراتب، تصدير CSV
- ⏰ **الحضور والانصراف** — تسجيل يومي، تقارير، تصدير
- 🌴 **الإجازات** — طلبات، موافقة/رفض، رصيد الإجازة
- ⭐ **تقييم الأداء** — تقييمات ربع سنوية
- ✅ **المهام** — تعيين وتتبع المهام
- 📁 **المستندات** — رفع وتتبع انتهاء صلاحية المستندات
- ⚠️ **التأديب** — سجل الإجراءات التأديبية
- 📊 **التقارير** — لوحات بيانات تفاعلية
- 🔐 **المصادقة** — تسجيل دخول آمن مع صلاحيات (مدير/مشرف/موظف)
- 🌙 **الوضع الليلي** — Dark Mode
- 📱 **متجاوب** — يعمل على جميع الأجهزة
- ☁️ **Supabase** — تخزين سحابي حقيقي مع مزامنة فورية

## 🚀 طريقة التشغيل

### 1. إعداد Supabase

**الطريقة السريعة:**
1. افتح صفحة `setup_supabase.html` في المتصفح
2. اتبع التعليمات الظاهرة على الشاشة

**الطريقة اليدوية:**
1. اذهب إلى [supabase.com/dashboard](https://supabase.com/dashboard)
2. اختر المشروع: `hzzbkyqcxyjqfwvtcizq`
3. من Dashboard → SQL Editor، شغّل ملف `supabase/schema.sql`
4. تأكد من إنشاء جميع الجداول المطلوبة

### 2. إعداد ملف الإعدادات

تم إعداد ملف `src/js/config.js` بالفعل ببيانات Supabase الخاصة بك:

```javascript
const SUPABASE_URL = 'https://hzzbkyqcxyjqfwvtcizq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### 3. رفع على GitHub Pages

```bash
git clone https://github.com/yourusername/almuhit-hr
cd almuhit-hr
# عدّل config.js
git add .
git commit -m "Add Supabase config"
git push
```

فعّل GitHub Pages من Settings → Pages → main branch / root.

### 4. تشغيل محلي

```bash
# أي خادم محلي يكفي
npx serve .
# أو
python -m http.server 8080
```

## 📁 هيكل المشروع

```
almuhit-hr/
├── index.html              ← الملف الرئيسي
├── src/
│   ├── css/
│   │   └── style.css       ← جميع الأنماط
│   └── js/
│       ├── config.js       ← إعدادات Supabase ⬅ عدّل هنا
│       ├── supabase.js     ← طبقة التخزين السحابي
│       ├── app.js          ← منطق التطبيق الرئيسي
│       ├── auth.js         ← المصادقة والصلاحيات
│       ├── dashboard.js    ← لوحة التحكم
│       ├── employees.js    ← إدارة الموظفين
│       ├── salary.js       ← الرواتب
│       ├── attendance.js   ← الحضور
│       ├── leaves.js       ← الإجازات
│       ├── tasks.js        ← المهام
│       ├── documents.js    ← المستندات
│       ├── reports.js      ← التقارير
│       └── utils.js        ← دوال مساعدة
├── supabase/
│   └── schema.sql          ← جداول قاعدة البيانات
└── README.md
```

## 🔐 بيانات الدخول الافتراضية

| الدور | اسم المستخدم | كلمة المرور |
|-------|-------------|-------------|
| مدير | admin | admin123 |
| مشرف | manager | mgr123 |
| موظف | employee | emp123 |

> ⚠️ غيّر كلمات المرور فور التثبيت

## 🛠️ التقنيات المستخدمة

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Database**: Supabase (PostgreSQL)
- **Auth**: SHA-256 hashing + Supabase Auth (اختياري)
- **Fonts**: Cairo, Tajawal (Google Fonts)
- **Deploy**: GitHub Pages

## 📝 License

MIT License — حر الاستخدام للأغراض التجارية والشخصية
