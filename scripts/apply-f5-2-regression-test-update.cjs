const fs = require("fs");
const path = require("path");

const relativePath = "backend/scripts/test-step1-qa-incident-writes.ts";
const fullPath = path.join(process.cwd(), relativePath);
const original = fs.readFileSync(fullPath, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let source = original.replace(/\r\n/g, "\n");

const before = [
  '        const created = await request("POST", "", createBody);',
  '        assert.equal(created.status, 201, `${roles.join("+")} can create: ${JSON.stringify(created.body)}`);',
  '        const incidentId = created.body.data.id as string;',
  '        const resolved = await request("PATCH", `/${incidentId}/resolve`, { resolutionNotes: "Allowed resolution." });',
  '        assert.equal(resolved.status, 200, `${roles.join("+")} can resolve.`);',
  '        assert.equal(resolved.body.data.status, "RESOLVED");',
  '        const voided = await request("PATCH", `/${incidentId}/void`, { reason: "Allowed void." });',
  '        assert.equal(voided.status, 200, `${roles.join("+")} can void.`);',
  '        assert.equal(voided.body.data.status, "VOIDED");',
  '        const saved = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });',
  '        assert.equal(saved.status, "VOIDED");',
  '        assert.equal(saved.voidReason, "Allowed void.");',
].join("\n");

const after = [
  '        const createdForResolve = await request("POST", "", createBody);',
  '        assert.equal(createdForResolve.status, 201, `${roles.join("+")} can create for resolve: ${JSON.stringify(createdForResolve.body)}`);',
  '        const resolvedIncidentId = createdForResolve.body.data.id as string;',
  '        const resolved = await request("PATCH", `/${resolvedIncidentId}/resolve`, { resolutionNotes: "Allowed resolution." });',
  '        assert.equal(resolved.status, 200, `${roles.join("+")} can resolve.`);',
  '        assert.equal(resolved.body.data.status, "RESOLVED");',
  '',
  '        const rejectedVoid = await request("PATCH", `/${resolvedIncidentId}/void`, { reason: "Resolved incidents must not be voided." });',
  '        assert.equal(rejectedVoid.status, 409, `${roles.join("+")} cannot void a resolved incident.`);',
  '        const savedResolved = await prisma.incident.findUniqueOrThrow({ where: { id: resolvedIncidentId } });',
  '        assert.equal(savedResolved.status, "RESOLVED");',
  '        assert.equal(savedResolved.voidReason, null);',
  '',
  '        const createdForVoid = await request("POST", "", createBody);',
  '        assert.equal(createdForVoid.status, 201, `${roles.join("+")} can create for void: ${JSON.stringify(createdForVoid.body)}`);',
  '        const openIncidentId = createdForVoid.body.data.id as string;',
  '        const voided = await request("PATCH", `/${openIncidentId}/void`, { reason: "Allowed void." });',
  '        assert.equal(voided.status, 200, `${roles.join("+")} can void an open incident.`);',
  '        assert.equal(voided.body.data.status, "VOIDED");',
  '        const savedVoided = await prisma.incident.findUniqueOrThrow({ where: { id: openIncidentId } });',
  '        assert.equal(savedVoided.status, "VOIDED");',
  '        assert.equal(savedVoided.voidReason, "Allowed void.");',
].join("\n");

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
