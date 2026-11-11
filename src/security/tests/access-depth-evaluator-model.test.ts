import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessLevel, PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import { AccessDepthEvaluator } from "../../index.js";
import { EngineSecurityFx } from "./engine-security-fx.js";

test("DenyAll decides with the empty model and grants nothing", () =>
{
    const evaluator = AccessDepthEvaluator.DenyAll();
    const sam = EngineSecurityFx.User("sam");
    assert.equal(evaluator.Model().Hierarchy().RootId(), evaluator.Model().PlacementOf(sam).HomeBusinessUnitId);
    assert.deepEqual(evaluator.RoleSources(sam), []);
    assert.equal(evaluator.EffectiveLevel(sam, PrivilegeAction.Read, EngineSecurityFx.Employee), AccessLevel.None);
});
