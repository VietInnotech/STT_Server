# Architecture

This document describes the architecture of the UNV AI Report Server V2.

## Overview

The project follows a monolithic architecture with a clear separation of concerns. It is built with Node.js and TypeScript, using the Express.js framework for the web server and Prisma as the ORM for database interactions.

## Directory Structure

```
.
├── client/         # Frontend client (React)
├── docs/           # Documentation
├── prisma/         # Database schema and migrations
├── src/            # Server source code
│   ├── config/     # Configuration files (e.g., Swagger)
│   ├── lib/        # Reusable libraries (e.g., logger, prisma client)
│   ├── middleware/ # Express middleware (e.g., auth, rate limiting)
│   ├── routes/     # API routes
│   ├── services/   # Business logic (e.g., schedulers)
│   └── utils/      # Utility functions (e.g., encryption, JWT)
├── .env.example    # Example environment variables
├── package.json    # Project dependencies
└── tsconfig.json   # TypeScript configuration
```

## Components

*   **Express.js:** The web server framework used to handle HTTP requests and responses.
*   **Prisma:** The ORM used to interact with the SQLite database. It provides a type-safe API for database queries.
*   **jsonwebtoken:** Used for generating and verifying JSON Web Tokens for user authentication.
*   **Swagger:** Used for API documentation and testing.
*   **Bun:** Used as the package manager and runtime.

## Database

The project uses a SQLite database. The database schema is defined in `prisma/schema.prisma`. Migrations are managed by Prisma Migrate.

## Authentication

Authentication is handled using JSON Web Tokens (JWT). When a user logs in, a JWT is generated and sent to the client. The client then includes the JWT in the `Authorization` header of subsequent requests to authenticate the user.

## Error Handling

The project uses a centralized error handling middleware to catch and handle errors.

## Logging

The project uses a custom logger to log messages to the console and to a file.

## Real-time Communication

The project uses Socket.IO for real-time communication between the client and the server.
