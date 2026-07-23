// مسیر فایل: ai-chat-saas/frontend/lib/api.ts
// هدف: ارتباط مرکزی پنل Next.js با PHP API

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost/ai-chat-saas/backend/api";

type ApiOptions = RequestInit & {
  auth?: boolean;
};

function clearAuthStorage() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
}

export async function apiRequest(path: string, options: ApiOptions = {}) {
  const token =
      typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = new Headers(options.headers);

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();

  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("پاسخ سرور JSON معتبر نیست.");
  }

  if (response.status === 401) {
    clearAuthStorage();

    if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
    ) {
      window.location.href = "/login";
    }

    throw new Error(data?.message || "نشست شما منقضی شده است. دوباره وارد شوید.");
  }

  if (!data) {
    throw new Error("پاسخ معتبری از سرور دریافت نشد.");
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
  const token =
      typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { headers });

  if (response.status === 401) {
    clearAuthStorage();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("نشست شما منقضی شده است. دوباره وارد شوید.");
  }

  if (!response.ok) {
    let message = "دانلود فایل ناموفق بود";
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch {
      // پاسخ غیر JSON برای خطای دانلود
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

export function saveAuth(token: string, user: unknown) {
  if (!token || !user) {
    throw new Error("اطلاعات ورود ناقص است.");
  }

  localStorage.setItem("auth_token", token);
  localStorage.setItem("auth_user", JSON.stringify(user));
}

export function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("auth_token");
}

export function getAuthUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = localStorage.getItem("auth_user");

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
