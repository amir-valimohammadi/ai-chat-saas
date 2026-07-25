// مسیر فایل: ai-chat-saas/frontend/app/blog/page.tsx
// هدف: صفحه لیست مقالات بلاگ برای SEO

import Link from "next/link";
import { blogPosts } from "@/lib/blog-posts";

export default function BlogPage() {
    return (
        <main className="marketing-page">
            <header className="marketing-header">
                <Link href="/" className="marketing-logo">
                    <span>AI</span>
                    Chat SaaS
                </Link>

                <nav className="marketing-nav">
                    <Link href="/">صفحه اصلی</Link>
                    <Link href="/login" className="marketing-login">
                        ورود به پنل
                    </Link>
                </nav>
            </header>

            <section className="blog-hero">
                <span className="marketing-eyebrow">بلاگ</span>
                <h1>آموزش‌ها و مقالات پشتیبانی آنلاین</h1>
                <p>
                    محتوای آموزشی درباره چت آنلاین، تجربه مشتری، پشتیبانی هوشمند و
                    اتوماسیون پاسخ‌گویی.
                </p>
            </section>

            <section className="blog-list">
                {blogPosts.map((post) => (
                    <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-card">
                        <div>
                            <span className="blog-category">{post.category}</span>
                            <h2>{post.title}</h2>
                            <p>{post.excerpt}</p>
                        </div>

                        <div className="blog-card-footer">
                            <span>{post.publishedAt}</span>
                            <span>{post.readTime}</span>
                        </div>
                    </Link>
                ))}
            </section>
        </main>
    );
}