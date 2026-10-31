import type { StaffRole } from "@pendaftaran/shared";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<StaffRole>().notNull(),
  status: text("status").$type<"ACTIVE" | "INACTIVE">().notNull().default("ACTIVE"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
