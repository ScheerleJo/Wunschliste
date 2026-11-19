import type {
  CreateInviteInput,
  MeDto,
  GroupDetailDto,
  GroupInput,
  GroupRole,
  GroupSummaryDto,
  InviteDto,
  InvitePreviewDto,
  RegistrationStatusDto,
} from "@wunschliste/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export const fetchMe = () => api<MeDto>("/me");

// ---- Gruppen ---------------------------------------------------------------

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const groupsApi = {
  list: () => api<GroupSummaryDto[]>("/groups"),
  get: (id: string) => api<GroupDetailDto>(`/groups/${id}`),
  create: (input: GroupInput) => api<{ id: string }>("/groups", json("POST", input)),
  update: (id: string, input: GroupInput) => api(`/groups/${id}`, json("PATCH", input)),
  remove: (id: string) => api(`/groups/${id}`, json("DELETE")),
  setRole: (id: string, profileId: string, role: GroupRole) =>
    api(`/groups/${id}/members/${profileId}`, json("PATCH", { role })),
  removeMember: (id: string, profileId: string) =>
    api<{ groupDeleted: boolean }>(`/groups/${id}/members/${profileId}`, json("DELETE")),
  invites: (id: string) => api<InviteDto[]>(`/groups/${id}/invites`),
  createInvite: (id: string, input: CreateInviteInput) => api<InviteDto>(`/groups/${id}/invites`, json("POST", input)),
  revokeInvite: (id: string, inviteId: string) => api(`/groups/${id}/invites/${inviteId}`, json("DELETE")),
};

export const invitesApi = {
  preview: (token: string) => api<InvitePreviewDto>(`/invites/${token}`),
  accept: (token: string) => api<{ groupId: string; alreadyMember: boolean }>(`/invites/${token}/accept`, json("POST")),
  registrationStatus: () => api<RegistrationStatusDto>("/registration-status"),
};
