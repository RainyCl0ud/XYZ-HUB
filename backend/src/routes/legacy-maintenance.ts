import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  linkLegacyChatterToUser,
  LegacyChatterLinkError,
} from "../services/legacy-chatter-link.js";

const router =
  Router();

const linkSchema =
  z.object({
    chatterName:
      z
        .string()
        .trim()
        .min(1)
        .max(100),
    userEmail:
      z
        .string()
        .trim()
        .email()
        .max(320),
  });

router.post(
  "/legacy-chatter-link",
  async (
    req,
    res
  ) => {
    const parsed =
      linkSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_LEGACY_LINK",
        message:
          "A valid chatter name and People account email are required.",
      });
      return;
    }

    try {
      const result =
        await linkLegacyChatterToUser(
          parsed.data
        );

      res.status(200).json({
        message:
          "Legacy QA chatter linked to the People account successfully.",
        data:
          result,
      });
    } catch (error) {
      if (
        error instanceof
        LegacyChatterLinkError
      ) {
        const status =
          error.code ===
            "USER_NOT_FOUND" ||
          error.code ===
            "CHATTER_NOT_FOUND"
            ? 404
            : error.code ===
                "USER_ALREADY_LINKED" ||
              error.code ===
                "LINK_CONFLICT"
              ? 409
              : 400;

        res.status(status).json({
          error:
            error.code,
          message:
            error.message,
        });
        return;
      }

      console.error(
        "Failed to link legacy chatter identity:",
        error
      );

      res.status(500).json({
        error:
          "LEGACY_LINK_FAILED",
        message:
          "Unable to link the legacy QA chatter."
      });
    }
  }
);

export default router;
