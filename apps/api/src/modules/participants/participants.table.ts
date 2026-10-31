import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey(),
    nik: text("nik").notNull().unique(),
    fullName: text("full_name").notNull(),
    gender: text("gender").notNull(),
    birthPlace: text("birth_place").notNull(),
    birthDate: date("birth_date").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    institution: text("institution"),
    educationLevel: text("education_level"),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    status: text("status").$type<"ACTIVE" | "SUSPENDED">().notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("participants_full_name_idx").on(t.fullName)],
);
