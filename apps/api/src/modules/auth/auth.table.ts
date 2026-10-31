import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { participants } from "../participants/participants.table";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    subjectType: text("subject_type").$type<"STAFF" | "PARTICIPANT">().notNull(),
    subjectId: uuid("subject_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_subject_idx").on(t.subjectType, t.subjectId)],
);

export const emailOtps = pgTable(
  "email_otps",
  {
    id: uuid("id").primaryKey(),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"VERIFY_EMAIL" | "RESET_PASSWORD" | "CHANGE_EMAIL">().notNull(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_otps_lookup_idx").on(t.participantId, t.purpose)],
);
