import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessDefault, Compare, CompareOp, ConceptIs, In, Not, Or, Predicate, type AccessScope } from "@pragmatic-tech-ai/graph";
import { ShareGrantScope, ShareRight, SystemNames, TodlNames } from "@pragmatic-tech-ai/todl/engine";
import { AccessLevel, PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import { Tier1ScopeCompiler } from "../../index.js";
import { Tier1Fx, type ITier1FxOptions } from "./tier1-fx.js";

class Fx
{
    public static readonly ReadsLabel = " reads ";
    public static readonly NoUpdateLabel = "sam holds no update on Project";
    public static readonly Space = " ";
    public static readonly RowMembers: ReadonlySet<string> = new Set<string>([
        SystemNames.Owner, SystemNames.OwningBusinessUnit, SystemNames.SubjectKind, SystemNames.SubjectId, ShareRight.Read, ShareRight.Update, ShareRight.Delete,
    ]);

    public static Scope(id: string, options: ITier1FxOptions = {}): AccessScope
    {
        return Tier1ScopeCompiler.Compile(Tier1Fx.User(id), Tier1Fx.Security(), Tier1Fx.Model(options), Tier1Fx.Catalog());
    }

    public static Guard(concept: string, p: Predicate): Predicate
    {
        return new Or([Fx.Others(concept), p]);
    }

    public static Others(concept: string): Predicate
    {
        return new Not(new ConceptIs(concept));
    }
}

test("inactive principal compiles to a deny-all scope", () =>
{
    const scope = Fx.Scope(Tier1Fx.Dana);
    assert.equal(scope.Default, AccessDefault.Deny);
    assert.equal(scope.Rows.size, 0);
});

test("system administrator reads unrestricted but cannot write system fields", () =>
{
    const scope = Fx.Scope(Tier1Fx.Admin);
    assert.equal(scope.ReadsUnrestricted, true);
    assert.equal(scope.Writes.get(SystemNames.Owned)?.ReadOnly?.Update?.has(SystemNames.Owner), true);
});

test("external concepts get no entries and default allow", () =>
{
    const scope = Fx.Scope(Tier1Fx.Sam);
    assert.equal(scope.Rows.has(Tier1Fx.Account), false);
    assert.equal(scope.Default, AccessDefault.Allow);
});

test("uncovered engine concept is invisible", () =>
{
    assert.deepEqual(Fx.Scope(Tier1Fx.Rita).Rows.get(Tier1Fx.Task), Fx.Others(Tier1Fx.Task));
});

test("depth encodes over the fixed system fields only", () =>
{
    const scope = Fx.Scope(Tier1Fx.Sam);
    const widening = ShareGrantScope.Widening({ PrincipalId: Tier1Fx.Sam, Teams: [] }, ShareRight.Read);
    const depth = new Compare(SystemNames.OwningBusinessUnit, CompareOp.Eq, Tier1Fx.Sales);
    assert.deepEqual(scope.Rows.get(Tier1Fx.Employee), Fx.Guard(Tier1Fx.Employee, new Or([depth, widening])));
    for (const [concept, row] of scope.Rows)
    {
        for (const member of Predicate.MemberNames(row))
        {
            assert.ok(Fx.RowMembers.has(member), concept + Fx.ReadsLabel + member);
        }
    }
});

test("secured field stays hidden on a subconcept and depth rules do not leak across concepts", () =>
{
    const scope = Fx.Scope(Tier1Fx.Sam);
    assert.equal(scope.Hidden.get(Tier1Fx.Employee)?.has(Tier1Fx.Salary), true);
    assert.deepEqual((scope.Rows.get(Tier1Fx.Employee) as Or).Terms[0], Fx.Others(Tier1Fx.Employee));
    assert.deepEqual(scope.Rows.get(Tier1Fx.Contractor), Fx.Others(Tier1Fx.Contractor));
});

test("field profile grants read; update absent makes it read-only", () =>
{
    const profiles = [{ profile: Tier1Fx.SalaryReader, principalIds: [Tier1Fx.Sam], teamIds: [] }];
    const scope = Fx.Scope(Tier1Fx.Sam, { ProfileAssignments: profiles });
    assert.equal(scope.Hidden.get(Tier1Fx.Employee)?.has(Tier1Fx.Salary), false);
    assert.equal(scope.Writes.get(Tier1Fx.Employee)?.ReadOnly?.Update?.has(Tier1Fx.Salary), true);
});

test("append and appendTo compile from their own depths", () =>
{
    const rules = Fx.Scope(Tier1Fx.Sam).Writes.get(Tier1Fx.Project);
    assert.deepEqual(rules?.Append, Fx.Guard(Tier1Fx.Project, new In(SystemNames.Owner, [Tier1Fx.Sam])));
    assert.deepEqual(rules?.AppendTo, Fx.Guard(Tier1Fx.Project, new Compare(SystemNames.OwningBusinessUnit, CompareOp.Eq, Tier1Fx.Sales)));
    assert.deepEqual(rules?.Update, Fx.Others(Tier1Fx.Project), Fx.NoUpdateLabel);
    assert.deepEqual(Fx.Scope(Tier1Fx.Rita).Writes.get(Tier1Fx.Project)?.Append, Fx.Others(Tier1Fx.Project));
});

test("edge concepts are governed by their endpoints only", () =>
{
    const scope = Fx.Scope(Tier1Fx.Sam);
    assert.deepEqual(scope.Endpoints.get(Tier1Fx.Assignment), { From: Tier1Fx.From, To: Tier1Fx.To });
    assert.equal(scope.Rows.has(Tier1Fx.Assignment), false);
    assert.equal(scope.Writes.has(Tier1Fx.Assignment), false);
    assert.equal(Fx.Scope(Tier1Fx.Admin).Endpoints.size, 0);
    assert.equal(Fx.Scope(Tier1Fx.Dana).Endpoints.size, 0);
});

test("a role held through a team judges BU depth against the team's unit", () =>
{
    const scope = Fx.Scope(Tier1Fx.Erin, { ManagerReadsBusinessUnit: true });
    const widening = ShareGrantScope.Widening({ PrincipalId: Tier1Fx.Erin, Teams: [Tier1Fx.Mkt] }, ShareRight.Read);
    const terms = [
        new In(SystemNames.Owner, [Tier1Fx.Erin, Tier1Fx.Mkt]),
        new Compare(SystemNames.OwningBusinessUnit, CompareOp.Eq, Tier1Fx.Marketing),
        widening,
    ];
    assert.deepEqual(scope.Rows.get(Tier1Fx.Project), Fx.Guard(Tier1Fx.Project, new Or(terms)));
});

test("platform vocabulary is readable by all and writable by none", () =>
{
    for (const id of [Tier1Fx.Sam, Tier1Fx.Nora])
    {
        const scope = Fx.Scope(id);
        assert.equal(scope.Rows.get(TodlNames.Term), Predicate.True, id);
        assert.equal(scope.Rows.has(TodlNames.Element), false, id);
        for (const concept of [TodlNames.Term, TodlNames.Element])
        {
            const rules = scope.Writes.get(concept);
            for (const rule of [rules?.Create, rules?.Update, rules?.Delete, rules?.Append])
            {
                assert.deepEqual(rule, Fx.Others(concept), id + Fx.Space + concept);
            }
            assert.equal(rules?.AppendTo, undefined, id + Fx.Space + concept);
        }
        const grant = scope.Writes.get(SystemNames.ShareGrant);
        assert.deepEqual(grant?.Append, Fx.Others(SystemNames.ShareGrant), id);
        assert.deepEqual(grant?.AppendTo, Fx.Others(SystemNames.ShareGrant), id);
    }
});

test("CompileAssign lifts system-field read-only and gates update by assign depth", () =>
{
    const scope = Tier1ScopeCompiler.CompileAssign(Tier1Fx.User(Tier1Fx.Pat), Tier1Fx.Security(), Tier1Fx.Model(), Tier1Fx.Catalog());
    const widening = ShareGrantScope.Widening({ PrincipalId: Tier1Fx.Pat, Teams: [] }, ShareRight.Assign);
    const depth = new Compare(SystemNames.OwningBusinessUnit, CompareOp.Eq, Tier1Fx.Contoso);
    assert.deepEqual(scope.Writes.get(Tier1Fx.Project)?.Update, Fx.Guard(Tier1Fx.Project, new Or([depth, widening])));
    assert.equal(scope.Writes.get(SystemNames.Owned)?.ReadOnly, undefined);
});

test("Grants exposes levels for append/share/invoke", () =>
{
    const grants = Tier1ScopeCompiler.Grants(Tier1Fx.User(Tier1Fx.Sam), Tier1Fx.Security(), Tier1Fx.Model(), Tier1Fx.Catalog());
    assert.equal(grants.Level(PrivilegeAction.Invoke, Tier1Fx.Project), AccessLevel.BusinessUnit);
});
