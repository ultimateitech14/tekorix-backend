import cors from "cors";
import express from "express";
import path from "node:path";

import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";
import { router } from "./routes/index.js";

const app = express();
const staticUploadsDir = path.resolve(process.cwd(), "public");

app.disable("x-powered-by");
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition", "Content-Type"],
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(staticUploadsDir, "uploads")));
app.use(router);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
