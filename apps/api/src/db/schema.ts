// Datenbankschema. Änderungen hier, danach `pnpm db:generate` für eine neue Migration.
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Authentifizierung (Tabellen von Better Auth, Feldnamen sind vorgegeben)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Profile: eine Person mit Wunschliste. Jeder Benutzer hat genau ein eigenes
// Profil. Kinderprofile haben (noch) keinen Benutzer und werden von
// Erziehungsberechtigten verwaltet, bis sie übergeben werden.
// ---------------------------------------------------------------------------

export const profile = pgTable("profile", {
  id: id(),
  displayName: text("display_name").notNull(),
  /** null = verwaltetes Kinderprofil ohne eigenes Konto */
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const profileGuardian = pgTable(
  "profile_guardian",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    guardianUserId: text("guardian_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.guardianUserId] })],
);

/** Übergabe eines Kinderprofils an ein eigenes Konto */
export const profileHandover = pgTable("profile_handover", {
  id: id(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profile.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Gruppen
// ---------------------------------------------------------------------------

export const groupRole = pgEnum("group_role", ["admin", "member"]);

export const group = pgTable("group", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const groupMember = pgTable(
  "group_member",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    role: groupRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.profileId] }), index("group_member_profile_idx").on(t.profileId)],
);

export const groupInvite = pgTable("group_invite", {
  id: id(),
  groupId: text("group_id")
    .notNull()
    .references(() => group.id, { onDelete: "cascade" }),
  /** optional: Einladung an eine bestimmte Adresse */
  email: text("email"),
  token: text("token").notNull().unique(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** null = unbegrenzt oft verwendbar bis zum Ablauf */
  maxUses: integer("max_uses"),
  useCount: integer("use_count").notNull().default(0),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Haushalte innerhalb einer Gruppe: Vorlage für Wichtel-Ausschlüsse (z. B. Ehepaare) */
export const household = pgTable("household", {
  id: id(),
  groupId: text("group_id")
    .notNull()
    .references(() => group.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const householdMember = pgTable(
  "household_member",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.profileId] })],
);

// ---------------------------------------------------------------------------
// Wünsche
// ---------------------------------------------------------------------------

export const wishStatus = pgEnum("wish_status", ["active", "archived", "deleted"]);

export const wish = pgTable(
  "wish",
  {
    id: id(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** ungefährer Preis in Cent */
    priceCents: integer("price_cents"),
    status: wishStatus("status").notNull().default("active"),
    /** false = nur in den Gruppen aus wish_visibility sichtbar */
    visibleInAllGroups: boolean("visible_in_all_groups").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Soft-Delete, damit Reservierende sehen, dass der Wunsch entfernt wurde */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("wish_profile_idx").on(t.profileId)],
);

export const wishLink = pgTable("wish_link", {
  id: id(),
  wishId: text("wish_id")
    .notNull()
    .references(() => wish.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const wishImage = pgTable("wish_image", {
  id: id(),
  wishId: text("wish_id")
    .notNull()
    .references(() => wish.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  thumbPath: text("thumb_path").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const wishVisibility = pgTable(
  "wish_visibility",
  {
    wishId: text("wish_id")
      .notNull()
      .references(() => wish.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.wishId, t.groupId] })],
);

/**
 * Reservierung. Wird dem Besitzer der Wunschliste NIE ausgeliefert
 * (Ausnahme: verwaltete Kinderprofile, dort sehen Erziehungsberechtigte den Status).
 */
export const reservation = pgTable("reservation", {
  wishId: text("wish_id")
    .primaryKey()
    .references(() => wish.id, { onDelete: "cascade" }),
  reservedByUserId: text("reserved_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  /** Reservierender hat den Hinweis "Wunsch wurde geändert" bis zu diesem Zeitpunkt gesehen */
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Events (Wichteln oder "alle beschenken alle")
// ---------------------------------------------------------------------------

export const eventType = pgEnum("event_type", ["secret_santa", "standard"]);
export const eventStatus = pgEnum("event_status", ["draft", "drawn", "closed"]);

export const event = pgTable(
  "event",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "cascade" }),
    type: eventType("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    date: date("date"),
    budgetMinCents: integer("budget_min_cents"),
    budgetMaxCents: integer("budget_max_cents"),
    status: eventStatus("status").notNull().default("draft"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    drawnAt: timestamp("drawn_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "event_budget_range",
      sql`${t.budgetMinCents} IS NULL OR ${t.budgetMaxCents} IS NULL OR ${t.budgetMinCents} <= ${t.budgetMaxCents}`,
    ),
  ],
);

export const eventParticipant = pgTable(
  "event_participant",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.profileId] })],
);

export const exclusionSource = pgEnum("exclusion_source", ["manual", "household", "previous_event"]);

/** Gerichteter Ausschluss: giver darf receiver nicht ziehen. Beidseitig = zwei Zeilen. */
export const eventExclusion = pgTable(
  "event_exclusion",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    giverProfileId: text("giver_profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    receiverProfileId: text("receiver_profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    source: exclusionSource("source").notNull().default("manual"),
  },
  (t) => [primaryKey({ name: "event_exclusion_pk", columns: [t.eventId, t.giverProfileId, t.receiverProfileId] })],
);

export const eventAssignment = pgTable(
  "event_assignment",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    giverProfileId: text("giver_profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    receiverProfileId: text("receiver_profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.giverProfileId] }),
    uniqueIndex("event_assignment_receiver_uq").on(t.eventId, t.receiverProfileId),
  ],
);

/** Protokoll, wenn ein Organisator die Wichtel-Zuordnung im Notfall aufdeckt (für alle sichtbar). */
export const eventRevealLog = pgTable("event_reveal_log", {
  id: id(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  revealedByUserId: text("revealed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  reason: text("reason"),
  createdAt: createdAt(),
});
