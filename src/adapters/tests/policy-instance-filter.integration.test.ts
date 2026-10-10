import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository, toJSON, ModelDataSource } from "@pragmatic-tech-ai/todl";
import type { TodlDocument } from "@pragmatic-tech-ai/todl";
import { AccessContext, Action, Principal, PrincipalKind, Tenant, TenantKind } from "@pragmatic-tech-ai/todl-identity";
import { PolicyCatalog } from "../../policy/policy-catalog.js";
import { FusionAccessPolicy } from "../../authz/fusion-access-policy.js";
import { PolicyAccessInstanceFilter } from "../policy-instance-filter.js";

class FilterFixture
{
    public static readonly Concept = "account";
    public static readonly Region = "region";
    public static readonly TenantId = "t1";

    public Catalog!: PolicyCatalog;
    public Doc!: TodlDocument;

    public static Build(): FilterFixture
    {
        const fixture = new FilterFixture();
        const r = new Repository();
        const b = r.builder();
        b.definePrimitive("string");
        b.defineConcept(FilterFixture.Concept);
        b.addField(FilterFixture.Concept, FilterFixture.Region, "string");
        const rows: [string, string][] = [["acme", "eu"], ["globex", "us"], ["initech", "eu"]];
        for (const [id, region] of rows)
        {
            b.assertInstance(FilterFixture.Concept, id);
            b.setField(id, FilterFixture.Region, region);
        }
        const predicate = { kind: 2, op: 0, left: { kind: 0, root: 1, member: FilterFixture.Region }, right: { kind: 1, value: "eu" } };
        const rulesJson = JSON.stringify([{ effect: "allow", action: "read", predicate }]);
        b.definePolicy(`${FilterFixture.Concept}@policy`, FilterFixture.Concept, rulesJson);
        b.commit();
        fixture.Catalog = PolicyCatalog.FromRepository(r);
        fixture.Doc = toJSON(r);
        return fixture;
    }
}

class FilterSource extends ModelDataSource
{
    public constructor(doc: TodlDocument)
    {
        super();
        this.modelName = "filtertest";
        this.modelVersion = "0.0.0";
        this.loadDocument(doc);
    }
}

test("policy filter gates Instances and entity(id) on a real ModelDataSource; unset restores all", () =>
{
    const fixture = FilterFixture.Build();
    const policy = new FusionAccessPolicy(fixture.Catalog);
    const principal = new Principal("u1", FilterFixture.TenantId, PrincipalKind.User, new Map(), []);
    const tenant = new Tenant(FilterFixture.TenantId, TenantKind.Saas, "Acme");
    const context = new AccessContext(principal, tenant, [], policy);
    const source = new FilterSource(fixture.Doc);
    assert.ok(source.entity("globex") !== undefined);

    source.UseInstanceFilter(new PolicyAccessInstanceFilter(policy, context, Action.Read));
    assert.deepEqual(source.Instances(FilterFixture.Concept).map((e) => e.id).sort(), ["acme", "initech"]);
    assert.equal(source.entity("globex"), undefined);
    assert.ok(source.entity("acme") !== undefined);

    source.UseInstanceFilter(undefined);
    assert.equal(source.Instances(FilterFixture.Concept).length, 3);
});

class TwoConceptFixture
{
    public static readonly Account = "account";
    public static readonly Order = "order";
    public static readonly Region = "region";
    public static readonly Status = "status";
    public static readonly Open = "open";

    public static Build(): { Catalog: PolicyCatalog; Doc: TodlDocument }
    {
        const r = new Repository();
        const b = r.builder();
        b.definePrimitive("string");
        TwoConceptFixture.Define(b, TwoConceptFixture.Account, TwoConceptFixture.Region, "eu",
            [["acme", "eu"], ["globex", "us"], ["initech", "eu"]]);
        TwoConceptFixture.Define(b, TwoConceptFixture.Order, TwoConceptFixture.Status, TwoConceptFixture.Open,
            [["o1", "open"], ["o2", "closed"], ["o3", "open"]]);
        b.commit();
        return { Catalog: PolicyCatalog.FromRepository(r), Doc: toJSON(r) };
    }

    private static Define(b: ReturnType<Repository["builder"]>, concept: string, field: string, allowed: string, rows: [string, string][]): void
    {
        b.defineConcept(concept);
        b.addField(concept, field, "string");
        for (const [id, value] of rows)
        {
            b.assertInstance(concept, id);
            b.setField(id, field, value);
        }
        const predicate = { kind: 2, op: 0, left: { kind: 0, root: 1, member: field }, right: { kind: 1, value: allowed } };
        b.definePolicy(`${concept}@policy`, concept, JSON.stringify([{ effect: "allow", action: "read", predicate }]));
    }
}

test("one filter over two concepts with different policies does not bleed the memoized predicate", () =>
{
    const fixture = TwoConceptFixture.Build();
    const policy = new FusionAccessPolicy(fixture.Catalog);
    const principal = new Principal("u1", FilterFixture.TenantId, PrincipalKind.User, new Map(), []);
    const tenant = new Tenant(FilterFixture.TenantId, TenantKind.Saas, "Acme");
    const context = new AccessContext(principal, tenant, [], policy);
    const source = new FilterSource(fixture.Doc);
    source.UseInstanceFilter(new PolicyAccessInstanceFilter(policy, context, Action.Read));

    const ids = (concept: string): string[] => source.Instances(concept).map((e) => e.id).sort();
    assert.deepEqual(ids(TwoConceptFixture.Account), ["acme", "initech"]);
    assert.deepEqual(ids(TwoConceptFixture.Order), ["o1", "o3"]);
    assert.deepEqual(ids(TwoConceptFixture.Account), ["acme", "initech"]);
    assert.deepEqual(ids(TwoConceptFixture.Order), ["o1", "o3"]);
});
