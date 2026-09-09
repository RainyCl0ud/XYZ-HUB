import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const chatterNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Chatter name is required")
    .max(100, "Chatter name must be 100 characters or fewer"),
});

// GET /api/chatters
router.get("/", async (req, res) => {
  try {
    const status =
      req.query.status === "ACTIVE" || req.query.status === "INACTIVE"
        ? req.query.status
        : undefined;

    const chatters = await prisma.chatter.findMany({
      where: status ? { status } : undefined,
      orderBy: {
        name: "asc",
      },
    });

    res.status(200).json({
      data: chatters,
    });
  } catch (error) {
    console.error("Failed to fetch chatters:", error);

    res.status(500).json({
      message: "Failed to fetch chatters",
    });
  }
});

// GET /api/chatters/:id
router.get("/:id", async (req, res) => {
  try {
    const chatter = await prisma.chatter.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!chatter) {
      res.status(404).json({
        message: "Chatter not found",
      });
      return;
    }

    res.status(200).json({
      data: chatter,
    });
  } catch (error) {
    console.error("Failed to fetch chatter:", error);

    res.status(500).json({
      message: "Failed to fetch chatter",
    });
  }
});

// POST /api/chatters
router.post("/", async (req, res) => {
  try {
    const result = chatterNameSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid chatter data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const existingChatter = await prisma.chatter.findFirst({
      where: {
        name: {
          equals: result.data.name,
          mode: "insensitive",
        },
      },
    });

    if (existingChatter) {
      res.status(409).json({
        message: "A chatter with this name already exists",
      });
      return;
    }

    const chatter = await prisma.chatter.create({
      data: {
        name: result.data.name,
      },
    });

    res.status(201).json({
      message: "Chatter created successfully",
      data: chatter,
    });
  } catch (error) {
    console.error("Failed to create chatter:", error);

    res.status(500).json({
      message: "Failed to create chatter",
    });
  }
});

// PATCH /api/chatters/:id
router.patch("/:id", async (req, res) => {
  try {
    const result = chatterNameSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid chatter data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const existingChatter = await prisma.chatter.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existingChatter) {
      res.status(404).json({
        message: "Chatter not found",
      });
      return;
    }

    const duplicate = await prisma.chatter.findFirst({
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
        message: "A chatter with this name already exists",
      });
      return;
    }

    const chatter = await prisma.chatter.update({
      where: {
        id: req.params.id,
      },
      data: {
        name: result.data.name,
      },
    });

    res.status(200).json({
      message: "Chatter updated successfully",
      data: chatter,
    });
  } catch (error) {
    console.error("Failed to update chatter:", error);

    res.status(500).json({
      message: "Failed to update chatter",
    });
  }
});

// PATCH /api/chatters/:id/deactivate
router.patch("/:id/deactivate", async (req, res) => {
  try {
    const existingChatter = await prisma.chatter.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existingChatter) {
      res.status(404).json({
        message: "Chatter not found",
      });
      return;
    }

    const chatter = await prisma.chatter.update({
      where: {
        id: req.params.id,
      },
      data: {
        status: "INACTIVE",
      },
    });

    res.status(200).json({
      message: "Chatter deactivated successfully",
      data: chatter,
    });
  } catch (error) {
    console.error("Failed to deactivate chatter:", error);

    res.status(500).json({
      message: "Failed to deactivate chatter",
    });
  }
});

// PATCH /api/chatters/:id/reactivate
router.patch("/:id/reactivate", async (req, res) => {
  try {
    const existingChatter = await prisma.chatter.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existingChatter) {
      res.status(404).json({
        message: "Chatter not found",
      });
      return;
    }

    const chatter = await prisma.chatter.update({
      where: {
        id: req.params.id,
      },
      data: {
        status: "ACTIVE",
      },
    });

    res.status(200).json({
      message: "Chatter reactivated successfully",
      data: chatter,
    });
  } catch (error) {
    console.error("Failed to reactivate chatter:", error);

    res.status(500).json({
      message: "Failed to reactivate chatter",
    });
  }
});

export default router;