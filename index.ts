// Load environment variables from .env for local development
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { prisma } from "./src/lib/prisma";
import logger from "./src/lib/logger";
import {
  apiLimiter,
  authLimiter,
  uploadLimiter,
} from "./src/middleware/rateLimiter";
import { startScheduler } from "./src/services/scheduler";
import {
  setIo,
  registerUserSocket,
  unregisterUserSocket,
} from "./src/lib/socketBus";
import { verifyToken } from "./src/utils/jwt";
import { swaggerSpec } from "./src/config/swagger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// CORS configuration for Socket.IO
// In development, accept the requesting origin to support LAN deployment
// In production, restrict to configured origin or disable CORS
const getCorsOrigin = () => {
  if (process.env.NODE_ENV === "production") {
    return process.env.CORS_ORIGIN || false;
  }
  // In development, if CORS_ORIGIN is set, use it; otherwise allow all (will be restricted by Express CORS below)
  return process.env.CORS_ORIGIN || true;
};

const io = new Server(httpServer, {
  cors: {
    origin: getCorsOrigin(),
    credentials: true,
  },
});

// Expose io to socketBus utilities
setIo(io);

const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

// Configure Express 'trust proxy' to avoid express-rate-limit throwing when
// the 'X-Forwarded-For' header is present (common when behind a proxy/load
// balancer). We enable this in production by default, but keep it disabled
// during local development to avoid trusting external headers.
// If you run behind a proxy in development, set TRUST_PROXY env to 'true'.
if (process.env.TRUST_PROXY === "true" || !isDev) {
  // Accepts true/false or a number / comma-separated list if needed later.
  app.set("trust proxy", true);
} else {
  app.set("trust proxy", false);
}

// Security & Middleware
app.use(
  helmet({
    contentSecurityPolicy: isDev ? false : undefined,
  })
);

// Dynamic CORS for development (accepts any origin in dev to support LAN)
// For production, set CORS_ORIGIN environment variable
app.use(
  cors({
    origin: isDev ? true : process.env.CORS_ORIGIN || false,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging middleware - log all requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  });
  next();
});

// Apply general rate limiting to all API routes
app.use("/api", apiLimiter);

// Socket.IO connection handling - Track real devices
io.on("connection", async (socket) => {
  const clientIp =
    socket.handshake.address ||
    socket.request.socket.remoteAddress ||
    "unknown";
  const userAgent = socket.handshake.headers["user-agent"] || "unknown";

  logger.info(`Client connected: ${socket.id} from ${clientIp}`);

  try {
    // Find or create device based on IP
    let device = await prisma.device.findFirst({
      where: { ipAddress: clientIp },
    });

    if (!device) {
      // Create new device entry
      device = await prisma.device.create({
        data: {
          deviceId: socket.id,
          deviceName: `Device ${clientIp}`,
          ipAddress: clientIp,
          isOnline: true,
          lastSeen: new Date(),
        },
      });
      logger.info(`New device registered: ${device.deviceName}`, {
        ip: clientIp,
        deviceId: device.id,
      });
    } else {
      // Update existing device
      device = await prisma.device.update({
        where: { id: device.id },
        data: {
          deviceId: socket.id,
          isOnline: true,
          lastSeen: new Date(),
        },
      });
      logger.info(`Device reconnected: ${device.deviceName}`, {
        ip: clientIp,
        deviceId: device.id,
      });
    }

    // Log uptime history
    await prisma.uptimeHistory.create({
      data: {
        deviceId: device.id,
        status: "online",
        timestamp: new Date(),
      },
    });

    // Broadcast updated device list to all clients
    const onlineDevices = await prisma.device.findMany({
      where: { isOnline: true },
      select: {
        id: true,
        deviceName: true,
        deviceId: true,
        ipAddress: true,
        isOnline: true,
        lastSeen: true,
      },
    });
    io.emit("devices:list", onlineDevices);

    // Store device ID in socket for later use
    socket.data.deviceDbId = device.id;
  } catch (error) {
    logger.error("Error registering device", {
      error,
      socketId: socket.id,
      clientIp,
    });
  }

  // Handle disconnect
  socket.on("disconnect", async () => {
    // Cleanup user room mapping
    try {
      unregisterUserSocket(socket);
    } catch {}
    logger.info(`Client disconnected: ${socket.id} from ${clientIp}`);

    try {
      if (socket.data.deviceDbId) {
        // Mark device as offline
        await prisma.device.update({
          where: { id: socket.data.deviceDbId },
          data: {
            isOnline: false,
            lastSeen: new Date(),
          },
        });

        // Log uptime history
        await prisma.uptimeHistory.create({
          data: {
            deviceId: socket.data.deviceDbId,
            status: "offline",
            timestamp: new Date(),
          },
        });

        // Broadcast updated device list
        const onlineDevices = await prisma.device.findMany({
          where: { isOnline: true },
          select: {
            id: true,
            deviceName: true,
            deviceId: true,
            ipAddress: true,
            isOnline: true,
            lastSeen: true,
          },
        });
        io.emit("devices:list", onlineDevices);
      }
    } catch (error) {
      logger.error("Error handling disconnect", { error, socketId: socket.id });
    }
  });

  // Handle device info updates
  socket.on("device:info", async (data) => {
    try {
      if (socket.data.deviceDbId) {
        await prisma.device.update({
          where: { id: socket.data.deviceDbId },
          data: {
            androidVersion: data.androidVersion,
            appVersion: data.appVersion,
            macAddress: data.macAddress,
          },
        });
        logger.info(`Device info updated`, {
          deviceId: socket.data.deviceDbId,
          androidVersion: data.androidVersion,
        });
      }
    } catch (error) {
      logger.error("Error updating device info", {
        error,
        socketId: socket.id,
      });
    }
  });

  // Handle heartbeat/ping
  socket.on("device:heartbeat", async () => {
    try {
      if (socket.data.deviceDbId) {
        await prisma.device.update({
          where: { id: socket.data.deviceDbId },
          data: { lastSeen: new Date() },
        });
      }
    } catch (error) {
      logger.error("Error updating heartbeat", { error, socketId: socket.id });
    }
  });
  // Handle auth identification from frontend to associate socket with user
  socket.on("auth:identify", (data: { token?: string }) => {
    try {
      const token = data?.token;
      if (!token) return;
      const payload = verifyToken(token);
      if (!payload?.userId) return;
      registerUserSocket(payload.userId, socket);
    } catch (err) {
      logger.warn("auth:identify failed", { err });
    }
  });
});

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "UNV AI Report API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
  })
);

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Authentication routes - with strict rate limiting
const authRouter = (await import("./src/routes/auth")).default;
app.use("/api/auth", authLimiter, authRouter);

// Device management routes
const devicesRouter = (await import("./src/routes/devices")).default;
app.use("/api/devices", devicesRouter);

// File upload/download routes
const filesRouter = (await import("./src/routes/files")).default;
app.use("/api/files", filesRouter);

// Users management routes
const usersRouter = (await import("./src/routes/users")).default;
app.use("/api/users", usersRouter);

// Templates routes
const templatesRouter = (await import("./src/routes/templates")).default;
app.use("/api/templates", templatesRouter);

// Statistics routes
const statsRouter = (await import("./src/routes/stats")).default;
app.use("/api/stats", statsRouter);

// Settings routes
const settingsRouter = (await import("./src/routes/settings")).default;
app.use("/api/settings", settingsRouter);

// Roles management routes
const rolesRouter = (await import("./src/routes/roles")).default;
app.use("/api/roles", rolesRouter);

// Vite Dev Server (Development) or Static Files (Production)
if (isDev) {
  // Development: Use Vite dev server
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
    root: join(__dirname, "client"),
  });

  app.use(vite.middlewares);
} else {
  // Production: Serve static files with sirv
  const sirv = (await import("sirv")).default;
  const clientDist = join(__dirname, "client", "dist");

  if (fs.existsSync(clientDist)) {
    app.use(sirv(clientDist, { single: true, dev: false }));
  } else {
    logger.warn(
      "Client dist folder not found. Run `bun run build:client` first."
    );
  }
}

// Start server
httpServer.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`, {
    mode: isDev ? "development" : "production",
    corsOrigin: isDev
      ? "any (development)"
      : process.env.CORS_ORIGIN || "disabled",
    note: isDev
      ? "For LAN access, use your machine IP address (e.g., http://192.168.1.100:3000)"
      : undefined,
  });
  logger.info(`Socket.IO enabled`);
  logger.info(`Mode: ${isDev ? "Development" : "Production"}`);
  // Start background scheduler (auto-delete, maintenance)
  try {
    startScheduler();
  } catch (err) {
    logger.error("Failed to start scheduler", { err });
  }
});
