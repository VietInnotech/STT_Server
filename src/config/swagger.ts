import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "UNV AI Report API",
      version: "1.0.0",
      description:
        "Local offline API for device management, file storage, and real-time monitoring",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local Development Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token obtained from /api/auth/login",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            username: { type: "string" },
            email: { type: "string", format: "email" },
            fullName: { type: "string", nullable: true },
            role: { type: "string", enum: ["admin", "user", "viewer"] },
            roleId: { type: "string", format: "uuid" },
            isActive: { type: "boolean" },
            lastLogin: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Device: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            deviceName: { type: "string" },
            deviceId: { type: "string" },
            ipAddress: { type: "string", nullable: true },
            macAddress: { type: "string", nullable: true },
            androidVersion: { type: "string", nullable: true },
            appVersion: { type: "string", nullable: true },
            isOnline: { type: "boolean" },
            lastSeen: { type: "string", format: "date-time" },
            registeredAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        File: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            filename: { type: "string" },
            originalName: { type: "string" },
            fileSize: { type: "integer" },
            mimeType: { type: "string" },
            deviceId: { type: "string", format: "uuid", nullable: true },
            uploadedById: { type: "string", format: "uuid" },
            uploadedAt: { type: "string", format: "date-time" },
            deleteAfterDays: { type: "integer", nullable: true },
          },
        },
        DashboardStats: {
          type: "object",
          properties: {
            devices: {
              type: "object",
              properties: {
                total: { type: "integer" },
                online: { type: "integer" },
                offline: { type: "integer" },
              },
            },
            files: {
              type: "object",
              properties: {
                audio: { type: "integer" },
                text: { type: "integer" },
                total: { type: "integer" },
                uploadedToday: { type: "integer" },
              },
            },
            storage: {
              type: "object",
              properties: {
                total: { type: "integer" },
                audio: { type: "integer" },
                text: { type: "integer" },
                formatted: { type: "string" },
              },
            },
            users: {
              type: "object",
              properties: {
                total: { type: "integer" },
              },
            },
          },
        },
        MAIETemplate: {
          type: "object",
          description: "Template from external MAIE API",
          properties: {
            id: { type: "string", description: "Template ID" },
            name: { type: "string", description: "Template name" },
            description: {
              type: "string",
              description: "Template description",
            },
            schema_url: {
              type: "string",
              description: "URL to the JSON schema",
            },
            parameters: {
              type: "object",
              additionalProperties: true,
              description: "Template parameters",
            },
            example: {
              type: "object",
              additionalProperties: true,
              description: "Example data (optional)",
            },
            prompt_template: {
              type: "string",
              description: "Prompt template text (detail view only)",
            },
            schema_data: {
              type: "object",
              additionalProperties: true,
              description: "Full JSON schema data (detail view only)",
            },
          },
        },
        Role: {
          type: "object",
          description: "User role with permissions",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Role name (unique)" },
            description: { type: "string", nullable: true },
            permissions: {
              type: "array",
              items: { type: "string" },
              description: "Array of permission strings",
            },
            userCount: {
              type: "integer",
              description: "Number of users with this role",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts"], // Path to route files with JSDoc comments
};

export const swaggerSpec = swaggerJsdoc(options);
