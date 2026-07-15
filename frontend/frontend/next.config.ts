// مسیر فایل: ai-chat-saas/frontend/next.config.ts
// هدف: تنظیمات Next.js و هدرهای امنیتی فرانت‌اند

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value:
                            "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;