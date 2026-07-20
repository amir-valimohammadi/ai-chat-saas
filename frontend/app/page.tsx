"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ContactRequestSection from "@/components/public/ContactRequestSection";

type IconName =
    | "spark"
    | "chat"
    | "crawl"
    | "brain"
    | "users"
    | "chart"
    | "shield"
    | "arrow"
    | "check"
    | "code"
    | "layers"
    | "globe"
    | "menu"
    | "close";

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
    const common = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    };

    const paths: Record<IconName, React.ReactNode> = {
        spark: <><path d="M12 3l1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
        chat: <><path d="M5 18.2 3.8 21l3.8-1.2H18a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8.2a3 3 0 0 0 2 3Z"/><path d="M8 10h8M8 14h5"/></>,
        crawl: <><path d="M5 6h14M5 12h9M5 18h6"/><circle cx="18" cy="12" r="2"/><circle cx="15" cy="18" r="2"/><path d="m16.5 13.5-1 2.5"/></>,
        brain: <><path d="M9.5 4.5A3.5 3.5 0 0 0 6 8v.2A3.8 3.8 0 0 0 4 15a3 3 0 0 0 4 4.5"/><path d="M14.5 4.5A3.5 3.5 0 0 1 18 8v.2A3.8 3.8 0 0 1 20 15a3 3 0 0 1-4 4.5"/><path d="M9.5 4.5v15M14.5 4.5v15M7 10h2.5M14.5 8H17M14.5 15H18M6 16h3.5"/></>,
        users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M17 11a4 4 0 0 1 4 4v2M16.5 3.2a4 4 0 0 1 0 7.6"/></>,
        chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
        shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/></>,
        arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
        check: <path d="m5 12 4 4L19 6"/>,
        code: <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></>,
        layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
        globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
        menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
        close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    };

    return <svg {...common}>{paths[name]}</svg>;
}

const featureCards = [
    {
        icon: "crawl" as IconName,
        eyebrow: "Knowledge Crawler",
        title: "دانش سایت را خودکار استخراج کن",
        text: "مسیرهای داخلی را بخزش کن، محتوای فارسی را به بخش‌های قابل جست‌وجو تبدیل کن و روند پیشرفت را لحظه‌ای ببین.",
        className: "orbit-feature-card orbit-feature-card--large",
    },
    {
        icon: "brain" as IconName,
        eyebrow: "Persian Engine",
        title: "پاسخ‌گویی فارسی و توضیح‌پذیر",
        text: "نرمال‌سازی فارسی، تشخیص مترادف، رتبه‌بندی منابع و نمایش دلیل انتخاب پاسخ؛ بدون وابستگی به API خارجی.",
        className: "orbit-feature-card orbit-feature-card--violet",
    },
    {
        icon: "users" as IconName,
        eyebrow: "Team Inbox",
        title: "صندوق گفت‌وگوی تیمی",
        text: "گفت‌وگو را به پشتیبان اختصاص بده، وضعیت را تغییر بده و هیچ پیام مهمی را از دست نده.",
        className: "orbit-feature-card",
    },
    {
        icon: "chart" as IconName,
        eyebrow: "Control Center",
        title: "گزارش و کنترل کامل",
        text: "مصرف پلن، سؤالات بی‌پاسخ، کیفیت پاسخ‌ها، وضعیت سایت‌ها و عملکرد تیم را یک‌جا مدیریت کن.",
        className: "orbit-feature-card",
    },
];

const workflow = [
    { number: "01", title: "ویجت را نصب کن", text: "یک قطعه کد سبک را روی سایت قرار بده و رنگ، لوگو و پیام خوش‌آمدگویی را شخصی‌سازی کن." },
    { number: "02", title: "دانش را بساز", text: "صفحات داخلی سایت را بخزش کن یا سؤال و پاسخ‌های اختصاصی خودت را به پایگاه دانش اضافه کن." },
    { number: "03", title: "گفت‌وگو را مدیریت کن", text: "پشتیبان‌ها پیام‌ها را در Inbox تیمی دریافت می‌کنند و موتور داخلی پاسخ‌های مرتبط پیشنهاد می‌دهد." },
    { number: "04", title: "کیفیت را بهبود بده", text: "سؤال‌های بی‌پاسخ را شناسایی کن، دانش را کامل‌تر کن و عملکرد سیستم را با گزارش‌ها بسنج." },
];

const plans = [
    {
        name: "Basic",
        caption: "برای شروع و تست محصول",
        items: ["یک سایت", "ویجت شخصی‌سازی‌شده", "Inbox پشتیبانی", "دانش دستی", "گزارش پایه"],
    },
    {
        name: "Growth",
        caption: "برای کسب‌وکارهای در حال رشد",
        featured: true,
        items: ["چند پشتیبان", "خزش داخلی سایت", "موتور پاسخ فارسی", "پاسخ خودکار کنترل‌شده", "گزارش کیفیت AI"],
    },
    {
        name: "Pro",
        caption: "برای تیم‌ها و چند سایت",
        items: ["چند سایت", "مدیریت تیم پیشرفته", "محدودیت‌های اختصاصی", "نظارت سوپرادمین", "گزارش و کنترل کامل"],
    },
];

const faqs = [
    ["آیا سیستم برای پاسخ‌گویی به سرویس خارجی متصل می‌شود؟", "خیر. موتور فعلی پاسخ‌گویی، جست‌وجو و رتبه‌بندی را داخل زیرساخت خود محصول انجام می‌دهد و به API چت خارجی وابسته نیست."],
    ["آیا ویجت روی هر سایتی قابل نصب است؟", "بله. کد ویجت می‌تواند روی سایت‌های مختلف نصب شود و برای هر سایت تنظیمات برند، پیام خوش‌آمدگویی و حالت پاسخ‌گویی جداگانه داشته باشد."],
    ["دانش پاسخ‌ها از کجا تأمین می‌شود؟", "از سؤال و پاسخ‌های دستی، محتوای صفحات خزیده‌شده و سؤال‌های تولیدشده از همان محتوا. مدیر می‌تواند همه این منابع را بررسی و ویرایش کند."],
    ["آیا چند پشتیبان می‌توانند هم‌زمان کار کنند؟", "بله. گفت‌وگوها قابل اختصاص به اعضای تیم هستند و وضعیت، اولویت، فایل‌ها و تاریخچه پیام‌ها در Inbox مشترک نگهداری می‌شود."],
    ["پاسخ خودکار چگونه کنترل می‌شود؟", "سه حالت خاموش، دستیار و نیمه‌خودکار وجود دارد. پاسخ خودکار فقط با مجوز پلن، نبود پشتیبان آنلاین و عبور امتیاز اطمینان از حد تعیین‌شده ارسال می‌شود."],
];

export default function HomePage() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.13 },
        );

        nodes.forEach((node) => observer.observe(node));
        return () => observer.disconnect();
    }, []);

    function choosePlan(planName: string) {
        window.dispatchEvent(
            new CustomEvent("contact-plan-select", {
                detail: { planName },
            }),
        );
    }

    return (
        <main className="orbit-page">
            <div className="orbit-grid-bg" aria-hidden="true" />
            <div className="orbit-aurora orbit-aurora--one" aria-hidden="true" />
            <div className="orbit-aurora orbit-aurora--two" aria-hidden="true" />

            <header className={`orbit-header ${scrolled ? "is-scrolled" : ""}`}>
                <div className="orbit-header-inner">
                    <Link href="/" className="orbit-brand" aria-label="صفحه اصلی AI Chat SaaS">
                        <span className="orbit-brand-mark"><Icon name="spark" size={20} /></span>
                        <span className="orbit-brand-text">
                            <strong>AI Chat</strong>
                            <small>SaaS Platform</small>
                        </span>
                    </Link>

                    <nav className={`orbit-nav ${mobileOpen ? "is-open" : ""}`}>
                        <a href="#platform" onClick={() => setMobileOpen(false)}>محصول</a>
                        <a href="#intelligence" onClick={() => setMobileOpen(false)}>موتور هوشمند</a>
                        <a href="#workflow" onClick={() => setMobileOpen(false)}>نحوه کار</a>
                        <a href="#plans" onClick={() => setMobileOpen(false)}>پلن‌ها</a>
                        <a href="#contact" onClick={() => setMobileOpen(false)}>مشاوره و خرید</a>
                        <a href="#faq" onClick={() => setMobileOpen(false)}>سؤالات متداول</a>
                        <Link href="/login" className="orbit-nav-login">ورود به پنل <Icon name="arrow" size={17} /></Link>
                    </nav>

                    <div className="orbit-header-actions">
                        <Link href="/login" className="orbit-header-login">ورود به پنل</Link>
                        <button
                            type="button"
                            className="orbit-mobile-toggle"
                            onClick={() => setMobileOpen((value) => !value)}
                            aria-label={mobileOpen ? "بستن منو" : "باز کردن منو"}
                            aria-expanded={mobileOpen}
                        >
                            <Icon name={mobileOpen ? "close" : "menu"} />
                        </button>
                    </div>
                </div>
            </header>

            <section className="orbit-hero">
                <div className="orbit-hero-copy" data-reveal>
                    <div className="orbit-launch-badge">
                        <span className="orbit-live-dot" />
                        نسخه آماده ارائه محصول
                    </div>

                    <h1>
                        پشتیبانی هوشمند،
                        <span> ساده و قابل کنترل</span>
                    </h1>

                    <p>
                        ویجت چت، تیم پشتیبانی، دانش سایت و موتور پاسخ فارسی را در یک فضای یکپارچه مدیریت کنید.
                    </p>

                    <div className="orbit-hero-actions">
                        <Link href="/login" className="orbit-button orbit-button--primary">
                            ورود به پنل محصول
                            <Icon name="arrow" size={19} />
                        </Link>
                        <a href="#contact" className="orbit-button orbit-button--ghost">
                            درخواست مشاوره
                        </a>
                    </div>

                    <div className="orbit-proof-row">
                        <span><Icon name="check" size={16} /> بدون API چت خارجی</span>
                        <span><Icon name="check" size={16} /> موتور فارسی توضیح‌پذیر</span>
                        <span><Icon name="check" size={16} /> معماری چندمشتریه</span>
                    </div>
                </div>

                <div className="orbit-product-stage" data-reveal>
                    <div className="orbit-stage-glow" />
                    <div className="orbit-dashboard-window">
                        <div className="orbit-window-bar">
                            <div className="orbit-window-dots"><i/><i/><i/></div>
                            <span>AI Chat · Command Center</span>
                            <b>Live</b>
                        </div>

                        <div className="orbit-dashboard-body">
                            <aside className="orbit-mini-sidebar">
                                <span className="active"><Icon name="chat" size={17}/></span>
                                <span><Icon name="brain" size={17}/></span>
                                <span><Icon name="crawl" size={17}/></span>
                                <span><Icon name="chart" size={17}/></span>
                            </aside>

                            <div className="orbit-inbox-pane">
                                <div className="orbit-pane-title">
                                    <div><small>Inbox تیمی</small><strong>گفت‌وگوهای فعال</strong></div>
                                    <span>۱۲ جدید</span>
                                </div>
                                <div className="orbit-conversation active">
                                    <i>م</i><div><strong>مریم احمدی</strong><span>شرایط ارسال رایگان چیه؟</span></div><small>الان</small>
                                </div>
                                <div className="orbit-conversation">
                                    <i>ع</i><div><strong>علی رضایی</strong><span>شماره سفارشم رو ارسال کردم</span></div><small>۲ دقیقه</small>
                                </div>
                                <div className="orbit-conversation">
                                    <i>س</i><div><strong>سارا محمدی</strong><span>برای مرجوعی راهنمایی می‌خواستم</span></div><small>۵ دقیقه</small>
                                </div>
                            </div>

                            <div className="orbit-chat-pane">
                                <div className="orbit-chat-title">
                                    <div><i>م</i><span><strong>مریم احمدی</strong><small>بازدیدکننده سایت · آنلاین</small></span></div>
                                    <b>در حال پاسخ</b>
                                </div>
                                <div className="orbit-chat-messages">
                                    <div className="orbit-message visitor">سلام، ارسال رایگان برای چه سفارش‌هایی است؟</div>
                                    <div className="orbit-message system"><Icon name="spark" size={14}/> موتور دانش در حال بررسی ۱۸ منبع...</div>
                                    <div className="orbit-message agent">برای سفارش‌های بیشتر از ۳ میلیون تومان، ارسال عادی رایگان است.</div>
                                </div>
                                <div className="orbit-ai-suggestion">
                                    <div><Icon name="brain" size={18}/><span><small>پاسخ پیشنهادی داخلی</small><strong>اطمینان ۹۲٪ · منبع: شرایط ارسال</strong></span></div>
                                    <button>استفاده از پاسخ</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="orbit-widget-demo">
                        <div className="orbit-widget-head">
                            <span><i/><strong>پشتیبانی آنلاین</strong></span>
                            <small>کمتر از یک دقیقه</small>
                        </div>
                        <div className="orbit-widget-body">
                            <div className="orbit-widget-bubble">سلام 👋 چطور می‌تونم کمکتون کنم؟</div>
                            <div className="orbit-widget-bubble user">شرایط خرید اقساطی چیه؟</div>
                            <div className="orbit-widget-typing"><i/><i/><i/></div>
                        </div>
                        <div className="orbit-widget-input"><span>پیام خود را بنویسید...</span><b>↑</b></div>
                    </div>

                </div>
            </section>

            <nav className="orbit-journey-map" aria-label="مسیر معرفی محصول" data-reveal>
                <a href="#platform"><span>01</span><strong>قابلیت‌ها</strong><small>ساختار یکپارچه محصول</small></a>
                <a href="#intelligence"><span>02</span><strong>موتور هوشمند</strong><small>پاسخ فارسی و منبع</small></a>
                <a href="#workflow"><span>03</span><strong>راه‌اندازی</strong><small>چهار مرحله روشن</small></a>
                <a href="#widget"><span>04</span><strong>ویجت</strong><small>تجربه مطابق برند</small></a>
                <a href="#plans"><span>05</span><strong>پلن‌ها</strong><small>انتخاب ظرفیت مناسب</small></a>
                <a href="#contact" className="is-highlighted"><span>06</span><strong>شروع همکاری</strong><small>ثبت درخواست مشاوره</small></a>
            </nav>

            <section className="orbit-section orbit-section--surface orbit-section--platform" id="platform">
                <div className="orbit-section-heading" data-reveal>
                    <span className="orbit-kicker"><Icon name="layers" size={17}/> 01 · همه‌چیز در یک محصول</span>
                    <h2>یک محصول برای کل مسیر پشتیبانی</h2>
                    <p>از دریافت پیام تا پاسخ‌گویی و گزارش، همه‌چیز در یک جریان ساده و قابل مدیریت قرار دارد.</p>
                </div>

                <div className="orbit-feature-grid">
                    {featureCards.map((item) => (
                        <article key={item.title} className={item.className} data-reveal>
                            <div className="orbit-feature-icon"><Icon name={item.icon}/></div>
                            <span>{item.eyebrow}</span>
                            <h3>{item.title}</h3>
                            <p>{item.text}</p>
                            {item.icon === "crawl" && (
                                <div className="orbit-crawl-preview">
                                    <div className="orbit-crawl-line"><span>در حال پردازش</span><strong>ai-chat-saas.ir/features</strong><b>68%</b></div>
                                    <div className="orbit-crawl-track"><i/></div>
                                    <div className="orbit-crawl-stats"><span>۱۲ صفحه کشف‌شده</span><span>۸ پردازش‌شده</span><span>۲۱ بخش دانش</span></div>
                                </div>
                            )}
                            {item.icon === "brain" && (
                                <div className="orbit-score-preview">
                                    <span><b>۱</b> مرجوعی و ضمانت <strong>۹۴٪</strong></span>
                                    <span><b>۲</b> شرایط ارسال <strong>۶۷٪</strong></span>
                                    <span><b>۳</b> پرسش عمومی <strong>۲۹٪</strong></span>
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            </section>

            <section className="orbit-intelligence" id="intelligence">
                <div className="orbit-intelligence-copy" data-reveal>
                    <span className="orbit-kicker orbit-kicker--light"><Icon name="brain" size={17}/> 02 · موتور پاسخ داخلی</span>
                    <h2>پاسخ فارسی با منبع و امتیاز اطمینان</h2>
                    <p>سؤال کاربر پردازش می‌شود، منابع مرتبط رتبه‌بندی می‌شوند و پاسخ همراه با دلیل انتخاب نمایش داده می‌شود.</p>
                    <ul>
                        <li><Icon name="check" size={18}/> تشخیص شکل‌های مختلف نوشتاری فارسی</li>
                        <li><Icon name="check" size={18}/> جست‌وجو میان دانش دستی، سؤال‌های تولیدشده و محتوای خزیده‌شده</li>
                        <li><Icon name="check" size={18}/> نمایش منبع، واژه‌های منطبق و فاصله رتبه اول و دوم</li>
                        <li><Icon name="check" size={18}/> جلوگیری از پاسخ ساختگی برای سؤال خارج از دانش سایت</li>
                    </ul>
                </div>

                <div className="orbit-explain-panel" data-reveal>
                    <div className="orbit-explain-head">
                        <span><i/><i/><i/></span>
                        <strong>Persian Retrieval Lab</strong>
                        <b>persian-hybrid-v2</b>
                    </div>
                    <div className="orbit-query-box">
                        <small>سؤال کاربر</small>
                        <strong>کالای آسیب دیده رو تا کی می‌تونم گزارش کنم؟</strong>
                    </div>
                    <div className="orbit-pipeline">
                        <div><span>01</span><b>نرمال‌سازی</b><small>کالای آسیب دیده تا کی گزارش</small></div>
                        <i/>
                        <div><span>02</span><b>تشخیص نیت</b><small>مرجوعی / ضمانت</small></div>
                        <i/>
                        <div><span>03</span><b>رتبه‌بندی</b><small>۹ نامزد بررسی شد</small></div>
                    </div>
                    <div className="orbit-result-card">
                        <div><span>پاسخ منتخب</span><b>اطمینان ۹۶٪</b></div>
                        <p>آسیب فیزیکی کالا باید حداکثر تا ۲۴ ساعت پس از تحویل به پشتیبانی گزارش شود.</p>
                        <footer><span><Icon name="globe" size={15}/> مرجوعی و ضمانت فروشگاه</span><strong>رتبه ۱ از ۹</strong></footer>
                    </div>
                </div>
            </section>

            <section className="orbit-section orbit-section--soft orbit-section--workflow" id="workflow">
                <div className="orbit-section-heading orbit-section-heading--center" data-reveal>
                    <span className="orbit-kicker"><Icon name="spark" size={17}/> 03 · مسیر راه‌اندازی</span>
                    <h2>راه‌اندازی در چهار مرحله روشن</h2>
                </div>
                <div className="orbit-workflow">
                    {workflow.map((item, index) => (
                        <article key={item.number} data-reveal>
                            <div className="orbit-workflow-number">{item.number}</div>
                            <div className="orbit-workflow-icon"><Icon name={(index === 0 ? "code" : index === 1 ? "crawl" : index === 2 ? "chat" : "chart") as IconName}/></div>
                            <h3>{item.title}</h3>
                            <p>{item.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="orbit-widget-section orbit-widget-section--surface" id="widget">
                <div className="orbit-widget-showcase" data-reveal>
                    <div className="orbit-widget-copy">
                        <span className="orbit-kicker"><Icon name="chat" size={17}/> 04 · تجربه‌ای مطابق برند شما</span>
                        <h2>ویجتی هماهنگ با ظاهر سایت شما</h2>
                        <p>ظاهر و رفتار ویجت برای هر سایت به‌صورت مستقل قابل تنظیم است.</p>
                        <div className="orbit-customization-list">
                            <span><i style={{ background: "#7c5cff" }}/> رنگ برند</span>
                            <span><i style={{ background: "#21d4fd" }}/> حالت روشن و تیره</span>
                            <span><i style={{ background: "#35e7a5" }}/> پیام خوش‌آمدگویی</span>
                            <span><i style={{ background: "#ffb86b" }}/> جایگاه ویجت</span>
                        </div>
                    </div>
                    <div className="orbit-phone-mockup">
                        <div className="orbit-phone-top"><span/><b>فروشگاه شما</b><i/></div>
                        <div className="orbit-phone-content"><div/><div/><div/><div/></div>
                        <div className="orbit-phone-widget">
                            <header><span><i/> پشتیبانی هوشمند</span><b>×</b></header>
                            <main>
                                <div>سلام! من دستیار فروشگاه هستم. چه کمکی از دستم برمیاد؟</div>
                                <div className="user">ارسال به شهرستان دارید؟</div>
                                <div>بله، سفارش‌ها به سراسر کشور ارسال می‌شوند.</div>
                            </main>
                            <footer><span>پیام شما...</span><b>↑</b></footer>
                        </div>
                        <div className="orbit-phone-launcher"><Icon name="chat" size={23}/><i/></div>
                    </div>
                </div>
            </section>

            <section className="orbit-section orbit-security-section orbit-section--plain">
                <div className="orbit-security-card" data-reveal>
                    <div className="orbit-security-icon"><Icon name="shield" size={32}/></div>
                    <div>
                        <span>معماری امن و چندمشتریه</span>
                        <h2>فضای مستقل برای هر مشتری و هر سایت</h2>
                        <p>تفکیک Tenant، کنترل نقش‌ها، محدودیت پلن، ثبت رخدادهای مدیریتی و اعتبارسنجی دامنه، ساختار محصول را برای استفاده واقعی آماده کرده‌اند.</p>
                    </div>
                    <div className="orbit-security-tags">
                        <span>Role Based Access</span><span>Tenant Isolation</span><span>Plan Enforcement</span><span>Audit Logs</span>
                    </div>
                </div>
            </section>

            <section className="orbit-section orbit-section--surface orbit-section--plans" id="plans">
                <div className="orbit-section-heading orbit-section-heading--center" data-reveal>
                    <span className="orbit-kicker"><Icon name="layers" size={17}/> 05 · پلن‌های قابل توسعه</span>
                    <h2>پلن‌های ساده و قابل توسعه</h2>
                    <p>ساختار پلن‌ها در پنل سوپرادمین قابل مدیریت است و دسترسی به قابلیت‌ها بر اساس هر پلن کنترل می‌شود.</p>
                </div>
                <div className="orbit-plans">
                    {plans.map((plan) => (
                        <article key={plan.name} className={plan.featured ? "is-featured" : ""} data-reveal>
                            {plan.featured && <span className="orbit-plan-badge">انتخاب پیشنهادی</span>}
                            <small>{plan.caption}</small>
                            <h3>{plan.name}</h3>
                            <div className="orbit-plan-line"/>
                            <ul>{plan.items.map((item) => <li key={item}><Icon name="check" size={16}/>{item}</li>)}</ul>
                            <button type="button" onClick={() => choosePlan(plan.name)}>
                                درخواست این پلن <Icon name="arrow" size={17}/>
                            </button>
                        </article>
                    ))}
                </div>
            </section>

            <div className="orbit-contact-transition" data-reveal>
                <span>06</span>
                <div>
                    <small>از معرفی محصول تا شروع همکاری</small>
                    <strong>محصول را دیدید؛ حالا نیاز واقعی کسب‌وکارتان را با ما در میان بگذارید.</strong>
                </div>
                <a href="#contact">ثبت درخواست <Icon name="arrow" size={18}/></a>
            </div>

            <ContactRequestSection />

            <section className="orbit-section orbit-section--soft orbit-section--faq" id="faq">
                <div className="orbit-faq-layout">
                    <div className="orbit-faq-copy" data-reveal>
                        <span className="orbit-kicker"><Icon name="spark" size={17}/> 07 · پاسخ کوتاه و شفاف</span>
                        <h2>سؤالاتی که در معرفی محصول پرسیده می‌شوند</h2>
                        <p>این بخش مهم‌ترین تفاوت‌ها و شیوه کار محصول را برای ارائه سریع و روشن جمع‌بندی می‌کند.</p>
                        <Link href="/login" className="orbit-text-link">ورود به نسخه عملیاتی <Icon name="arrow" size={18}/></Link>
                    </div>
                    <div className="orbit-faq-list">
                        {faqs.map(([question, answer], index) => (
                            <details key={question} open={index === 0} data-reveal>
                                <summary>{question}<span>+</span></summary>
                                <p>{answer}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-final-cta" data-reveal>
                <div className="orbit-cta-glow"/>
                <span><Icon name="spark" size={18}/> آماده نمایش نسخه نهایی</span>
                <h2>پشتیبانی سایت را یکپارچه و هوشمند مدیریت کنید</h2>
                <p>ویجت، تیم پشتیبانی، دانش سایت و موتور پاسخ فارسی در یک محصول یکپارچه.</p>
                <div>
                    <Link href="/login" className="orbit-button orbit-button--light">ورود به پنل محصول <Icon name="arrow" size={19}/></Link>
                    <a href="#contact" className="orbit-button orbit-button--dark">درخواست مشاوره و خرید</a>
                </div>
            </section>

            <footer className="orbit-footer">
                <div className="orbit-footer-main">
                    <Link href="/" className="orbit-brand">
                        <span className="orbit-brand-mark"><Icon name="spark" size={20}/></span>
                        <span className="orbit-brand-text"><strong>AI Chat</strong><small>SaaS Platform</small></span>
                    </Link>
                    <p>پلتفرم فارسی مدیریت چت، تیم پشتیبانی و پاسخ‌گویی هوشمند مبتنی بر دانش سایت.</p>
                </div>
                <div className="orbit-footer-links">
                    <div><strong>محصول</strong><a href="#platform">قابلیت‌ها</a><a href="#intelligence">موتور هوشمند</a><a href="#workflow">نحوه کار</a></div>
                    <div><strong>دسترسی</strong><Link href="/login">ورود به پنل</Link><a href="#plans">پلن‌ها</a><a href="#contact">مشاوره و خرید</a><a href="#faq">سؤالات متداول</a></div>
                </div>
                <div className="orbit-footer-bottom"><span>© 2026 AI Chat SaaS</span><span>طراحی و توسعه برای ارتباط هوشمندتر با مشتری</span></div>
            </footer>
        </main>
    );
}
