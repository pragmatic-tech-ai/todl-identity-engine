import { test } from "node:test";
import assert from "node:assert/strict";
import { BindingTable } from "@pragmatic-tech-ai/graph";
import { FakeStorage } from "@pragmatic-tech-ai/todl-runtime";
import { compilePackage, StoragePackageSource } from "@pragmatic-tech-ai/todl";
import { DeliveryChannel, EnvironmentCatalogComposer, type IEnvironmentCatalog } from "@pragmatic-tech-ai/todl/engine";
import { BaseRole, type ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";
import { TenantSecurityModel, Tier1Catalog, Tier1ScopeCompiler } from "../../index.js";
import { Tier1Fx } from "./tier1-fx.js";

/** A real composed environment catalog: `shop.Order` engine-stored (the catalog's default), `shop.Customer` populated from an external sql datasource. */
class ComposedFx
{
    public static readonly Model = "shop";
    public static readonly Version = "1.0.0";
    public static readonly Order = "shop.Order";
    public static readonly Customer = "shop.Customer";
    public static readonly Source = `namespace shop
{
    concept Customer { name : string; }
    concept Order : todl.system.Owned { title : string; }
    datasource crm { kind = sql; connection = "crm-db"; }
    model Feed : shop { connect crm; populate shop.Customer key id { name = "full_name"; } }
}`;

    public static async Compose(): Promise<IEnvironmentCatalog>
    {
        const out = compilePackage([], [{ uri: "shop.todl", text: ComposedFx.Source }], { id: ComposedFx.Model, version: ComposedFx.Version }, []);
        assert.ok(out.ok, JSON.stringify(out.errors));
        const storage = new FakeStorage();
        await storage.WriteText(`${ComposedFx.Model}/${ComposedFx.Version}/model.json`, JSON.stringify(out.package!.document));
        return EnvironmentCatalogComposer.Compose({
            Deliveries: [{ Channel: DeliveryChannel.Deploy, Name: "app", Packages: [{ model: ComposedFx.Model, version: ComposedFx.Version }] }],
            Packages: new StoragePackageSource(storage),
        });
    }

    public static Config(): ISecurityModelConfig
    {
        return {
            businessUnits: [{ id: Tier1Fx.Sales, name: Tier1Fx.Sales }],
            users: [{ principalId: Tier1Fx.Sam, businessUnitId: Tier1Fx.Sales }],
            teams: [],
            roleAssignments: [{ role: BaseRole.BasicUser, principalIds: [Tier1Fx.Sam], teamIds: [] }],
            profileAssignments: [],
            roleOverrides: [],
            profileOverrides: [],
        };
    }
}

test("a composed catalog's engine-storage default governs engine-stored concepts; external-bound ones get no entries", async () =>
{
    const catalog = await ComposedFx.Compose();
    assert.equal(catalog.Description.DefaultConnector, BindingTable.EngineStorage);
    assert.ok(catalog.Description.Bindings.some(b => b.Concept === ComposedFx.Customer && b.Connector !== BindingTable.EngineStorage));

    const stored = Tier1Catalog.EngineStoredConcepts(catalog);
    assert.equal(stored.has(ComposedFx.Order), true);
    assert.equal(stored.has(ComposedFx.Customer), false);

    const model = TenantSecurityModel.FromConfig(ComposedFx.Config(), Tier1Fx.Directory());
    const scope = Tier1ScopeCompiler.Compile(Tier1Fx.User(Tier1Fx.Sam), catalog.Security, model, catalog);
    assert.equal(scope.Rows.has(ComposedFx.Order), true);
    assert.equal(scope.Writes.has(ComposedFx.Order), true);
    assert.equal(scope.Rows.has(ComposedFx.Customer), false);
    assert.equal(scope.Writes.has(ComposedFx.Customer), false);
});
