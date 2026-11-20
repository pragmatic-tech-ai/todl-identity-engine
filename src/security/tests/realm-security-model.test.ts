import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidSecurityModelError } from "@pragmatic-tech-ai/pragmatic-identity";
import { RealmSecurityModel } from "../../index.js";
import { EngineSecurityFx } from "./engine-security-fx.js";

test("Empty() is a root-only tree on a non-authoritative directory", () =>
{
    const model = RealmSecurityModel.Empty();
    const root = model.Hierarchy().RootId();
    assert.deepEqual(model.Hierarchy().DescendantsOf(root), []);
    assert.equal(model.Directory().Authoritative, false);
    assert.equal(model.PlacementOf(EngineSecurityFx.User("sam")).HomeBusinessUnitId, root);
});

test("FromConfig places users and teams, and rejects an invalid setting", () =>
{
    const model = RealmSecurityModel.FromConfig(EngineSecurityFx.Config(), EngineSecurityFx.Directory());
    assert.deepEqual(model.PlacementOf(EngineSecurityFx.User("dana")), { PrincipalId: "dana", HomeBusinessUnitId: "hr" });
    assert.equal(model.PlacementOf(EngineSecurityFx.User("unplaced")).HomeBusinessUnitId, "contoso");
    assert.equal(model.TeamBusinessUnit("mkt"), "marketing");
    assert.equal(model.TeamBusinessUnit("gone"), undefined);
    const invalid = { ...EngineSecurityFx.Config(), users: [{ principalId: "sam", businessUnitId: "gone" }] };
    assert.throws(() => RealmSecurityModel.FromConfig(invalid, EngineSecurityFx.Directory()), InvalidSecurityModelError);
});
