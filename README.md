# AI Chat SaaS

سامانه چندمستاجری چت آنلاین، پشتیبانی اپراتوری و پاسخ‌گویی هوشمند برای نصب روی سایت مشتریان.

## اجزای پروژه

- `backend/`: APIهای PHP، احراز هویت JWT، مدیریت مشتریان، پیام‌رسانی، AI، گزارش‌ها و ابزارهای QA
- `frontend/`: پنل Next.js برای Super Admin، مدیر مشتری و اپراتور
- `widget/`: ویجت مستقل چت مبتنی بر Shadow DOM
- `qa-browser-runner/`: تست‌های مرورگری Playwright
- `tools/`: Smoke testهای خط فرمان
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

5. ابتدا schema پایه را import و سپس فایل‌های `backend/database/migrations` را به‌ترتیب نام اجرا کنید. در نسخه محلی فعلی یک dump توسعه‌ای در `database/ai_chat_saas (4).sql` وجود دارد؛ این فایل حاوی داده است و عمداً توسط Git دنبال نمی‌شود. برای استقرار یا Clone تازه باید یک schema پایه پاک‌سازی‌شده و بدون داده حساس تهیه شود.

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
