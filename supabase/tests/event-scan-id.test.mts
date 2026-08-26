// Regression tests for the offline queue's idempotency key.
//
// This exists because of a real failure at a door: the scan id was composed as
// `${eventId}-${token}-${scannedAt}` — 83 characters against the schema's
// max(64) — so EVERY sync was rejected with "Too big: expected string to have
// <= 64 characters" and not one scan ever reached the database.
//
// The generator and the schema live in different files, and nothing tied them
// together. That is what this test is: the tie.

import assert from "node:assert/strict";
import test from "node:test";
import { newScanId } from "../../src/lib/event-scan-queue.ts";
import { eventScanBatchSchema } from "../../src/lib/validations/event-schema.ts";

const EVENT_ID = "0e3f1a2b-4c5d-6e7f-8a9b-0c1d2e3f4a5b";
const TOKEN = "H0123456789ABCDEF0123";

function batchWith(clientScanId: string) {
  return {
    event_id: EVENT_ID,
    scans: [
      {
        client_scan_id: clientScanId,
        token: TOKEN,
        scanned_at: "2026-03-02T09:00:00+08:00",
      },
    ],
  };
}

test("a generated scan id validates against the submit schema", () => {
  const result = eventScanBatchSchema.safeParse(batchWith(newScanId()));
  assert.equal(result.success, true, result.success ? "" : result.error.issues[0].message);
});

test("generated ids are unique, so two scans never collide in the queue", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newScanId()));
  assert.equal(ids.size, 500);
});

test("the id that broke production is still rejected", () => {
  // Pinned literally: if anyone reintroduces a composed id, this fails here
  // rather than at a venue.
  const composed = `${EVENT_ID}-${TOKEN}-2026-03-02T01:00:00.000Z`;
  assert.ok(composed.length > 64, "the old format really was oversized");
  assert.equal(eventScanBatchSchema.safeParse(batchWith(composed)).success, false);
});

test("the real token shape fits the schema", () => {
  assert.ok(TOKEN.length <= 64);
  assert.equal(eventScanBatchSchema.safeParse(batchWith(newScanId())).success, true);
});
