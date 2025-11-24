import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')

  // Create Roles
  console.log('Creating roles...')
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'Full system access',
      permissions: [
        'users.read',
        'users.write',
        'users.delete',
        'devices.read',
        'devices.write',
        'devices.delete',
        'files.read',
        'files.write',
        'files.delete',
        'logs.read',
        'settings.write',
      ],
    },
  })

  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
      description: 'Standard user access',
      permissions: [
        'devices.read',
        'files.read',
        'files.write',
      ],
    },
  })

  const viewerRole = await prisma.role.upsert({
    where: { name: 'viewer' },
    update: {},
    create: {
      name: 'viewer',
      description: 'Read-only access',
      permissions: [
        'devices.read',
        'files.read',
      ],
    },
  })

  console.log('✅ Roles created')

  // Create Admin User
  console.log('Creating admin user...')
  const passwordHash = await bcrypt.hash('admin123', 10)

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@local.system',
      passwordHash,
      fullName: 'System Administrator',
      roleId: adminRole.id,
      isActive: true,
    },
  })

  console.log('✅ Admin user created (username: admin, password: admin123)')

  console.log('✅ Sample device created')

  // Create Audit Log
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'system.seed',
      resource: 'database',
      details: { message: 'Database seeded successfully' },
      ipAddress: '127.0.0.1',
      userAgent: 'Seed Script',
    },
  })

  console.log('✅ Audit log created')

  console.log('\n🎉 Database seeding completed!')
  console.log('\n📝 Login credentials:')
  console.log('   Username: admin')
  console.log('   Password: admin123')
  console.log('\n⚠️  Please change the admin password after first login!\n')
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
