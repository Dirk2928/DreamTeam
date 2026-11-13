export type Role = "citizen" | "official" | "admin";
export type ComplaintStatus = "submitted" | "acknowledged" | "assigned" | "in_progress" | "resolved" | "pending_verification" | "closed" | "reopened" | "rejected";
export type Severity = "low" | "medium" | "high" | "critical";
export type PhotoKind = "before" | "after";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  sla_hours: number;
  is_active: boolean;
  created_at?: string;
}

export interface Complaint {
  id: string;
  citizen_id: string;
  category_id: string;
  assigned_to: string | null;
  duplicate_of_id: string | null;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  status: ComplaintStatus;
  severity: Severity;
  severity_score: number;
  me_too_count: number;
  escalation_level: number;
  sla_deadline: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  status: ComplaintStatus;
  distance_m: number;
}

export interface Photo {
  id: string;
  complaint_id: string;
  uploader_id: string;
  kind: PhotoKind;
  url?: string | null;
  content_url?: string | null;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  ai_metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ComplaintUpdate {
  id: string;
  author_id: string;
  old_status: ComplaintStatus | null;
  new_status: ComplaintStatus | null;
  message: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  complaint_id: string | null;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface DashboardResponse {
  totals: { all: number; active: number; closed: number };
  by_status: Record<string, number>;
  by_category: { category: string; count: number }[];
  average_resolution_hours: number | null;
  average_first_response_hours: number | null;
  sla_breached: number;
}

export interface PublicReport {
  total_complaints: number;
  closed_complaints: number;
  resolution_rate: number;
  average_first_response_hours: number | null;
  average_resolution_hours: number | null;
  by_status: Record<string, number>;
  by_category: { category: string; count: number }[];
  generated_at: string;
}

export interface PublicMarker {
  id: string;
  category_id: string;
  title: string;
  latitude: number;
  longitude: number;
  status: ComplaintStatus;
  severity: Severity;
  me_too_count: number;
  created_at: string;
}

export interface Hotspot {
  latitude: number;
  longitude: number;
  complaints: number;
  supporters: number;
  max_severity: number;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  open: number;
  resolved: number;
  avg_resolution_hours: number | null;
  avg_first_response_hours: number | null;
  resolution_rate: number;
  sla_breached: number;
  by_status: { name: string; value: number }[];
  by_category: { name: string; value: number }[];
  trend: { date: string; submitted: number; resolved: number }[];
}

export interface EvidenceAssessment {
  complaint_id: string;
  photo_id: string;
  verdict: "consistent" | "needs_review" | "inconclusive";
  disclaimer: string;
  severity: Severity;
  score: number;
  report_match: {
    expected_category: string;
    detected_category: string | null;
    confidence: number | null;
    matches: boolean | null;
  };
  ocr: {
    text: string;
    engine: string | null;
    term_match: number;
    matched_terms: string[];
  };
  image_risk: {
    available: boolean;
    label: Severity | null;
    score: number | null;
    confidence: number | null;
  };
  hotspot: {
    radius_m: number;
    pins: number;
    supporters: number;
    max_severity: number;
  };
  components: {
    written_report: number;
    image: number | null;
    hotspot_density: number;
    nearby_max: number;
  };
  warnings: string[];
}
