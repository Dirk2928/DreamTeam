import type {
  AuditLog,
  Category,
  Complaint,
  ComplaintStatus,
  ComplaintUpdate,
  DashboardResponse,
  DuplicateMatch,
  EvidenceAssessment,
  Hotspot,
  Notification,
  Photo,
  PhotoKind,
  PublicMarker,
  PublicReport,
  Role,
  Severity,
  User,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
export const API_BASE_URL = `${API_URL}/api`;
const TOKEN_KEY = "pkonek_access_token";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokenStore = {
  get: () => typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

function detailMessage(payload: unknown, status: number) {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) return `Request failed (${status})`;
  const detail = payload.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
  if (Array.isArray(detail)) return detail.map((item) => typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)).join("; ");
  return `Request failed (${status})`;
}

function queryString(values: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const result = query.toString();
  return result ? `?${result}` : "";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* Non-JSON error response. */ }
    if (response.status === 401) {
      tokenStore.clear();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("pkonek:unauthorized"));
    }
    throw new ApiError(response.status, detailMessage(payload, response.status), payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type RegisterInput = { email: string; full_name: string; password: string };
type CategoryInput = Pick<Category, "name" | "description" | "sla_hours" | "is_active">;
type ComplaintInput = Pick<Complaint, "category_id" | "title" | "description" | "latitude" | "longitude" | "address"> & { allow_possible_duplicate?: boolean };
type ComplaintFilters = Partial<Pick<Complaint, "status" | "category_id" | "assigned_to" | "severity">> & { mine?: boolean; skip?: number; limit?: number };

export const api = {
  auth: {
    login: (body: { email: string; password: string }) => request<{ access_token: string; token_type: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    register: (body: RegisterInput) => request<{ access_token: string; token_type: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    me: () => request<User>("/auth/me"),
    staff: () => request<User[]>("/auth/staff"),
    createStaff: (body: RegisterInput & { role: Exclude<Role, "citizen"> }) => request<User>("/auth/staff", { method: "POST", body: JSON.stringify(body) }),
    setStaffActive: (id: string, active: boolean) => request<User>(`/auth/staff/${encodeURIComponent(id)}/active${queryString({ active })}`, { method: "PATCH" }),
  },
  categories: {
    list: (includeInactive = false) => request<Category[]>(`/categories${queryString({ include_inactive: includeInactive })}`),
    create: (body: CategoryInput) => request<Category>("/categories", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: CategoryInput) => request<Category>(`/categories/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  },
  complaints: {
    list: (filters: ComplaintFilters = {}) => request<Complaint[]>(`/complaints${queryString(filters)}`),
    get: (id: string) => request<Complaint>(`/complaints/${encodeURIComponent(id)}`),
    create: (body: ComplaintInput) => request<Complaint>("/complaints", { method: "POST", body: JSON.stringify(body) }),
    duplicates: (params: { category_id: string; latitude: number; longitude: number; radius_m?: number }) => request<{ radius_m: number; matches: DuplicateMatch[] }>(`/complaints/duplicates${queryString(params)}`),
    meToo: (id: string) => request<{ complaint_id: string; me_too_count: number }>(`/complaints/${encodeURIComponent(id)}/me-too`, { method: "POST" }),
    assign: (id: string, officialId: string) => request<Complaint>(`/complaints/${encodeURIComponent(id)}/assign`, { method: "POST", body: JSON.stringify({ official_id: officialId }) }),
    status: (id: string, status: ComplaintStatus, message: string) => request<Complaint>(`/complaints/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status, message }) }),
    addUpdate: (id: string, message: string) => request<{ id: string; message: string; created_at: string }>(`/complaints/${encodeURIComponent(id)}/updates`, { method: "POST", body: JSON.stringify({ message }) }),
    updates: (id: string) => request<ComplaintUpdate[]>(`/complaints/${encodeURIComponent(id)}/updates`),
    verify: (id: string, accepted: boolean, comment?: string) => request<Complaint>(`/complaints/${encodeURIComponent(id)}/verify`, { method: "POST", body: JSON.stringify({ accepted, comment }) }),
    uploadPhoto: (id: string, file: File, kind: PhotoKind) => {
      const body = new FormData();
      body.append("file", file);
      return request<Photo>(`/complaints/${encodeURIComponent(id)}/photos${queryString({ kind })}`, { method: "POST", body });
    },
    photos: (id: string) => request<Photo[]>(`/complaints/${encodeURIComponent(id)}/photos`),
    similarity: (id: string, beforePhotoId: string, afterPhotoId: string) => request<{ similarity: number; model: string }>(`/complaints/${encodeURIComponent(id)}/photo-similarity${queryString({ before_photo_id: beforePhotoId, after_photo_id: afterPhotoId })}`),
    assessEvidence: (id: string) => request<EvidenceAssessment>(`/complaints/${encodeURIComponent(id)}/evidence-assessment`, { method: "POST" }),
  },
  assistant: {
    chat: (message: string, complaintId?: string) => request<{ response: string; source: string }>("/assistant/chat", { method: "POST", body: JSON.stringify({ message, complaint_id: complaintId }) }),
  },
  ai: {
    ocr: (photoId: string) => request<{ text: string; engine: string }>("/ai/ocr", { method: "POST", body: JSON.stringify({ photo_id: photoId }) }),
    classify: (photoId: string, categoryNames: string[] = []) => request<{ best_category: string; confidence: number; scores: Record<string, number> }>("/ai/classify-image", { method: "POST", body: JSON.stringify({ photo_id: photoId, category_names: categoryNames }) }),
    severity: (message: string) => request<{ severity: Severity; score: number; method: string }>("/ai/severity", { method: "POST", body: JSON.stringify({ message }) }),
  },
  public: {
    markers: (filters: { status?: ComplaintStatus; category_id?: string; limit?: number } = {}) => request<PublicMarker[]>(`/public/markers${queryString(filters)}`),
    hotspots: (categoryId?: string) => request<Hotspot[]>(`/public/hotspots${queryString({ category_id: categoryId })}`),
    reports: () => request<PublicReport>("/public/reports"),
  },
  dashboard: () => request<DashboardResponse>("/dashboard"),
  notifications: {
    list: (unreadOnly = false) => request<Notification[]>(`/notifications${queryString({ unread_only: unreadOnly })}`),
    markRead: (notificationId: string) => request<Notification>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" }),
    readAll: () => request<{ updated: number }>("/notifications/read-all", { method: "POST" }),
  },
  auditLogs: (filters: { action?: string; actor_id?: string; entity_type?: string; skip?: number; limit?: number } = {}) => request<AuditLog[]>(`/admin/audit-logs${queryString(filters)}`),
};

export function photoContentUrl(photo: Pick<Photo, "id" | "content_url" | "url">) {
  return photo.content_url || photo.url || `${API_BASE_URL}/photos/${encodeURIComponent(photo.id)}/content`;
}
