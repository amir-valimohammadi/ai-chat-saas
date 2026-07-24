"use client";

import { useState } from "react";
import { apiRequest, clearImpersonationAuth } from "@/lib/api";
import styles from "@/styles/impersonation-banner.module.css";

type Props = {
  impersonatorName?: string | null;
  expiresAt?: string | null;
};

export default function ImpersonationBanner({ impersonatorName, expiresAt }: Props) {
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");

  async function endSession() {
    setEnding(true);
    setError("");
    try {
      await apiRequest("/auth/impersonation-stop.php", { method: "POST" });
      clearImpersonationAuth();
      window.location.href = "/impersonate?ended=1";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "پایان ورود موقت ناموفق بود.");
      setEnding(false);
    }
  }

  return (
    <div className={styles.banner} role="status">
      <div className={styles.content}>
        <span className={styles.pulse} aria-hidden="true" />
        <div>
          <strong>حالت ورود موقت فعال است</strong>
          <p>
            شما از طرف {impersonatorName || "مدیر پلتفرم"} وارد پنل مشتری شده‌اید.
            {expiresAt ? ` پایان خودکار: ${new Date(expiresAt).toLocaleString("fa-IR")}` : ""}
          </p>
          {error && <small>{error}</small>}
        </div>
      </div>
      <button type="button" onClick={endSession} disabled={ending}>
        {ending ? "در حال خروج..." : "پایان ورود موقت"}
      </button>
    </div>
  );
}
