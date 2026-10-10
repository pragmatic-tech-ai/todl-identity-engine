import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph, Builder, Repository } from "@pragmatic-tech-ai/todl";
import { PolicyCatalog, PolicyEffect, PolicyActionKind } from "../policy-catalog.js";

class PolicyCatalogFixture
{
    public static readonly Concept = "shop.Customer";
    public static readonly Order = "shop.Order";

    public static Predicate(region: string): object
    {
        return { kind: 2, op: 0, left: { kind: 0, root: 1, member: "region" }, right: { kind: 1, value: region } };
    }

    public static Build(rulesJson: string): Repository
    {
        const graph = new Graph();
        const builder = new Builder(graph);
        builder.defineConcept(PolicyCatalogFixture.Concept);
        builder.definePolicy(`${PolicyCatalogFixture.Concept}@policy`, PolicyCatalogFixture.Concept, rulesJson);
        builder.commit();
        return new Repository(graph);
    }
}

test("PolicyCatalog parses stored rules per concept", () =>
{
    const rulesJson = JSON.stringify([
        { effect: "allow", action: "read", predicate: PolicyCatalogFixture.Predicate("eu") },
        { effect: "deny", action: "read", predicate: PolicyCatalogFixture.Predicate("us") },
    ]);
    const catalog = PolicyCatalog.FromRepository(PolicyCatalogFixture.Build(rulesJson));
    const rules = catalog.RulesFor(PolicyCatalogFixture.Concept);
    assert.equal(rules.length, 2);
    assert.equal(rules[0]!.Effect, PolicyEffect.Allow);
    assert.equal(rules[0]!.Action, PolicyActionKind.Read);
    assert.equal(rules[0]!.Predicate.kind, 2);
    assert.equal(rules[1]!.Effect, PolicyEffect.Deny);
    assert.deepEqual(catalog.RulesFor(PolicyCatalogFixture.Order), []);
    assert.ok(catalog.Concepts().includes(PolicyCatalogFixture.Concept));
});

test("PolicyCatalog fails closed on an unknown effect", () =>
{
    const rulesJson = JSON.stringify([
        { effect: "maybe", action: "read", predicate: PolicyCatalogFixture.Predicate("eu") },
    ]);
    const repo = PolicyCatalogFixture.Build(rulesJson);
    assert.throws(() => PolicyCatalog.FromRepository(repo));
});
