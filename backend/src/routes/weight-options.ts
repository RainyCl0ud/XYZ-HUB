import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const weightSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Weight name is required")
    .max(
      100,
      "Weight name must be 100 characters or fewer"
    ),

  value: z
    .number()
    .int("Weight value must be a whole number")
    .min(0, "Weight value cannot be negative")
    .nullable()
    .optional(),

  description: z
    .string()
    .trim()
    .max(
      500,
      "Description must be 500 characters or fewer"
    )
    .nullable()
    .optional(),

  sortOrder: z
    .number()
    .int()
    .min(0, "Sort order cannot be negative")
    .optional(),
});

const reorderSchema = z.object({
  orderedIds: z
    .array(z.string().trim().min(1))
    .min(
      1,
      "At least one weight option is required"
    )
    .max(
      200,
      "Too many weight options were submitted"
    )
    .refine(
      (ids) => new Set(ids).size === ids.length,
      {
        message:
          "Weight reorder list contains duplicate IDs",
      }
    ),
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

    const options =
      await prisma.weightOption.findMany({
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
    console.error(
      "Failed to fetch weight options:",
      error
    );

    res.status(500).json({
      message:
        "Failed to fetch weight options",
    });
  }
});

// PATCH /api/weight-options/reorder
//
// IMPORTANT:
// Keep this ABOVE /:id routes so Express does not
// interpret "reorder" as a weight-option ID.
router.patch("/reorder", async (req, res) => {
  try {
    const result =
      reorderSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message:
          "Invalid weight reorder data",

        errors:
          result.error.flatten().fieldErrors,
      });

      return;
    }

    const { orderedIds } = result.data;

    /*
     * Verify that every submitted record still exists.
     * This prevents stale client data from silently
     * creating an invalid arrangement.
     */
    const existingOptions =
      await prisma.weightOption.findMany({
        where: {
          id: {
            in: orderedIds,
          },
        },

        select: {
          id: true,
        },
      });

    if (
      existingOptions.length !==
      orderedIds.length
    ) {
      res.status(400).json({
        message:
          "One or more weight options no longer exist. Refresh the page and try again.",
      });

      return;
    }

    /*
     * Save the complete arrangement atomically.
     *
     * The order is normalized to:
     *
     * 1, 2, 3, 4...
     */
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.weightOption.update({
          where: {
            id,
          },

          data: {
            sortOrder: index + 1,
          },
        })
      )
    );

    const options =
      await prisma.weightOption.findMany({
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
      message:
        "Weight order updated successfully",

      data: options,
    });
  } catch (error) {
    console.error(
      "Failed to reorder weight options:",
      error
    );

    res.status(500).json({
      message:
        "Failed to reorder weight options",
    });
  }
});

// GET /api/weight-options/:id
router.get("/:id", async (req, res) => {
  try {
    const option =
      await prisma.weightOption.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!option) {
      res.status(404).json({
        message:
          "Weight option not found",
      });

      return;
    }

    res.status(200).json({
      data: option,
    });
  } catch (error) {
    console.error(
      "Failed to fetch weight option:",
      error
    );

    res.status(500).json({
      message:
        "Failed to fetch weight option",
    });
  }
});

// POST /api/weight-options
router.post("/", async (req, res) => {
  try {
    const result =
      weightSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message:
          "Invalid weight option data",

        errors:
          result.error.flatten().fieldErrors,
      });

      return;
    }

    const duplicate =
      await prisma.weightOption.findFirst({
        where: {
          name: {
            equals: result.data.name,
            mode: "insensitive",
          },
        },
      });

    if (duplicate) {
      res.status(409).json({
        message:
          "A weight option with this name already exists",
      });

      return;
    }

    /*
     * If the UI does not explicitly provide sortOrder,
     * append the new option to the bottom automatically.
     */
    let nextSortOrder = result.data.sortOrder;

    if (nextSortOrder === undefined) {
      const lastOption =
        await prisma.weightOption.findFirst({
          orderBy: {
            sortOrder: "desc",
          },

          select: {
            sortOrder: true,
          },
        });

      nextSortOrder =
        (lastOption?.sortOrder ?? 0) + 1;
    }

    const option =
      await prisma.weightOption.create({
        data: {
          name: result.data.name,

          value:
            result.data.value ?? null,

          description:
            result.data.description ?? null,

          sortOrder: nextSortOrder,
        },
      });

    res.status(201).json({
      message:
        "Weight option created successfully",

      data: option,
    });
  } catch (error) {
    console.error(
      "Failed to create weight option:",
      error
    );

    res.status(500).json({
      message:
        "Failed to create weight option",
    });
  }
});

// PATCH /api/weight-options/:id
router.patch("/:id", async (req, res) => {
  try {
    const result =
      weightSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message:
          "Invalid weight option data",

        errors:
          result.error.flatten().fieldErrors,
      });

      return;
    }

    const existing =
      await prisma.weightOption.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!existing) {
      res.status(404).json({
        message:
          "Weight option not found",
      });

      return;
    }

    const duplicate =
      await prisma.weightOption.findFirst({
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
        message:
          "A weight option with this name already exists",
      });

      return;
    }

    const option =
      await prisma.weightOption.update({
        where: {
          id: req.params.id,
        },

        data: {
          name: result.data.name,

          value:
            result.data.value === undefined
              ? existing.value
              : result.data.value,

          description:
            result.data.description ?? null,

          sortOrder:
            result.data.sortOrder ??
            existing.sortOrder,
        },
      });

    res.status(200).json({
      message:
        "Weight option updated successfully",

      data: option,
    });
  } catch (error) {
    console.error(
      "Failed to update weight option:",
      error
    );

    res.status(500).json({
      message:
        "Failed to update weight option",
    });
  }
});

// PATCH /api/weight-options/:id/archive
router.patch(
  "/:id/archive",
  async (req, res) => {
    try {
      const existing =
        await prisma.weightOption.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!existing) {
        res.status(404).json({
          message:
            "Weight option not found",
        });

        return;
      }

      if (!existing.isActive) {
        res.status(409).json({
          message:
            "Weight option is already archived",
        });

        return;
      }

      const option =
        await prisma.weightOption.update({
          where: {
            id: req.params.id,
          },

          data: {
            isActive: false,
            archivedAt: new Date(),
          },
        });

      res.status(200).json({
        message:
          "Weight option archived successfully",

        data: option,
      });
    } catch (error) {
      console.error(
        "Failed to archive weight option:",
        error
      );

      res.status(500).json({
        message:
          "Failed to archive weight option",
      });
    }
  }
);

// PATCH /api/weight-options/:id/reactivate
router.patch(
  "/:id/reactivate",
  async (req, res) => {
    try {
      const existing =
        await prisma.weightOption.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!existing) {
        res.status(404).json({
          message:
            "Weight option not found",
        });

        return;
      }

      if (existing.isActive) {
        res.status(409).json({
          message:
            "Weight option is already active",
        });

        return;
      }

      const option =
        await prisma.weightOption.update({
          where: {
            id: req.params.id,
          },

          data: {
            isActive: true,
            archivedAt: null,
          },
        });

      res.status(200).json({
        message:
          "Weight option reactivated successfully",

        data: option,
      });
    } catch (error) {
      console.error(
        "Failed to reactivate weight option:",
        error
      );

      res.status(500).json({
        message:
          "Failed to reactivate weight option",
      });
    }
  }
);

export default router;