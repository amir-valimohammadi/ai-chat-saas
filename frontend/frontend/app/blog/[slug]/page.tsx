// مسیر فایل: ai-chat-saas/frontend/app/blog/[slug]/page.tsx
// هدف: صفحه جزئیات مقاله بلاگ

import Link from "next/link";
import { notFound } from "next/navigation";
import { blogPosts, getBlogPostBySlug } from "@/lib/blog-posts";

export function generateStaticParams() {
    return blogPosts.map((post) => ({
        slug: post.slug,
    }));
}

export async function generateMetadata({
                                           params,
                                       }: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const post = getBlogPostBySlug(slug);

    if (!post) {
        return {
            title: "مقاله پیدا نشد",
        };
    }

    return {
        title: `${post.title} | AI Chat SaaS`,
        description: post.excerpt,
        keywords: post.keywords,
    };
}

export default async function BlogPostPage({
                                               params,
                                           }: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const post = getBlogPostBySlug(slug);

    if (!post) {
        notFound();
    }

    return (
        <main className="marketing-page">
            <header className="marketing-header">
                <Link href="/" className="marketing-logo">
                    <span>AI</span>
                    Chat SaaS
                </Link>

                <nav className="marketing-nav">
                    <Link href="/">صفحه اصلی</Link>
                    <Link href="/blog">بلاگ</Link>
                    <Link href="/login" className="marketing-login">
                        ورود به پنل
                    </Link>
                </nav>
            </header>

            <article className="blog-article">
                <Link href="/blog" className="blog-back-link">
                    ← بازگشت به بلاگ
                </Link>

                <div className="blog-article-head">
                    <span className="blog-category">{post.category}</span>
                    <h1>{post.title}</h1>
                    <p>{post.excerpt}</p>

                    <div className="blog-meta">
                        <span>{post.publishedAt}</span>
                        <span>{post.readTime}</span>
                    </div>
                </div>

                <div className="blog-article-body">
                    {post.content.map((section) => (
                        <section key={section.heading}>
                            <h2>{section.heading}</h2>
                            <p>{section.body}</p>
                        </section>
                    ))}
                </div>

                <div className="blog-keywords">
                    {post.keywords.map((keyword) => (
                        <span key={keyword}>{keyword}</span>
                    ))}
                </div>
            </article>
        </main>
    );
}