const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;

  constructor(code: string, message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type ApiEnvelope<T> =
  | ({ success: true } & T)
  | { success: false; error: { code: string; message: string } };

async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Couldn't reach the server. Check your connection.", 0);
  }

  let json: ApiEnvelope<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("INTERNAL_ERROR", "Unexpected response from the server.", res.status);
  }

  if (!json.success) {
    const retryAfterHeader = res.headers.get("Retry-After");
    throw new ApiError(
      json.error.code,
      json.error.message,
      res.status,
      retryAfterHeader ? Number(retryAfterHeader) : undefined,
    );
  }

  return json as T;
}

export type User = { id: string; name: string; email: string; createdAt?: string };
export type Project = {
  id: string;
  name: string;
  apiKeyLastFour: string | null;
  createdAt: string;
  updatedAt: string;
};
export type NewProject = Project & { apiKey: string };

export function register(input: { name: string; email: string; password: string }) {
  return apiFetch<{ user: User }>("/auth/register", { method: "POST", body: input });
}

export function login(input: { email: string; password: string }) {
  return apiFetch<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: input,
  });
}

export function me(token: string) {
  return apiFetch<{ user: User }>("/auth/me", { token });
}

export function logout(token: string) {
  return apiFetch<Record<string, never>>("/auth/logout", { method: "POST", token });
}

export function listProjects(token: string) {
  return apiFetch<{ projects: Project[] }>("/projects", { token });
}

export function createProject(token: string, input: { name: string }) {
  return apiFetch<{ project: NewProject }>("/projects", {
    method: "POST",
    body: input,
    token,
  });
}

export function getProject(token: string, projectId: string) {
  return apiFetch<{ project: Project }>(`/projects/${projectId}`, { token });
}

export type ErrorType = "error" | "unhandledrejection" | "http" | "resource";

export type ErrorGroup = {
  id: string;
  message: string;
  type: ErrorType;
  endpoint: string | null;
  statusCode: number | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};
export type ErrorGroupDetail = ErrorGroup & {
  environment: string;
  stack: string | null;
  filename: string | null;
  line: number | null;
  column: number | null;
};
export type Occurrence = {
  id: string;
  timestamp: string;
  browser: string;
  url: string;
  method: string | null;
  statusCode: number | null;
};
export type Pagination = { page: number; limit: number; total: number };
export type Paginated<T> = { data: T[]; pagination: Pagination };
export type Stats = {
  errors: number;
  events: number;
  lastErrorAt: string | null;
  activeGroups: number;
};

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function getStats(token: string, projectId: string) {
  return apiFetch<Stats>(`/projects/${projectId}/stats`, { token });
}

export function listErrorGroups(
  token: string,
  projectId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    type?: ErrorType;
    sort?: "lastSeen" | "firstSeen" | "occurrences";
  } = {},
) {
  return apiFetch<Paginated<ErrorGroup>>(
    `/projects/${projectId}/errors${toQuery(params)}`,
    { token },
  );
}

export function getErrorGroup(
  token: string,
  projectId: string,
  groupId: string,
  params: { page?: number; limit?: number } = {},
) {
  return apiFetch<{ group: ErrorGroupDetail; occurrences: Paginated<Occurrence> }>(
    `/projects/${projectId}/errors/${groupId}${toQuery(params)}`,
    { token },
  );
}

export { API_BASE_URL };
