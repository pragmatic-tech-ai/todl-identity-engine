import { test } from "node:test";
import assert from "node:assert/strict";

// Baseline resolution guard: both core packages must resolve from their root
// barrels (compiled dist). This pins the bridge's two file: dependencies and the
// transitive todl-runtime registry dependency. The bridge imports nothing from
// deep subpaths of todl.
import { MetaKind, PolicyPredicateCodec, Repository } from "@pragmatic-tech-ai/todl";
import { ResourceAuthorizationPolicy, Action, Principal } from "@pragmatic-tech-ai/todl-identity";

test("todl root barrel resolves the policy + model surface the bridge needs", () =>
{
    assert.equal(MetaKind.Policy, "policy");
    assert.equal(typeof PolicyPredicateCodec.FromJson, "function");
    assert.equal(typeof Repository, "function");
});

test("todl-identity root barrel resolves the authorization surface the bridge needs", () =>
{
    assert.equal(typeof ResourceAuthorizationPolicy, "function");
    assert.equal(Action.Read, 0);
    assert.equal(typeof Principal, "function");
});
