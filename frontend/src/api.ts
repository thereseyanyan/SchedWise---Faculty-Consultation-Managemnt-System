export type ApptStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "reschedule_requested"
  | "cancelled"
  | "completed"
  | "no_show";

export type Appointment = {
  id: string;
  student_id: string;
  faculty_id: string;
  availability_id?: string;
  appointment_date: string;
  start_minutes: number;
  end_minutes: number;
  topic: string;
  reason: string;
  location?: string;
  meeting_link?: string;
  status: ApptStatus;
  requested_at: string;
  approved_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  reschedule_reason?: string;
  created_at: string;
  updated_at: string;
  faculty_first_name?: string;
  faculty_last_name?: string;
  faculty_number?: string;
  student_first_name?: string;
  student_last_name?: string;
  student_number?: string;
  student_program?: string;
  summary?: string;
};

export type UiAppointment = Appointment & {
  faculty: string;
  student: string;
  initials: string;
  date: string;
  start: number;
  end: number;
  notes: string;
};

export type FacultyDirectoryEntry = {
  id: string;
  email: string;
  status?: string;
  first_name?: string;
  last_name?: string;
  faculty_number?: string;
  department_id?: string;
  department_name?: string;
  program?: string;
  phone?: string;
};

export type ManagedUser = {
  id: string;
  email: string;
  role_id: string;
  status: string;
  faculty_approval_status?: string;
  email_verified_at?: string | null;
  first_name?: string;
  last_name?: string;
  student_number?: string;
  faculty_number?: string;
  department_id?: string;
  program?: string;
  phone?: string;
  last_login_at?: string;
  created_at?: string;
};

export type User = {
  id: string;
  email: string;
  role_id: string;
  status: string;
  faculty_approval_status?: string | null;
  first_name?: string;
  last_name?: string;
  student_number?: string | null;
  faculty_number?: string | null;
  department_id?: string | null;
  program?: string | null;
  phone?: string | null;
};

export type FacultyAvailability = {
  id: string;
  faculty_id: string;
  weekday: number;
  start_minutes: number;
  end_minutes: number;
  location?: string;
  meeting_link?: string;
  timezone?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ScheduleOverride = {
  id: string;
  faculty_id: string;
  date: string;
  kind: "available" | "blocked";
  start_minutes?: number;
  end_minutes?: number;
  location?: string;
  reason?: string;
  created_at: string;
  updated_at: string;
};

export type ConsultationRecord = {
  id: string;
  appointment_id: string;
  faculty_id: string;
  student_id: string;
  summary?: string;
  action_items?: string;
  private_notes?: string;
  follow_up_date?: string;
  created_at: string;
  updated_at: string;
  appointment_date?: string;
  start_minutes?: number;
  end_minutes?: number;
  topic?: string;
  faculty_first_name?: string;
  faculty_last_name?: string;
  student_first_name?: string;
  student_last_name?: string;
};

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_appointment_id?: string;
  read_at?: string | null;
  created_at: string;
};

export type MonthlySeriesPoint = {
  period: string;
  month: string;
  total: number;
  completed: number;
  cancelled: number;
  pending: number;
};

export type AuditLogEntry = {
  id: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
};

export type AuditLogPage = {
  entries: AuditLogEntry[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  options: {
    actions: string[];
    entity_types: string[];
  };
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
  code?: string;
  fields?: Record<string, string>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(
    message: string,
    status: number,
    fields: Record<string, string> = {},
    code = "",
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

// CSRF token for the current session. It is issued by login/me and sent on
// every state-changing request.
let csrfToken: string | null = null;

async function request<T>(path: string, options?: RequestInit, csrfRetried = false): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(response.status === 502 || response.status === 503
      ? "The PHP backend is unavailable. Start the full app with the SchedWise launcher."
      : `The server returned an unreadable response (${response.status}). Check the backend logs.`, response.status);
  }

  // Hot reloads and another tab signing in can leave this module's token stale.
  // Only replay a request explicitly rejected by the CSRF gate, before mutation.
  if (response.status === 403 && payload.error === "Invalid or missing CSRF token"
      && !["GET", "HEAD", "OPTIONS"].includes(method) && !csrfRetried) {
    csrfToken = null;
    try {
      await authApi.me();
    } catch {
      throw new ApiError("Your session has expired. Please sign out and sign in again.", 401);
    }
    return request<T>(path, options, true);
  }

  if (!response.ok || payload.error || payload.data === undefined) {
    if (response.status === 401 && path !== "/auth/login.php") {
      csrfToken = null;
      if (typeof window !== "undefined") window.dispatchEvent(new Event("schedwise:session-expired"));
    }
    throw new ApiError(
      payload.error || `API request failed (${response.status})`,
      response.status,
      payload.fields ?? {},
      payload.code ?? "",
    );
  }

  return payload.data;
}

export const authApi = {
  register: (userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role_id: string;
    student_number?: string;
    faculty_number?: string;
    department_id?: string;
    program?: string;
    phone?: string;
  }) =>
    request<{
      message: string;
      user_id: string;
      verification_required?: boolean;
      student_number?: string;
      faculty_number?: string;
      approval_required?: boolean;
      email_sent?: boolean;
      debug_verification_url?: string;
    }>("/auth/register.php", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  login: async (credentials: { email: string; password: string }) => {
    const result = await request<{ user: User; csrf_token: string }>(
      "/auth/login.php",
      {
        method: "POST",
        body: JSON.stringify(credentials),
      },
    );
    csrfToken = result.csrf_token;
    return result;
  },

  logout: async () => {
    try {
      return await request<{ message: string }>("/auth/logout.php", {
        method: "POST",
      });
    } finally {
      csrfToken = null;
    }
  },

  me: async () => {
    const result = await request<{ user: User; csrf_token: string }>("/auth/me.php", {
      method: "GET",
    });
    csrfToken = result.csrf_token;
    return result;
  },

  changePassword: async (payload: {
    current_password: string;
    new_password: string;
  }) => {
    const result = await request<{ message: string; csrf_token: string }>(
      "/auth/change-password.php",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    csrfToken = result.csrf_token;
    return result;
  },

  forgotPassword: (email: string) =>
    request<{
      message: string;
      debug_code?: string;
      debug_mail_sent?: boolean;
      expires_at?: string;
    }>("/auth/forgot-password.php", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (payload: { email: string; code: string; password: string }) =>
    request<{ message: string }>("/auth/reset-password.php", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  verifyEmail: (token: string) =>
    request<{ message: string }>("/auth/verify-email.php", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerification: (email: string) =>
    request<{
      message: string;
      debug_mail_sent?: boolean;
      debug_verification_url?: string;
    }>("/auth/resend-verification.php", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};

export const usersApi = {
  delete: (id: string) => request<{ message: string }>(`/users/index.php?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  list: (filters?: { role_id?: string; status?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filters?.role_id) params.append("role_id", filters.role_id);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.q) params.append("q", filters.q);
    const query = params.toString() ? `?${params}` : "";
    return request<ManagedUser[]>(`/users/index.php${query}`);
  },

  getById: (id: string) =>
    request<ManagedUser>(`/users/index.php?id=${encodeURIComponent(id)}`),

  update: (
    id: string,
    data: Partial<{
      role_id: string;
      status: string;
      first_name: string;
      last_name: string;
      phone: string;
      program: string;
      department_id: string;
      student_number: string;
      faculty_number: string;
    }>,
  ) =>
    request<ManagedUser>(`/users/index.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  create: (data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role_id: string;
    status?: string;
    student_number?: string;
    faculty_number?: string;
    department_id?: string;
    program?: string;
    phone?: string;
  }) =>
    request<{ message: string; user_id: string }>("/users/index.php", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  approveFaculty: (id: string) =>
    request<ManagedUser>(`/users/index.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ faculty_approval_action: "approve" }),
    }),

  rejectFaculty: (id: string) =>
    request<ManagedUser>(`/users/index.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ faculty_approval_action: "reject" }),
    }),
};

export const auditApi = {
  list: (filters?: {
    page?: number;
    per_page?: number;
    q?: string;
    action?: string;
    entity_type?: string;
    actor_id?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.per_page) params.append("per_page", String(filters.per_page));
    if (filters?.q) params.append("q", filters.q);
    if (filters?.action) params.append("action", filters.action);
    if (filters?.entity_type) params.append("entity_type", filters.entity_type);
    if (filters?.actor_id) params.append("actor_id", filters.actor_id);
    if (filters?.date_from) params.append("date_from", filters.date_from);
    if (filters?.date_to) params.append("date_to", filters.date_to);
    const query = params.toString() ? `?${params}` : "";
    return request<AuditLogPage>(`/audit/index.php${query}`);
  },
};

export const appointmentApi = {
  list: (filters?: {
    student_id?: string;
    faculty_id?: string;
    status?: ApptStatus;
    date_from?: string;
    date_to?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.student_id) params.append("student_id", filters.student_id);
    if (filters?.faculty_id) params.append("faculty_id", filters.faculty_id);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.date_from) params.append("date_from", filters.date_from);
    if (filters?.date_to) params.append("date_to", filters.date_to);

    const query = params.toString() ? `?${params}` : "";
    return request<Appointment[]>(`/appointments/index.php${query}`);
  },

  create: (
    appointmentData: Omit<
      Appointment,
      | "id"
      | "created_at"
      | "updated_at"
      | "requested_at"
      | "approved_at"
      | "completed_at"
      | "cancelled_at"
    >,
  ) =>
    request<Appointment>("/appointments/index.php", {
      method: "POST",
      body: JSON.stringify(appointmentData),
    }),

  getById: (id: string) =>
    request<Appointment>(`/appointments/index.php?id=${encodeURIComponent(id)}`),

  approve: (id: string) =>
    request<Appointment>(`/appointments/approve.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
    }),

  reject: (id: string, reason: string) =>
    request<Appointment>(`/appointments/reject.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ reason }),
    }),

  complete: (id: string) =>
    request<Appointment>(`/appointments/complete.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
    }),

  noShow: (id: string) =>
    request<Appointment>(`/appointments/no-show.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
    }),

  cancel: (id: string, reason: string) =>
    request<Appointment>(`/appointments/cancel.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ reason }),
    }),

  reschedule: (
    id: string,
    data: {
      appointment_date: string;
      start_minutes: number;
      end_minutes: number;
      reason?: string;
    },
  ) =>
    request<Appointment>(`/appointments/reschedule.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export const facultyApi = {
  slots: () => request<{ faculty_id: string; date: string; start_minutes: number }[]>("/faculty/slots.php"),
  list: () => request<FacultyDirectoryEntry[]>("/faculty/index.php"),
};

export const facultyAvailabilityApi = {
  list: (filters?: {
    faculty_id?: string;
    active?: boolean;
    weekday?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.faculty_id) params.append("faculty_id", filters.faculty_id);
    if (filters?.active !== undefined) params.append("active", filters.active.toString());
    if (filters?.weekday !== undefined) params.append("weekday", filters.weekday.toString());

    const query = params.toString() ? `?${params}` : "";
    return request<FacultyAvailability[]>(`/faculty/availability.php${query}`);
  },

  getById: (id: string) =>
    request<FacultyAvailability>(`/faculty/availability.php?id=${encodeURIComponent(id)}`),

  create: (availabilityData: Omit<FacultyAvailability, "id" | "created_at" | "updated_at">) =>
    request<FacultyAvailability>("/faculty/availability.php", {
      method: "POST",
      body: JSON.stringify(availabilityData),
    }),

  update: (id: string, availabilityData: Partial<FacultyAvailability>) =>
    request<FacultyAvailability>(`/faculty/availability.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(availabilityData),
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/faculty/availability.php?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

export const facultyScheduleOverridesApi = {
  list: (filters?: {
    faculty_id?: string;
    date?: string;
    kind?: "available" | "blocked";
  }) => {
    const params = new URLSearchParams();
    if (filters?.faculty_id) params.append("faculty_id", filters.faculty_id);
    if (filters?.date) params.append("date", filters.date);
    if (filters?.kind) params.append("kind", filters.kind);

    const query = params.toString() ? `?${params}` : "";
    return request<ScheduleOverride[]>(`/faculty/schedule_overrides.php${query}`);
  },

  getById: (id: string) =>
    request<ScheduleOverride>(`/faculty/schedule_overrides.php?id=${encodeURIComponent(id)}`),

  create: (overrideData: Omit<ScheduleOverride, "id" | "created_at" | "updated_at">) =>
    request<ScheduleOverride>("/faculty/schedule_overrides.php", {
      method: "POST",
      body: JSON.stringify(overrideData),
    }),

  update: (id: string, overrideData: Partial<ScheduleOverride>) =>
    request<ScheduleOverride>(`/faculty/schedule_overrides.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(overrideData),
    }),

  delete: (id: string) =>
    request<{ message: string }>(
      `/faculty/schedule_overrides.php?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};

export const consultationApi = {
  list: (filters?: {
    appointment_id?: string;
    faculty_id?: string;
    student_id?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.appointment_id) params.append("appointment_id", filters.appointment_id);
    if (filters?.faculty_id) params.append("faculty_id", filters.faculty_id);
    if (filters?.student_id) params.append("student_id", filters.student_id);

    const query = params.toString() ? `?${params}` : "";
    return request<ConsultationRecord[]>(`/consultations/index.php${query}`);
  },

  create: (recordData: Omit<ConsultationRecord, "id" | "created_at" | "updated_at">) =>
    request<ConsultationRecord>("/consultations/index.php", {
      method: "POST",
      body: JSON.stringify(recordData),
    }),
};

export const notificationsApi = {
  list: (unreadOnly = false) => {
    const query = unreadOnly ? "?unread=1" : "";
    return request<AppNotification[]>(`/notifications/index.php${query}`);
  },

  markRead: (id: string) =>
    request<{ message: string }>(`/notifications/index.php?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({}),
    }),

  markAllRead: () =>
    request<{ message: string }>("/notifications/index.php", {
      method: "PUT",
      body: JSON.stringify({ mark_all: true }),
    }),
};

export const reportsApi = {
  summary: (filters?: { year?: number; month?: number; faculty_id?: string; department_id?: string }) => {
    const params = new URLSearchParams();
    if (filters?.year !== undefined) params.append("year", filters.year.toString());
    if (filters?.month !== undefined) params.append("month", filters.month.toString());
    if (filters?.faculty_id) params.append("faculty_id", filters.faculty_id);
    if (filters?.department_id) params.append("department_id", filters.department_id);

    const query = params.toString() ? `?${params}` : "";
    return request<{
      period: { year: number; month: number; start_date: string; end_date: string };
      filters: { faculty_id?: string | null; department_id?: string | null };
      statistics: Record<string, unknown>;
    }>(`/reports/summary.php${query}`);
  },

  monthly: (months = 6, filters?: { end_month?: string; faculty_id?: string; department_id?: string }) => {
    const params = new URLSearchParams({ months: String(months) });
    if (filters?.end_month) params.append("end_month", filters.end_month);
    if (filters?.faculty_id) params.append("faculty_id", filters.faculty_id);
    if (filters?.department_id) params.append("department_id", filters.department_id);
    return request<{ months: number; end_month: string; series: MonthlySeriesPoint[] }>(
      `/reports/monthly.php?${params}`,
    );
  },

  exportUrl: (filters?: {
    year?: number;
    month?: number;
    faculty_id?: string;
    department_id?: string;
    format?: "json" | "csv";
  }) => {
    const params = new URLSearchParams();
    if (filters?.year !== undefined) params.append("year", filters.year.toString());
    if (filters?.month !== undefined) params.append("month", filters.month.toString());
    if (filters?.faculty_id) params.append("faculty_id", filters.faculty_id);
    if (filters?.department_id) params.append("department_id", filters.department_id);
    params.append("format", filters?.format ?? "csv");
    return `${API_BASE_URL}/reports/export.php?${params}`;
  },
};

export const healthApi = {
  check: () =>
    request<{ status: string }>("/health.php", {
      method: "GET",
    }),
};
