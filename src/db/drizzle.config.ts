import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/drizzle",
  dbCredentials: {
    host: process.env.SQL_HOST || "localhost",
    user: process.env.SQL_ADMIN_USER || "postgres",
    password: process.env.SQL_ADMIN_PASSWORD || "postgres",
    database: process.env.SQL_DB_NAME || "postgres",
    ssl: false,
  },
});
