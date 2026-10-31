# Contech DC Dashboard

تطبيق محلي كامل لإدارة طلبات IR وCPR وPPIR وTR والمراجعات وShop Drawings. لا يعتمد على
Python أو PythonAnywhere أو Firebase/Firestore.

## مكان الـFrontend والـBackend

- **Frontend:** المجلد `src/` في جذر المشروع، ويعمل بواسطة React + Vite.
- **Backend:** المجلد `backend/`، ويعمل بواسطة Node.js + Express.
- **Database:** ملف SQLite محلي يُنشأ تلقائيًا في
  `backend/data/contech.sqlite` ولا يُرفع إلى Git.

## التشغيل لأول مرة

المطلوب Node.js 22.5 أو أحدث فقط.

```powershell
npm install
Copy-Item .env.example .env
npm run dev:all
```

ثم افتح `http://localhost:5173`. يعمل الـAPI على
`http://127.0.0.1:5055/api` وتقوم Vite بتمرير طلبات `/api` إليه تلقائيًا.

## واجهات Document Control

- `/dc`: جدول المتابعة الكامل.
- `/dc/cpr`: نموذج إنشاء CPR للـDC وجدول التحكم الخاص به.
- `/dc/tr`: نموذج إنشاء TR للـDC وجدول تنزيل ومتابعة تقارير الاختبار.
- `/dc/reports`: فلاتر وتقارير ورسوم قابلة للتنزيل وتصدير XLSX، مع معاينة ملفات Excel.
- `/dc-archive`: أرشيف جدولي مع الفلاتر والاستعادة والإجراءات.

يقرأ تنزيل Word القوالب الأصلية من `WORD_TEMPLATE_DIR`، وتعرض مكتبة Excel
ملفات `.xlsx` الموجودة في `EXCEL_FILES_DIR`. الإعداد المحلي الافتراضي في
`.env.example` يشير إلى مجلد `C:\Users\nehru\OneDrive\Desktop\Files` ومجلد
`ExcelFiles` داخله، مع fallback إلى نسخة `Files/` داخل المشروع.

بيانات المدير المحلية الافتراضية الموجودة في `.env.example`:

- Username: `admin`
- Password: `Admin@12345`

غيّر كلمة المرور في `.env` قبل الاستخدام الحقيقي. هذه البيانات تُستخدم فقط
لإنشاء أول مدير عندما تكون قاعدة البيانات فارغة.

## إضافة حساب

لا يوجد تسجيل عام من شاشة الدخول. ينشئ المدير جميع الحسابات من صفحة
**Admin Mode → User Management**، مع اختيار الدور المناسب: Engineer أو DC أو
Head أو Admin. تبقى شاشة الدخول مخصّصة لتسجيل الدخول فقط.

## الإنتاج

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

في الإنتاج يجب ضبط `INITIAL_ADMIN_PASSWORD` في البيئة قبل أول تشغيل، ووضع
الخادم خلف HTTPS. يخدم Node ملفات الواجهة المبنية والـAPI من نفس المنفذ.

### تشغيل خادم المكتب تلقائيًا

على خادم `D:\DC\ContecDC\source`، شغّل PowerShell كمسؤول ونفّذ:

```powershell
Set-Location 'D:\DC\ContecDC\source'
.\install-server-task.ps1
```

تنشئ هذه الخطوة مهمة `ContecDC` عند إقلاع ويندوز وتشغّل خادم الإنتاج على المنفذ
`5173`. يعيد `server-start.ps1` تشغيل Node بعد توقف غير متوقع، ويحفظ السجل في
`logs\site.log`. للتحقق: `http://127.0.0.1:5173/api/health` على الخادم.
قبل تحديث الواجهة، نفّذ `npm run build` أو انشر مجلد `dist` المبني.

## الاختبارات

```powershell
npm test
npm run build
```
