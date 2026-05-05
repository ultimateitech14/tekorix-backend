import type { Server } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { closePool, testDatabaseConnection } from "./config/db.js";

let server: Server | null = null;

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

function formatStartupError(error: unknown) {
  if (isNodeError(error) && error.code === "EADDRINUSE") {
    return `Port ${env.PORT} is already in use. Stop the existing process or change PORT in backend/express-api/.env.`;
  }

  if (isNodeError(error) && error.code === "EACCES") {
    return `Port ${env.PORT} requires elevated permissions. Change PORT in backend/express-api/.env.`;
  }

  return "Express API startup failed.";
}

async function listenOnConfiguredPort() {
  return await new Promise<Server>((resolve, reject) => {
    const nextServer = app.listen(env.PORT);

    const handleListening = () => {
      nextServer.off("error", handleError);
      resolve(nextServer);
    };

    const handleError = (error: Error) => {
      nextServer.off("listening", handleListening);
      reject(error);
    };

    nextServer.once("listening", handleListening);
    nextServer.once("error", handleError);
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down Express API.`);

  if (!server) {
    await closePool();
    process.exit(0);
  }

  server.close(async (error) => {
    if (error) {
      console.error("Failed to close HTTP server cleanly", error);
      process.exit(1);
    }

    try {
      await closePool();
      process.exit(0);
    } catch (shutdownError) {
      console.error("Failed to close database pool cleanly", shutdownError);
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function startServer() {
  try {
    await testDatabaseConnection();
  } catch (error) {
    console.error("Database connection failed.");
    console.error(error);
    await closePool();
    process.exit(1);
  }

  try {
    server = await listenOnConfiguredPort();
    console.log(`Express API listening on port ${env.PORT}`);
  } catch (error) {
    console.error(formatStartupError(error));
    console.error(error);
    await closePool();
    process.exit(1);
  }
}

void startServer();
