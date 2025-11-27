import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PERMISSIONS } from "../src/types/permissions";

const prisma = new PrismaClient();

// Define permissions for built-in roles (keep in sync with DEFAULT_ROLE_PERMISSIONS in permissions.ts)
const ADMIN_PERMISSIONS = [
  PERMISSIONS.USERS_READ,
  PERMISSIONS.USERS_WRITE,
  PERMISSIONS.USERS_DELETE,
  PERMISSIONS.DEVICES_READ,
  PERMISSIONS.DEVICES_WRITE,
  PERMISSIONS.DEVICES_DELETE,
  PERMISSIONS.FILES_READ,
  PERMISSIONS.FILES_WRITE,
  PERMISSIONS.FILES_DELETE,
  PERMISSIONS.LOGS_READ,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.SETTINGS_WRITE,
  PERMISSIONS.ROLES_READ,
  PERMISSIONS.ROLES_WRITE,
  PERMISSIONS.ROLES_DELETE,
];

const USER_PERMISSIONS = [
  PERMISSIONS.DEVICES_READ,
  PERMISSIONS.FILES_READ,
  PERMISSIONS.FILES_WRITE,
];

const VIEWER_PERMISSIONS = [PERMISSIONS.DEVICES_READ, PERMISSIONS.FILES_READ];

async function main() {
  console.log("🌱 Starting database seeding...");

  // Create Roles
  console.log("Creating roles...");
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {
      permissions: ADMIN_PERMISSIONS,
    },
    create: {
      name: "admin",
      description: "Full system access",
      permissions: ADMIN_PERMISSIONS,
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: "user" },
    update: {
      permissions: USER_PERMISSIONS,
    },
    create: {
      name: "user",
      description: "Standard user access",
      permissions: USER_PERMISSIONS,
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: "viewer" },
    update: {
      permissions: VIEWER_PERMISSIONS,
    },
    create: {
      name: "viewer",
      description: "Read-only access",
      permissions: VIEWER_PERMISSIONS,
    },
  });

  console.log("✅ Roles created");

  // Create Admin User
  console.log("Creating admin user...");
  const passwordHash = await bcrypt.hash("admin123", 10);

  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@local.system",
      passwordHash,
      fullName: "System Administrator",
      roleId: adminRole.id,
      isActive: true,
    },
  });

  console.log("✅ Admin user created (username: admin, password: admin123)");

  console.log("✅ Sample device created");

  // Create Audit Log
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: "system.seed",
      resource: "database",
      details: { message: "Database seeded successfully" },
      ipAddress: "127.0.0.1",
      userAgent: "Seed Script",
    },
  });

  console.log("✅ Audit log created");

  console.log("\n🎉 Database seeding completed!");
  console.log("\n📝 Login credentials:");
  console.log("   Username: admin");
  console.log("   Password: admin123");
  console.log("\n⚠️  Please change the admin password after first login!\n");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
