import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository, PolicyNodeKind, PolicyRefRoot, PolicyCompareOp } from "@pragmatic-tech-ai/todl";
import type { IInstanceView, PolicyPredicate } from "@pragmatic-tech-ai/todl";
import { AccessContext, Action, Principal, PrincipalKind, Tenant, TenantKind } from "@pragmatic-tech-ai/todl-identity";
import { PolicyCatalog } from "../policy-catalog.js";
import { FusionAccessPolicy } from "../../authz/fusion-access-policy.js";
import { IdentityEnforcement } from "../../enforcement/identity-enforcement.js";

class Fixture
{
    public static readonly Concept = "shop.Customer";
    public static readonly Other = "shop.Order";
    public static readonly Field = "status";
    public static readonly Restricted = "restricted";
    public static readonly Open = "open";
    public static readonly Admins = "admins";
    public static readonly TenantId = "t1";
    public static readonly EffectDeny = "deny";
    public static readonly EffectAllow = "allow";
    public static readonly ActionRead = "read";

    public static DenyRestricted(): PolicyPredicate
    {
        return {
            kind: PolicyNodeKind.Compare,
            op: PolicyCompareOp.Eq,
            left: { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Entity, member: Fixture.Field },
            right: { kind: PolicyNodeKind.Literal, value: Fixture.Restricted },
        };
    }

    public static InAdmins(): PolicyPredicate
    {
        return {
            kind: PolicyNodeKind.Membership,
            collection: { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Principal, member: "groups" },
            item: { kind: PolicyNodeKind.Literal, value: Fixture.Admins },
        };
    }

    public static RulesJson(): string
    {
        return JSON.stringify([
            { effect: Fixture.EffectDeny, action: Fixture.ActionRead, predicate: Fixture.DenyRestricted() },
            { effect: Fixture.EffectAllow, action: Fixture.ActionRead, predicate: Fixture.InAdmins() },
        ]);
    }

    public static DenyOnlyJson(): string
    {
        return JSON.stringify([{ effect: Fixture.EffectDeny, action: Fixture.ActionRead, predicate: Fixture.DenyRestricted() }]);
    }

    public static FromRepo(rulesJson: string): PolicyCatalog
    {
        const repo = new Repository();
        const b = repo.builder();
        b.definePrimitive("string");
        b.defineConcept(Fixture.Concept);
        b.addField(Fixture.Concept, Fixture.Field, "string");
        b.definePolicy(`${Fixture.Concept}@policy`, Fixture.Concept, rulesJson);
        b.commit();
        return PolicyCatalog.FromRepository(repo);
    }

    public static FromSetting(rulesJson: string): PolicyCatalog
    {
        return PolicyCatalog.FromPolicies([{ concept: Fixture.Concept, rulesJson }]);
    }

    public static Context(catalog: PolicyCatalog, groups: string[]): AccessContext
    {
        const principal = new Principal("u1", Fixture.TenantId, PrincipalKind.User, new Map(), groups);
        const tenant = new Tenant(Fixture.TenantId, TenantKind.Saas, "Acme");
        return new AccessContext(principal, tenant, [], new FusionAccessPolicy(catalog));
    }

    public static View(status: string): IInstanceView
    {
        return { Concept: Fixture.Concept, Field: (n: string) => (n === Fixture.Field ? status : undefined) };
    }

    public static Keep(catalog: PolicyCatalog, groups: string[], status: string): boolean
    {
        return IdentityEnforcement.Over(catalog, Fixture.Context(catalog, groups), Action.Read)
            .InstanceFilter().Keep(Fixture.View(status));
    }
}

test("FromPolicies + Over: deny rule drops restricted instances", () =>
{
    const catalog = Fixture.FromSetting(Fixture.DenyOnlyJson());
    assert.equal(Fixture.Keep(catalog, [], Fixture.Restricted), false);
    assert.equal(Fixture.Keep(catalog, [], Fixture.Open), true);
});

test("FromPolicies matches FromRepository for the same rules", () =>
{
    const fromRepo = Fixture.FromRepo(Fixture.RulesJson());
    const fromSetting = Fixture.FromSetting(Fixture.RulesJson());
    for (const groups of [[], [Fixture.Admins]])
    {
        for (const status of [Fixture.Restricted, Fixture.Open])
        {
            assert.equal(Fixture.Keep(fromSetting, groups, status), Fixture.Keep(fromRepo, groups, status));
        }
    }
});

test("FromPolicies with no rules is allow-all", () =>
{
    const catalog = PolicyCatalog.FromPolicies([]);
    assert.equal(catalog.RulesFor(Fixture.Other).length, 0);
    assert.equal(Fixture.Keep(catalog, [], Fixture.Restricted), true);
});
