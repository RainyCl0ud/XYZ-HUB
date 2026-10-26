/// <reference types="node" />

import "dotenv/config";

import { pathToFileURL } from "node:url";

import {
  ChatterStatus,
  IncidentStatus,
  Prisma,
  PrismaClient,
  RoleDataScope,
  TwoFactorMethodType,
  UserStatus,
} from "@prisma/client";

import {
  hashPassword,
} from "../src/services/password.js";

import {
  MANAGED_PERMISSION_KEYS,
  PERMISSION_CATALOG,
} from "../src/permissions/permission-catalog.js";

const prisma = new PrismaClient();

const ROOT_TEAM_GROUP_ID =
  "xyz_management_root";
const ROOT_TEAM_GROUP_NAME =
  "XYZ Management";

const RESET_CONFIRMATION =
  "RESET_XYZ_STAGING";
const DEMO_PASSWORD =
  "Stagecoach!1899";
const STRIKE_DURATION_DAYS =
  30;

const dayMs =
  24 * 60 * 60 * 1000;

const REQUIRED_PRESERVED_OWNER_EMAILS = [
  "dim@xyzofm.xyz",
  "galario.rainheart16@gmail.com",
] as const;

const permissionDefinitions =
  PERMISSION_CATALOG;

const systemRoleDefinitions = [
  {
    systemKey: "OWNER",
    name: "Owner",
    rank: 1,
    dataScope: RoleDataScope.ALL,
    permissions:
      MANAGED_PERMISSION_KEYS,
  },
  {
    systemKey: "OPS_MANAGER",
    name: "Ops Manager",
    rank: 2,
    dataScope: RoleDataScope.ALL,
    permissions: [
      "dashboard.view",

      "people.access",
      "people.profile.view",
      "people.create",
      "people.assign_roles",

      "quality.access",
      "quality.incidents.view",
      "quality.incidents.create",
      "quality.incidents.resolve",
      "quality.incidents.void",
      "quality.chatters.view",
      "quality.chatters.manage",
      "quality.rules.view",
      "quality.rules.manage",

      "strikes.access",
      "strikes.view",
      "strikes.issue",
      "strikes.void",
      "strikes.reasons.view",
      "strikes.reasons.create",
      "strikes.reasons.edit",
      "strikes.reasons.archive",
      "strikes.ladder.view",
      "strikes.ladder.edit",

      "models.access",
      "models.create",
      "models.edit",
      "models.status.manage",
    ],
  },
  {
    systemKey: "MANAGER",
    name: "Manager",
    rank: 3,
    dataScope:
      RoleDataScope.SELF_AND_TEAM,
    permissions: [
      "dashboard.view",

      "people.access",
      "people.profile.view",
      "people.create",
      "people.assign_roles",

      "quality.access",
      "quality.incidents.view",
      "quality.incidents.create",
      "quality.incidents.resolve",
      "quality.incidents.void",
      "quality.chatters.view",
      "quality.chatters.manage",
      "quality.rules.view",
      "quality.rules.manage",

      "strikes.access",
      "strikes.view",
      "strikes.issue",
    ],
  },
  {
    systemKey: "QC",
    name: "QC",
    rank: 4,
    dataScope:
      RoleDataScope.SELF_AND_TEAM,
    permissions: [
      "dashboard.view",

      "quality.access",
      "quality.incidents.view",
      "quality.chatters.view",

      "strikes.access",
      "strikes.view",
      "strikes.issue",
    ],
  },
  {
    systemKey: "CHATTER",
    name: "Chatter",
    rank: 5,
    dataScope:
      RoleDataScope.SELF,
    permissions: [
      "dashboard.view",
    ],
  },
  {
    systemKey: "TRIAL_CHATTER",
    name: "Trial Chatter",
    rank: 6,
    dataScope:
      RoleDataScope.SELF,
    permissions: [
      "dashboard.view",
    ],
  },
  {
    systemKey: "DEV",
    name: "Dev",
    rank: null,
    dataScope:
      RoleDataScope.ALL,
    permissions: [
      "dashboard.view",

      "quality.access",
      "quality.incidents.view",
      "quality.incidents.create",
      "quality.incidents.resolve",
      "quality.incidents.void",
      "quality.chatters.view",
      "quality.chatters.manage",
      "quality.rules.view",
      "quality.rules.manage",
    ],
  },
  {
    systemKey: "ACCOUNTANT",
    name: "Accountant",
    rank: null,
    dataScope:
      RoleDataScope.ALL,
    permissions: [
      "dashboard.view",
    ],
  },
  {
    systemKey: "MODEL",
    name: "Model",
    rank: null,
    dataScope:
      RoleDataScope.SELF,
    permissions: [
      "dashboard.view",
    ],
  },
  {
    systemKey: "GENERAL_STAFF",
    name: "General Staff",
    rank: null,
    dataScope:
      RoleDataScope.SELF,
    permissions: [
      "dashboard.view",
    ],
  },
] as const;

const demoGroups = [
  {
    key: "operations",
    name: "Van der Linde Operations",
    parentKey: "root",
  },
  {
    key: "horseshoe",
    name: "Horseshoe Overlook",
    parentKey: "operations",
  },
  {
    key: "clemens",
    name: "Clemens Point",
    parentKey: "operations",
  },
  {
    key: "shady",
    name: "Shady Belle",
    parentKey: "operations",
  },
] as const;

const demoModels = [
  {
    key: "mary_beth",
    name: "Mary-Beth Gaskill",
    isActive: true,
  },
  {
    key: "abigail",
    name: "Abigail Roberts",
    isActive: true,
  },
  {
    key: "mary_linton",
    name: "Mary Linton",
    isActive: true,
  },
  {
    key: "bonnie",
    name: "Bonnie MacFarlane",
    isActive: true,
  },
  {
    key: "charlotte",
    name: "Charlotte Balfour",
    isActive: true,
  },
  {
    key: "molly",
    name: "Molly O'Shea",
    isActive: false,
  },
] as const;

type DemoUserDefinition = {
  key: string;
  name: string;
  email: string;
  status: UserStatus;
  roleKeys: string[];
  groupKey: string;
  modelKeys: string[];
  lastSignInDaysAgo?: number;
};

const demoUsers: DemoUserDefinition[] = [
  {
    key: "dutch",
    name: "Dutch Van Der Linde",
    email:
      "dutch.vanderlinde@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "OPS_MANAGER",
    ],
    groupKey:
      "operations",
    modelKeys: [
      "mary_beth",
      "abigail",
      "mary_linton",
      "bonnie",
      "charlotte",
    ],
    lastSignInDaysAgo: 0,
  },
  {
    key: "hosea",
    name: "Hosea Matthews",
    email:
      "hosea.matthews@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "MANAGER",
    ],
    groupKey:
      "operations",
    modelKeys: [
      "mary_beth",
      "abigail",
      "mary_linton",
    ],
    lastSignInDaysAgo: 1,
  },
  {
    key: "micah",
    name: "Micah Bell",
    email:
      "micah.bell@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "MANAGER",
    ],
    groupKey:
      "operations",
    modelKeys: [
      "mary_beth",
      "bonnie",
    ],
    lastSignInDaysAgo: 0,
  },
  {
    key: "susan",
    name: "Susan Grimshaw",
    email:
      "susan.grimshaw@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "QC",
    ],
    groupKey:
      "operations",
    modelKeys: [
      "abigail",
      "mary_linton",
    ],
    lastSignInDaysAgo: 2,
  },
  {
    key: "arthur",
    name: "Arthur Morgan",
    email:
      "arthur.morgan@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "CHATTER",
    ],
    groupKey:
      "horseshoe",
    modelKeys: [
      "mary_beth",
      "abigail",
    ],
    lastSignInDaysAgo: 0,
  },
  {
    key: "john",
    name: "John Marston",
    email:
      "john.marston@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "CHATTER",
    ],
    groupKey:
      "horseshoe",
    modelKeys: [
      "mary_beth",
    ],
    lastSignInDaysAgo: 3,
  },
  {
    key: "charles",
    name: "Charles Smith",
    email:
      "charles.smith@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "CHATTER",
    ],
    groupKey:
      "clemens",
    modelKeys: [
      "abigail",
      "mary_linton",
    ],
    lastSignInDaysAgo: 1,
  },
  {
    key: "javier",
    name: "Javier Escuella",
    email:
      "javier.escuella@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "CHATTER",
    ],
    groupKey:
      "shady",
    modelKeys: [
      "bonnie",
    ],
    lastSignInDaysAgo: 4,
  },
  {
    key: "sadie",
    name: "Sadie Adler",
    email:
      "sadie.adler@rdr.staging.test",
    status:
      UserStatus.ACTIVE,
    roleKeys: [
      "CHATTER",
    ],
    groupKey:
      "shady",
    modelKeys: [
      "charlotte",
    ],
    lastSignInDaysAgo: 2,
  },
];

const severityDefinitions = [
  {
    key: "minor",
    name: "Minor",
    description:
      "Low-impact coaching issue with limited customer or revenue risk.",
    sortOrder: 1,
  },
  {
    key: "moderate",
    name: "Moderate",
    description:
      "Meaningful quality issue that requires documented coaching and follow-up.",
    sortOrder: 2,
  },
  {
    key: "major",
    name: "Major",
    description:
      "Serious execution issue with material customer, revenue, or workflow impact.",
    sortOrder: 3,
  },
  {
    key: "critical",
    name: "Critical",
    description:
      "High-risk policy, compliance, security, or client-impacting issue.",
    sortOrder: 4,
  },
] as const;

const weightDefinitions = [
  {
    key: "one",
    name: "1 Point",
    value: 1,
    description: "Low-weight strike.",
    sortOrder: 1,
  },
  {
    key: "two",
    name: "2 Points",
    value: 2,
    description: "Standard coaching strike.",
    sortOrder: 2,
  },
  {
    key: "three",
    name: "3 Points",
    value: 3,
    description: "High-impact strike.",
    sortOrder: 3,
  },
  {
    key: "five",
    name: "5 Points",
    value: 5,
    description: "Critical strike weight.",
    sortOrder: 4,
  },
] as const;

type RuleVersionDefinition = {
  versionNumber: number;
  title: string;
  definition: string;
  severityKey: string;
  weightKey: string;
};

type RuleDefinition = {
  key: string;
  isActive: boolean;
  versions: RuleVersionDefinition[];
};

const ruleDefinitions: RuleDefinition[] = [
  {
    key: "slow_response",
    isActive: true,
    versions: [
      {
        versionNumber: 1,
        title: "Slow Response Time",
        definition:
          "Responses are consistently delayed beyond the expected service window without a valid operational reason.",
        severityKey: "minor",
        weightKey: "one",
      },
    ],
  },
  {
    key: "left_hanging",
    isActive: true,
    versions: [
      {
        versionNumber: 1,
        title: "Left Conversation Hanging",
        definition:
          "A live conversation was left without an appropriate reply or handoff, creating avoidable customer abandonment risk.",
        severityKey: "moderate",
        weightKey: "two",
      },
      {
        versionNumber: 2,
        title: "Left Conversation Hanging",
        definition:
          "A live conversation was left without an appropriate reply, follow-up, or documented handoff when continued engagement was required.",
        severityKey: "major",
        weightKey: "three",
      },
    ],
  },
  {
    key: "pricing",
    isActive: true,
    versions: [
      {
        versionNumber: 1,
        title: "Incorrect Pricing or PPV Handling",
        definition:
          "Pricing, paid content, or offer handling did not follow the approved commercial instructions for the assigned creator.",
        severityKey: "major",
        weightKey: "three",
      },
    ],
  },
  {
    key: "persona",
    isActive: true,
    versions: [
      {
        versionNumber: 1,
        title: "Persona or Tone Mismatch",
        definition:
          "Messages materially deviated from the approved creator persona, tone, or communication style.",
        severityKey: "moderate",
        weightKey: "two",
      },
    ],
  },
  {
    key: "aftercare",
    isActive: true,
    versions: [
      {
        versionNumber: 1,
        title: "Missed Aftercare",
        definition:
          "Required follow-up or aftercare was not provided after a sale or sensitive customer interaction.",
        severityKey: "moderate",
        weightKey: "two",
      },
    ],
  },
  {
    key: "compliance",
    isActive: true,
    versions: [
      {
        versionNumber: 1,
        title: "Policy or Compliance Violation",
        definition:
          "A message or action breached an approved policy, safety rule, platform requirement, or client restriction.",
        severityKey: "critical",
        weightKey: "five",
      },
    ],
  },
  {
    key: "duplicate_message",
    isActive: false,
    versions: [
      {
        versionNumber: 1,
        title: "Duplicate or Unnecessary Message",
        definition:
          "The same or substantially similar message was sent unnecessarily and reduced conversation quality.",
        severityKey: "minor",
        weightKey: "one",
      },
    ],
  },
];

type DemoIncidentDefinition = {
  chatterKey: string;
  modelKey: string;
  ruleVersionKey: string;
  daysAgo: number;
  status: IncidentStatus;
  details: string;
  evidenceUrl?: string;
};

const demoIncidents: DemoIncidentDefinition[] = [
  {
    chatterKey: "arthur",
    modelKey: "mary_beth",
    ruleVersionKey: "left_hanging:v2",
    daysAgo: 0,
    status: IncidentStatus.OPEN,
    details:
      "Conversation remained unanswered after the fan asked a direct follow-up question. No handoff note was recorded.",
  },
  {
    chatterKey: "arthur",
    modelKey: "abigail",
    ruleVersionKey: "slow_response:v1",
    daysAgo: 4,
    status: IncidentStatus.RESOLVED,
    details:
      "Several replies exceeded the expected response window during an otherwise normal workload period.",
  },
  {
    chatterKey: "arthur",
    modelKey: "mary_beth",
    ruleVersionKey: "persona:v1",
    daysAgo: 8,
    status: IncidentStatus.OPEN,
    details:
      "Tone became noticeably formal and inconsistent with the creator's approved conversational style.",
  },
  {
    chatterKey: "john",
    modelKey: "mary_beth",
    ruleVersionKey: "aftercare:v1",
    daysAgo: 0,
    status: IncidentStatus.OPEN,
    details:
      "The post-sale follow-up sequence was not completed after a paid-content purchase.",
  },
  {
    chatterKey: "charles",
    modelKey: "abigail",
    ruleVersionKey: "pricing:v1",
    daysAgo: 0,
    status: IncidentStatus.OPEN,
    details:
      "A paid-content offer was sent below the approved floor price for the assigned creator.",
  },
  {
    chatterKey: "charles",
    modelKey: "mary_linton",
    ruleVersionKey: "duplicate_message:v1",
    daysAgo: 5,
    status: IncidentStatus.VOIDED,
    details:
      "Two similar follow-up messages were initially flagged as duplicate outreach.",
  },
  {
    chatterKey: "lenny",
    modelKey: "mary_linton",
    ruleVersionKey: "slow_response:v1",
    daysAgo: 10,
    status: IncidentStatus.OPEN,
    details:
      "Training-period response times repeatedly exceeded the expected service window.",
  },
  {
    chatterKey: "javier",
    modelKey: "bonnie",
    ruleVersionKey: "compliance:v1",
    daysAgo: 12,
    status: IncidentStatus.RESOLVED,
    details:
      "A restricted topic was discussed before the required policy deflection was used.",
  },
  {
    chatterKey: "bill",
    modelKey: "charlotte",
    ruleVersionKey: "left_hanging:v1",
    daysAgo: 35,
    status: IncidentStatus.OPEN,
    details:
      "Historical QA incident retained for a deactivated employee; QA history does not expire.",
  },
  {
    chatterKey: "micah",
    modelKey: "mary_beth",
    ruleVersionKey: "left_hanging:v2",
    daysAgo: 0,
    status: IncidentStatus.OPEN,
    details:
      "Conversation ended without a reply even though the customer had asked a clear purchase question.",
  },
  {
    chatterKey: "micah",
    modelKey: "mary_beth",
    ruleVersionKey: "pricing:v1",
    daysAgo: 3,
    status: IncidentStatus.OPEN,
    details:
      "Offer price did not match the creator-specific pricing instruction in the active workflow.",
  },
  {
    chatterKey: "micah",
    modelKey: "mary_beth",
    ruleVersionKey: "persona:v1",
    daysAgo: 6,
    status: IncidentStatus.RESOLVED,
    details:
      "Conversation language repeatedly departed from the approved persona and required coaching.",
  },
  {
    chatterKey: "micah",
    modelKey: "mary_beth",
    ruleVersionKey: "aftercare:v1",
    daysAgo: 9,
    status: IncidentStatus.OPEN,
    details:
      "Required aftercare was skipped following a completed sale.",
  },
  {
    chatterKey: "kieran",
    modelKey: "abigail",
    ruleVersionKey: "slow_response:v1",
    daysAgo: 20,
    status: IncidentStatus.RESOLVED,
    details:
      "Older resolved QA incident retained to verify historical coaching notes.",
  },
  {
    chatterKey: "javier",
    modelKey: "bonnie",
    ruleVersionKey: "persona:v1",
    daysAgo: 2,
    status: IncidentStatus.VOIDED,
    details:
      "QA review determined the cited language was consistent with the approved creator persona.",
    evidenceUrl:
      "https://example.test/evidence/rdr-demo-015",
  },
];

const clientDemoIncidentChatters =
  new Set([
    "arthur",
    "john",
    "charles",
    "javier",
    "sadie",
  ]);

const clientDemoIncidents =
  demoIncidents.filter(
    (incident) =>
      clientDemoIncidentChatters.has(
        incident.chatterKey
      )
  );

const strikeLadderSteps = [
  {
    minActiveStrikes: 0,
    standingLabel: "Clear",
    deductionPercent: 0,
  },
  {
    minActiveStrikes: 1,
    standingLabel: "Formal Warning",
    deductionPercent: 0,
  },
  {
    minActiveStrikes: 2,
    standingLabel: "20% Commission Cut",
    deductionPercent: 20,
  },
  {
    minActiveStrikes: 3,
    standingLabel: "Final Warning / 30% Cut",
    deductionPercent: 30,
  },
  {
    minActiveStrikes: 4,
    standingLabel: "Termination Review",
    deductionPercent: 30,
  },
] as const;

function ensureUnique(
  label: string,
  values: string[]
) {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(
        `Duplicate ${label}: ${value}`
      );
    }

    seen.add(value);
  }
}

function validateSeedPlan() {
  ensureUnique(
    "group key",
    demoGroups.map((group) => group.key)
  );
  ensureUnique(
    "group name",
    demoGroups.map((group) => group.name.toLowerCase())
  );
  ensureUnique(
    "creator key",
    demoModels.map((model) => model.key)
  );
  ensureUnique(
    "creator name",
    demoModels.map((model) => model.name.toLowerCase())
  );
  ensureUnique(
    "user key",
    demoUsers.map((user) => user.key)
  );
  ensureUnique(
    "user email",
    demoUsers.map((user) => user.email.toLowerCase())
  );
  ensureUnique(
    "rule key",
    ruleDefinitions.map((rule) => rule.key)
  );

  const roleKeys =
    new Set(
      systemRoleDefinitions.map(
        (role) => role.systemKey
      )
    );
  const groupKeys =
    new Set([
      "root",
      ...demoGroups.map((group) => group.key),
    ]);
  const modelKeys =
    new Set(
      demoModels.map((model) => model.key)
    );
  const userByKey =
    new Map(
      demoUsers.map((user) => [
        user.key,
        user,
      ] as const)
    );
  const ruleVersionKeys =
    new Set<string>();

  for (const group of demoGroups) {
    if (!groupKeys.has(group.parentKey)) {
      throw new Error(
        `Unknown parent group key: ${group.parentKey}`
      );
    }
  }

  for (const user of demoUsers) {
    if (!groupKeys.has(user.groupKey)) {
      throw new Error(
        `Unknown group for ${user.name}: ${user.groupKey}`
      );
    }

    for (const roleKey of user.roleKeys) {
      if (!roleKeys.has(roleKey as never)) {
        throw new Error(
          `Unknown role for ${user.name}: ${roleKey}`
        );
      }
    }

    for (const modelKey of user.modelKeys) {
      if (!modelKeys.has(modelKey as never)) {
        throw new Error(
          `Unknown creator for ${user.name}: ${modelKey}`
        );
      }
    }
  }

  const severityKeys =
    new Set(
      severityDefinitions.map((item) => item.key)
    );
  const weightKeys =
    new Set(
      weightDefinitions.map((item) => item.key)
    );

  for (const rule of ruleDefinitions) {
    ensureUnique(
      `version number for ${rule.key}`,
      rule.versions.map((version) =>
        String(version.versionNumber)
      )
    );

    for (const version of rule.versions) {
      if (!severityKeys.has(version.severityKey as never)) {
        throw new Error(
          `Unknown severity in ${rule.key}: ${version.severityKey}`
        );
      }

      if (!weightKeys.has(version.weightKey as never)) {
        throw new Error(
          `Unknown weight in ${rule.key}: ${version.weightKey}`
        );
      }

      ruleVersionKeys.add(
        `${rule.key}:v${version.versionNumber}`
      );
    }
  }

  for (const incident of clientDemoIncidents) {
    const user =
      userByKey.get(
        incident.chatterKey
      );

    if (!user) {
      throw new Error(
        `Unknown incident chatter: ${incident.chatterKey}`
      );
    }

    if (
      !user.roleKeys.includes("CHATTER") &&
      !user.roleKeys.includes("TRIAL_CHATTER")
    ) {
      throw new Error(
        `Incident user is not a chatter: ${user.name}`
      );
    }

    if (!modelKeys.has(incident.modelKey as never)) {
      throw new Error(
        `Unknown incident creator: ${incident.modelKey}`
      );
    }

    if (!user.modelKeys.includes(incident.modelKey)) {
      throw new Error(
        `Incident creator ${incident.modelKey} is not assigned to ${user.name}`
      );
    }

    if (!ruleVersionKeys.has(incident.ruleVersionKey)) {
      throw new Error(
        `Unknown incident rule version: ${incident.ruleVersionKey}`
      );
    }
  }

  console.log("RDR staging seed plan is valid.");
  console.log(
    `Planned data: ${demoUsers.length} staff, ${demoModels.length} creators, ${demoGroups.length} subgroups, ${severityDefinitions.length} severities, ${weightDefinitions.length} weights, ${ruleDefinitions.length} rules, ${clientDemoIncidents.length} incidents.`
  );
}

function parsePreserveEmails() {
  return [
    ...new Set(
      (process.env.STAGING_RESET_PRESERVE_EMAILS ?? "")
        .split(",")
        .map((email) =>
          email.trim().toLowerCase()
        )
        .filter(Boolean)
    ),
  ];
}

function requireStagingEnvironment(
  destructive: boolean
) {
  const environmentName =
    (
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.RAILWAY_ENVIRONMENT ??
      ""
    )
      .trim()
      .toLowerCase();

  if (environmentName !== "staging") {
    throw new Error(
      `Refusing staging reset because RAILWAY_ENVIRONMENT_NAME is "${environmentName || "unset"}", not "Staging".`
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Refusing staging reset because DATABASE_URL is missing."
    );
  }

  if (
    destructive &&
    process.env.STAGING_RESET_CONFIRM !==
      RESET_CONFIRMATION
  ) {
    throw new Error(
      `Refusing destructive reset. Set STAGING_RESET_CONFIRM=${RESET_CONFIRMATION} for the one command that should mutate Staging.`
    );
  }
}

type OwnerSnapshot = {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  passwordHash: string | null;
  sessionCount: number;
  twoFactorMethodCount: number;
};

async function loadOwnerSnapshots() {
  const ownerRole =
    await prisma.role.findUnique({
      where: {
        systemKey: "OWNER",
      },
    });

  if (!ownerRole) {
    throw new Error(
      "Owner role is missing. Reset aborted before any mutation."
    );
  }

  const owners =
    await prisma.user.findMany({
      where: {
        roleMemberships: {
          some: {
            roleId: ownerRole.id,
          },
        },
      },
      include: {
        _count: {
          select: {
            sessions: true,
            twoFactorMethods: true,
          },
        },
      },
      orderBy: {
        email: "asc",
      },
    });

  if (owners.length === 0) {
    throw new Error(
      "No Owner account exists. Reset aborted before any mutation."
    );
  }

  const snapshots: OwnerSnapshot[] =
    owners.map((owner) => ({
      id: owner.id,
      name: owner.name,
      email: owner.email,
      status: owner.status,
      passwordHash: owner.passwordHash,
      sessionCount:
        owner._count.sessions,
      twoFactorMethodCount:
        owner._count.twoFactorMethods,
    }));

  snapshots.sort(
    (a, b) =>
      a.email.localeCompare(b.email)
  );

  if (
    snapshots.length !==
    REQUIRED_PRESERVED_OWNER_EMAILS.length
  ) {
    throw new Error(
      `OWNER COUNT SAFETY FAILURE: expected exactly ${REQUIRED_PRESERVED_OWNER_EMAILS.length} Owner accounts, found ${snapshots.length}. Reset aborted before mutation.`
    );
  }

  const actualOwnerEmails =
    new Set(
      snapshots.map(
        (owner) =>
          owner.email.toLowerCase()
      )
    );

  for (
    const requiredEmail
    of REQUIRED_PRESERVED_OWNER_EMAILS
  ) {
    if (
      !actualOwnerEmails.has(
        requiredEmail.toLowerCase()
      )
    ) {
      throw new Error(
        `OWNER IDENTITY SAFETY FAILURE: required Owner ${requiredEmail} is missing. Reset aborted before mutation.`
      );
    }
  }
  const expectedEmails =
    Array.from(
      new Set([
        ...REQUIRED_PRESERVED_OWNER_EMAILS.map(
          (email) => email.toLowerCase()
        ),
        ...parsePreserveEmails(),
      ])
    );

  if (expectedEmails.length > 0) {
    const allUsers =
      await prisma.user.findMany({
        select: {
          id: true,
          email: true,
        },
      });
    const ownerIds =
      new Set(
        snapshots.map((owner) => owner.id)
      );

    for (const expectedEmail of expectedEmails) {
      const existing =
        allUsers.find(
          (user) =>
            user.email.toLowerCase() ===
            expectedEmail
        );

      if (!existing) {
        throw new Error(
          `PROTECTED OWNER SAFETY FAILURE: ${expectedEmail} is not present in this database. Reset aborted before mutation.`
        );
      }

      if (!ownerIds.has(existing.id)) {
        throw new Error(
          `Protected email ${expectedEmail} exists but is not currently an Owner. Reset aborted.`
        );
      }
    }
  }

  return {
    ownerRoleId: ownerRole.id,
    snapshots,
  };
}

async function printDryRun() {
  requireStagingEnvironment(false);
  validateSeedPlan();

  const {
    snapshots,
  } =
    await loadOwnerSnapshots();

  const counts = {
    users:
      await prisma.user.count(),
    chatters:
      await prisma.chatter.count(),
    creators:
      await prisma.agencyModel.count(),
    incidents:
      await prisma.incident.count(),
    strikes:
      await prisma.strike.count(),
    strikeReasons:
      await prisma.strikeReason.count(),
    strikeLadderVersions:
      await prisma.strikeLadderVersion.count(),
    rules:
      await prisma.rule.count(),
    severities:
      await prisma.severityOption.count(),
    weights:
      await prisma.weightOption.count(),
    groups:
      await prisma.teamGroup.count(),
    auditEvents:
      await prisma.auditEvent.count(),
    chatAreas: await prisma.chatArea.count(),
    chatChannels: await prisma.chatChannel.count(),
    chatMessages: await prisma.chatMessage.count(),
    chatNamedGrants: await prisma.chatPersonGrant.count(),
    chatPrivateConversations: await prisma.chatStandingConversation.count(),
    clockCorrections: await prisma.clockCorrection.count(),
    clockAlerts: await prisma.clockAlert.count(),
    clockAlertReads: await prisma.clockAlertRead.count(),
    clockShifts: await prisma.clockShift.count(),
    clockBreaks: await prisma.clockBreak.count(),
  };

  console.log("");
  console.log("STAGING RESET DRY RUN — NO DATA CHANGED");
  console.log("Preserved Owner accounts:");

  for (const owner of snapshots) {
    console.log(
      `- ${owner.name} <${owner.email}> (${owner.status})`
    );
  }

  console.log("");
console.log("Current rows scheduled for cleanup/replacement:");
  console.table(counts);
  console.log("");
  console.log(
    "Run again without --dry-run only after reviewing this output."
  );
}

async function restoreSystemCatalog(
  tx: Prisma.TransactionClient
) {
  const systemKeys =
    systemRoleDefinitions.map(
      (role) => role.systemKey
    );

  const existingRoles =
    await tx.role.findMany({
      where: {
        systemKey: {
          in: [...systemKeys],
        },
      },
    });

  for (const role of existingRoles) {
    await tx.role.update({
      where: {
        id: role.id,
      },
      data: {
        name:
          `__staging_reset_${role.systemKey}_${role.id}`,
      },
    });
  }

  const permissionByKey =
    new Map<string, string>();

  for (const definition of permissionDefinitions) {
    const permission =
      await tx.permission.upsert({
        where: {
          key: definition.key,
        },
        update: {
          name: definition.name,
          description:
            definition.description,
          pageKey:
            definition.pageKey,
          categoryKey:
            definition.categoryKey,
          actionKey:
            definition.actionKey,
        },
        create: {
          key: definition.key,
          name: definition.name,
          description:
            definition.description,
          pageKey:
            definition.pageKey,
          categoryKey:
            definition.categoryKey,
          actionKey:
            definition.actionKey,
        },
      });

    permissionByKey.set(
      definition.key,
      permission.id
    );
  }

  const roleBySystemKey =
    new Map<string, string>();

  for (const definition of systemRoleDefinitions) {
    const role =
      await tx.role.upsert({
        where: {
          systemKey:
            definition.systemKey,
        },
        update: {
          name: definition.name,
          rank: definition.rank,
          dataScope:
            definition.dataScope,
          isSystem: true,
          landingPath: null,
        },
        create: {
          systemKey:
            definition.systemKey,
          name: definition.name,
          rank: definition.rank,
          dataScope:
            definition.dataScope,
          isSystem: true,
          landingPath: null,
        },
      });

    roleBySystemKey.set(
      definition.systemKey,
      role.id
    );
  }

  await tx.rolePermission.deleteMany({
    where: {
      roleId: {
        in: [
          ...roleBySystemKey.values(),
        ],
      },
    },
  });

  const rolePermissionRows: Array<{
    roleId: string;
    permissionId: string;
  }> = [];

  for (const definition of systemRoleDefinitions) {
    const roleId =
      roleBySystemKey.get(
        definition.systemKey
      );

    if (!roleId) {
      throw new Error(
        `Missing restored system role: ${definition.systemKey}`
      );
    }

    for (const permissionKey of definition.permissions) {
      const permissionId =
        permissionByKey.get(
          permissionKey
        );

      if (!permissionId) {
        throw new Error(
          `Missing restored permission: ${permissionKey}`
        );
      }

      rolePermissionRows.push({
        roleId,
        permissionId,
      });
    }
  }

  if (rolePermissionRows.length > 0) {
    await tx.rolePermission.createMany({
      data: rolePermissionRows,
    });
  }

  return roleBySystemKey;
}

async function performReset() {
  requireStagingEnvironment(true);
  validateSeedPlan();

  const {
    ownerRoleId,
    snapshots,
  } =
    await loadOwnerSnapshots();
  const ownerIds =
    snapshots.map((owner) => owner.id);
  const demoPasswordHash =
    await hashPassword(
      DEMO_PASSWORD
    );
  const now =
    new Date();

  console.log("");
  console.log("Protected Owner accounts:");
  for (const owner of snapshots) {
    console.log(
      `- ${owner.name} <${owner.email}>`
    );
  }
  console.log("");

  const summary =
    await prisma.$transaction(
      async (tx) => {
await tx.teamGroup.upsert({
          where: {
            id: ROOT_TEAM_GROUP_ID,
          },
          update: {
            name:
              ROOT_TEAM_GROUP_NAME,
            parentId: null,
            isRoot: true,
          },
          create: {
            id: ROOT_TEAM_GROUP_ID,
            name:
              ROOT_TEAM_GROUP_NAME,
            parentId: null,
            isRoot: true,
          },
        });

        /* Clear discipline before referenced people/policy and QA traceability. */
        await tx.strike.deleteMany();
        await tx.strikeReason.deleteMany();
        await tx.strikeLadderStep.deleteMany();
        await tx.strikeLadderVersion.deleteMany();

        await tx.strikeLadderVersion.create({
          data: {
            versionNumber: 1,
            durationDays: STRIKE_DURATION_DAYS,
            isCurrent: true,
            steps: {
              create: strikeLadderSteps.map((step) => ({ ...step })),
            },
          },
        });

        /* QA and configuration data. */
        await tx.incident.deleteMany();
        await tx.ruleVersion.deleteMany();
        await tx.rule.deleteMany();
        await tx.severityOption.deleteMany();
        await tx.weightOption.deleteMany();
        await tx.chatter.deleteMany();

        /* Disposable staging chat data must be cleared before its creator FKs.
         * The one-time marker also resets because role defaults are rebuilt. */
        await tx.chatMessage.deleteMany();
        await tx.chatStandingConversation.deleteMany();
        await tx.chatPersonGrant.deleteMany();
        await tx.chatRoleGrant.deleteMany();
        await tx.chatChannel.deleteMany();
        await tx.chatArea.deleteMany();
        await tx.chatSetup.deleteMany();
         /* Attendance is disposable only in this guarded staging reset. */
         await tx.clockCorrection.deleteMany();
         await tx.clockAlertRead.deleteMany();
         await tx.clockAlert.deleteMany();
         await tx.clockBreak.deleteMany();
         await tx.clockShift.deleteMany();
         await tx.clockSetup.deleteMany();

        /* Creator assignments/catalog. */
        await tx.userModelAssignment.deleteMany();
        await tx.agencyModel.deleteMany();

        /* Preserve Owner identity/auth, but remove incidental test access. */
        await tx.userRole.deleteMany({
          where: {
            userId: {
              in: ownerIds,
            },
            roleId: {
              not: ownerRoleId,
            },
          },
        });

        await tx.user.updateMany({
          where: {
            id: {
              in: ownerIds,
            },
          },
          data: {
            teamGroupId:
              ROOT_TEAM_GROUP_ID,
          },
        });

        /* Removing users cascades their sessions/tokens/methods/invites only for non-Owners. */
        await tx.user.deleteMany({
          where: {
            id: {
              notIn: ownerIds,
            },
          },
        });

        /* Reset organization hierarchy to permanent root only. */
        await tx.teamGroup.updateMany({
          where: {
            id: {
              not: ROOT_TEAM_GROUP_ID,
            },
          },
          data: {
            parentId: null,
            isRoot: false,
          },
        });
        await tx.teamGroup.deleteMany({
          where: {
            id: {
              not: ROOT_TEAM_GROUP_ID,
            },
          },
        });

        /* Staging audit history is intentionally cleared with the test dataset. */
        await tx.auditEvent.deleteMany();

        /* Custom roles are test data; system roles/permissions are restored below. */
        await tx.role.deleteMany({
          where: {
            systemKey: null,
          },
        });

        const roleBySystemKey =
          await restoreSystemCatalog(
            tx
          );
        const restoredOwnerRoleId =
          roleBySystemKey.get(
            "OWNER"
          );

        if (!restoredOwnerRoleId) {
          throw new Error(
            "Restored Owner role is missing."
          );
        }

        for (const ownerId of ownerIds) {
          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId: ownerId,
                roleId:
                  restoredOwnerRoleId,
              },
            },
            update: {},
            create: {
              userId: ownerId,
              roleId:
                restoredOwnerRoleId,
              assignedByUserId: null,
            },
          });
        }

        const groupByKey =
          new Map<string, string>([
            [
              "root",
              ROOT_TEAM_GROUP_ID,
            ],
          ]);

        for (const group of demoGroups) {
          const parentId =
            groupByKey.get(
              group.parentKey
            );

          if (!parentId) {
            throw new Error(
              `Seed parent group missing: ${group.parentKey}`
            );
          }

          const created =
            await tx.teamGroup.create({
              data: {
                name: group.name,
                parentId,
                isRoot: false,
              },
            });

          groupByKey.set(
            group.key,
            created.id
          );
        }

        const modelByKey =
          new Map<string, string>();

        for (const model of demoModels) {
          const created =
            await tx.agencyModel.create({
              data: {
                name: model.name,
                isActive:
                  model.isActive,
              },
            });

          modelByKey.set(
            model.key,
            created.id
          );
        }

        const userByKey =
          new Map<string, string>();
        const chatterByUserKey =
          new Map<string, string>();
        const assigningOwnerId =
          ownerIds[0];

        for (const definition of demoUsers) {
          const groupId =
            groupByKey.get(
              definition.groupKey
            );

          if (!groupId) {
            throw new Error(
              `Seed group missing for ${definition.name}`
            );
          }

          const isPending =
            definition.status ===
            UserStatus.PENDING_SETUP;
          const isDeactivated =
            definition.status ===
            UserStatus.DEACTIVATED;

          const createdUser =
            await tx.user.create({
              data: {
                name: definition.name,
                email:
                  definition.email,
                passwordHash:
                  isPending
                    ? null
                    : demoPasswordHash,
                status:
                  definition.status,
                emailVerifiedAt:
                  isPending
                    ? null
                    : now,
                lastSignInAt:
                  definition.lastSignInDaysAgo ===
                  undefined
                    ? null
                    : new Date(
                        now.getTime() -
                          definition.lastSignInDaysAgo *
                            dayMs
                      ),
                deactivatedAt:
                  isDeactivated
                    ? new Date(
                        now.getTime() -
                          2 * dayMs
                      )
                    : null,
                teamGroupId:
                  groupId,
              },
            });

          userByKey.set(
            definition.key,
            createdUser.id
          );

          const roleRows =
            definition.roleKeys.map(
              (roleKey) => {
                const roleId =
                  roleBySystemKey.get(
                    roleKey
                  );

                if (!roleId) {
                  throw new Error(
                    `Seed role missing: ${roleKey}`
                  );
                }

                return {
                  userId:
                    createdUser.id,
                  roleId,
                  assignedByUserId:
                    assigningOwnerId,
                };
              }
            );

          await tx.userRole.createMany({
            data: roleRows,
          });

          if (!isPending) {
            await tx.userTwoFactorMethod.create({
              data: {
                userId:
                  createdUser.id,
                type:
                  TwoFactorMethodType.EMAIL,
                isEnabled: true,
                verifiedAt: now,
              },
            });
          }

          if (
            definition.roleKeys.includes(
              "CHATTER"
            ) ||
            definition.roleKeys.includes(
              "TRIAL_CHATTER"
            )
          ) {
            const chatter =
              await tx.chatter.create({
                data: {
                  userId:
                    createdUser.id,
                  name:
                    definition.name,
                  status:
                    isDeactivated
                      ? ChatterStatus.INACTIVE
                      : ChatterStatus.ACTIVE,
                },
              });

            chatterByUserKey.set(
              definition.key,
              chatter.id
            );
          }

          if (
            definition.modelKeys.length >
            0
          ) {
            await tx.userModelAssignment.createMany({
              data:
                definition.modelKeys.map(
                  (modelKey) => {
                    const modelId =
                      modelByKey.get(
                        modelKey
                      );

                    if (!modelId) {
                      throw new Error(
                        `Seed creator missing: ${modelKey}`
                      );
                    }

                    return {
                      userId:
                        createdUser.id,
                      modelId,
                      assignedByUserId:
                        assigningOwnerId,
                    };
                  }
                ),
            });
          }

          if (isPending) {
            await tx.invite.create({
              data: {
                userId:
                  createdUser.id,
                tokenHash:
                  `rdr-demo-invite-${definition.key}`,
                createdByUserId:
                  assigningOwnerId,
                sentAt: now,
                expiresAt:
                  new Date(
                    now.getTime() +
                      7 * dayMs
                  ),
              },
            });
          }
        }

        const severityByKey =
          new Map<
            string,
            {
              id: string;
              name: string;
            }
          >();

        for (const definition of severityDefinitions) {
          const created =
            await tx.severityOption.create({
              data: {
                name: definition.name,
                description:
                  definition.description,
                sortOrder:
                  definition.sortOrder,
                isActive: true,
              },
            });

          severityByKey.set(
            definition.key,
            {
              id: created.id,
              name: created.name,
            }
          );
        }

        const weightByKey =
          new Map<
            string,
            {
              id: string;
              name: string;
              value: number | null;
            }
          >();

        for (const definition of weightDefinitions) {
          const created =
            await tx.weightOption.create({
              data: {
                name: definition.name,
                value: definition.value,
                description:
                  definition.description,
                sortOrder:
                  definition.sortOrder,
                isActive: true,
              },
            });

          weightByKey.set(
            definition.key,
            {
              id: created.id,
              name: created.name,
              value: created.value,
            }
          );
        }

        const ruleVersionByKey =
          new Map<
            string,
            {
              id: string;
              title: string;
              definition: string;
              severityNameSnapshot:
                string | null;
              weightNameSnapshot:
                string | null;
              weightValueSnapshot:
                number | null;
            }
          >();

        for (const definition of ruleDefinitions) {
          const rule =
            await tx.rule.create({
              data: {
                isActive:
                  definition.isActive,
                archivedAt:
                  definition.isActive
                    ? null
                    : new Date(
                        now.getTime() -
                          2 * dayMs
                      ),
              },
            });

          for (const version of definition.versions) {
            const severity =
              severityByKey.get(
                version.severityKey
              );
            const weight =
              weightByKey.get(
                version.weightKey
              );

            if (!severity || !weight) {
              throw new Error(
                `Seed rule options missing for ${definition.key}`
              );
            }

            const createdVersion =
              await tx.ruleVersion.create({
                data: {
                  ruleId: rule.id,
                  versionNumber:
                    version.versionNumber,
                  title:
                    version.title,
                  definition:
                    version.definition,
                  severityOptionId:
                    severity.id,
                  weightOptionId:
                    weight.id,
                  severityNameSnapshot:
                    severity.name,
                  weightNameSnapshot:
                    weight.name,
                  weightValueSnapshot:
                    weight.value,
                },
              });

            ruleVersionByKey.set(
              `${definition.key}:v${version.versionNumber}`,
              createdVersion
            );
          }
        }

        for (
          let index = 0;
          index < clientDemoIncidents.length;
          index += 1
        ) {
          const definition =
            clientDemoIncidents[index];
          const chatterId =
            chatterByUserKey.get(
              definition.chatterKey
            );
          const modelId =
            modelByKey.get(
              definition.modelKey
            );
          const version =
            ruleVersionByKey.get(
              definition.ruleVersionKey
            );

          if (!chatterId || !modelId || !version) {
            throw new Error(
              `Seed incident reference missing at index ${index}`
            );
          }

          const occurredAt =
            new Date(
              now.getTime() -
                definition.daysAgo *
                  dayMs -
                index *
                  37 *
                  60 *
                  1000
            );
          const workflowAt =
            new Date(
              occurredAt.getTime() +
                6 * 60 * 60 * 1000
            );

          await tx.incident.create({
            data: {
              chatterId,
              ruleVersionId:
                version.id,
              modelId,
              ruleTitleSnapshot:
                version.title,
              ruleDefinitionSnapshot:
                version.definition,
              severityNameSnapshot:
                version.severityNameSnapshot,
              weightNameSnapshot:
                version.weightNameSnapshot,
              weightValueSnapshot:
                version.weightValueSnapshot,
              occurredAt,
              details:
                definition.details,
              evidenceUrl:
                definition.evidenceUrl ??
                null,
              status:
                definition.status,
              resolutionNotes:
                definition.status ===
                IncidentStatus.RESOLVED
                  ? "Coaching completed and follow-up expectations documented."
                  : null,
              resolvedAt:
                definition.status ===
                IncidentStatus.RESOLVED
                  ? workflowAt
                  : null,
              voidReason:
                definition.status ===
                IncidentStatus.VOIDED
                  ? "QA review determined the original incident was not valid."
                  : null,
              voidedAt:
                definition.status ===
                IncidentStatus.VOIDED
                  ? workflowAt
                  : null,
            },
          });
        }

        return {
          preservedOwners:
            ownerIds.length,
          users:
            await tx.user.count(),
          demoStaff:
            demoUsers.length,
          chatters:
            await tx.chatter.count(),
          creators:
            await tx.agencyModel.count(),
          incidents:
            await tx.incident.count(),
          strikes:
            await tx.strike.count(),
          strikeReasons:
            await tx.strikeReason.count(),
          strikeLadderVersions:
            await tx.strikeLadderVersion.count(),
          rules:
            await tx.rule.count(),
          severities:
            await tx.severityOption.count(),
          weights:
            await tx.weightOption.count(),
          groups:
            await tx.teamGroup.count(),
        };
      },
      {
        maxWait: 10_000,
        timeout: 60_000,
      }
    );

  const restoredOwners =
    await prisma.user.findMany({
      where: {
        id: {
          in: ownerIds,
        },
      },
      include: {
        roleMemberships: {
          include: {
            role: true,
          },
        },
        _count: {
          select: {
            sessions: true,
            twoFactorMethods: true,
          },
        },
      },
    });

  for (const snapshot of snapshots) {
    const restored =
      restoredOwners.find(
        (owner) =>
          owner.id === snapshot.id
      );

    if (!restored) {
      throw new Error(
        `OWNER PRESERVATION FAILURE: ${snapshot.email} no longer exists.`
      );
    }

    const stillOwner =
      restored.roleMemberships.some(
        (membership) =>
          membership.role.systemKey ===
          "OWNER"
      );

    if (!stillOwner) {
      throw new Error(
        `OWNER PRESERVATION FAILURE: ${snapshot.email} lost the Owner role.`
      );
    }

    if (
      restored.passwordHash !==
        snapshot.passwordHash ||
      restored.status !==
        snapshot.status ||
      restored._count.sessions !==
        snapshot.sessionCount ||
      restored._count.twoFactorMethods !==
        snapshot.twoFactorMethodCount
    ) {
      throw new Error(
        `OWNER PRESERVATION FAILURE: authentication/security state changed for ${snapshot.email}.`
      );
    }
  }

  console.log("");
console.log("STAGING RESET COMPLETED SUCCESSFULLY");
  console.table(summary);
  console.log("");
  console.log(
    "Owner identities, passwords, status, active sessions, and 2FA methods were preserved."
  );
  console.log(
    "Demo staff use reserved .test emails and are not intended for real email-2FA login."
  );
}

async function main() {
  const validateOnly =
    process.argv.includes(
      "--validate-only"
    );
  const dryRun =
    process.argv.includes(
      "--dry-run"
    );

  if (validateOnly) {
    validateSeedPlan();
    return;
  }

  if (dryRun) {
    await printDryRun();
    return;
  }

  await performReset();
}

// Importing this utility for isolated regression tests must never execute a reset.
export { main as runStagingReset, prisma as resetPrisma };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(
        "Staging reset failed:",
        error
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
