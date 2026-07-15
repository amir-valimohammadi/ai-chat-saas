// مسیر فایل: ai-chat-saas/frontend/app/page.tsx
// هدف: صفحه اصلی محصول با طراحی کاملاً جدید، رنگ‌بندی ارتقایافته و ساختار Landing حرفه‌ای

import Link from "next/link";

const stats = [
    { value: "2.4x", label: "سرعت پاسخ‌گویی بیشتر" },
    { value: "+38%", label: "بهبود پیگیری گفتگوها" },
    { value: "-45%", label: "کاهش پیام‌های بی‌پاسخ" },
];

const productModules = [
    {
        icon: "↗",
        title: "اختصاص گفتگو",
        text: "هر گفتگو را به پشتیبان مناسب assign کنید تا مسئولیت پاسخ‌گویی مشخص باشد.",
    },
    {
        icon: "●",
        title: "وضعیت‌های حرفه‌ای",
        text: "گفتگوها را با وضعیت‌هایی مثل در حال انجام، پیگیری، در انتظار مشتری و بسته‌شده مدیریت کنید.",
    },
    {
        icon: "▣",
        title: "ارسال فایل و تصویر",
        text: "کاربر و پشتیبان می‌توانند تصویر، PDF و فایل‌های ضروری را در جریان گفتگو ارسال کنند.",
    },
    {
        icon: "AI",
        title: "زیرساخت هوشمند",
        text: "ساختار محصول آماده اضافه شدن پیشنهاد پاسخ AI و امکانات هوشمندتر است.",
    },
];

const productCapabilities = [
    "ویجت قابل نصب روی سایت",
    "Inbox تیم پشتیبانی",
    "مدیریت مشتری‌ها",
    "گزارش و مصرف پلن",
    "اعلان‌های پنل مشتری",
    "تنظیمات برند و ویجت",
];

const flow = [
    {
        number: "01",
        title: "نصب ویجت",
        text: "کد ویجت روی سایت مشتری قرار می‌گیرد و آماده دریافت پیام می‌شود.",
    },
    {
        number: "02",
        title: "شروع گفتگو",
        text: "کاربر از همان صفحه سایت پیام می‌دهد، فایل ارسال می‌کند یا سوال می‌پرسد.",
    },
    {
        number: "03",
        title: "مدیریت در پنل",
        text: "تیم پشتیبانی گفتگو را می‌بیند، assign می‌کند و وضعیت را تغییر می‌دهد.",
    },
    {
        number: "04",
        title: "گزارش و رشد",
        text: "مدیر با گزارش‌ها، عملکرد تیم و کیفیت ارتباط با مشتری را بررسی می‌کند.",
    },
];

const plans = [
    {
        name: "Starter",
        badge: "شروع",
        price: "تستی / ساده",
        text: "برای تست محصول و کسب‌وکارهای کوچک.",
        items: ["۱ سایت", "۱ پشتیبان", "گفتگوی محدود", "ویجت پایه", "پاسخ آماده"],
    },
    {
        name: "Growth",
        badge: "پیشنهادی",
        price: "پلن رشد",
        text: "برای تیم‌هایی که پشتیبانی روزانه و فعال دارند.",
        featured: true,
        items: ["چند پشتیبان", "Assign گفتگو", "Knowledge Base", "گزارش‌ها", "اعلان‌های پنل", "شخصی‌سازی ویجت"],
    },
    {
        name: "Scale",
        badge: "حرفه‌ای",
        price: "کامل‌تر",
        text: "برای چند سایت، تیم بزرگ‌تر و قابلیت‌های AI.",
        items: ["چند سایت", "AI Suggestion", "گزارش پیشرفته", "مدیریت کامل پلن", "دسترسی تیمی", "تنظیمات حرفه‌ای"],
    },
];

const team = [
    {
        initials: "PL",
        role: "Product Lead",
        name: "نام عضو تیم",
        text: "مسئول مسیر محصول، تجربه کاربری و هماهنگی توسعه قابلیت‌های اصلی.",
    },
    {
        initials: "BE",
        role: "Backend Developer",
        name: "نام عضو تیم",
        text: "توسعه APIها، دیتابیس، امنیت، احراز هویت و زیرساخت چندمشتریه.",
    },
    {
        initials: "FE",
        role: "Frontend Developer",
        name: "نام عضو تیم",
        text: "طراحی پنل‌ها، تجربه کاربری، صفحات مدیریتی و رابط کاربری ویجت.",
    },
    {
        initials: "CS",
        role: "Customer Success",
        name: "نام عضو تیم",
        text: "بررسی نیاز مشتری، بهبود فرآیند پشتیبانی و کمک به رشد محصول.",
    },
];

export default function HomePage() {
    return (
        <main className="stellar-page">
            <div className="stellar-noise" />
            <div className="stellar-orb stellar-orb-one" />
            <div className="stellar-orb stellar-orb-two" />

            <header className="stellar-header">
                <Link href="/" className="stellar-brand">
                    <span>AI</span>
                    <strong>Chat SaaS</strong>
                </Link>

                <nav className="stellar-nav">
                    <a href="#product">محصول</a>
                    <a href="#growth">رشد</a>
                    <a href="#flow">نحوه کار</a>
                    <a href="#plans">پلن‌ها</a>
                    <a href="#team">تیم ما</a>
                    <Link href="/login" className="stellar-login">
                        ورود به پنل
                    </Link>
                </nav>
            </header>

            <section className="stellar-hero">
                <div className="stellar-hero-copy">
                    <span className="stellar-pill">پلتفرم پشتیبانی آنلاین برای سایت‌های در حال رشد</span>

                    <h1>
                        پشتیبانی سایتت را از یک چت ساده به
                        <em> تجربه‌ای سریع، قابل پیگیری و حرفه‌ای </em>
                        تبدیل کن
                    </h1>

                    <p>
                        AI Chat SaaS به کسب‌وکارها کمک می‌کند پیام‌های کاربران سایت را در یک
                        پنل منظم دریافت کنند، گفتگوها را به پشتیبان‌ها اختصاص دهند، فایل دریافت
                        کنند، وضعیت‌ها را پیگیری کنند و عملکرد پشتیبانی را با گزارش‌ها بهتر کنند.
                    </p>

                    <div className="stellar-hero-actions">
                        <Link href="/login" className="stellar-btn primary">
                            ورود به پنل
                        </Link>

                        <a href="#product" className="stellar-btn secondary">
                            دیدن محصول
                        </a>
                    </div>

                    <div className="stellar-hero-tags">
                        <span>Multi Tenant</span>
                        <span>Widget Chat</span>
                        <span>Team Inbox</span>
                        <span>Plan Based</span>
                    </div>
                </div>

                <div className="stellar-visual">
                    <div className="stellar-visual-card">
                        <div className="stellar-window-top">
                            <div>
                                <i />
                                <i />
                                <i />
                            </div>
                            <span>Support Command Center</span>
                        </div>

                        <div className="stellar-command-grid">
                            <aside className="stellar-command-menu">
                                <span className="active" />
                                <span />
                                <span />
                                <span />
                                <span />
                            </aside>

                            <section className="stellar-chat-card">
                                <div className="stellar-chat-head">
                                    <div>
                                        <strong>گفتگو #1284</strong>
                                        <small>اختصاص داده شده به نازنین احمدی</small>
                                    </div>
                                    <b>Online</b>
                                </div>

                                <div className="stellar-messages">
                                    <div className="visitor">سلام، درباره سفارش یک سوال دارم.</div>
                                    <div className="agent">سلام 👋 شماره سفارش را ارسال کنید تا بررسی کنم.</div>
                                    <div className="visitor">رسید پرداخت را هم ارسال کردم.</div>
                                </div>

                                <div className="stellar-composer">
                                    <span>پاسخ آماده یا پیام جدید...</span>
                                    <button>ارسال</button>
                                </div>
                            </section>

                            <aside className="stellar-insights">
                                <article>
                                    <span>وضعیت گفتگو</span>
                                    <strong>Waiting Customer</strong>
                                </article>

                                <article>
                                    <span>اولویت</span>
                                    <strong>متوسط</strong>
                                </article>

                                <article className="accent">
                                    <span>AI Suggestion</span>
                                    <strong>پیشنهاد آماده است</strong>
                                </article>
                            </aside>
                        </div>
                    </div>

                    <div className="stellar-float-card top">
                        <strong>+38%</strong>
                        <span>بهبود پیگیری</span>
                    </div>

                    <div className="stellar-float-card bottom">
                        <strong>2.4x</strong>
                        <span>پاسخ‌گویی سریع‌تر</span>
                    </div>
                </div>
            </section>

            <section className="stellar-stats">
                {stats.map((item) => (
                    <article key={item.label}>
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                    </article>
                ))}
            </section>

            <section className="stellar-section stellar-product-section" id="product">
                <div className="stellar-section-head">
                    <span className="stellar-pill">محصول</span>
                    <h2>یک فضای مرکزی برای مدیریت ارتباط با کاربران سایت</h2>
                    <p>
                        پیام‌ها، فایل‌ها، وضعیت گفتگو، مسئول پاسخ‌گویی و گزارش عملکرد، همه در یک
                        ساختار تمیز و قابل پیگیری کنار هم قرار می‌گیرند.
                    </p>
                </div>

                <div className="stellar-suite">
                    <article className="stellar-suite-main">
                        <div className="stellar-suite-main-content">
                            <span className="stellar-suite-label">Core Product</span>

                            <h3>Inbox پشتیبانی، ویجت چت و مدیریت تیم در یک محصول</h3>

                            <p>
                                AI Chat SaaS کمک می‌کند هر کسب‌وکار، پیام‌های کاربران سایت را از
                                طریق ویجت دریافت کند، گفتگوها را در پنل ببیند، به اعضای تیم اختصاص
                                دهد و وضعیت هر گفتگو را تا حل کامل پیگیری کند.
                            </p>

                            <div className="stellar-suite-main-grid">
                                <div>
                                    <strong>Live Widget</strong>
                                    <span>شروع گفتگو از سایت مشتری</span>
                                </div>

                                <div>
                                    <strong>Team Inbox</strong>
                                    <span>مدیریت پیام‌ها در پنل</span>
                                </div>

                                <div>
                                    <strong>Plan Control</strong>
                                    <span>کنترل مصرف و محدودیت‌ها</span>
                                </div>
                            </div>
                        </div>

                        <div className="stellar-suite-preview">
                            <div className="stellar-suite-preview-top">
                                <span />
                                <span />
                                <span />
                            </div>

                            <div className="stellar-suite-preview-body">
                                <div className="stellar-suite-preview-row active">
                                    <b>گفتگو جدید</b>
                                    <small>در انتظار پاسخ</small>
                                </div>

                                <div className="stellar-suite-preview-row">
                                    <b>اختصاص داده شد</b>
                                    <small>پشتیبان: نازنین</small>
                                </div>

                                <div className="stellar-suite-preview-row">
                                    <b>فایل دریافت شد</b>
                                    <small>رسید پرداخت.pdf</small>
                                </div>
                            </div>
                        </div>
                    </article>

                    <div className="stellar-suite-modules">
                        {productModules.map((item) => (
                            <article key={item.title} className="stellar-suite-module">
                                <span>{item.icon}</span>
                                <div>
                                    <h3>{item.title}</h3>
                                    <p>{item.text}</p>
                                </div>
                            </article>
                        ))}
                    </div>

                    <div className="stellar-suite-capabilities">
                        {productCapabilities.map((item) => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </div>
            </section>

            <section className="stellar-growth" id="growth">
                <div className="stellar-growth-copy">
                    <span className="stellar-pill">رشد با ارتباط بهتر</span>
                    <h2>وقتی کاربر سریع‌تر جواب بگیرد، احتمال تبدیل او به مشتری بیشتر می‌شود</h2>
                    <p>
                        این نمودار یک سناریوی نمایشی است. اعداد واقعی به ترافیک، نوع کسب‌وکار و
                        کیفیت تیم پشتیبانی بستگی دارند، اما منطق ساده است: پاسخ سریع‌تر، اعتماد
                        بیشتر و پیگیری بهتر.
                    </p>

                    <div className="stellar-growth-list">
                        <span>کاهش رها شدن گفتگو</span>
                        <span>افزایش اعتماد کاربر</span>
                        <span>شفافیت عملکرد تیم</span>
                    </div>
                </div>

                <div className="stellar-chart-panel">
                    <div className="stellar-chart-head">
                        <div>
                            <strong>نمونه روند رشد تعامل</strong>
                            <span>قبل و بعد از فعال‌سازی چت و پیگیری تیمی</span>
                        </div>
                        <b>Demo</b>
                    </div>

                    <svg viewBox="0 0 760 340" className="stellar-chart">
                        <defs>
                            <linearGradient id="stellarLine" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#f97316" />
                                <stop offset="48%" stopColor="#14b8a6" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>

                            <linearGradient id="stellarArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.24" />
                                <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {[72, 138, 204, 270].map((y) => (
                            <line
                                key={y}
                                x1="54"
                                x2="710"
                                y1={y}
                                y2={y}
                                stroke="rgba(148,163,184,0.2)"
                                strokeDasharray="8 10"
                            />
                        ))}

                        <path
                            d="M 60 276 C 130 268, 180 244, 250 226 C 330 206, 365 178, 430 154 C 505 125, 555 96, 625 70 C 665 55, 690 48, 710 42 L 710 304 L 60 304 Z"
                            fill="url(#stellarArea)"
                        />

                        <path
                            d="M 60 276 C 130 268, 180 244, 250 226 C 330 206, 365 178, 430 154 C 505 125, 555 96, 625 70 C 665 55, 690 48, 710 42"
                            fill="none"
                            stroke="url(#stellarLine)"
                            strokeWidth="7"
                            strokeLinecap="round"
                        />

                        {[
                            [60, 276, "قبل"],
                            [250, 226, "ویجت"],
                            [430, 154, "Assign"],
                            [625, 70, "گزارش"],
                            [710, 42, "رشد"],
                        ].map(([x, y, label]) => (
                            <g key={String(label)}>
                                <circle cx={Number(x)} cy={Number(y)} r="9" fill="#fffaf0" />
                                <circle
                                    cx={Number(x)}
                                    cy={Number(y)}
                                    r="16"
                                    fill="rgba(20,184,166,0.16)"
                                />
                                <text
                                    x={Number(x)}
                                    y={Number(y) - 25}
                                    textAnchor="middle"
                                    fontSize="14"
                                    fontWeight="900"
                                    fill="#e5e7eb"
                                >
                                    {label}
                                </text>
                            </g>
                        ))}
                    </svg>
                </div>
            </section>

            <section className="stellar-section" id="flow">
                <div className="stellar-section-head">
                    <span className="stellar-pill">نحوه کار</span>
                    <h2>از نصب ویجت تا مدیریت کامل گفتگوها</h2>
                </div>

                <div className="stellar-flow">
                    {flow.map((item) => (
                        <article key={item.number}>
                            <span>{item.number}</span>
                            <h3>{item.title}</h3>
                            <p>{item.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="stellar-section" id="plans">
                <div className="stellar-section-head">
                    <span className="stellar-pill">پلن‌ها</span>
                    <h2>برای شروع ساده، رشد تیم و استفاده حرفه‌ای‌تر</h2>
                    <p>
                        پلن‌ها می‌توانند محدودیت‌هایی مثل تعداد سایت، تعداد پشتیبان، گفتگوهای
                        ماهانه، Knowledge Base و قابلیت‌های AI را کنترل کنند.
                    </p>
                </div>

                <div className="stellar-plans">
                    {plans.map((plan) => (
                        <article
                            key={plan.name}
                            className={`stellar-plan ${plan.featured ? "featured" : ""}`}
                        >
                            <span>{plan.badge}</span>
                            <h3>{plan.name}</h3>
                            <strong>{plan.price}</strong>
                            <p>{plan.text}</p>

                            <ul>
                                {plan.items.map((item) => (
                                    <li key={item}>
                                        <b>✓</b>
                                        {item}
                                    </li>
                                ))}
                            </ul>

                            <Link href="/login">ورود و مدیریت پلن</Link>
                        </article>
                    ))}
                </div>
            </section>

            <section className="stellar-section" id="team">
                <div className="stellar-section-head">
                    <span className="stellar-pill">تیم ما</span>
                    <h2>پشت محصول، تیمی برای بهتر کردن تجربه پشتیبانی قرار دارد</h2>
                    <p>
                        این بخش بعداً می‌تواند با عکس واقعی اعضا، نقش‌ها و توضیحات دقیق‌تر کامل شود.
                    </p>
                </div>

                <div className="stellar-team">
                    {team.map((member) => (
                        <article key={member.role}>
                            <div className="stellar-avatar">
                                <span>{member.initials}</span>
                            </div>
                            <small>{member.role}</small>
                            <h3>{member.name}</h3>
                            <p>{member.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="stellar-final">
                <span className="stellar-pill light">آماده شروع هستید؟</span>
                <h2>یک تجربه پشتیبانی شبیه برندهای حرفه‌ای بسازید</h2>
                <p>
                    با ویجت چت، Inbox تیمی، Assign گفتگو، وضعیت‌های حرفه‌ای، ارسال فایل،
                    اعلان‌های پنل، گزارش‌ها و پلن‌های قابل مدیریت، ارتباط با مشتری را به
                    یک مزیت رقابتی تبدیل کنید.
                </p>

                <Link href="/login" className="stellar-final-btn">
                    ورود به پنل
                </Link>
            </section>

            <footer className="stellar-footer">
                <Link href="/" className="stellar-brand">
                    <span>AI</span>
                    <strong>Chat SaaS</strong>
                </Link>

                <div>
                    <a href="#product">محصول</a>
                    <a href="#growth">رشد</a>
                    <a href="#plans">پلن‌ها</a>
                    <Link href="/login">ورود</Link>
                </div>
            </footer>
        </main>
    );
}