import test from "node:test";
import assert from "node:assert/strict";
import { parseCloudOperationArguments as parse, parseOfflinePublicIdArguments as offline } from "../../services/api/src/operations-arguments";

test("cloud operation argument validation rejects missing, ambiguous, unknown or unsafe commands before client creation", () => {
  assert.equal(parse([]).apply, false);
  assert.equal(parse(["migrate-public-ids"]).apply, false);
  for (const args of [
    ["migrate-public-ids", "--apply", "--environment", "example", "--file", "--backup", "backup.json"],
    ["migrate-public-ids", "--apply", "--environment", "example", "--file", "plan.json"],
    ["migrate-public-ids", "--apply", "--environment", "example", "--file", "plan.json", "--backup"],
    ["migrate-public-ids", "--environment", "one", "--environment", "two"],
    ["backup", "--apply", "--environment", "example", "--file", "backup.json", "--dry-run"],
    ["restore", "--apply", "--environment", "example", "--file", "backup.json"],
    ["plan", "--apply"],
    ["initialize", "--apply"],
  ]) assert.throws(() => parse(args));
  const accepted = parse(["migrate-public-ids", "--apply", "--environment", "isolated-example", "--file", "plan.json", "--backup", "backup.json"]);
  assert.equal(accepted.action, "migrate-public-ids"); assert.equal(accepted.apply, true);
  assert.equal(accepted.value("--environment"), "isolated-example");
  assert.equal(accepted.value("--backup"), "backup.json");
  assert.throws(() => accepted.value("--missing"), /required/);
});


test("offline public UUID planner validates distinct path flags without creating a cloud client", () => {
  assert.deepEqual(offline(["--output", "plan.json", "--backup", "backup.json"]), { backupPath: "backup.json", output: "plan.json" });
  for (const args of [
    ["--backup", "--output", "--output", "plan.json"],
    ["--backup", "backup.json", "--backup", "other.json"],
    ["--backup", "backup.json", "--unknown", "plan.json"],
    ["--backup", "backup.json", "--output"],
  ]) assert.throws(() => offline(args), /用法/);
});
