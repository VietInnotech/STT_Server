import { PrismaClient } from '@prisma/client'
import logger from './logger'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

try {
  // Info events (general operational messages)
  (prisma as any).$on('info', (e: any) => {
    logger.info(e.message, { target: e.target, timestamp: e.timestamp })
  });

  // Warnings
  (prisma as any).$on('warn', (e: any) => {
    logger.warn(e.message, { target: e.target, timestamp: e.timestamp })
  });

  // Errors
  (prisma as any).$on('error', (e: any) => {
    // Prisma error objects can be large; log message + code for clarity
    logger.error(e.message, { stack: e.stack, code: e?.code, meta: e?.meta })
  })
} catch (err) {
  // If $on isn't available for any reason, log the failure but continue
  logger.warn('Failed to attach Prisma event listeners', { error: (err as Error).message })
}

export default prisma
