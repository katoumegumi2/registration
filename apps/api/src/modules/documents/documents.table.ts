import type { VerificationStatus } from "@pendaftaran/shared";
import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { documentTypes } from "../events/events.table";
import { registrations } from "../registrations/registrations.table";
import { staffUsers } from "../staff/staff.table";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    registrationId: uuid("registration_id").notNull().references(() => registrations.id, { onDelete: "cascade" }),
    documentTypeId: uuid("document_type_id").notNull().references(() => documentTypes.id),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    verificationStatus: text("verification_status").$type<VerificationStatus>().notNull().default("PENDING"),
    notes: text("notes"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => staffUsers.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [unique("documents_registration_type_uq").on(t.registrationId, t.documentTypeId)],
);

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey(),
    registrationId: uuid("registration_id").notNull().references(() => registrations.id, { onDelete: "cascade" }),
    documentTypeId: uuid("document_type_id").notNull().references(() => documentTypes.id),
    tempKey: text("temp_key").notNull(),
    originalName: text("original_name").notNull(),
    status: text("status").$type<"PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED">().notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_status_expires_idx").on(t.status, t.expiresAt)],
);
