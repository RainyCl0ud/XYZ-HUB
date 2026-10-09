/// <reference types="node" />

import assert from "node:assert/strict";

import {
  readFile,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

import {
  deriveStrikeStatus,
} from "../src/services/strike-management.js";

async function read(
  path:
    string
) {
  return readFile(
    resolve(
      process.cwd(),
      path
    ),
    "utf8"
  );
}

async function main() {
  console.log(
    "Starting Strike domain foundation tests..."
  );

  const [
    schema,
    migration,
    escalationMigration,
    strikeService,
    strikeRoutes,
    reasonService,
    reasonRoutes,
    strikeAudit,
    qaAudit,
    index,
  ] =
    await Promise.all([
      read(
        "prisma/schema.prisma"
      ),
      read(
        "prisma/migrations/20261004151000_add_strike_domain_foundation/migration.sql"
      ),
      read(
        "prisma/migrations/20261005063000_qa_strike_escalation_foundation/migration.sql"
      ),
      read(
        "src/services/strike-management.ts"
      ),
      read(
        "src/routes/strikes.ts"
      ),
      read(
        "src/services/strike-reasons.ts"
      ),
      read(
        "src/routes/strike-reasons.ts"
      ),
      read(
        "src/middleware/strike-audit-http.ts"
      ),
      read(
        "src/middleware/qa-audit-http.ts"
      ),
      read(
        "src/index.ts"
      ),
    ]);

  const auditPresentation =
    await read(
      "src/services/audit-presentation.ts"
    );

  const strikeModel =
    schema.match(
      /model Strike \{[\s\S]*?\n\}/
    )?.[0];

  assert.ok(
    strikeModel,
    "Strike model must exist."
  );

  assert.ok(
    strikeModel.includes(
      "sourceIncidentId String? @unique"
    ),
    "Strike may keep one optional QA Incident traceability reference."
  );

  assert.ok(
    escalationMigration.includes(
      'ADD COLUMN "sourceIncidentId" TEXT'
    )
  );

  assert.equal(
    /REFERENCES "Incident"/.test(
      escalationMigration
    ),
    false,
    "QA traceability must not create a lifecycle foreign key."
  );

  assert.ok(
    escalationMigration.includes(
      "No existing QA Incident is converted into a Strike."
    )
  );

  console.log(
    "✓ Strike and QA remain separate lifecycles with optional one-way traceability"
  );

  for (
    const permission of [
      "strikes.view",
      "strikes.issue",
      "strikes.void",
      "strikes.configure",
    ]
  ) {
    assert.ok(
      migration.includes(
        permission
      ),
      `Migration must include ${permission}`
    );
  }

  console.log(
    "✓ Strike permission catalog is present in the migration"
  );

  assert.ok(
    strikeService.includes(
      "canAccessTeamGroup"
    )
  );

  assert.ok(
    strikeService.includes(
      "canAssignRole"
    )
  );

  assert.ok(
    strikeService.includes(
      "canAccessModel"
    )
  );

  assert.ok(
    strikeService.includes(
      "CANNOT_STRIKE_SELF"
    )
  );

  assert.ok(
    strikeService.includes(
      "TARGET_NOT_ELIGIBLE"
    )
  );

  assert.ok(
    strikeService.includes(
      "TransactionIsolationLevel"
    )
  );

  assert.ok(
    strikeService.includes(
      "isOwner("
    )
  );

  console.log(
    "✓ Strike service retains hierarchy, rank, creator and Owner protections"
  );

  assert.ok(
    strikeRoutes.includes(
      '"strikes.view"'
    )
  );

  assert.ok(
    strikeRoutes.includes(
      '"strikes.issue"'
    )
  );

  assert.ok(
    strikeRoutes.includes(
      '"strikes.void"'
    )
  );

  for (
    const permission of [
      "strikes.reasons.view",
      "strikes.reasons.create",
      "strikes.reasons.edit",
      "strikes.reasons.archive",
    ]
  ) {
    assert.ok(
      reasonRoutes.includes(
        `"${permission}"`
      ),
      `Strike Reason routes must use ${permission}`
    );

    assert.ok(
      reasonService.includes(
        `"${permission}"`
      ),
      `Strike Reason service must use ${permission}`
    );
  }

  assert.ok(
    reasonService.includes(
      '"strikes.issue"'
    )
  );

  console.log(
    "✓ Strike and Strike Reason endpoints use the current granular Strike permissions"
  );

  for (
    const forbidden of [
      "requireQa",
      "qa-access",
      "chatterId",
      "ruleId",
    ]
  ) {
    assert.equal(
      strikeService.includes(
        forbidden
      ),
      false,
      `Strike service must not contain ${forbidden}`
    );

    assert.equal(
      reasonService.includes(
        forbidden
      ),
      false,
      `Strike Reason service must not contain ${forbidden}`
    );
  }

  console.log(
    "✓ New Strike services contain no QA authorization dependency"
  );

  assert.ok(
    index.includes(
      '"/api/strikes"'
    )
  );

  assert.ok(
    index.includes(
      '"/api/strike-reasons"'
    )
  );

  assert.ok(
    index.includes(
      "strikeAuditHttpMiddleware"
    )
  );

  console.log(
    "✓ independent Strike routes and audit middleware are mounted"
  );

  for (
    const action of [
      "strike.issued",
      "strike.voided",
      "strike.reason.created",
      "strike.reason.updated",
      "strike.reason.archived",
      "strike.reason.reactivated",
      "strike.ladder.version_created",
    ]
  ) {
    assert.ok(
      strikeAudit.includes(
        action
      ),
      `Strike audit must classify ${action}`
    );

    assert.ok(
      auditPresentation.includes(
        `"${action}"`
      ),
      `Audit presentation must label ${action}`
    );
  }

  assert.equal(
    qaAudit.includes(
      "qa.strike_ladder.version_created"
    ),
    false
  );

  assert.ok(
    auditPresentation.includes(
      '"qa.strike_ladder.version_created"'
    ),
    "Historical QA Strike Ladder audit events must remain presentable."
  );

  console.log(
    "✓ Strike audit events are owned by the Strike domain, not QA"
  );

  console.log(
    "✓ historical Strike Ladder audit presentation remains backward-compatible"
  );

  const now =
    new Date(
      "2026-10-05T00:00:00.000Z"
    );

  assert.equal(
    deriveStrikeStatus(
      {
        expiresAt:
          new Date(
            "2026-10-06T00:00:00.000Z"
          ),

        voidedAt:
          null,
      },
      now
    ),
    "ACTIVE"
  );

  assert.equal(
    deriveStrikeStatus(
      {
        expiresAt:
          new Date(
            "2026-10-04T00:00:00.000Z"
          ),

        voidedAt:
          null,
      },
      now
    ),
    "EXPIRED"
  );

  assert.equal(
    deriveStrikeStatus(
      {
        expiresAt:
          new Date(
            "2026-10-06T00:00:00.000Z"
          ),

        voidedAt:
          new Date(
            "2026-10-04T12:00:00.000Z"
          ),
      },
      now
    ),
    "VOIDED"
  );

  console.log(
    "✓ Strike status derives ACTIVE / EXPIRED / VOIDED without a mutable status column"
  );

  console.log("");
  console.log(
    "All Strike domain foundation tests passed."
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      error
    );

    process.exitCode =
      1;
  }
);