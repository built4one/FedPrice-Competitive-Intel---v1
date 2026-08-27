import { pgTable, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  agency: text("agency").notNull(),
  solicitationNumber: text("solicitation_number").notNull(),
  popYears: integer("pop_years").notNull(),
  status: text("status").notNull(),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  clins: jsonb("clins").notNull().default('[]'),
  scenarios: jsonb("scenarios").notNull().default('[]'),
});

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").references(() => opportunities.id).notNull(),
  action: text("action").notNull(),
  agent: text("agent").notNull(),
  description: text("description").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});
