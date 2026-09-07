import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  company: varchar("company", { length: 160 }),
  businessDirection: varchar("business_direction", { length: 160 }),
  service: varchar("service", { length: 80 }),
  phone: varchar("phone", { length: 40 }).notNull(),
  task: text("task").notNull(),
  budget: varchar("budget", { length: 80 }),
  status: varchar("status", { length: 24 }).notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Lead = typeof leadsTable.$inferSelect;
export type NewLead = typeof leadsTable.$inferInsert;