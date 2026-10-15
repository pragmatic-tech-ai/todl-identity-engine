import { test } from "node:test";
import assert from "node:assert/strict";
import type { IInstanceView } from "@pragmatic-tech-ai/todl";
import { Principal, PrincipalKind, PrivilegeAction, AccessLevel, OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";
import { AccessDepthEvaluator } from "../access-depth-evaluator.js";
import { AccessDepthInstanceFilter } from "../access-depth-instance-filter.js";
import { CompositeInstanceFilter } from "../composite-instance-filter.js";
import { AllowAllInstanceFilter } from "../allow-all-instance-filter.js";

class DepthFilterFixture
{
    public static readonly Concept = "Widget";

    public static AllowingModel(): ISecurityModelConfig
    {
        return {
            businessUnits: [{ id: "root", name: "Root" }],
            teams: [],
            membership: { claimsMapping: [], overrides: [{ principalId: "p1", homeBusinessUnit: "root", teams: [] }] },
            ownershipRules: [{ concept: DepthFilterFixture.Concept, owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "root" } }],
            roles: [{ id: "reader", name: "Reader", privileges: [{ action: PrivilegeAction.Read, concept: DepthFilterFixture.Concept, level: AccessLevel.Organization }] }],
            roleAssignment: { claimsMapping: [], overrides: [{ principalId: "p1", roles: ["reader"] }], teamRoles: [] },
        };
    }

    public static Principal(): Principal
    {
        return new Principal("p1", "t1", PrincipalKind.User, new Map(), []);
    }

    public static View(): IInstanceView
    {
        return { Concept: DepthFilterFixture.Concept, Field: () => undefined };
    }
}

test("DenyAll denies a principal an equivalent FromConfig would allow", () =>
{
    const allow = AccessDepthEvaluator.FromConfig(DepthFilterFixture.AllowingModel());
    assert.equal(allow.Allows(DepthFilterFixture.Principal(), PrivilegeAction.Read, DepthFilterFixture.View()), true);
    const deny = AccessDepthEvaluator.DenyAll();
    assert.equal(deny.Allows(DepthFilterFixture.Principal(), PrivilegeAction.Read, DepthFilterFixture.View()), false);
});

test("AccessDepthInstanceFilter.Keep equals evaluator.Allows for the fixed action", () =>
{
    const allow = new AccessDepthInstanceFilter(AccessDepthEvaluator.FromConfig(DepthFilterFixture.AllowingModel()), DepthFilterFixture.Principal(), PrivilegeAction.Read);
    assert.equal(allow.Keep(DepthFilterFixture.View()), true);
    const deny = new AccessDepthInstanceFilter(AccessDepthEvaluator.DenyAll(), DepthFilterFixture.Principal(), PrivilegeAction.Read);
    assert.equal(deny.Keep(DepthFilterFixture.View()), false);
});

test("CompositeInstanceFilter is deny-wins and keeps on empty", () =>
{
    const keep = new AllowAllInstanceFilter();
    const drop = new AccessDepthInstanceFilter(AccessDepthEvaluator.DenyAll(), DepthFilterFixture.Principal(), PrivilegeAction.Read);
    assert.equal(new CompositeInstanceFilter([keep, keep]).Keep(DepthFilterFixture.View()), true);
    assert.equal(new CompositeInstanceFilter([keep, drop]).Keep(DepthFilterFixture.View()), false);
    assert.equal(new CompositeInstanceFilter([]).Keep(DepthFilterFixture.View()), true);
});

test("AllowAllInstanceFilter keeps everything", () =>
{
    assert.equal(new AllowAllInstanceFilter().Keep(DepthFilterFixture.View()), true);
});
