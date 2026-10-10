import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository, QueryCompareOp } from "@pragmatic-tech-ai/todl";
import type { IInstanceView } from "@pragmatic-tech-ai/todl";
import { AccessContext, Action, Principal, PrincipalKind, Tenant, TenantKind } from "@pragmatic-tech-ai/todl-identity";
import { PolicyCatalog } from "../../policy/policy-catalog.js";
import { FusionAccessPolicy } from "../../authz/fusion-access-policy.js";
import { IdentityEnforcement } from "../identity-enforcement.js";

class EnforcementFixture
{
    public static readonly Customer = "shop.Customer";
    public static readonly Order = "shop.Order";
    public static readonly Region = "region";
    public static readonly TenantId = "t1";

    public static BuildRepository(): Repository
    {
        const repo = new Repository();
        const b = repo.builder();
        b.definePrimitive("string");
        b.defineConcept(EnforcementFixture.Customer);
        b.addField(EnforcementFixture.Customer, EnforcementFixture.Region, "string");
        const predicate = { kind: 2, op: 0, left: { kind: 0, root: 1, member: EnforcementFixture.Region }, right: { kind: 1, value: "eu" } };
        const rulesJson = JSON.stringify([{ effect: "allow", action: "read", predicate }]);
        b.definePolicy(`${EnforcementFixture.Customer}@policy`, EnforcementFixture.Customer, rulesJson);
        b.commit();
        return repo;
    }

    public static Context(repo: Repository): AccessContext
    {
        const principal = new Principal("u1", EnforcementFixture.TenantId, PrincipalKind.User, new Map(), []);
        const tenant = new Tenant(EnforcementFixture.TenantId, TenantKind.Saas, "Acme");
        return new AccessContext(principal, tenant, [], new FusionAccessPolicy(PolicyCatalog.FromRepository(repo)));
    }

    public static View(region: string): IInstanceView
    {
        return { Concept: EnforcementFixture.Customer, Field: (n: string) => (n === EnforcementFixture.Region ? region : undefined) };
    }
}

test("IdentityEnforcement binds instance filter and push-down to one policy", () =>
{
    const repo = EnforcementFixture.BuildRepository();
    const enforcement = IdentityEnforcement.ForRepository(repo, EnforcementFixture.Context(repo), Action.Read);
    const filter = enforcement.InstanceFilter();
    assert.equal(filter.Keep(EnforcementFixture.View("eu")), true);
    assert.equal(filter.Keep(EnforcementFixture.View("us")), false);
    const provider = enforcement.QueryFilterProvider();
    assert.deepEqual(provider.WhereFor(EnforcementFixture.Customer), { All: [{ Field: "region", Op: QueryCompareOp.Eq, Value: "eu" }] });
    assert.equal(provider.WhereFor(EnforcementFixture.Order), undefined);
});
