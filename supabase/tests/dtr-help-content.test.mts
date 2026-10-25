// The DTR guide's "What to do" steps link straight to the pages they describe.
// A renamed route would leave a guide that sends people to a 404, so every
// link is checked against the app's actual page files.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DTR_FAQ, DTR_STEPS, type DtrAudience } from "../../src/lib/dtr-help-content.ts";

const APP = fileURLToPath(new URL("../../src/app/(dashboard)", import.meta.url));
const AUDIENCES: DtrAudience[] = ["officer", "department", "employee"];

test("every audience has numbered steps with a title and an explanation", () => {
  for (const a of AUDIENCES) {
    assert.ok(DTR_STEPS[a].length >= 3, a);
    for (const s of DTR_STEPS[a]) {
      assert.ok(s.title.length > 0 && s.body.length > 0, `${a}: ${s.title}`);
    }
  }
});

test("every step link points at a page that exists", () => {
  for (const a of AUDIENCES) {
    for (const s of DTR_STEPS[a]) {
      if (!s.href) continue;
      const path = s.href.split("?")[0];
      assert.ok(existsSync(`${APP}${path}/page.tsx`), `${a}: ${s.title} → ${s.href}`);
    }
  }
});

test("the FAQ has questions and answers", () => {
  assert.ok(DTR_FAQ.length >= 6);
  for (const f of DTR_FAQ) assert.ok(f.q.endsWith("?") && f.a.length > 0, f.q);
});
