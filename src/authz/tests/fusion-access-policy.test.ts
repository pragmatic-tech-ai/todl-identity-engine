import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph, Builder, Repository } from "@pragmatic-tech-ai/todl";
import {
    AccessContext, Action, Grant, Principal, PrincipalKind, ResourceKind, ResourceRef, Role, Tenant, TenantKind,
} from "@pragmatic-tech-ai/todl-identity";
import type { EntityView } from "@pragmatic-tech-ai/todl-identity";
import { PolicyCatalog } from "../../policy/policy-catalog.js";
import { FusionAccessPolicy } from "../fusion-access-policy.js";

class FusionFixture
{
    public static readonly Concept = "shop.Customer";
    public static readonly Order = "shop.Order";
    public static readonly TenantId = "t1";

    public static Catalog(): PolicyCatalog
    {
        const predicate = { kind: 2, op: 0, left: { kind: 0, root: 1, member: "region" }, right: { kind: 1, value: "eu" } };
        const rules = JSON.stringify([{ effect: "allow", action: "read", predicate }]);
        const graph = new Graph();
        const builder = new Builder(graph);
        builder.defineConcept(FusionFixture.Concept);
        builder.definePolicy(`${FusionFixture.Concept}@policy`, FusionFixture.Concept, rules);
        builder.commit();
        return PolicyCatalog.FromRepository(new Repository(graph));
    }

    public static Principal(): Principal
    {
        return new Principal("u1", FusionFixture.TenantId, PrincipalKind.User, new Map(), []);
    }

    public static Tenant(): Tenant
    {
        return new Tenant(FusionFixture.TenantId, TenantKind.Saas, "Acme");
    }

    public static Entity(region: string | undefined): EntityView
    {
        return { Member: (n: string) => (n === "region" ? region : undefined) };
    }
}

test("FusionAccessPolicy compiles entity filters per concept and action", () =>
{
    const policy = new FusionAccessPolicy(FusionFixture.Catalog());
    const ctx = new AccessContext(FusionFixture.Principal(), FusionFixture.Tenant(), [], policy);
    const filter = policy.EntityFilterFor(ctx, Action.Read, FusionFixture.Concept);
    assert.equal(filter.Matches(FusionFixture.Entity("eu")), true);
    assert.equal(filter.Matches(FusionFixture.Entity("us")), false);
    assert.equal(policy.EntityFilterFor(ctx, Action.Read, FusionFixture.Order).Matches(FusionFixture.Entity(undefined)), true);
    assert.equal(policy.EntityFilterFor(ctx, Action.Delete, FusionFixture.Concept).Matches(FusionFixture.Entity(undefined)), true);
});

test("FusionAccessPolicy.Decide delegates to the deny-by-default resource policy", () =>
{
    const policy = new FusionAccessPolicy(FusionFixture.Catalog());
    const model = new ResourceRef(ResourceKind.Model, FusionFixture.TenantId, ["p1", "m1"]);
    const grant = new Grant("u1", Role.Editor, new ResourceRef(ResourceKind.Project, FusionFixture.TenantId, ["p1"]));
    const allowed = new AccessContext(FusionFixture.Principal(), FusionFixture.Tenant(), [grant], policy);
    const denied = new AccessContext(FusionFixture.Principal(), FusionFixture.Tenant(), [], policy);
    assert.equal(policy.Decide(allowed, Action.Read, model).Allowed, true);
    assert.equal(policy.Decide(denied, Action.Read, model).Allowed, false);
});
