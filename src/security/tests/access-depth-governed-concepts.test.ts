import { test } from "node:test";
import assert from "node:assert/strict";
import { PrivilegeAction, AccessLevel, OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";
import { AccessDepthEvaluator } from "../access-depth-evaluator.js";

class Fixture
{
    public static readonly Order = "shop.Order";
    public static readonly Invoice = "shop.Invoice";
    public static readonly Owned = "shop.OwnedOnly";
    public static readonly Nowhere = "shop.Nowhere";

    public static Config(): ISecurityModelConfig
    {
        return {
            businessUnits: [{ id: "root", name: "Root" }],
            teams: [],
            membership: { claimsMapping: [], overrides: [] },
            ownershipRules: [{ concept: Fixture.Owned, owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "bu" }, owner: { kind: OwnershipSourceKind.FromField, value: "owner" } }],
            roles: [
                { id: "a", name: "A", privileges: [
                    { action: PrivilegeAction.Read, concept: Fixture.Order, level: AccessLevel.User },
                    { action: PrivilegeAction.Update, concept: Fixture.Invoice, level: AccessLevel.User }] },
                { id: "b", name: "B", privileges: [{ action: PrivilegeAction.Read, concept: Fixture.Order, level: AccessLevel.Organization }] },
            ],
        } as ISecurityModelConfig;
    }
}

test("privilege concepts across actions are governed", () =>
{
    const governed = AccessDepthEvaluator.FromConfig(Fixture.Config()).GovernedConcepts();
    assert.equal(governed.has(Fixture.Order), true);
    assert.equal(governed.has(Fixture.Invoice), true);
});

test("ownership-rule-only concept is governed", () =>
{
    assert.equal(AccessDepthEvaluator.FromConfig(Fixture.Config()).GovernedConcepts().has(Fixture.Owned), true);
});

test("unreferenced concept is not governed", () =>
{
    assert.equal(AccessDepthEvaluator.FromConfig(Fixture.Config()).GovernedConcepts().has(Fixture.Nowhere), false);
});

test("DenyAll governs nothing", () =>
{
    assert.equal(AccessDepthEvaluator.DenyAll().GovernedConcepts().size, 0);
});
