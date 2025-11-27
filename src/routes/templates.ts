import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireRole,
  type AuthRequest,
} from "../middleware/auth";
import {
  maieApi,
  handleMaieError,
  type CreateTemplateDTO,
  type UpdateTemplateDTO,
} from "../services/maieApi";

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: List all templates
 *     description: Retrieve all templates from the external MAIE API
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 templates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MAIETemplate'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: MAIE API error
 */
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { data } = await maieApi.listTemplates();
    // MAIE API returns { templates: [...] }, pass it through directly
    res.json(data);
  } catch (err) {
    const { status, error } = handleMaieError(err, "Failed to fetch templates");
    res.status(status).json({ error });
  }
});

/**
 * @swagger
 * /api/templates/{id}:
 *   get:
 *     summary: Get template detail
 *     description: Retrieve detailed information about a specific template including prompt_template and schema_data
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 template:
 *                   $ref: '#/components/schemas/MAIETemplate'
 *       404:
 *         description: Template not found
 *       500:
 *         description: MAIE API error
 */
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const templateId = req.params.id;
    if (!templateId) {
      res.status(400).json({ error: "Template ID required" });
      return;
    }
    const { data } = await maieApi.getTemplate(templateId);
    res.json({ template: data });
  } catch (err) {
    const { status, error } = handleMaieError(err, "Failed to fetch template");
    res.status(status).json({ error });
  }
});

/**
 * @swagger
 * /api/templates/{id}/schema:
 *   get:
 *     summary: Get template JSON schema
 *     description: Retrieve the JSON schema for a specific template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Schema retrieved successfully
 *       404:
 *         description: Template not found
 *       500:
 *         description: MAIE API error
 */
router.get("/:id/schema", async (req: AuthRequest, res: Response) => {
  try {
    const templateId = req.params.id;
    if (!templateId) {
      res.status(400).json({ error: "Template ID required" });
      return;
    }
    const { data } = await maieApi.getTemplateSchema(templateId);
    res.json({ schema: data });
  } catch (err) {
    const { status, error } = handleMaieError(
      err,
      "Failed to fetch template schema"
    );
    res.status(status).json({ error });
  }
});

/**
 * @swagger
 * /api/templates:
 *   post:
 *     summary: Create a new template
 *     description: Create a new template in the MAIE API (admin only)
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - schema
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name
 *               description:
 *                 type: string
 *                 description: Template description
 *               schema:
 *                 type: object
 *                 description: JSON Schema for the template
 *               prompt_template:
 *                 type: string
 *                 description: Optional prompt template
 *               example:
 *                 type: object
 *                 description: Optional example data
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Admin access required
 *       500:
 *         description: MAIE API error
 */
router.post(
  "/",
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as CreateTemplateDTO;
      if (!body.name || !body.description || !body.schema_data) {
        res
          .status(400)
          .json({ error: "name, description, and schema_data are required" });
        return;
      }

      const { data } = await maieApi.createTemplate(body);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "template.create",
          resource: "template",
          resourceId: data.id,
          details: { name: body.name },
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.status(201).json({ template: data });
    } catch (err) {
      const { status, error } = handleMaieError(
        err,
        "Failed to create template"
      );
      res.status(status).json({ error });
    }
  }
);

/**
 * PUT /api/templates/:id - update template (admin only)
 */
router.put(
  "/:id",
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const templateId = req.params.id;
      if (!templateId) {
        res.status(400).json({ error: "Template ID required" });
        return;
      }
      const body = req.body as UpdateTemplateDTO;
      const { data } = await maieApi.updateTemplate(templateId, body);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "template.update",
          resource: "template",
          resourceId: templateId,
          details: { updatedFields: Object.keys(body) },
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({ template: data });
    } catch (err) {
      const { status, error } = handleMaieError(
        err,
        "Failed to update template"
      );
      res.status(status).json({ error });
    }
  }
);

/**
 * DELETE /api/templates/:id - delete template (admin only)
 */
router.delete(
  "/:id",
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const templateId = req.params.id;
      if (!templateId) {
        res.status(400).json({ error: "Template ID required" });
        return;
      }
      await maieApi.deleteTemplate(templateId);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "template.delete",
          resource: "template",
          resourceId: templateId,
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({ message: "Template deleted" });
    } catch (err) {
      const { status, error } = handleMaieError(
        err,
        "Failed to delete template"
      );
      res.status(status).json({ error });
    }
  }
);

export default router;
