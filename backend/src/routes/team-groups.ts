import {
  Router,
} from "express";

import type {
  Response,
} from "express";

import {
  z,
} from "zod";

import {
  type AuthenticatedRequest,
  requireAuth,
  requirePermission,
} from "../middleware/access.js";

import {
  assignPersonToTeamGroup,
  createTeamGroup,
  deleteTeamGroup,
  listTeamGroups,
  renameTeamGroup,
  reorderTeamGroups,
  setTeamGroupColor,
  TeamHierarchyError,
} from "../services/team-hierarchy.js";

const router =
  Router();

const groupNameSchema =
  z
    .string()
    .trim()
    .min(1)
    .max(120);

const createGroupSchema =
  z.object({
    name:
      groupNameSchema,

    parentGroupId:
      z
        .string()
        .min(1),
  });

const renameGroupSchema =
  z.object({
    name:
      groupNameSchema,
  });

const reorderSchema = z.object({
  parentId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).max(500),
});

const colorSchema =
  z.object({
    color:
      z
        .string()
        .regex(
          /^#[0-9A-F]{6}$/i
        )
        .nullable(),
  });

const assignPersonSchema =
  z.object({
    groupId:
      z
        .string()
        .min(1),
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

function handleHierarchyError(
  error:
    unknown,
  res:
    Response
) {
  if (
    !(error instanceof
      TeamHierarchyError)
  ) {
    return false;
  }

  switch (
    error.code
  ) {
    case "PEOPLE_MANAGE_REQUIRED":
    case "OWNER_REQUIRED":
    case "GROUP_OUT_OF_SCOPE":
    case "OWNER_GROUP_ASSIGNMENT_FORBIDDEN":
      res.status(403).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;

    case "GROUP_NOT_FOUND":
    case "PARENT_GROUP_NOT_FOUND":
    case "USER_NOT_FOUND":
      res.status(404).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;

    case "GROUP_NAME_IN_USE":
    case "ROOT_GROUP_IMMUTABLE":
    case "GROUP_HAS_CHILDREN":
    case "GROUP_HAS_MEMBERS":
      res.status(409).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;

    case "INVALID_GROUP_ORDER":
    case "INVALID_GROUP_COLOR":
      res.status(400).json({
        error:
          error.code,

        message:
          error.message,
      });

      return true;
  }
}

const peopleManagementGuards = [
  requireAuth,

  requirePermission(
    "people.access"
  ),
] as const;

router.get(
  "/",
  ...peopleManagementGuards,
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    try {
      const hierarchy =
        await listTeamGroups(
          req.access
        );

      res.status(200).json(
        hierarchy
      );
    } catch (
      error
    ) {
      if (
        handleHierarchyError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "List team groups request failed:",
        error
      );

      res.status(500).json({
        error:
          "LIST_TEAM_GROUPS_FAILED",

        message:
          "Unable to load the organization hierarchy.",
      });
    }
  }
);

router.post(
  "/",
  ...peopleManagementGuards,
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    const parsed =
      createGroupSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A subgroup name and parent group are required.",
      });
      return;
    }

    try {
      const group =
        await createTeamGroup(
          parsed.data,
          req.access
        );

      res.status(201).json({
        status:
          "TEAM_GROUP_CREATED",

        group,
      });
    } catch (
      error
    ) {
      if (
        handleHierarchyError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Create team group request failed:",
        error
      );

      res.status(500).json({
        error:
          "CREATE_TEAM_GROUP_FAILED",

        message:
          "Unable to create the subgroup.",
      });
    }
  }
);

router.put("/order", ...peopleManagementGuards, async (req: AuthenticatedRequest, res) => {
  if (!req.access) { res.status(401).json({ error: "UNAUTHENTICATED" }); return; }
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "A parent team and ordered team IDs are required." });
    return;
  }
  try {
    const result = await reorderTeamGroups(parsed.data.parentId, parsed.data.orderedIds, req.access);
    res.status(200).json({ status: "TEAM_GROUPS_REORDERED", ...result });
  } catch (error) {
    if (handleHierarchyError(error, res)) return;
    console.error("Reorder teams request failed:", error);
    res.status(500).json({ error: "REORDER_TEAM_GROUPS_FAILED", message: "Unable to save team order." });
  }
});

router.put(
  "/:groupId",
  ...peopleManagementGuards,
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    const groupId =
      getParam(
        req.params.groupId
      );

    const parsed =
      renameGroupSchema.safeParse(
        req.body
      );

    if (
      !groupId ||
      !parsed.success
    ) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A valid group and name are required.",
      });
      return;
    }

    try {
      const group =
        await renameTeamGroup(
          groupId,
          parsed.data.name,
          req.access
        );

      res.status(200).json({
        status:
          "TEAM_GROUP_UPDATED",

        group,
      });
    } catch (
      error
    ) {
      if (
        handleHierarchyError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Update team group request failed:",
        error
      );

      res.status(500).json({
        error:
          "UPDATE_TEAM_GROUP_FAILED",

        message:
          "Unable to update the subgroup.",
      });
    }
  }
);

router.put(
  "/:groupId/color",
  ...peopleManagementGuards,
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    const groupId =
      getParam(
        req.params.groupId
      );

    const parsed =
      colorSchema.safeParse(
        req.body
      );

    if (
      !groupId ||
      !parsed.success
    ) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A valid group and #RRGGBB color are required.",
      });
      return;
    }

    try {
      const group =
        await setTeamGroupColor(
          groupId,
          parsed.data.color,
          req.access
        );

      res.status(200).json({
        status:
          "TEAM_GROUP_COLOR_UPDATED",

        group,
      });
    } catch (
      error
    ) {
      if (
        handleHierarchyError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Update team group color request failed:",
        error
      );

      res.status(500).json({
        error:
          "UPDATE_TEAM_GROUP_COLOR_FAILED",

        message:
          "Unable to update the group color.",
      });
    }
  }
);

router.delete(
  "/:groupId",
  ...peopleManagementGuards,
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    const groupId =
      getParam(
        req.params.groupId
      );

    if (
      !groupId
    ) {
      res.status(400).json({
        error:
          "INVALID_GROUP_ID",
      });
      return;
    }

    try {
      const group =
        await deleteTeamGroup(
          groupId,
          req.access
        );

      res.status(200).json({
        status:
          "TEAM_GROUP_DELETED",

        group,
      });
    } catch (
      error
    ) {
      if (
        handleHierarchyError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Delete team group request failed:",
        error
      );

      res.status(500).json({
        error:
          "DELETE_TEAM_GROUP_FAILED",

        message:
          "Unable to delete the subgroup.",
      });
    }
  }
);

router.put(
  "/members/:userId",
  ...peopleManagementGuards,
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    const userId =
      getParam(
        req.params.userId
      );

    const parsed =
      assignPersonSchema.safeParse(
        req.body
      );

    if (
      !userId ||
      !parsed.success
    ) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A valid person and group are required.",
      });
      return;
    }

    try {
      const person =
        await assignPersonToTeamGroup(
          {
            userId,
            groupId:
              parsed.data.groupId,
          },
          req.access
        );

      res.status(200).json({
        status:
          "TEAM_GROUP_MEMBER_UPDATED",

        person,
      });
    } catch (
      error
    ) {
      if (
        handleHierarchyError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Assign team group request failed:",
        error
      );

      res.status(500).json({
        error:
          "ASSIGN_TEAM_GROUP_FAILED",

        message:
          "Unable to move the person to the selected group.",
      });
    }
  }
);

export default router;
