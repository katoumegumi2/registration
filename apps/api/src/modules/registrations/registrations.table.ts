import type { RegistrationStatus } from "@pendaftaran/shared";
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { eventPrograms, events } from "../events/events.table";
import { participants } from "../participants/participants.table";
import { staffUsers } from "../staff/staff.table";

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey(),
    registrationNumber: text("registration_number").unique(),
    participantId: uuid("participant_id").notNull().references(() => participants.id),
    eventId: uuid("event_id").notNull().references(() => events.id),
    programId: uuid("program_id").references(() => eventPrograms.id),
    status: text("status").$type<RegistrationStatus>().notNull().default("DRAFT"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verificationNotes: text("verification_notes"),
    verifiedBy: uuid("verified_by").references(() => staffUsers.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("registrations_participant_event_uq").on(t.participantId, t.eventId),
    index("registrations_event_status_idx").on(t.eventId, t.status),
    index("registrations_created_idx").on(t.createdAt),
  ],
);

export const registrationStatusHistory = pgTable(
  "registration_status_history",
  {
    id: uuid("id").primaryKey(),
    registrationId: uuid("registration_id").notNull().references(() => registrations.id, { onDelete: "cascade" }),
    fromStatus: text("from_status").$type<RegistrationStatus>(),
    toStatus: text("to_status").$type<RegistrationStatus>().notNull(),
    notes: text("notes"),
    changedBy: uuid("changed_by").references(() => staffUsers.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("history_registration_idx").on(t.registrationId)],
);
