"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearImpersonationAuth, saveImpersonationAuth } from "@/lib/api";
import styles from "@/styles/impersonation-exchange.module.css";

export default function ImpersonationExchangePage() {
  const router = useRouter();
  const exchangeStarted = useRef(false);
  const [message, setMessage] = useState("در حال اعتبارسنجی ورود موقت...");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const isEnded = params.get("ended") === "1";
    setEnded(isEnded);
    if (isEnded) {
      clearImpersonationAuth();
      setMessage("ورود موقت با موفقیت پایان یافت. می‌توانید این تب را ببندید.");
      return;
    }
    const ticket = hashParams.get("ticket") || params.get("ticket") || "";
    if (!ticket) {
      setError("Ticket ورود موقت در آدرس وجود ندارد.");
      return;
    }
    window.history.replaceState(null, "", "/impersonate");
    apiRequest("/auth/impersonation-exchange.php", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ ticket }),
    }).then((data) => {
      saveImpersonationAuth(data.user, data.csrf_token);
      setMessage("ورود موقت تأیید شد؛ در حال انتقال به پنل مشتری...");
      router.replace("/dashboard");
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "ورود موقت ناموفق بود.");
    });
  }, [router]);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.logo}>AI</div>
        <h1>{ended ? "پایان ورود موقت" : "ورود موقت امن"}</h1>
        <p className={error ? styles.error : ""}>{error || message}</p>
        {(ended || error) && <button type="button" onClick={() => window.close()}>بستن این تب</button>}
      </section>
    </main>
  );
}
