import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const weightSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Weight name is required")
    .max(100, "Weight name must be 100 characters or fewer"),

  value: z
    .number()
    .int("Weight value must be a whole number")
    .min(0, "Weight value cannot be negative")
    .nullable()
    .optional(),

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

// GET /api/weight-options
router.get("/", async (req, res) => {
  try {
    const isActive =
      req.query.active === "true"
        ? true
        : req.query.active === "false"
          ? false
          : undefined;

    const options = await prisma.weightOption.findMany({
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
    console.error("Failed to fetch weight options:", error);

    res.status(500).json({
      message: "Failed to fetch weight options",
    });
  }
});

// GET /api/weight-options/:id
router.get("/:id", async (req, res) => {
  try {
    const option = await prisma.weightOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!option) {
      res.status(404).json({
        message: "Weight option not found",
      });
      return;
    }

    res.status(200).json({
      data: option,
    });
  } catch (error) {
    console.error("Failed to fetch weight option:", error);

    res.status(500).json({
      message: "Failed to fetch weight option",
    });
  }
});

// POST /api/weight-options
router.post("/", async (req, res) => {
  try {
    const result = weightSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid weight option data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const duplicate = await prisma.weightOption.findFirst({
      where: {
        name: {
          equals: result.data.name,
          mode: "insensitive",
        },
      },
    });

    if (duplicate) {
      res.status(409).json({
        message: "A weight option with this name already exists",
      });
      return;
    }

    const option = await prisma.weightOption.create({
      data: {
        name: result.data.name,
        value: result.data.value ?? null,
        description: result.data.description ?? null,
        sortOrder: result.data.sortOrder ?? 0,
      },
    });

    res.status(201).json({
      message: "Weight option created successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to create weight option:", error);

    res.status(500).json({
      message: "Failed to create weight option",
    });
  }
});

// PATCH /api/weight-options/:id
router.patch("/:id", async (req, res) => {
  try {
    const result = weightSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid weight option data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const existing = await prisma.weightOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Weight option not found",
      });
      return;
    }

    const duplicate = await prisma.weightOption.findFirst({
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
        message: "A weight option with this name already exists",
      });
      return;
    }

    const option = await prisma.weightOption.update({
      where: {
        id: req.params.id,
      },
      data: {
        name: result.data.name,
        value:
          result.data.value === undefined
            ? existing.value
            : result.data.value,
        description: result.data.description ?? null,
        sortOrder: result.data.sortOrder ?? existing.sortOrder,
      },
    });

    res.status(200).json({
      message: "Weight option updated successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to update weight option:", error);

    res.status(500).json({
      message: "Failed to update weight option",
    });
  }
});

// PATCH /api/weight-options/:id/archive
router.patch("/:id/archive", async (req, res) => {
  try {
    const existing = await prisma.weightOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Weight option not found",
      });
      return;
    }

    const option = await prisma.weightOption.update({
      where: {
        id: req.params.id,
      },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });

    res.status(200).json({
      message: "Weight option archived successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to archive weight option:", error);

    res.status(500).json({
      message: "Failed to archive weight option",
    });
  }
});

// PATCH /api/weight-options/:id/reactivate
router.patch("/:id/reactivate", async (req, res) => {
  try {
    const existing = await prisma.weightOption.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Weight option not found",
      });
      return;
    }

    const option = await prisma.weightOption.update({
      where: {
        id: req.params.id,
      },
      data: {
        isActive: true,
        archivedAt: null,
      },
    });

    res.status(200).json({
      message: "Weight option reactivated successfully",
      data: option,
    });
  } catch (error) {
    console.error("Failed to reactivate weight option:", error);

    res.status(500).json({
      message: "Failed to reactivate weight option",
    });
  }
});

export default router;