import { test } from "node:test";
import assert from "node:assert/strict";
import { FederatedModelDataConnector, DataSourceKind, DataSourceAdapterCatalog, QueryCompareOp, ModelDataSource, check, toJSON } from "@pragmatic-tech-ai/todl";
import type { ModelConnectorPlan, TodlDocument } from "@pragmatic-tech-ai/todl";
import { ServiceProvider } from "@pragmatic-tech-ai/todl-runtime";
import { Principal, PrincipalKind, Tenant, TenantKind, Action, AccessContext } from "@pragmatic-tech-ai/todl-identity";
import { PolicyCatalog } from "../../policy/policy-catalog.js";
import { FusionAccessPolicy } from "../../authz/fusion-access-policy.js";
import { IdentityEnforcement } from "../identity-enforcement.js";
import { RecordingAdapterFactory } from "./recording-adapter.js";

class EnforcementSource extends ModelDataSource
{
    public constructor(doc: TodlDocument)
    {
        super();
        this.modelName = "shop";
        this.modelVersion = "1";
        this.loadDocument(doc);
    }
}

class ConnectorHarness
{
    public static readonly Concept = "shop.Customer";
    public static readonly Source = "customers";
    public static readonly Connector = "opsdb";
    public static readonly CustomerId = "customer_id";
    public static readonly Region = "region";
    public static readonly Tier = "tier";
    public static readonly Eu = "eu";
    public static readonly Free = "free";
    public static readonly TenantId = "t1";
    public static readonly InstanceTier = "Instance";
    public static readonly IdSeparator = "#";
    private static readonly Meta = `namespace shop
{
    concept Customer { customer_id : string; region : string; tier : string; }
    identity Customer key storageId;
}`;

    public readonly Factory = new RecordingAdapterFactory(DataSourceKind.Sql);
    public readonly Enforcement: IdentityEnforcement;
    private readonly baseDoc: TodlDocument;

    public constructor()
    {
        const model = check([{ uri: "shop.todl", text: ConnectorHarness.Meta }]).model;
        const b = model.builder();
        b.definePolicy(`${ConnectorHarness.Concept}@policy`, ConnectorHarness.Concept, ConnectorHarness.RulesJson());
        b.commit();
        this.baseDoc = toJSON(model);
        const principal = new Principal("u1", ConnectorHarness.TenantId, PrincipalKind.User, new Map(), []);
        const tenant = new Tenant(ConnectorHarness.TenantId, TenantKind.Saas, "Acme");
        const context = new AccessContext(principal, tenant, [], new FusionAccessPolicy(PolicyCatalog.FromRepository(model)));
        this.Enforcement = IdentityEnforcement.ForRepository(model, context, Action.Read);
        this.Factory.Adapter.Seed(ConnectorHarness.Source, [
            { customer_id: "C1", region: "eu", tier: "paid" },
            { customer_id: "C2", region: "eu", tier: "free" },
            { customer_id: "C3", region: "us", tier: "paid" },
            { customer_id: "C4", region: "eu", tier: null }
        ]);
    }

    private static Rule(effect: string, field: string, value: string): object
    {
        return {
            effect, action: "read",
            predicate: { kind: 2, op: 0, left: { kind: 0, root: 1, member: field }, right: { kind: 1, value } }
        };
    }

    private static RulesJson(): string
    {
        return JSON.stringify([
            ConnectorHarness.Rule("allow", ConnectorHarness.Region, ConnectorHarness.Eu),
            ConnectorHarness.Rule("deny", ConnectorHarness.Tier, ConnectorHarness.Free)
        ]);
    }

    private Plan(): ModelConnectorPlan
    {
        return {
            Model: "shop", Version: "1",
            Connectors: [{ Name: ConnectorHarness.Connector, Kind: DataSourceKind.Sql, Config: {} }],
            Bindings: [{
                Concept: ConnectorHarness.Concept, Connector: ConnectorHarness.Connector, Source: ConnectorHarness.Source,
                IdKey: ConnectorHarness.CustomerId,
                FieldMap: { customer_id: ConnectorHarness.CustomerId, region: ConnectorHarness.Region, tier: ConnectorHarness.Tier },
                Writable: false
            }]
        };
    }

    public async Prepare(pushDown: boolean): Promise<TodlDocument>
    {
        const connector = new FederatedModelDataConnector(this.Plan(), this.baseDoc);
        if (pushDown) connector.UseQueryFilterProvider(this.Enforcement.QueryFilterProvider());
        const services = new ServiceProvider();
        services.registerInstance(DataSourceAdapterCatalog.ServiceKey, new DataSourceAdapterCatalog().Register(this.Factory));
        return connector.Prepare(services);
    }

    public Survivors(doc: TodlDocument): string[]
    {
        const source = new EnforcementSource(doc);
        source.UseInstanceFilter(this.Enforcement.InstanceFilter());
        return source.Instances(ConnectorHarness.Concept).map((e) => e.id.split(ConnectorHarness.IdSeparator).at(-1) ?? e.id).sort();
    }
}

test("only the allow Eq is pushed to the connector; the deny Neq is not", async () =>
{
    const h = new ConnectorHarness();
    const doc = await h.Prepare(true);
    assert.deepEqual(h.Factory.Adapter.Requests.at(-1)!.Where, { All: [{ Field: ConnectorHarness.Region, Op: QueryCompareOp.Eq, Value: ConnectorHarness.Eu }] });
    const pushedIds = doc.nodes
        .filter((n) => n.type === ConnectorHarness.Concept && n.tier === ConnectorHarness.InstanceTier)
        .map((n) => n.storageId).sort();
    assert.deepEqual(pushedIds, ["C1", "C2", "C4"]);
});

test("the in-memory filter is authoritative: deny drops C2, null-tier C4 survives", async () =>
{
    const h = new ConnectorHarness();
    const survived = h.Survivors(await h.Prepare(true));
    assert.deepEqual(survived, ["C1", "C4"]);
});

test("push-on and push-off yield the identical surviving set", async () =>
{
    const on = new ConnectorHarness();
    const off = new ConnectorHarness();
    const survived = on.Survivors(await on.Prepare(true));
    const offDoc = await off.Prepare(false);
    const survivedNoPush = off.Survivors(offDoc);
    assert.equal(off.Factory.Adapter.Requests.at(-1)!.Where, undefined);
    const fetched = offDoc.nodes.filter((n) => n.type === ConnectorHarness.Concept && n.tier === ConnectorHarness.InstanceTier);
    assert.equal(fetched.length, 4);
    assert.deepEqual(survivedNoPush, survived);
});
