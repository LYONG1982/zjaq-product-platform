import test from "node:test";
import assert from "node:assert/strict";
import { nextMaterialVersion, validMaterialVersion } from "../../apps/admin/src/versions";

test("material version suggestions increment the current edited version without guessing unknown labels", () => {
  assert.equal(nextMaterialVersion("V01.0"), "V01.1");
  assert.equal(nextMaterialVersion("V01.9"), "V01.10");
  assert.equal(nextMaterialVersion("V01.0", ["V01.1", "V01.3"]), "V01.2");
  assert.equal(nextMaterialVersion("V1.0"), "V1.1");
  assert.equal(nextMaterialVersion("v2.9"), "V2.10");
  assert.equal(nextMaterialVersion("v1"), "V1.1");
  assert.equal(nextMaterialVersion("V1.0", ["v1.1", "V1.2", "V2.3"]), "V1.3");
  assert.equal(nextMaterialVersion("legacy-release"), null);
  assert.equal(validMaterialVersion("V9.20"), true);
  assert.equal(validMaterialVersion("v9.20"), false);
  assert.equal(validMaterialVersion("V9"), false);
});
