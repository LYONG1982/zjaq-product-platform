import test from "node:test";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { rm, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { AssetStore } from "../../services/mock-api/src/assets";

test("AssetStore computes the completed asset checksum from the stored bytes", async () => {
  const store = new AssetStore();
  try {
    const bytes = await readFile(
      "tests/fixtures/validation/sample-v1.pdf",
    );
    const intent = store.create({
      productId: randomUUID(),
      purpose: "preview",
      fileName: "checksum.pdf",
      contentType: "application/pdf",
      size: bytes.length,
    });
    const request = Object.assign(Readable.from([bytes]), {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.length),
      },
    }) as IncomingMessage;
    await store.put(intent.uploadId, request);
    const result = await store.complete(intent.uploadId);
    assert.equal(result.status, "READY");
    assert.equal(result.size, bytes.length);
    assert.equal(
      result.checksum,
      createHash("sha256").update(bytes).digest("hex"),
    );
    // Confirm the source file still matches the checksum after streaming it.
    const storedHash = createHash("sha256");
    for await (const chunk of createReadStream(store.get(intent.uploadId).path))
      storedHash.update(chunk);
    assert.equal(result.checksum, storedHash.digest("hex"));
  } finally {
    await rm(store.directory, { recursive: true, force: true });
  }
});
