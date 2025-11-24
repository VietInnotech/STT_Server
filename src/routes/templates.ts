import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth'
import logger from '../lib/logger'

const router = Router()

router.use(authenticate)

/**
 * GET /api/templates - list templates visible to the current user
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
  const userId = req.user!.userId
  const userRole = req.user!.roleName

    // System templates visible to all; user templates visible to owner and admins
    const templates = await prisma.template.findMany({
      where: {
        OR: [
          { ownerType: 'system' },
          { ownerType: 'user', ownerId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ templates })
  } catch (err) {
    logger.error('Failed to list templates', { err })
    res.status(500).json({ error: 'Failed to list templates' })
  }
})

/**
 * POST /api/templates - create template
 * - system templates: admin only
 * - user templates: any authenticated user (owner is current user)
 */
router.post('/', requireRole('admin', 'user'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, content, ownerType } = req.body as { name?: string; content?: string; ownerType?: string }
    if (!name || !content || !ownerType) {
      res.status(400).json({ error: 'name, content and ownerType are required' })
      return
    }

    if (ownerType !== 'system' && ownerType !== 'user') {
      res.status(400).json({ error: 'ownerType must be system or user' })
      return
    }

  if (ownerType === 'system' && req.user!.roleName !== 'admin') {
      res.status(403).json({ error: 'Only admins can create system templates' })
      return
    }

    // Validate content is valid JSON
    try {
      JSON.parse(content)
    } catch (err) {
      res.status(400).json({ error: 'content must be valid JSON' })
      return
    }

    const newT = await prisma.template.create({
      data: {
        name,
        content,
        ownerType,
        ownerId: ownerType === 'user' ? req.user!.userId : null,
      },
    })

    res.status(201).json({ template: newT })
  } catch (err) {
    logger.error('Failed to create template', { err })
    res.status(500).json({ error: 'Failed to create template' })
  }
})

/**
 * PUT /api/templates/:id - update template
 * - system templates: admin only
 * - user templates: owner or admin
 */
router.put('/:id', requireRole('admin', 'user'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { name, content } = req.body as { name?: string; content?: string }

    const t = await prisma.template.findUnique({ where: { id } })
    if (!t) {
      res.status(404).json({ error: 'Template not found' })
      return
    }

    // Authorization
  if (t.ownerType === 'system' && req.user!.roleName !== 'admin') {
      res.status(403).json({ error: 'Only admins can modify system templates' })
      return
    }
    if (t.ownerType === 'user' && t.ownerId !== req.user!.userId && req.user!.roleName !== 'admin') {
      res.status(403).json({ error: 'Not authorized to modify this template' })
      return
    }

    // Validate content if provided
    if (content !== undefined) {
      try {
        JSON.parse(content)
      } catch (err) {
        res.status(400).json({ error: 'content must be valid JSON' })
        return
      }
    }

    const updated = await prisma.template.update({ where: { id }, data: { name, content } })
    res.json({ template: updated })
  } catch (err) {
    logger.error('Failed to update template', { err })
    res.status(500).json({ error: 'Failed to update template' })
  }
})

/**
 * DELETE /api/templates/:id - delete template
 * - system templates: admin only
 * - user templates: owner or admin
 */
router.delete('/:id', requireRole('admin', 'user'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const t = await prisma.template.findUnique({ where: { id } })
    if (!t) {
      res.status(404).json({ error: 'Template not found' })
      return
    }

  if (t.ownerType === 'system' && req.user!.roleName !== 'admin') {
      res.status(403).json({ error: 'Only admins can delete system templates' })
      return
    }
  if (t.ownerType === 'user' && t.ownerId !== req.user!.userId && req.user!.roleName !== 'admin') {
      res.status(403).json({ error: 'Not authorized to delete this template' })
      return
    }

    await prisma.template.delete({ where: { id } })
    res.json({ message: 'Template deleted' })
  } catch (err) {
    logger.error('Failed to delete template', { err })
    res.status(500).json({ error: 'Failed to delete template' })
  }
})

/**
 * PUT /api/templates/:id/default - set the current user's default template
 */
router.put('/:id/default', requireRole('admin', 'user'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const t = await prisma.template.findUnique({ where: { id } })
    if (!t) {
      res.status(404).json({ error: 'Template not found' })
      return
    }

    // Authorization: system templates can be used by any user; user templates only by owner or admin
    if (t.ownerType === 'user' && t.ownerId !== req.user!.userId && req.user!.roleName !== 'admin') {
      res.status(403).json({ error: 'Not authorized to use this template' })
      return
    }

    // Upsert user's settings row and set defaultTemplateId
    await prisma.userSettings.upsert({
      where: { userId: req.user!.userId },
      create: { userId: req.user!.userId, defaultTemplateId: id },
      update: { defaultTemplateId: id },
    })

    res.json({ message: 'Default template set' })
  } catch (err) {
    logger.error('Failed to set default template', { err })
    res.status(500).json({ error: 'Failed to set default template' })
  }
})

export default router
