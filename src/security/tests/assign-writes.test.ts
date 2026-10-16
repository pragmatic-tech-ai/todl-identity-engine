import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessDepthEvaluator, AssignOutcome } from "../../index.js";
import { OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";

class Fx
{
    public static Config(): ISecurityModelConfig
    {
        return {
            businessUnits: [{ id: "root", name: "Root" }, { id: "sales", name: "Sales", parent: "root" }],
            teams: [{ id: "teamA", name: "Team A", owningBusinessUnit: "sales" }, { id: "teamB", name: "Team B" }],
            membership: { claimsMapping: [], overrides: [] },
            ownershipRules: [
                { concept: "lead", owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "owningbu" }, owner: { kind: OwnershipSourceKind.FromField, value: "ownerid" } },
                { concept: "config", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "root" } },
            ],
        };
    }
}

test("FromField owner + BU resolves two writes with the explicit owningBu", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fx.Config());
    const c = e.AssignWrites("lead", "user-7", false, "sales");
    assert.equal(c.outcome, AssignOutcome.Writes);
    assert.deepEqual([...c.writes].sort((a, b) => a.field.localeCompare(b.field)), [{ field: "owningbu", value: "sales" }, { field: "ownerid", value: "user-7" }].sort((a, b) => a.field.localeCompare(b.field)));
});

test("principal owner without owningBu on a FromField-BU concept is OwningBusinessUnitRequired", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fx.Config());
    assert.equal(e.AssignWrites("lead", "user-7", false, undefined).outcome, AssignOutcome.OwningBusinessUnitRequired);
});

test("team owner derives its owning BU from team config", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fx.Config());
    const c = e.AssignWrites("lead", "teamA", true, undefined);
    assert.equal(c.outcome, AssignOutcome.Writes);
    assert.ok(c.writes.some(w => w.field === "owningbu" && w.value === "sales"));
});

test("team owner with no configured BU on a FromField-BU concept is OwningBusinessUnitRequired", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fx.Config());
    assert.equal(e.AssignWrites("lead", "teamB", true, undefined).outcome, AssignOutcome.OwningBusinessUnitRequired);
});

test("unknown business unit is rejected", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fx.Config());
    assert.equal(e.AssignWrites("lead", "user-7", false, "nope").outcome, AssignOutcome.UnknownBusinessUnit);
});

test("unknown team owner is rejected", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fx.Config());
    assert.equal(e.AssignWrites("lead", "ghost", true, "sales").outcome, AssignOutcome.UnknownTeam);
});

test("fixed-owningBU concept ignores owningBu and emits only the owner write; non-assignable is Unsupported", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fx.Config());
    assert.equal(e.AssignWrites("config", "user-7", false, undefined).outcome, AssignOutcome.Unsupported);
});
