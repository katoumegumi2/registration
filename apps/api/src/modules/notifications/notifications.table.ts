import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    participantId: uuid("participant_id"),
    registrationId: uuid("registration_id"),
    type: text("type").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text").notNull(),
    status: text("status").$type<"PENDING" | "SENT" | "FAILED">().notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_due_idx").on(t.status, t.nextAttemptAt)],
);
