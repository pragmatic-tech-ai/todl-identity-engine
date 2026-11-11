import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessLevel, BaseRole, PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import type { IPackageSecurity } from "@pragmatic-tech-ai/todl";
import { EffectiveRoleTable, Tier1DiagnosticCode } from "../../index.js";
import { EngineSecurityFx } from "./engine-security-fx.js";

class Fx
{
    /** The engine-stored concepts minus the edge concepts, as callers pass them. */
    public static NodeConcepts(): ReadonlySet<string>
    {
        const edges = new Set(EngineSecurityFx.Security().EdgeConcepts.map(e => e.Concept));
        return new Set([...EngineSecurityFx.StoredConcepts()].filter(c => !edges.has(c)));
    }
}

test("base roles exist without contributions", () =>
{
    const table = EffectiveRoleTable.Build(EngineSecurityFx.Security(new Map<string, IPackageSecurity>()), [], new Set<string>());
    assert.equal(table.HasRole(BaseRole.SystemAdministrator), true);
    assert.equal(table.HasRole(BaseRole.Reader), true);
});

test("contributions and package roles give defaults", () =>
{
    const table = EffectiveRoleTable.Build(EngineSecurityFx.Security(), [], Fx.NodeConcepts());
    assert.equal(table.Level(BaseRole.BasicUser, EngineSecurityFx.Employee, PrivilegeAction.Read), AccessLevel.BusinessUnit);
    assert.equal(table.Level(EngineSecurityFx.ProjectManager, EngineSecurityFx.Project, PrivilegeAction.Read), AccessLevel.BusinessUnitAndChildren);
});

test("overrides lower defaults and stale overrides are dropped with diagnostics", () =>
{
    const fx = EngineSecurityFx;
    const table = EffectiveRoleTable.Build(fx.Security(), [
        { role: fx.ProjectManager, concept: fx.Project, action: PrivilegeAction.Read, level: AccessLevel.BusinessUnit },
        { role: fx.ProjectManager, concept: fx.Task, action: PrivilegeAction.Read, level: AccessLevel.None },
        { role: "gone.Role", concept: fx.Project, action: PrivilegeAction.Read, level: AccessLevel.Organization },
        { role: fx.ProjectManager, concept: "gone.Thing", action: PrivilegeAction.Read, level: AccessLevel.Organization },
        { role: fx.ProjectManager, concept: fx.TaskOfProject, action: PrivilegeAction.Read, level: AccessLevel.Organization },
        { role: BaseRole.BasicUser, concept: fx.Department, action: PrivilegeAction.Read, level: AccessLevel.User },
    ], Fx.NodeConcepts());
    assert.equal(table.Level(fx.ProjectManager, fx.Project, PrivilegeAction.Read), AccessLevel.BusinessUnit);
    assert.equal(table.Level(fx.ProjectManager, fx.Task, PrivilegeAction.Read), AccessLevel.None);
    assert.equal(table.HasRole("gone.Role"), false);
    assert.equal(table.Level(fx.ProjectManager, "gone.Thing", PrivilegeAction.Read), AccessLevel.None);
    assert.equal(table.Level(fx.ProjectManager, fx.TaskOfProject, PrivilegeAction.Read), AccessLevel.None);
    assert.equal(table.Level(BaseRole.BasicUser, fx.Department, PrivilegeAction.Read), AccessLevel.None);
    assert.deepEqual(table.Diagnostics().map(d => [d.Code, d.Subject]), [
        [Tier1DiagnosticCode.OverrideUnknownRole, "gone.Role"],
        [Tier1DiagnosticCode.OverrideUnknownConcept, "gone.Thing"],
        [Tier1DiagnosticCode.OverrideUnknownConcept, fx.TaskOfProject],
        [Tier1DiagnosticCode.NonOrganizationDepthOnUnownedConcept, BaseRole.BasicUser + "/" + fx.Department + "/" + PrivilegeAction.Read],
    ]);
});
