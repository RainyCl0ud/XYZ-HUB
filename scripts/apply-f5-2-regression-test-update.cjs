const fs = require("fs");
const path = require("path");

const relativePath = "backend/scripts/test-step1-qa-incident-writes.ts";
const fullPath = path.join(process.cwd(), relativePath);
const original = fs.readFileSync(fullPath, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let source = original.replace(/\r\n/g, "\n");

const before = `        const created = await request("POST", "", createBody);\n        assert.equal(created.status, 201, \`${roles.join("+")} can create: \${JSON.stringify(created.body)}\`);\n        const incidentId = created.body.data.id as string;\n        const resolved = await request("PATCH", \`/\${incidentId}/resolve\`, { resolutionNotes: "Allowed resolution." });\n        assert.equal(resolved.status, 200, \`${roles.join("+")} can resolve.\`);\n        assert.equal(resolved.body.data.status, "RESOLVED");\n        const voided = await request("PATCH", \`/\${incidentId}/void\`, { reason: "Allowed void." });\n        assert.equal(voided.status, 200, \`${roles.join("+")} can void.\`);\n        assert.equal(voided.body.data.status, "VOIDED");\n        const saved = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });\n        assert.equal(saved.status, "VOIDED");\n        assert.equal(saved.voidReason, "Allowed void.");`;

const after = `        const createdForResolve = await request("POST", "", createBody);\n        assert.equal(createdForResolve.status, 201, \`${roles.join("+")} can create for resolve: \${JSON.stringify(createdForResolve.body)}\`);\n        const resolvedIncidentId = createdForResolve.body.data.id as string;\n        const resolved = await request("PATCH", \`/\${resolvedIncidentId}/resolve\`, { resolutionNotes: "Allowed resolution." });\n        assert.equal(resolved.status, 200, \`${roles.join("+")} can resolve.\`);\n        assert.equal(resolved.body.data.status, "RESOLVED");\n\n        const rejectedVoid = await request("PATCH", \`/\${resolvedIncidentId}/void\`, { reason: "Resolved incidents must not be voided." });\n        assert.equal(rejectedVoid.status, 409, \`${roles.join("+")} cannot void a resolved incident.\`);\n        const savedResolved = await prisma.incident.findUniqueOrThrow({ where: { id: resolvedIncidentId } });\n        assert.equal(savedResolved.status, "RESOLVED");\n        assert.equal(savedResolved.voidReason, null);\n\n        const createdForVoid = await request("POST", "", createBody);\n        assert.equal(createdForVoid.status, 201, \`${roles.join("+")} can create for void: \${JSON.stringify(createdForVoid.body)}\`);\n        const openIncidentId = createdForVoid.body.data.id as string;\n        const voided = await request("PATCH", \`/\${openIncidentId}/void\`, { reason: "Allowed void." });\n        assert.equal(voided.status, 200, \`${roles.join("+")} can void an open incident.\`);\n        assert.equal(voided.body.data.status, "VOIDED");\n        const savedVoided = await prisma.incident.findUniqueOrThrow({ where: { id: openIncidentId } });\n        assert.equal(savedVoided.status, "VOIDED");\n        assert.equal(savedVoided.voidReason, "Allowed void.");`;

const count = source.split(before).length - 1;
if (count !== 1) {
  console.error(`F.5.2 expected 1 incident-write regression block, found ${count}`);
  process.exit(1);
}

source = source.replace(before, after);
fs.writeFileSync(fullPath, source.replace(/\n/g, eol), "utf8");
console.log("✓ Incident-write regression now enforces resolved→void = 409.");
console.log("✓ Incident-write regression still verifies OPEN incidents can be voided.");
console.log("F.5.2 regression test update applied successfully.");
