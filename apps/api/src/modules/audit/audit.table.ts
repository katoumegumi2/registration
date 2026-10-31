import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey(),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    registrationId: uuid("registration_id"),
    description: text("description").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_logs_entity_idx").on(t.entityType, t.entityId), index("activity_logs_registration_idx").on(t.registrationId), index("activity_logs_created_idx").on(t.createdAt)],
);
