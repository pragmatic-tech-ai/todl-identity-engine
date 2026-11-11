import { test } from "node:test";
import assert from "node:assert/strict";
import { BusinessUnitHierarchy, IdpUserState, TeamMembershipRows } from "@pragmatic-tech-ai/todl-identity";
import { MembershipResolver } from "../../index.js";
import { EngineSecurityFx } from "./engine-security-fx.js";

test("membership is the placement home unit plus active team rows", () =>
{
    const config = EngineSecurityFx.Config();
    const hierarchy = BusinessUnitHierarchy.FromConfig(config.businessUnits);
    const active = new MembershipResolver(config, hierarchy, TeamMembershipRows.For(config, EngineSecurityFx.Directory()));
    assert.deepEqual(active.Resolve(EngineSecurityFx.User("bob")), { homeBusinessUnit: "marketing", teams: ["managers"] });
    assert.deepEqual(active.Resolve(EngineSecurityFx.User("unplaced")), { homeBusinessUnit: "contoso", teams: [] });
    const disabled = new MembershipResolver(config, hierarchy, TeamMembershipRows.For(config, EngineSecurityFx.Directory(IdpUserState.Disabled)));
    assert.deepEqual(disabled.Resolve(EngineSecurityFx.User("bob")), { homeBusinessUnit: "marketing", teams: [] });
});
