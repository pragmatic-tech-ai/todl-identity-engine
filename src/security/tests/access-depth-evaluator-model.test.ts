import { test } from "node:test";
import assert from "node:assert/strict";
import { Principal, PrincipalKind } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";
import { AccessDepthEvaluator } from "../access-depth-evaluator.js";
import { TenantSecurityModel } from "../tenant-security-model.js";

class ModelFixture
{
    public static readonly PrincipalId = "p1";
    public static readonly Sales = "sales";
    public static readonly North = "north";
    public static readonly TeamA = "team-a";
    public static readonly TeamB = "team-b";

    public static Config(): ISecurityModelConfig
    {
        return {
            businessUnits: [{ id: "root", name: "Root" }, { id: ModelFixture.Sales, name: "Sales", parent: "root" }, { id: ModelFixture.North, name: "North", parent: "root" }],
            teams: [{ id: ModelFixture.TeamA, name: "A", owningBusinessUnit: ModelFixture.North }, { id: ModelFixture.TeamB, name: "B" }],
            membership: { claimsMapping: [], overrides: [{ principalId: ModelFixture.PrincipalId, homeBusinessUnit: ModelFixture.Sales, teams: [ModelFixture.TeamA, ModelFixture.TeamB] }] },
            ownershipRules: [],
        };
    }

    public static Principal(id: string): Principal
    {
        return new Principal(id, "t1", PrincipalKind.User, new Map(), []);
    }
}

test("Model exposes the security model the evaluator decides with", () =>
{
    const evaluator = AccessDepthEvaluator.FromConfig(ModelFixture.Config());
    assert.ok(evaluator.Model() instanceof TenantSecurityModel);
    assert.equal(evaluator.Model().Hierarchy().Has(ModelFixture.North), true);
    assert.equal(evaluator.Model(), evaluator.Model(), "the same instance, not a re-parse");
});

test("ReachOf is the home unit plus each team's owning unit", () =>
{
    const evaluator = AccessDepthEvaluator.FromConfig(ModelFixture.Config());
    assert.deepEqual([...evaluator.ReachOf(ModelFixture.Principal(ModelFixture.PrincipalId))].sort(), [ModelFixture.North, ModelFixture.Sales]);
    assert.deepEqual([...evaluator.ReachOf(ModelFixture.Principal("stranger"))], ["root"], "no membership: the root unit");
});

test("DenyAll reaches only the root unit", () =>
{
    assert.deepEqual([...AccessDepthEvaluator.DenyAll().ReachOf(ModelFixture.Principal(ModelFixture.PrincipalId))], ["root"]);
});
