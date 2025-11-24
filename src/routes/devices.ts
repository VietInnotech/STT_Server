import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth'
import logger from '../lib/logger'

const router = Router()

/**
 * @swagger
 * /api/devices:
 *   get:
 *     summary: List all devices
 *     description: Retrieve a list of all registered devices with optional filtering by online status and pagination
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: online
 *         schema:
 *           type: boolean
 *         description: Filter by online status
 *         example: true
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of devices to return
 *         example: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of devices to skip for pagination
 *         example: 0
 *     responses:
 *       200:
 *         description: Devices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 devices:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Device'
 *                 count:
 *                   type: integer
 *                   description: Number of devices returned
 *                   example: 10
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
router.get('/', authenticate, requireRole('admin', 'user'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { online, limit = '50', offset = '0' } = req.query

    const where = online === 'true' ? { isOnline: true } : {}

    const devices = await prisma.device.findMany({
      where,
      select: {
        id: true,
        deviceName: true,
        deviceId: true,
        ipAddress: true,
        macAddress: true,
        androidVersion: true,
        appVersion: true,
        isOnline: true,
        lastSeen: true,
        registeredAt: true,
        updatedAt: true,
      },
      orderBy: [
        { isOnline: 'desc' }, // Online devices first
        { lastSeen: 'desc' },
      ],
      take: parseInt(String(limit)),
      skip: parseInt(String(offset)),
    })

    res.json({
      success: true,
      devices,
      count: devices.length,
    })
  } catch (error) {
    logger.error('Error fetching devices:', error)
    res.status(500).json({ error: 'Failed to fetch devices' })
  }
})

/**
 * @swagger
 * /api/devices/{id}:
 *   get:
 *     summary: Get device by ID
 *     description: Retrieve detailed information about a specific device including recent files and uptime history
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Device UUID
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Device retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 device:
 *                   $ref: '#/components/schemas/Device'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Device not found
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
router.get('/:id', authenticate, requireRole('admin', 'user'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        audioFiles: {
          select: {
            id: true,
            filename: true,
            fileSize: true,
            uploadedAt: true,
          },
          take: 10,
          orderBy: { uploadedAt: 'desc' },
        },
        textFiles: {
          select: {
            id: true,
            filename: true,
            fileSize: true,
            uploadedAt: true,
          },
          take: 10,
          orderBy: { uploadedAt: 'desc' },
        },
        uptimeHistory: {
          select: {
            status: true,
            timestamp: true,
          },
          take: 20,
          orderBy: { timestamp: 'desc' },
        },
      },
    })

    if (!device) {
      res.status(404).json({ error: 'Device not found' })
      return
    }

    res.json({
      success: true,
      device,
    })
  } catch (error) {
    logger.error('Error fetching device:', error)
    res.status(500).json({ error: 'Failed to fetch device' })
  }
})

/**
 * @swagger
 * /api/devices/{id}/name:
 *   put:
 *     summary: Update device name
 *     description: Update the friendly name of a device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Device UUID
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceName
 *             properties:
 *               deviceName:
 *                 type: string
 *                 description: New device name
 *                 example: "Office Tablet"
 *     responses:
 *       200:
 *         description: Device name updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 device:
 *                   $ref: '#/components/schemas/Device'
 *       400:
 *         description: Invalid device name
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Device not found
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
router.put('/:id/name', authenticate, requireRole('admin', 'user'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { deviceName } = req.body

    if (!deviceName || typeof deviceName !== 'string' || deviceName.trim().length === 0) {
      res.status(400).json({ error: 'Device name is required' })
      return
    }

    // Check if device exists
    const existingDevice = await prisma.device.findUnique({
      where: { id },
    })

    if (!existingDevice) {
      res.status(404).json({ error: 'Device not found' })
      return
    }

    // Update device name
    const updatedDevice = await prisma.device.update({
      where: { id },
      data: { deviceName: deviceName.trim() },
    })

    // Create audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'device.rename',
          resource: 'device',
          resourceId: id,
          details: { oldName: existingDevice.deviceName, newName: deviceName.trim() },
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
        },
      })
    }

    res.json({
      success: true,
      device: {
        id: updatedDevice.id,
        deviceName: updatedDevice.deviceName,
        deviceId: updatedDevice.deviceId,
        ipAddress: updatedDevice.ipAddress,
        isOnline: updatedDevice.isOnline,
        lastSeen: updatedDevice.lastSeen,
      },
    })
  } catch (error) {
    logger.error('Error updating device name:', error)
    res.status(500).json({ error: 'Failed to update device name' })
  }
})

/**
 * @swagger
 * /api/devices/{id}:
 *   delete:
 *     summary: Delete device
 *     description: Delete a device and all associated files and history (admin only)
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Device UUID
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Device deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Device deleted successfully
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - requires admin role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Device not found
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
router.delete('/:id', authenticate, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Check if device exists
    const device = await prisma.device.findUnique({
      where: { id },
    })

    if (!device) {
      res.status(404).json({ error: 'Device not found' })
      return
    }

    // Delete device (cascade will delete related files and history)
    await prisma.device.delete({
      where: { id },
    })

    // Create audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'device.delete',
          resource: 'device',
          resourceId: id,
          details: { deviceName: device.deviceName, deviceId: device.deviceId },
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
        },
      })
    }

    res.json({
      success: true,
      message: 'Device deleted successfully',
    })
  } catch (error) {
    logger.error('Error deleting device:', error)
    res.status(500).json({ error: 'Failed to delete device' })
  }
})

export default router
