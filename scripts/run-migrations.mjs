import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const migrationsDir = path.resolve(process.cwd(), "migrations");
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const migrationFiles = (await readdir(migrationsDir))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));

await client.connect();

try {
  for (const fileName of migrationFiles) {
    const sql = await readFile(path.join(migrationsDir, fileName), "utf8");
    process.stdout.write(`Running ${fileName}\n`);
    await client.query(sql);
  }

  process.stdout.write("Migrations completed successfully.\n");
} finally {
  await client.end();
}
