import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessScope, Cypher, GraphEngine, StorageKind, type GraphTransaction } from "@pragmatic-tech-ai/graph";
import { OwnershipAssignment, ShareRight, ShareSubject, SystemNames } from "@pragmatic-tech-ai/todl/engine";
import { Tier1ScopeCompiler } from "../../index.js";
import { Tier1Fx, type ITier1FxOptions } from "./tier1-fx.js";

/**
 * Spec §9.2 over an in-memory engine (opened without the crm connector, so the description's binding is dropped there;
 * the scopes are compiled from the bound catalog). P0 pat/contoso, P1 alice/sales, P2 bob/marketing shared with alice
 * (read), P4 erin/sales; task T3 carol/marketing; employee E1 alice/sales; assignments A1 (E1 → P1) and A2 (E1 → P0).
 */
class IntegrationFx
{
    public static readonly P0 = "P0";
    public static readonly P1 = "P1";
    public static readonly P2 = "P2";
    public static readonly P4 = "P4";
    public static readonly T3 = "T3";
    public static readonly E1 = "E1";
    public static readonly A1 = "A1";
    public static readonly A2 = "A2";
    public static readonly G1 = "G1";
    public static readonly Projects: readonly string[] = [IntegrationFx.P0, IntegrationFx.P1, IntegrationFx.P2, IntegrationFx.P4];
    public static readonly All: readonly string[] = [...IntegrationFx.Projects, IntegrationFx.T3, IntegrationFx.E1, IntegrationFx.A1, IntegrationFx.A2, IntegrationFx.G1];
    public static readonly MatchAssignments = "MATCH (a:`" + Tier1Fx.Assignment + "`) RETURN a";
    public static readonly CountAssignments = "MATCH (a:`" + Tier1Fx.Assignment + "`) RETURN count(a) AS c";

    public static async Open(): Promise<GraphEngine>
    {
        const engine = await GraphEngine.Open({ Description: Tier1Fx.Description(false), Storage: { Kind: StorageKind.Memory } });
        const t = await engine.Begin(AccessScope.System);
        const fx = IntegrationFx;
        fx.Owned(t, fx.P0, Tier1Fx.Project, Tier1Fx.Pat, Tier1Fx.Contoso);
        fx.Owned(t, fx.P1, Tier1Fx.Project, Tier1Fx.Alice, Tier1Fx.Sales);
        fx.Owned(t, fx.P2, Tier1Fx.Project, Tier1Fx.Bob, Tier1Fx.Marketing);
        fx.Owned(t, fx.P4, Tier1Fx.Project, Tier1Fx.Erin, Tier1Fx.Sales);
        fx.Owned(t, fx.T3, Tier1Fx.Task, Tier1Fx.Carol, Tier1Fx.Marketing);
        t.Link(fx.T3, Tier1Fx.ProjectOf, fx.P1);
        fx.Owned(t, fx.E1, Tier1Fx.Employee, Tier1Fx.Alice, Tier1Fx.Sales);
        t.CreateNode(fx.G1, SystemNames.ShareGrant);
        t.SetProperty(fx.G1, SystemNames.SubjectKind, ShareSubject.Principal);
        t.SetProperty(fx.G1, SystemNames.SubjectId, Tier1Fx.Alice);
        t.SetProperty(fx.G1, ShareRight.Read, true);
        t.Link(fx.G1, SystemNames.Record, fx.P2);
        for (const [edge, project] of [[fx.A1, fx.P1], [fx.A2, fx.P0]])
        {
            t.CreateNode(edge, Tier1Fx.Assignment);
            t.Link(edge, Tier1Fx.From, fx.E1);
            t.Link(edge, Tier1Fx.To, project);
        }
        await t.Commit();
        return engine;
    }

    public static Scope(id: string, options: ITier1FxOptions = {}): AccessScope
    {
        return Tier1ScopeCompiler.Compile(Tier1Fx.User(id), Tier1Fx.Security(), Tier1Fx.Model(options), Tier1Fx.Catalog());
    }

    public static Assign(id: string): AccessScope
    {
        return Tier1ScopeCompiler.CompileAssign(Tier1Fx.User(id), Tier1Fx.Security(), Tier1Fx.Model(), Tier1Fx.Catalog());
    }

    public static async Visible(engine: GraphEngine, scope: AccessScope, ids: readonly string[]): Promise<string[]>
    {
        const r = await engine.BeginRead(scope);
        try
        {
            const out: string[] = [];
            for (const id of ids)
            {
                if ((await r.ConceptOf(id)) !== undefined)
                {
                    out.push(id);
                }
            }
            return out;
        }
        finally
        {
            r.dispose();
        }
    }

    /** Runs `work` on a freshly seeded engine and disposes it. */
    public static async With(work: (engine: GraphEngine) => Promise<void>): Promise<void>
    {
        const engine = await IntegrationFx.Open();
        try
        {
            await work(engine);
        }
        finally
        {
            await engine.dispose();
        }
    }

    private static Owned(t: GraphTransaction, id: string, concept: string, owner: string, unit: string): void
    {
        t.CreateNode(id, concept);
        t.SetProperty(id, SystemNames.Owner, owner);
        t.SetProperty(id, SystemNames.OwningBusinessUnit, unit);
    }
}

test("alice sees her project and the one shared with her, not carol's task", () => IntegrationFx.With(async engine =>
{
    const fx = IntegrationFx;
    assert.deepEqual(await fx.Visible(engine, fx.Scope(Tier1Fx.Alice), [...fx.Projects, fx.T3]), [fx.P1, fx.P2]);
}));

test("a project manager at contoso sees every project, and only contoso's after the BU-only override", () => IntegrationFx.With(async engine =>
{
    const fx = IntegrationFx;
    assert.deepEqual(await fx.Visible(engine, fx.Scope(Tier1Fx.Pat), fx.Projects), fx.Projects);
    assert.deepEqual(await fx.Visible(engine, fx.Scope(Tier1Fx.Pat, { ManagerReadsBusinessUnit: true }), fx.Projects), [fx.P0]);
}));

test("a disabled principal sees nothing", () => IntegrationFx.With(async engine =>
{
    assert.deepEqual(await IntegrationFx.Visible(engine, IntegrationFx.Scope(Tier1Fx.Dana), IntegrationFx.All), []);
}));

test("a role held through a team reads at the team's unit", () => IntegrationFx.With(async engine =>
{
    const fx = IntegrationFx;
    assert.deepEqual(await fx.Visible(engine, fx.Scope(Tier1Fx.Erin, { ManagerReadsBusinessUnit: true }), fx.Projects), [fx.P2, fx.P4]);
}));

test("an assignment to a project alice cannot see is neither matched nor counted", () => IntegrationFx.With(async engine =>
{
    const cypher = new Cypher.CypherEngine(engine);
    const scope = IntegrationFx.Scope(Tier1Fx.Alice);
    const matched = Cypher.CypherEngine.ToDto(await cypher.Execute(scope, IntegrationFx.MatchAssignments));
    assert.equal(matched.Rows.length, 1);
    assert.equal((matched.Rows[0][0] as Cypher.NodeCellDto).$node.id, IntegrationFx.A1);
    const counted = Cypher.CypherEngine.ToDto(await cypher.Execute(scope, IntegrationFx.CountAssignments));
    assert.equal(Number(counted.Rows[0][0]), 1);
}));

test("the assign scope is the one OwnershipAssignment runs under", () => IntegrationFx.With(async engine =>
{
    const fx = IntegrationFx;
    const t = await engine.Begin(fx.Assign(Tier1Fx.Pat));
    const assignment = new OwnershipAssignment(Tier1Fx.Security().OwnedConcepts());
    await assignment.Assign(t, fx.P0, { OwnerId: Tier1Fx.Mkt, BusinessUnitId: Tier1Fx.Marketing });
    await t.Commit();
    const r = await engine.BeginRead(AccessScope.System);
    try
    {
        assert.equal(await r.GetProperty(fx.P0, SystemNames.Owner), Tier1Fx.Mkt);
    }
    finally
    {
        r.dispose();
    }
}));

test("every compiled scope validates against the catalog", () => IntegrationFx.With(async engine =>
{
    const fx = IntegrationFx;
    const ids = [Tier1Fx.Admin, Tier1Fx.Dana, Tier1Fx.Sam, Tier1Fx.Rita, Tier1Fx.Nora, Tier1Fx.Alice, Tier1Fx.Erin, Tier1Fx.Pat];
    const scopes = [...ids.map(id => fx.Scope(id)), ...ids.map(id => fx.Assign(id))];
    for (const scope of scopes)
    {
        const r = await engine.BeginRead(scope);
        r.dispose();
    }
}));
