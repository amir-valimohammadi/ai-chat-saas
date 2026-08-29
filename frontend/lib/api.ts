// مسیر فایل: ai-chat-saas/frontend/lib/api.ts
// هدف: ارتباط مرکزی پنل Next.js با PHP API

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost/ai-chat-saas/backend/api";

const PRIMARY_CSRF_KEY = "auth_csrf_token";
const IMPERSONATION_CSRF_KEY = "impersonation_csrf_token";

type ApiOptions = RequestInit & {
  auth?: boolean;
};

export type MaintenanceModeDetails = {
  enabled: true;
  message: string;
  until: string | null;
};

export const MAINTENANCE_MODE_EVENT = "ai-chat:maintenance-mode";

export class ApiProtocolError extends Error {
  readonly status: number;
  readonly path: string;
  readonly requestId: string | null;
  readonly contentType: string;

  constructor(options: {
    status: number;
    path: string;
    requestId: string | null;
    contentType: string;
  }) {
    const requestHint = options.requestId ? ` شناسه پیگیری: ${options.requestId}` : "";
    super(`پاسخ سرور برای ${options.path} JSON معتبر نیست (HTTP ${options.status}).${requestHint}`);
    this.name = "ApiProtocolError";
    this.status = options.status;
    this.path = options.path;
    this.requestId = options.requestId;
    this.contentType = options.contentType;
  }
}

export class MaintenanceModeError extends Error {
  readonly code = "maintenance_mode";
  readonly status = 503;
  readonly details: MaintenanceModeDetails;

  constructor(details: MaintenanceModeDetails) {
    super(details.message);
    this.name = "MaintenanceModeError";
    this.details = details;
  }
}

export function isMaintenanceModeError(error: unknown): error is MaintenanceModeError {
  return (
    error instanceof MaintenanceModeError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "maintenance_mode")
  );
}

function emitMaintenanceMode(details: MaintenanceModeDetails) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MaintenanceModeDetails>(MAINTENANCE_MODE_EVENT, {
      detail: details,
    })
  );
}

function maintenanceDetailsFromPayload(data: any): MaintenanceModeDetails {
  return {
    enabled: true,
    message:
      typeof data?.message === "string" && data.message.trim()
        ? data.message.trim()
        : "سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست.",
    until:
      typeof data?.maintenance_until === "string" && data.maintenance_until.trim()
        ? data.maintenance_until
        : null,
  };
}

function hasImpersonationSession() {
  return typeof window !== "undefined" && sessionStorage.getItem("impersonation_active") === "1";
}

function clearAuthStorage() {
  if (typeof window === "undefined") {
    return;
  }

  if (hasImpersonationSession()) {
    sessionStorage.removeItem("impersonation_auth_token");
    sessionStorage.removeItem("impersonation_auth_user");
    sessionStorage.removeItem("impersonation_active");
    sessionStorage.removeItem(IMPERSONATION_CSRF_KEY);
    return;
  }

  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
  sessionStorage.removeItem(PRIMARY_CSRF_KEY);
}

function csrfStorageKey(impersonation: boolean) {
  return impersonation ? IMPERSONATION_CSRF_KEY : PRIMARY_CSRF_KEY;
}

function isStateChangingMethod(method?: string) {
  return !["GET", "HEAD", "OPTIONS"].includes((method || "GET").toUpperCase());
}

function applyAuthContext(headers: Headers, impersonation: boolean) {
  if (impersonation) {
    headers.set("X-Auth-Context", "impersonation");
  }
}

function redirectAfterUnauthorized(wasImpersonating: boolean) {
  clearAuthStorage();
  if (typeof window === "undefined") return;
  if (wasImpersonating) {
    window.location.href = "/impersonate?ended=1";
  } else if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function ensureCsrfToken(impersonation: boolean): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("CSRF protection is only available in the browser.");
  }

  const storageKey = csrfStorageKey(impersonation);
  const existing = sessionStorage.getItem(storageKey) || "";
  if (/^[a-f0-9]{64}$/.test(existing)) {
    return existing;
  }

  const headers = new Headers();
  applyAuthContext(headers, impersonation);
  const response = await fetch(`${API_BASE_URL}/auth/csrf.php`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers,
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    redirectAfterUnauthorized(impersonation);
  }
  const token = typeof data?.csrf_token === "string" ? data.csrf_token : "";
  if (!response.ok || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error(data?.message || "دریافت توکن امنیتی ناموفق بود. صفحه را تازه‌سازی کنید.");
  }
  sessionStorage.setItem(storageKey, token);
  return token;
}

export async function apiRequest(path: string, options: ApiOptions = {}) {
  const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = new Headers(options.headers);
  const usesAuth = options.auth !== false;
  const impersonation = usesAuth && hasImpersonationSession();

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (usesAuth) {
    applyAuthContext(headers, impersonation);
    if (isStateChangingMethod(options.method)) {
      headers.set("X-CSRF-Token", await ensureCsrfToken(impersonation));
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const text = await response.text();

  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const requestId = response.headers.get("X-Request-ID");
    const contentType = response.headers.get("Content-Type") || "";

    if (process.env.NODE_ENV !== "production") {
      console.error("Invalid API JSON response", {
        path,
        status: response.status,
        requestId,
        contentType,
        preview: text.slice(0, 500),
      });
    }

    throw new ApiProtocolError({
      status: response.status,
      path,
      requestId,
      contentType,
    });
  }

  if (response.status === 401) {
    const wasImpersonating = hasImpersonationSession();
    redirectAfterUnauthorized(wasImpersonating);

    throw new Error(data?.message || "نشست شما منقضی شده است. دوباره وارد شوید.");
  }

  if (!data) {
    throw new Error("پاسخ معتبری از سرور دریافت نشد.");
  }

  if (response.status === 503 && data?.code === "maintenance_mode") {
    const details = maintenanceDetailsFromPayload(data);
    emitMaintenanceMode(details);
    throw new MaintenanceModeError(details);
  }

  if (!response.ok) {
    throw new Error(data?.message || "خطا در ارتباط با سرور");
  }

  if (data.success === false) {
    throw new Error(data?.message || "عملیات ناموفق بود");
  }

  return data;
}

export async function apiDownload(path: string, fallbackFilename = "download") {
  const headers = new Headers();
  const impersonation = hasImpersonationSession();
  applyAuthContext(headers, impersonation);

  const response = await fetch(`${API_BASE_URL}${path}`, { headers, credentials: "include" });

  if (response.status === 401) {
    const wasImpersonating = hasImpersonationSession();
    clearAuthStorage();
    if (typeof window !== "undefined") {
      window.location.href = wasImpersonating ? "/impersonate?ended=1" : "/login";
    }
    throw new Error("نشست شما منقضی شده است. دوباره وارد شوید.");
  }

  if (!response.ok) {
    let message = "دانلود فایل ناموفق بود";
    let data: any = null;
    try {
      data = await response.json();
      message = data?.message || message;
    } catch {
      // پاسخ غیر JSON برای خطای دانلود
    }

    if (response.status === 503 && data?.code === "maintenance_mode") {
      const details = maintenanceDetailsFromPayload(data);
      emitMaintenanceMode(details);
      throw new MaintenanceModeError(details);
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackFilename;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function saveAuth(user: unknown, csrfToken?: string) {
  if (!user) {
    throw new Error("اطلاعات ورود ناقص است.");
  }

  localStorage.removeItem("auth_token");
  localStorage.setItem("auth_user", JSON.stringify(user));
  if (csrfToken && /^[a-f0-9]{64}$/.test(csrfToken)) {
    sessionStorage.setItem(PRIMARY_CSRF_KEY, csrfToken);
  }
}

export function getAuthUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = sessionStorage.getItem("impersonation_auth_user") || localStorage.getItem("auth_user");

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function logout() {
  clearAuthStorage();
}


export function updateAuthUser(user: unknown) {
  if (typeof window === "undefined" || !user) {
    return;
  }
  if (hasImpersonationSession()) {
    sessionStorage.setItem("impersonation_auth_user", JSON.stringify(user));
  } else {
    localStorage.setItem("auth_user", JSON.stringify(user));
  }
}

export function saveImpersonationAuth(user: unknown, csrfToken?: string) {
  if (typeof window === "undefined" || !user) {
    throw new Error("اطلاعات ورود موقت ناقص است.");
  }
  sessionStorage.removeItem("impersonation_auth_token");
  sessionStorage.setItem("impersonation_auth_user", JSON.stringify(user));
  sessionStorage.setItem("impersonation_active", "1");
  if (csrfToken && /^[a-f0-9]{64}$/.test(csrfToken)) {
    sessionStorage.setItem(IMPERSONATION_CSRF_KEY, csrfToken);
  }
}

export function clearImpersonationAuth() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("impersonation_auth_token");
  sessionStorage.removeItem("impersonation_auth_user");
  sessionStorage.removeItem("impersonation_active");
  sessionStorage.removeItem(IMPERSONATION_CSRF_KEY);
}

export function isImpersonationSession() {
  return hasImpersonationSession();
}

export async function logoutCurrentDevice() {
  try {
    await apiRequest("/auth/logout-current.php", { method: "POST" });
  } finally {
    logout();
  }
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}) {
  const data = await apiRequest("/auth/change-password.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  logout();

  return data;
}

export async function logoutAllDevices() {
  const data = await apiRequest("/auth/logout-all.php", {
    method: "POST",
  });

  logout();

  return data;
}
