import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessLevel, BaseRole, IdpUserState, PrivilegeAction, SystemPrincipal } from "@pragmatic-tech-ai/todl-identity";
import { AccessDepthEvaluator, RoleSource, TenantSecurityModel } from "../../index.js";
import { EngineSecurityFx } from "./engine-security-fx.js";

class Fx
{
    public static Evaluator(bobState: IdpUserState = IdpUserState.Enabled): AccessDepthEvaluator
    {
        const model = TenantSecurityModel.FromConfig(EngineSecurityFx.Config(), EngineSecurityFx.Directory(bobState));
        return AccessDepthEvaluator.For(EngineSecurityFx.Security(), model, EngineSecurityFx.StoredConcepts());
    }
}

test("effective roles come from direct and team assignments of active principals only", () =>
{
    const bob = EngineSecurityFx.User("bob");
    assert.deepEqual([...Fx.Evaluator().EffectiveRoles(bob)], [EngineSecurityFx.ProjectManager]);
    assert.deepEqual([...Fx.Evaluator(IdpUserState.Disabled).EffectiveRoles(bob)], []);
});

test("role sources keep each team's unit", () =>
{
    const evaluator = Fx.Evaluator();
    const sources = evaluator.RoleSources(EngineSecurityFx.User("erin"));
    assert.deepEqual(sources, [
        new RoleSource(new Set<string>([BaseRole.BasicUser]), "sales", undefined),
        new RoleSource(new Set<string>([EngineSecurityFx.ProjectManager]), "marketing", "mkt"),
    ]);
    assert.equal(evaluator.SourceLevel(sources[1], PrivilegeAction.Read, EngineSecurityFx.Project), AccessLevel.BusinessUnitAndChildren);
});

test("system principal is System Administrator and sits at the root", () =>
{
    const evaluator = Fx.Evaluator();
    const system = SystemPrincipal.For(EngineSecurityFx.Tenant);
    assert.equal(evaluator.IsSystemAdministrator(system), true);
    assert.equal(evaluator.Model().PlacementOf(system).HomeBusinessUnitId, evaluator.Model().Hierarchy().RootId());
});
