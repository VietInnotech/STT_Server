import cron from 'node-cron'
import prisma from '../lib/prisma'
import logger from '../lib/logger'

/**
 * Scheduler service
 * - Computes scheduledDeleteAt for files that have deleteAfterDays set but no schedule
 * - Deletes files whose scheduledDeleteAt <= now
 * Runs daily at 02:00 local time.
 */
export function startScheduler() {
  // Run once at startup to avoid waiting until 2AM on first boot
  processExpiredFiles()
    .then(() => logger.info('Initial file cleanup check completed'))
    .catch((err) => logger.error('Initial file cleanup failed', { err }))

  // Schedule daily run at 02:00
  cron.schedule('0 2 * * *', async () => {
    await processExpiredFiles()
  })

  logger.info('Scheduler started: daily cleanup at 02:00')
}

export async function processExpiredFiles() {
  const now = new Date()

  // Step 1: Backfill scheduledDeleteAt for records that have deleteAfterDays but no scheduledDeleteAt
  await backfillSchedules()

  // Step 2: Delete expired Audio files
  const expiredAudio = await prisma.audioFile.findMany({
    where: { scheduledDeleteAt: { lte: now } },
    select: { id: true, filename: true, fileSize: true, uploadedById: true },
  })

  if (expiredAudio.length > 0) {
    logger.info(`Deleting ${expiredAudio.length} expired audio files`)
  }

  for (const file of expiredAudio) {
    try {
      await prisma.audioFile.delete({ where: { id: file.id } })
      await prisma.auditLog.create({
        data: {
          userId: file.uploadedById ?? undefined,
          action: 'files.auto_delete',
          resource: 'audio',
          resourceId: file.id,
          details: { filename: file.filename, fileSize: file.fileSize },
          success: true,
        },
      })
    } catch (err) {
      logger.error('Failed to auto-delete audio file', { err, fileId: file.id })
    }
  }

  // Step 3: Delete expired Text files
  const expiredText = await prisma.textFile.findMany({
    where: { scheduledDeleteAt: { lte: now } },
    select: { id: true, filename: true, fileSize: true, uploadedById: true },
  })

  if (expiredText.length > 0) {
    logger.info(`Deleting ${expiredText.length} expired text files`)
  }

  for (const file of expiredText) {
    try {
      await prisma.textFile.delete({ where: { id: file.id } })
      await prisma.auditLog.create({
        data: {
          userId: file.uploadedById ?? undefined,
          action: 'files.auto_delete',
          resource: 'text',
          resourceId: file.id,
          details: { filename: file.filename, fileSize: file.fileSize },
          success: true,
        },
      })
    } catch (err) {
      logger.error('Failed to auto-delete text file', { err, fileId: file.id })
    }
  }
}

async function backfillSchedules() {
  // Audio: set scheduledDeleteAt where missing and deleteAfterDays is set
  const audioToSchedule = await prisma.audioFile.findMany({
    where: {
      deleteAfterDays: { not: null },
      scheduledDeleteAt: null,
    },
    select: { id: true, uploadedAt: true, deleteAfterDays: true },
  })

  for (const f of audioToSchedule) {
    const days = f.deleteAfterDays!
    const scheduled = new Date(f.uploadedAt)
    scheduled.setDate(scheduled.getDate() + days)
    await prisma.audioFile.update({
      where: { id: f.id },
      data: { scheduledDeleteAt: scheduled },
    })
  }

  // Text: set scheduledDeleteAt where missing and deleteAfterDays is set
  const textToSchedule = await prisma.textFile.findMany({
    where: {
      deleteAfterDays: { not: null },
      scheduledDeleteAt: null,
    },
    select: { id: true, uploadedAt: true, deleteAfterDays: true },
  })

  for (const f of textToSchedule) {
    const days = f.deleteAfterDays!
    const scheduled = new Date(f.uploadedAt)
    scheduled.setDate(scheduled.getDate() + days)
    await prisma.textFile.update({
      where: { id: f.id },
      data: { scheduledDeleteAt: scheduled },
    })
  }
}

export default { startScheduler }
