import type {
  CreateInviteInput,
  AdminChildDto,
  AdminEventDto,
  AdminGroupDto,
  AdminInviteDto,
  AdminShareDto,
  AdminStatsDto,
  AdminUserDto,
  NotificationListDto,
  ShareLinkDto,
  ShareLinkInput,
  ShareViewDto,
  DrawResultDto,
  EventAssignmentDto,
  EventDetailDto,
  EventInput,
  EventSummaryDto,
  HouseholdDto,
  ChildDetailDto,
  HandoverPreviewDto,
  PersonDto,
  ProfileDto,
  WishImageDto,
  MyReservationDto,
  WishlistViewDto,
  OwnWishDto,
  ProfileGroupDto,
  WishInput,
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

// ---- Wünsche ---------------------------------------------------------------
export const wishesApi = {
  list: (profileId: string, status: "active" | "archived" = "active") =>
    api<OwnWishDto[]>(`/profiles/${profileId}/wishes?status=${status}`),
  groups: (profileId: string) => api<ProfileGroupDto[]>(`/profiles/${profileId}/groups`),
  create: (profileId: string, input: WishInput) => api<OwnWishDto>(`/profiles/${profileId}/wishes`, json("POST", input)),
  update: (wishId: string, input: WishInput) => api<OwnWishDto>(`/wishes/${wishId}`, json("PATCH", input)),
  archive: (wishId: string) => api(`/wishes/${wishId}/archive`, json("POST")),
  restore: (wishId: string) => api(`/wishes/${wishId}/restore`, json("POST")),
  remove: (wishId: string) => api(`/wishes/${wishId}`, json("DELETE")),
  reorder: (profileId: string, ids: string[]) => api(`/profiles/${profileId}/wishes/order`, json("PUT", { ids })),
  deleteImage: (wishId: string, imageId: string) => api(`/wishes/${wishId}/images/${imageId}`, json("DELETE")),
  uploadImage: async (wishId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/wishes/${wishId}/images`, { method: "POST", body: form, credentials: "include" });
    const body = (await res.json().catch(() => null)) as (WishImageDto & { error?: string }) | null;
    if (!res.ok) throw new ApiError(res.status, body?.error ?? "Upload fehlgeschlagen");
    return body as WishImageDto;
  },
};

// ---- Fremde Listen & Reservierungen ------------------------------------------
export const reservationsApi = {
  view: (profileId: string) => api<WishlistViewDto>(`/profiles/${profileId}/list`),
  reserve: (wishId: string) => api(`/wishes/${wishId}/reserve`, json("POST")),
  release: (wishId: string) => api(`/wishes/${wishId}/reserve`, json("DELETE")),
  acknowledge: (wishId: string) => api(`/reservations/${wishId}/acknowledge`, json("POST")),
  mine: () => api<MyReservationDto[]>("/reservations"),
};

// ---- Kinderprofile ------------------------------------------------------------
export const childrenApi = {
  create: (displayName: string) => api<ProfileDto>("/children", json("POST", { displayName })),
  get: (id: string) => api<ChildDetailDto>(`/children/${id}`),
  rename: (id: string, displayName: string) => api(`/children/${id}`, json("PATCH", { displayName })),
  remove: (id: string) => api(`/children/${id}`, json("DELETE")),
  candidates: (id: string) => api<PersonDto[]>(`/children/${id}/guardian-candidates`),
  addGuardian: (id: string, userId: string) => api(`/children/${id}/guardians`, json("POST", { userId })),
  removeGuardian: (id: string, userId: string) => api(`/children/${id}/guardians/${userId}`, json("DELETE")),
  addGroup: (id: string, groupId: string) => api(`/children/${id}/groups`, json("POST", { groupId })),
  removeGroup: (id: string, groupId: string) => api(`/children/${id}/groups/${groupId}`, json("DELETE")),
  startHandover: (id: string, email: string) => api(`/children/${id}/handover`, json("POST", { email })),
  cancelHandover: (id: string) => api(`/children/${id}/handover`, json("DELETE")),
  handoverPreview: (token: string) => api<HandoverPreviewDto>(`/handover/${token}`),
  acceptHandover: (token: string) => api<{ profileId: string }>(`/handover/${token}/accept`, json("POST")),
};

// ---- Haushalte & Events --------------------------------------------------------
export const householdsApi = {
  list: (groupId: string) => api<HouseholdDto[]>(`/groups/${groupId}/households`),
  create: (groupId: string, name: string, profileIds: string[]) =>
    api(`/groups/${groupId}/households`, json("POST", { name, profileIds })),
  update: (id: string, name: string, profileIds: string[]) => api(`/households/${id}`, json("PUT", { name, profileIds })),
  remove: (id: string) => api(`/households/${id}`, json("DELETE")),
};

export const eventsApi = {
  list: () => api<EventSummaryDto[]>("/events"),
  get: (id: string) => api<EventDetailDto>(`/events/${id}`),
  create: (groupId: string, input: EventInput) => api<{ id: string }>(`/groups/${groupId}/events`, json("POST", input)),
  update: (id: string, input: EventInput) => api(`/events/${id}`, json("PATCH", input)),
  remove: (id: string) => api(`/events/${id}`, json("DELETE")),
  setParticipants: (id: string, profileIds: string[]) => api(`/events/${id}/participants`, json("PUT", { profileIds })),
  setExclusions: (id: string, pairs: { a: string; b: string }[]) => api(`/events/${id}/exclusions`, json("PUT", { pairs })),
  setType: (id: string, type: EventInput["type"]) => api(`/events/${id}/type`, json("PUT", { type })),
  draw: (id: string) => api<DrawResultDto>(`/events/${id}/draw`, json("POST")),
  reset: (id: string) => api(`/events/${id}/reset`, json("POST")),
  reveal: (id: string, reason: string) => api<EventAssignmentDto[]>(`/events/${id}/reveal`, json("POST", { reason })),
};

// ---- Teilen-Links (Verwaltung) -------------------------------------------------
export const sharesApi = {
  list: (profileId: string) => api<ShareLinkDto[]>(`/profiles/${profileId}/shares`),
  create: (profileId: string, input: ShareLinkInput) => api<ShareLinkDto>(`/profiles/${profileId}/shares`, json("POST", input)),
  revoke: (id: string) => api(`/shares/${id}`, json("DELETE")),
};

// ---- Gast-Zugriff über einen geteilten Link (der Link ist die Identität) ---------
export const guestApi = {
  view: (t: string) => api<ShareViewDto>(`/share/${t}`),
  reserve: (t: string, wishId: string) => api(`/share/${t}/wishes/${wishId}/reserve`, json("POST")),
  release: (t: string, wishId: string) => api(`/share/${t}/wishes/${wishId}/reserve`, json("DELETE")),
  acknowledge: (t: string, wishId: string) => api(`/share/${t}/reservations/${wishId}/acknowledge`, json("POST")),
};

// ---- Benachrichtigungen ----------------------------------------------------------
export const notificationsApi = {
  list: () => api<NotificationListDto>("/notifications"),
  read: (id: string) => api(`/notifications/${id}/read`, json("POST")),
  readAll: () => api("/notifications/read-all", json("POST")),
};

// ---- System-Admin (eigene Sitzung, Cookie nur für /api/admin) --------------------
export const adminApi = {
  me: () => api<{ id: string; email: string }>("/admin/me"),
  login: (email: string, password: string) => api<{ id: string; email: string }>("/admin/login", json("POST", { email, password })),
  logout: () => api("/admin/logout", json("POST")),
  stats: () => api<AdminStatsDto>("/admin/stats"),
  users: () => api<AdminUserDto[]>("/admin/users"),
  updateUser: (id: string, input: { name?: string; email?: string; emailVerified?: boolean }) => api(`/admin/users/${id}`, json("PATCH", input)),
  setPassword: (id: string, password: string) => api(`/admin/users/${id}/password`, json("POST", { password })),
  logoutUser: (id: string) => api(`/admin/users/${id}/logout`, json("POST")),
  deleteUser: (id: string) => api(`/admin/users/${id}`, json("DELETE")),
  groups: () => api<AdminGroupDto[]>("/admin/groups"),
  updateGroup: (id: string, name: string, description: string | null) => api(`/admin/groups/${id}`, json("PATCH", { name, description })),
  deleteGroup: (id: string) => api(`/admin/groups/${id}`, json("DELETE")),
  setMember: (groupId: string, profileId: string, role: "admin" | "member") =>
    api(`/admin/groups/${groupId}/members/${profileId}`, json("PUT", { role })),
  removeMember: (groupId: string, profileId: string) => api(`/admin/groups/${groupId}/members/${profileId}`, json("DELETE")),
  children: () => api<AdminChildDto[]>("/admin/children"),
  addGuardian: (id: string, userId: string) => api(`/admin/children/${id}/guardians`, json("POST", { userId })),
  removeGuardian: (id: string, userId: string) => api(`/admin/children/${id}/guardians/${userId}`, json("DELETE")),
  deleteChild: (id: string) => api(`/admin/children/${id}`, json("DELETE")),
  events: () => api<AdminEventDto[]>("/admin/events"),
  deleteEvent: (id: string) => api(`/admin/events/${id}`, json("DELETE")),
  invites: () => api<AdminInviteDto[]>("/admin/invites"),
  revokeInvite: (id: string) => api(`/admin/invites/${id}`, json("DELETE")),
  shares: () => api<AdminShareDto[]>("/admin/shares"),
  revokeShare: (id: string) => api(`/admin/shares/${id}`, json("DELETE")),
};
