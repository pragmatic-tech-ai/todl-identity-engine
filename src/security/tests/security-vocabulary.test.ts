import { test } from "node:test";
import assert from "node:assert/strict";

import { SecurityAction, SecurityDepth, BaseRoleName } from "@pragmatic-tech-ai/todl";
import { PrivilegeAction, AccessLevel, BaseRole } from "@pragmatic-tech-ai/todl-identity";
import { SecurityVocabulary } from "../security-vocabulary.js";

test("every SecurityAction maps to the PrivilegeAction with the same value and back", () =>
{
    assert.deepEqual([...Object.values(SecurityAction)].sort(), [...Object.values(PrivilegeAction)].sort());
    for (const a of Object.values(SecurityAction)) assert.equal(SecurityVocabulary.ActionOf(a), a as string);
});

test("every SecurityDepth maps to the AccessLevel with the same value and back", () =>
{
    assert.deepEqual([...Object.values(SecurityDepth)].sort(), [...Object.values(AccessLevel)].sort());
    for (const d of Object.values(SecurityDepth)) assert.equal(SecurityVocabulary.DepthOf(d), d as string);
});

test("an unmapped value throws", () =>
{
    assert.throws(() => SecurityVocabulary.ActionOf("write" as SecurityAction));
});

test("BaseRole values equal BaseRoleName values", () =>
{
    assert.deepEqual([...Object.values(BaseRole)].sort(), [...Object.values(BaseRoleName)].sort());
});
