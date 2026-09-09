import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const severitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Severity name is required")
    .max(100, "Severity name must be 100 characters or fewer"),

  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer")
    .nullable()
    .optional(),

  sortOrder: z
    .number()
    .int()
    .min(0, "Sort order cannot be negative")
    .optional(),
});

// GET /api/severity-options
router.get("/", async (req, res) => {
  try {
    const isActive =
      req.query.active === "true"
        ? true
        : req.query.active === "false"
          ? false
          : undefined;

    const options = await prisma.severityOption.findMany({
      where:
        isActive === undefined
          ? undefined
          : {
              isActive,
            },

      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],
    });

    res.status(200).json({
      data: options,
    });
  } catch (error) {
    console.error("Failed to fetch severity options:", error);

    res.status(500).json({
      message: "Failed to fetch severity options",
    });
  }
});

// GET /api/severity-options/:id
router.get("/:id", async (req, res) => {
  try {
    const option = await prisma.severityOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!option) {
      res.status(404).json({
        message: "Severity option not found",
      });
      return;
    }

    res.status(200).json({
      data: option,
    });
  } catch (error) {
    console.error("Failed to fetch severity option:", error);

    res.status(500).json({
      message: "Failed to fetch severity option",
    });
  }
});

// POST /api/severity-options
router.post("/", async (req, res) => {
  try {
    const result = severitySchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid severity option data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const duplicate = await prisma.severityOption.findFirst({
      where: {
        name: {
          equals: result.data.name,
          mode: "insensitive",
        },
      },
    });

    if (duplicate) {
      res.status(409).json({
        message: "A severity option with this name already exists",
      });
      return;
    }

    const option = await prisma.severityOption.create({
      data: {
        name: result.data.name,
        description: result.data.description ?? null,
        sortOrder: result.data.sortOrder ?? 0,
      },
    });

    res.status(201).json({
      message: "Severity option created successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to create severity option:", error);

    res.status(500).json({
      message: "Failed to create severity option",
    });
  }
});

// PATCH /api/severity-options/:id
router.patch("/:id", async (req, res) => {
  try {
    const result = severitySchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid severity option data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const existing = await prisma.severityOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Severity option not found",
      });
      return;
    }

    const duplicate = await prisma.severityOption.findFirst({
      where: {
        id: {
          not: req.params.id,
        },
        name: {
          equals: result.data.name,
          mode: "insensitive",
        },
      },
    });

    if (duplicate) {
      res.status(409).json({
        message: "A severity option with this name already exists",
      });
      return;
    }

    const option = await prisma.severityOption.update({
      where: {
        id: req.params.id,
      },
      data: {
        name: result.data.name,
        description: result.data.description ?? null,
        sortOrder: result.data.sortOrder ?? existing.sortOrder,
      },
    });

    res.status(200).json({
      message: "Severity option updated successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to update severity option:", error);

    res.status(500).json({
      message: "Failed to update severity option",
    });
  }
});

// PATCH /api/severity-options/:id/archive
router.patch("/:id/archive", async (req, res) => {
  try {
    const existing = await prisma.severityOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Severity option not found",
      });
      return;
    }

    const option = await prisma.severityOption.update({
      where: {
        id: req.params.id,
      },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });

    res.status(200).json({
      message: "Severity option archived successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to archive severity option:", error);

    res.status(500).json({
      message: "Failed to archive severity option",
    });
  }
});

// PATCH /api/severity-options/:id/reactivate
router.patch("/:id/reactivate", async (req, res) => {
  try {
    const existing = await prisma.severityOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Severity option not found",
      });
      return;
    }

    const option = await prisma.severityOption.update({
      where: {
        id: req.params.id,
      },
      data: {
        isActive: true,
        archivedAt: null,
      },
    });

    res.status(200).json({
      message: "Severity option reactivated successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to reactivate severity option:", error);

    res.status(500).json({
      message: "Failed to reactivate severity option",
    });
  }
});

export default router;