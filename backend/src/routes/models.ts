import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  type AuthenticatedRequest,
  requireAuth,
} from "../middleware/access.js";

import {
  createManagedModel,
  deactivateManagedModel,
  listManagedModels,
  ModelManagementError,
  reactivateManagedModel,
  renameManagedModel,
} from "../services/model-management.js";

const router =
  Router();

const modelNameSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(1)
        .max(120),
  });

function getParam(
  value:
    string |
    string[] |
    undefined
) {
  return Array.isArray(
    value
  )
    ? value[0]
    : value;
}

function handleModelError(
  error:
    unknown,
  res:
    Parameters<
      Parameters<
        typeof router.get
      >[1]
    >[1]
) {
  if (
    error instanceof
    ModelManagementError
  ) {
    switch (
      error.code
    ) {
      case "MODEL_MANAGEMENT_REQUIRED":
        res.status(403).json({
          error:
            error.code,

          message:
            error.message,
        });

        return true;

      case "MODEL_NOT_FOUND":
        res.status(404).json({
          error:
            error.code,

          message:
            error.message,
        });

        return true;

      case "MODEL_NAME_IN_USE":
      case "MODEL_ALREADY_ACTIVE":
      case "MODEL_ALREADY_INACTIVE":
        res.status(409).json({
          error:
            error.code,

          message:
            error.message,
        });

        return true;
    }
  }

  return false;
}

router.get(
  "/",

  requireAuth,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    try {
      const models =
        await listManagedModels(
          req.access
        );

      res.status(200).json({
        models,
      });
    } catch (
      error
    ) {
      if (
        handleModelError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "List models request failed:",
        error
      );

      res.status(500).json({
        error:
          "LIST_MODELS_FAILED",

        message:
          "Unable to load models.",
      });
    }
  }
);

router.post(
  "/",

  requireAuth,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const parsed =
      modelNameSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A model name between 1 and 120 characters is required.",
      });

      return;
    }

    try {
      const model =
        await createManagedModel(
          parsed.data.name,
          req.access
        );

      res.status(201).json({
        status:
          "MODEL_CREATED",

        model,
      });
    } catch (
      error
    ) {
      if (
        handleModelError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Create model request failed:",
        error
      );

      res.status(500).json({
        error:
          "CREATE_MODEL_FAILED",

        message:
          "Unable to create the model.",
      });
    }
  }
);

router.put(
  "/:modelId",

  requireAuth,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const modelId =
      getParam(
        req.params.modelId
      );

    if (!modelId) {
      res.status(400).json({
        error:
          "INVALID_MODEL_ID",
      });

      return;
    }

    const parsed =
      modelNameSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A model name between 1 and 120 characters is required.",
      });

      return;
    }

    try {
      const model =
        await renameManagedModel(
          modelId,
          parsed.data.name,
          req.access
        );

      res.status(200).json({
        status:
          "MODEL_UPDATED",

        model,
      });
    } catch (
      error
    ) {
      if (
        handleModelError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Update model request failed:",
        error
      );

      res.status(500).json({
        error:
          "UPDATE_MODEL_FAILED",

        message:
          "Unable to update the model.",
      });
    }
  }
);

router.post(
  "/:modelId/deactivate",

  requireAuth,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const modelId =
      getParam(
        req.params.modelId
      );

    if (!modelId) {
      res.status(400).json({
        error:
          "INVALID_MODEL_ID",
      });

      return;
    }

    try {
      const model =
        await deactivateManagedModel(
          modelId,
          req.access
        );

      res.status(200).json({
        status:
          "MODEL_DEACTIVATED",

        model,
      });
    } catch (
      error
    ) {
      if (
        handleModelError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Deactivate model request failed:",
        error
      );

      res.status(500).json({
        error:
          "DEACTIVATE_MODEL_FAILED",

        message:
          "Unable to deactivate the model.",
      });
    }
  }
);

router.post(
  "/:modelId/reactivate",

  requireAuth,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const modelId =
      getParam(
        req.params.modelId
      );

    if (!modelId) {
      res.status(400).json({
        error:
          "INVALID_MODEL_ID",
      });

      return;
    }

    try {
      const model =
        await reactivateManagedModel(
          modelId,
          req.access
        );

      res.status(200).json({
        status:
          "MODEL_REACTIVATED",

        model,
      });
    } catch (
      error
    ) {
      if (
        handleModelError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Reactivate model request failed:",
        error
      );

      res.status(500).json({
        error:
          "REACTIVATE_MODEL_FAILED",

        message:
          "Unable to reactivate the model.",
      });
    }
  }
);

export default router;
