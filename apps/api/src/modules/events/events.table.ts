import type { QuotaMode } from "@pendaftaran/shared";
import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { staffUsers } from "../staff/staff.table";

export const events = pgTable("events", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").$type<"PMB" | "PELATIHAN" | "SEMINAR" | "KEGIATAN">().notNull(),
  description: text("description").notNull().default(""),
  registrationPrefix: text("registration_prefix").notNull().unique(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  quotaMode: text("quota_mode").$type<QuotaMode>().notNull(),
  quota: integer("quota"),
  requiresProgram: boolean("requires_program").notNull().default(false),
  status: text("status").$type<"DRAFT" | "PUBLISHED" | "CLOSED">().notNull().default("DRAFT"),
  lastSeq: integer("last_seq").notNull().default(0),
  createdBy: uuid("created_by").references(() => staffUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventPrograms = pgTable("event_programs", {
  id: uuid("id").primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const documentTypes = pgTable("document_types", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventDocumentRequirements = pgTable(
  "event_document_requirements",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    documentTypeId: uuid("document_type_id").notNull().references(() => documentTypes.id),
    isRequired: boolean("is_required").notNull().default(true),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.documentTypeId] })],
);
