# AI Chat SaaS

سامانه چندمستاجری چت آنلاین، پشتیبانی اپراتوری و پاسخ‌گویی هوشمند برای نصب روی سایت مشتریان.

## اجزای پروژه

- `backend/`: APIهای PHP، نشست امن HttpOnly، مدیریت مشتریان، پیام‌رسانی، AI، گزارش‌ها و ابزارهای QA
- `frontend/`: پنل Next.js برای Super Admin، مدیر مشتری و اپراتور
- `widget/`: ویجت مستقل چت مبتنی بر Shadow DOM
- `qa-browser-runner/`: تست‌های مرورگری Playwright
- `tools/`: Smoke testهای خط فرمان
- `backend/database/schema.sql`: schema کامل، پاک‌سازی‌شده و بدون داده برای نصب تازه
- `backend/database/migrations/`: migrationهای افزایشی دیتابیس
- `doc/`: مستندات فنی و تجاری

## پیش‌نیازها

- PHP 8.1 یا جدیدتر؛ PHP 8.2 پیشنهاد می‌شود
- MySQL یا MariaDB با پشتیبانی `utf8mb4`
- Node.js 20.9 یا جدیدتر و npm
- افزونه‌های PHP: `json`، `pdo_mysql`، `mbstring`، `openssl`، `fileinfo`، `dom` و `curl`
- برای محیط Production، فعال بودن `opcache` و در صورت امکان `sodium` پیشنهاد می‌شود

## راه‌اندازی بک‌اند

1. فایل تنظیمات نمونه را کپی کنید:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

2. مقادیر دیتابیس، URLها و CORS را در `backend/.env` تنظیم کنید.

3. برای `JWT_SECRET` و `APP_ENCRYPTION_KEY` دو مقدار تصادفی و مستقل بسازید:

   ```powershell
   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
   ```

4. دیتابیس `ai_chat_saas` را با Collation مبتنی بر `utf8mb4` ایجاد کنید.

5. برای نصب تازه فقط `backend/database/schema.sql` را import کنید. این فایل شامل ساختار نهایی همه migrationها تا `2026_08_30_automation_guardrails.sql` است و هیچ داده کاربر، نشست، پیام یا Secret ندارد. migrationهای قدیمی را بعد از این schema دوباره اجرا نکنید.

   ```powershell
   Get-Content backend\database\schema.sql -Raw |
     & C:\xampp\mysql\bin\mysql.exe -u root ai_chat_saas
   ```

   برای دیتابیس موجود، فقط migrationهایی را اجرا کنید که قبلاً روی آن محیط اعمال نشده‌اند. dumpهای کامل داخل `database/` حاوی داده واقعی هستند، توسط Git نادیده گرفته می‌شوند و فقط برای Backup/Restore محلی‌اند.

6. در XAMPP، مسیر پروژه باید از طریق Apache در دسترس باشد. سلامت بک‌اند از این آدرس قابل بررسی است:

   ```text
   http://localhost/ai-chat-saas/backend/public/
   ```

## راه‌اندازی فرانت‌اند

```powershell
Set-Location frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

پنل به‌صورت پیش‌فرض روی `http://localhost:3000` اجرا می‌شود. مقدار `NEXT_PUBLIC_API_BASE_URL` در `frontend/.env.local` باید به API بک‌اند اشاره کند.

## ویجت

فایل قابل نصب ویجت `widget/dist/widget.js` است. نمونه استفاده:

```html
<script
  src="http://localhost/ai-chat-saas/widget/dist/widget.js"
  data-site-key="YOUR_SITE_KEY"
  data-api-base="http://localhost/ai-chat-saas/backend/api"
  defer
></script>
```

کد توسعه در `widget/src/widget.js` نگهداری می‌شود. در حال حاضر pipeline ساخت جداگانه‌ای برای ویجت وجود ندارد؛ هر تغییر ویجت باید به‌صورت کنترل‌شده در نسخه `dist` نیز منتشر شود.

## چت بلادرنگ

صفحه گفتگو، صندوق ورودی اپراتور، صفحه پشتیبانی عمومی و ویجت از Server-Sent Events استفاده می‌کنند. ارسال پیام همچنان با APIهای معمول انجام می‌شود و SSE تغییرات پیام، رسید خواندن، وضعیت گفتگو و تایپ اپراتور را فوراً به طرف مقابل اعلام می‌کند. اگر مرورگر، پراکسی یا میزبان از stream پشتیبانی نکند، کلاینت به‌صورت خودکار به polling قبلی برمی‌گردد و بعداً اتصال بلادرنگ را دوباره امتحان می‌کند.

تنظیمات اختیاری:

```dotenv
REALTIME_STREAM_DURATION_SECONDS=25
REALTIME_POLL_INTERVAL_MS=750
```

در Production، فشرده‌سازی و buffering مسیرهای `*/conversation-stream.php` و `*/inbox-stream.php` باید در Reverse Proxy غیرفعال باشد. هر اتصال SSE یک درخواست نسبتاً طولانی نگه می‌دارد؛ بنابراین تعداد Workerهای PHP/Apache باید متناسب با تعداد اپراتورها و گفتگوهای هم‌زمان تنظیم شود.

## مرکز اتوماسیون

مرکز اتوماسیون شامل قوانین رویدادمحور، شرط‌ها و اقدام‌های قابل ترکیب، سیاست‌های SLA، هشدارهای عملیاتی و تاریخچه اجرا است. رویدادهای شروع گفتگو، پیام مشتری، پاسخ پشتیبان، تغییر وضعیت و تخصیص به موتور متصل‌اند.

برای بررسی قوانین زمان‌بندی‌شده و سررسیدهای SLA، این Worker باید هر دقیقه با Task Scheduler ویندوز یا Cron اجرا شود. در ویندوز برای جلوگیری از بازشدن پنجره CMD، برنامه Task را روی `php-win.exe` قرار دهید:

```powershell
C:\xampp\php\php-win.exe C:\xampp\htdocs\ai-chat-saas\backend\cron\automation-worker.php
```

روی دیتابیس‌های موجود ابتدا migration زیر را فقط یک بار اجرا کنید:

```text
backend/database/migrations/2026_08_30_automation_center.sql
backend/database/migrations/2026_08_30_automation_guardrails.sql
```

برای افزودن یا به‌روزرسانی سه قانون پیشنهادی و SLA استاندارد یک حساب مشتری، اسکریپت زیر idempotent است و رکورد تکراری نمی‌سازد. SLA پیش‌فرض، پاسخ اولیه ۱۵ دقیقه، حل گفتگو ۲۴ ساعت و هشدار ۵ دقیقه پیش از سررسید دارد و از زمان ایجاد به بعد اعمال می‌شود:

```powershell
php backend\cli\seed-automation-defaults.php TENANT_ID CUSTOMER_ADMIN_USER_ID
```

اعلان‌های تولیدشده توسط قوانین و SLA از طریق SSE در تمام صفحات پنل مشتری و پشتیبان نمایش داده می‌شوند. در صورت قطع Stream، رابط به دریافت دوره‌ای خودکار برمی‌گردد.

## بررسی کیفیت

فرانت‌اند:

```powershell
Set-Location frontend
npm run lint
npm run build
```

بک‌اند و محیط اجرا:

```powershell
php backend\cli\pass2-runtime-check.php
php backend\cli\pass2-database-check.php
php backend\cli\automation-smoke-test.php
php backend\cli\automation-api-smoke-test.php
php backend\cli\auth-cookie-smoke-test.php

$files = rg --files backend -g '*.php'
foreach ($file in $files) { php -l $file }
```

Smoke test API، پس از اجرای Apache و MySQL:

```powershell
$env:PASS2_API_BASE = 'http://localhost/ai-chat-saas/backend/api'
$env:PASS2_EMAIL = 'test@example.com'
$env:PASS2_PASSWORD = 'test-password'
node tools\pass2-smoke-test.mjs
```

## تنظیمات مهم Production

- `APP_ENV=production` و `APP_DEBUG=false`
- استفاده از HTTPS برای پنل، API و ویجت
- مقادیر تصادفی و متفاوت برای `JWT_SECRET` و `APP_ENCRYPTION_KEY`
- `WIDGET_ALLOW_EMPTY_ORIGIN=false`
- محدودکردن `PANEL_ALLOWED_ORIGINS` و `WIDGET_ALLOWED_ORIGINS` به دامنه‌های واقعی
- نگهداری uploadها، logها، cache و فایل `.env` خارج از Git
- اجرای منظم cronهای `backend/cron/`
- تهیه backup رمزگذاری‌شده از دیتابیس و uploadها

## وضعیت فایل‌های محلی

فایل‌های `.env`، دیتابیس‌های dumpشده، uploadها، خروجی‌های Runtime و dependencyها نباید Commit شوند. پیش از Commit همیشه خروجی زیر را بررسی کنید:

```powershell
git status --short
```
