import { test } from "node:test";
import assert from "node:assert/strict";

// Resolution guard: the three sibling packages must resolve from compiled dist, and
// the graph package is the same module instance TODL links (one Predicate class).
import { AccessScope, Predicate } from "@pragmatic-tech-ai/graph";
import { ShareGrantScope } from "@pragmatic-tech-ai/todl/engine";
import { BaseRole } from "@pragmatic-tech-ai/todl-identity";

test("graph resolves AccessScope and Predicate", () =>
{
    assert.equal(typeof AccessScope, "function");
    assert.equal(typeof Predicate, "function");
});

test("todl engine subpath resolves ShareGrantScope", () =>
{
    assert.ok(ShareGrantScope !== undefined);
});

test("todl-identity resolves BaseRole", () =>
{
    assert.ok(Object.values(BaseRole).length > 0);
});
