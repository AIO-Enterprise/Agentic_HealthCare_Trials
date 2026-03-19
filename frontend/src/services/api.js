/**
 * Frontend API Service Layer
 * Owner: Frontend Dev 1
 * 
 * Centralized API calls. Each section maps to a backend module.
 * All functions return parsed JSON or throw errors.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    // FastAPI can return detail as a string OR an array of validation error objects
    let message;
    if (Array.isArray(err.detail)) {
      // Pydantic validation errors: [{loc: [...], msg: "...", type: "..."}]
      message = err.detail
        .map((d) => {
          const field = Array.isArray(d.loc) ? d.loc.filter(x => x !== "body").join(" → ") : "";
          return field ? `${field}: ${d.msg}` : d.msg;
        })
        .join("\n");
    } else {
      message = err.detail || err.message || `HTTP ${res.status}: ${res.statusText}`;
    }
    throw new Error(message);
  }

  return res.json();
}

// ─── M2: Auth ────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (email, password, company, role) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, company, role }),
    }),
};

// ─── M3: Onboarding ─────────────────────────────────────────────────────────

export const onboardingAPI = {
  register: (data) =>
    request("/onboarding/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  uploadDocument: async (docType, title, content, file) => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("title", title);
    if (content) formData.append("content", content);
    if (file) formData.append("file", file);

    const res = await fetch(`${API_BASE}/onboarding/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  triggerTraining: () =>
    request("/onboarding/train", { method: "POST" }),
};

// ─── M2: Users ───────────────────────────────────────────────────────────────

export const usersAPI = {
  list: () => request("/users/"),

  create: (data) =>
    request("/users/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deactivate: (userId) =>
    request(`/users/${userId}/deactivate`, { method: "PATCH" }),
};

// ─── M3: Documents ───────────────────────────────────────────────────────────

export const documentsAPI = {
  list: (docType) =>
    request(`/documents/${docType ? `?doc_type=${docType}` : ""}`),

  create: (data) =>
    request("/documents/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (docId, data) =>
    request(`/documents/${docId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (docId) =>
    request(`/documents/${docId}`, { method: "DELETE" }),
};

// ─── M8: Advertisements ──────────────────────────────────────────────────────

export const adsAPI = {
  list: (status) =>
    request(`/advertisements/${status ? `?status=${status}` : ""}`),

  get: (adId) => request(`/advertisements/${adId}`),

  create: (data) =>
    request("/advertisements/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (adId, data) =>
    request(`/advertisements/${adId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  generateStrategy: (adId) =>
    request(`/advertisements/${adId}/generate-strategy`, { method: "POST" }),

  submitForReview: (adId) =>
    request(`/advertisements/${adId}/submit-for-review`, { method: "POST" }),

  createReview: (adId, data) =>
    request(`/advertisements/${adId}/reviews`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listReviews: (adId) => request(`/advertisements/${adId}/reviews`),

  publish: (adId) =>
    request(`/advertisements/${adId}/publish`, { method: "POST" }),

  updateBotConfig: (adId, data) =>
    request(`/advertisements/${adId}/bot-config`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// ─── M7/M15: Analytics ───────────────────────────────────────────────────────

export const analyticsAPI = {
  get: (adId) => request(`/analytics/${adId}`),

  triggerOptimize: (adId) =>
    request(`/analytics/${adId}/optimize`, { method: "POST" }),

  submitDecision: (adId, data) =>
    request(`/analytics/${adId}/decision`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};