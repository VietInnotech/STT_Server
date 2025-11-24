import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth'
import logger from '../lib/logger'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * @swagger
 * /api/stats/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Retrieve comprehensive dashboard statistics including device counts, storage usage, recent activities, and file upload stats
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardStats'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/dashboard', requireRole('admin', 'user'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.roleName === 'admin'
    
    // Get total counts
    const [
      totalDevices,
      onlineDevices,
      totalAudioFiles,
      totalTextFiles,
      totalUsers,
    ] = await Promise.all([
      prisma.device.count(),
      prisma.device.count({ where: { isOnline: true } }),
      prisma.audioFile.count(),
      prisma.textFile.count(),
      prisma.user.count(),
    ])

    // Get storage stats
    const [audioStorage, textStorage] = await Promise.all([
      prisma.audioFile.aggregate({
        _sum: {
          fileSize: true,
        },
      }),
      prisma.textFile.aggregate({
        _sum: {
          fileSize: true,
        },
      }),
    ])

    const totalStorage = (audioStorage._sum.fileSize || 0) + (textStorage._sum.fileSize || 0)

    // Get recent activities (audit logs) - admin only
    let activities: any[] = []
    if (isAdmin) {
      const recentActivities = await prisma.auditLog.findMany({
        take: 10,
        orderBy: {
          timestamp: 'desc',
        },
        include: {
          user: {
            select: {
              username: true,
              fullName: true,
            },
          },
        },
      })

      // Format recent activities
      activities = recentActivities.map(log => ({
        id: log.id,
        action: log.action,
        resource: log.resource || 'unknown',
        user: log.user?.username || 'System',
        userFullName: log.user?.fullName || null,
        timestamp: log.timestamp,
        success: log.success,
        details: log.details,
      }))
    }

    // Get devices activity (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentDeviceActivity = await prisma.uptimeHistory.count({
      where: {
        timestamp: {
          gte: oneDayAgo,
        },
      },
    })

    // Get files uploaded today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [audioFilesToday, textFilesToday] = await Promise.all([
      prisma.audioFile.count({
        where: {
          uploadedAt: {
            gte: today,
          },
        },
      }),
      prisma.textFile.count({
        where: {
          uploadedAt: {
            gte: today,
          },
        },
      }),
    ])

    const filesUploadedToday = audioFilesToday + textFilesToday

    // Get device stats by status
    const deviceStats = {
      total: totalDevices,
      online: onlineDevices,
      offline: totalDevices - onlineDevices,
    }

    // Get file stats
    const fileStats = {
      audio: totalAudioFiles,
      text: totalTextFiles,
      total: totalAudioFiles + totalTextFiles,
      uploadedToday: filesUploadedToday,
    }

    res.json({
      devices: deviceStats,
      files: fileStats,
      storage: {
        total: totalStorage,
        audio: audioStorage._sum.fileSize || 0,
        text: textStorage._sum.fileSize || 0,
        formatted: formatBytes(totalStorage),
      },
      users: {
        total: totalUsers,
      },
      activity: {
        deviceEvents24h: recentDeviceActivity,
        filesUploadedToday,
      },
      recentActivities: activities,
    })
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' })
  }
})

/**
 * @swagger
 * /api/stats/devices-chart:
 *   get:
 *     summary: Get device connection chart data
 *     description: Retrieve historical device online/offline statistics for chart visualization
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days of history to retrieve
 *         example: 7
 *     responses:
 *       200:
 *         description: Device chart data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2025-10-08"
 *                       online:
 *                         type: integer
 *                         example: 5
 *                       offline:
 *                         type: integer
 *                         example: 2
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/devices-chart', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { days = '7' } = req.query
    const daysInt = parseInt(String(days))

    // Get uptime history for the last N days
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysInt)

    const uptimeHistory = await prisma.uptimeHistory.findMany({
      where: {
        timestamp: {
          gte: startDate,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    })

    // Group by day and count online/offline events
    const dailyStats: Record<string, { online: number; offline: number }> = {}

    uptimeHistory.forEach(record => {
      const dateKey = record.timestamp.toISOString().split('T')[0]!
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { online: 0, offline: 0 }
      }
      if (record.status === 'online') {
        dailyStats[dateKey].online++
      } else {
        dailyStats[dateKey].offline++
      }
    })

    // Format for chart
    const chartData = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      online: stats.online,
      offline: stats.offline,
    }))

    res.json({ data: chartData })
  } catch (error) {
    logger.error('Error fetching device chart stats:', error)
    res.status(500).json({ error: 'Failed to fetch device chart data' })
  }
})

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export default router
