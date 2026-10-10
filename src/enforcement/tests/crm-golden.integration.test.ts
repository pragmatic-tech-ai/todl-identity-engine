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

class CrmSource extends ModelDataSource
{
    public constructor(doc: TodlDocument)
    {
        super();
        this.modelName = "crm";
        this.modelVersion = "1";
        this.loadDocument(doc);
    }
}

class CrmHarness
{
    public static readonly Customer = "crm.Customer";
    public static readonly Order = "crm.Order";
    public static readonly CustomersSource = "customers";
    public static readonly OrdersSource = "orders";
    public static readonly Connector = "crmdb";
    public static readonly CustomerId = "customer_id";
    public static readonly OrderId = "order_id";
    public static readonly Owner = "owner";
    public static readonly Status = "status";
    public static readonly Region = "region";
    public static readonly Tier = "tier";
    public static readonly Eu = "eu";
    public static readonly Us = "us";
    public static readonly Free = "free";
    public static readonly Open = "open";
    public static readonly TenantId = "t1";
    public static readonly IdSeparator = "#";
    private static readonly Meta = `namespace crm
{
    concept Customer { customer_id : string; region : string; tier : string; }
    concept Order { order_id : string; owner : string; status : string; }
    identity Customer key storageId;
    identity Order key storageId;
}`;

    public readonly Factory = new RecordingAdapterFactory(DataSourceKind.Sql);
    public readonly Enforcement: IdentityEnforcement;
    private readonly baseDoc: TodlDocument;

    public constructor(regionClaim: string)
    {
        const model = check([{ uri: "crm.todl", text: CrmHarness.Meta }]).model;
        const b = model.builder();
        b.definePolicy(`${CrmHarness.Customer}@policy`, CrmHarness.Customer, CrmHarness.CustomerRules());
        b.definePolicy(`${CrmHarness.Order}@policy`, CrmHarness.Order, CrmHarness.OrderRules());
        b.commit();
        this.baseDoc = toJSON(model);
        const principal = new Principal("u1", CrmHarness.TenantId, PrincipalKind.User, new Map([[CrmHarness.Region, regionClaim]]), ["sales"]);
        const tenant = new Tenant(CrmHarness.TenantId, TenantKind.Saas, "Acme");
        const context = new AccessContext(principal, tenant, [], new FusionAccessPolicy(PolicyCatalog.FromRepository(model)));
        this.Enforcement = IdentityEnforcement.ForRepository(model, context, Action.Read);
        this.Factory.Adapter.Seed(CrmHarness.CustomersSource, [
            { customer_id: "C1", region: "eu", tier: "paid" },
            { customer_id: "C2", region: "eu", tier: "free" },
            { customer_id: "C3", region: "us", tier: "paid" },
            { customer_id: "C4", region: "eu", tier: null }
        ]);
        this.Factory.Adapter.Seed(CrmHarness.OrdersSource, [
            { order_id: "O1", owner: "C1", status: "open" },
            { order_id: "O2", owner: "C3", status: "closed" },
            { order_id: "O3", owner: "C1", status: "open" }
        ]);
    }

    private static Rule(effect: string, left: object, right: object): object
    {
        return { effect, action: "read", predicate: { kind: 2, op: 0, left, right } };
    }

    private static Entity(member: string): object
    {
        return { kind: 0, root: 1, member };
    }

    private static CustomerRules(): string
    {
        return JSON.stringify([
            CrmHarness.Rule("allow", CrmHarness.Entity(CrmHarness.Region), { kind: 0, root: 0, member: CrmHarness.Region }),
            CrmHarness.Rule("deny", CrmHarness.Entity(CrmHarness.Tier), { kind: 1, value: CrmHarness.Free })
        ]);
    }

    private static OrderRules(): string
    {
        return JSON.stringify([
            CrmHarness.Rule("allow", CrmHarness.Entity(CrmHarness.Status), { kind: 1, value: CrmHarness.Open })
        ]);
    }

    private static Binding(concept: string, source: string, idKey: string, fields: string[]): ModelConnectorPlan["Bindings"][number]
    {
        const fieldMap: Record<string, string> = {};
        for (const f of fields) fieldMap[f] = f;
        return { Concept: concept, Connector: CrmHarness.Connector, Source: source, IdKey: idKey, FieldMap: fieldMap, Writable: false };
    }

    private Plan(): ModelConnectorPlan
    {
        return {
            Model: "crm", Version: "1",
            Connectors: [{ Name: CrmHarness.Connector, Kind: DataSourceKind.Sql, Config: {} }],
            Bindings: [
                CrmHarness.Binding(CrmHarness.Customer, CrmHarness.CustomersSource, CrmHarness.CustomerId, [CrmHarness.CustomerId, CrmHarness.Region, CrmHarness.Tier]),
                CrmHarness.Binding(CrmHarness.Order, CrmHarness.OrdersSource, CrmHarness.OrderId, [CrmHarness.OrderId, CrmHarness.Owner, CrmHarness.Status])
            ]
        };
    }

    public async Prepare(): Promise<TodlDocument>
    {
        const connector = new FederatedModelDataConnector(this.Plan(), this.baseDoc);
        connector.UseQueryFilterProvider(this.Enforcement.QueryFilterProvider());
        const services = new ServiceProvider();
        services.registerInstance(DataSourceAdapterCatalog.ServiceKey, new DataSourceAdapterCatalog().Register(this.Factory));
        return connector.Prepare(services);
    }

    public WhereFor(source: string): unknown
    {
        return this.Factory.Adapter.Requests.find((r) => r.Source === source)?.Where;
    }

    public Survivors(doc: TodlDocument, concept: string): string[]
    {
        const src = new CrmSource(doc);
        src.UseInstanceFilter(this.Enforcement.InstanceFilter());
        return src.Instances(concept).map((e) => e.id.split(CrmHarness.IdSeparator).at(-1)).sort();
    }
}

test("CRM golden: claim-driven push-down plus in-memory deny across two concepts", async () =>
{
    const h = new CrmHarness(CrmHarness.Eu);
    const doc = await h.Prepare();
    assert.deepEqual(h.WhereFor(CrmHarness.CustomersSource), { All: [{ Field: CrmHarness.Region, Op: QueryCompareOp.Eq, Value: CrmHarness.Eu }] });
    assert.deepEqual(h.WhereFor(CrmHarness.OrdersSource), { All: [{ Field: CrmHarness.Status, Op: QueryCompareOp.Eq, Value: CrmHarness.Open }] });
    assert.deepEqual(h.Survivors(doc, CrmHarness.Customer), ["C1", "C4"]);
    assert.deepEqual(h.Survivors(doc, CrmHarness.Order), ["O1", "O3"]);
});

test("CRM golden: flipping the principal region claim flips push-down and survivors", async () =>
{
    const h = new CrmHarness(CrmHarness.Us);
    const doc = await h.Prepare();
    assert.deepEqual(h.WhereFor(CrmHarness.CustomersSource), { All: [{ Field: CrmHarness.Region, Op: QueryCompareOp.Eq, Value: CrmHarness.Us }] });
    assert.deepEqual(h.Survivors(doc, CrmHarness.Customer), ["C3"]);
    assert.deepEqual(h.Survivors(doc, CrmHarness.Order), ["O1", "O3"]);
});
