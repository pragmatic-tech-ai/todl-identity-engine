import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessDepthEvaluator, AssignOutcome, TenantSecurityModel } from "../../index.js";
import { EngineSecurityFx } from "./engine-security-fx.js";

test("assign computes the fixed system fields", () =>
{
    const model = TenantSecurityModel.FromConfig(EngineSecurityFx.Config(), EngineSecurityFx.Directory());
    const evaluator = AccessDepthEvaluator.For(EngineSecurityFx.Security(), model, EngineSecurityFx.StoredConcepts());
    assert.deepEqual(evaluator.AssignWrites(EngineSecurityFx.Employee, "hr", true, undefined), {
        outcome: AssignOutcome.Writes,
        writes: [{ field: "owner", value: "hr" }, { field: "owningBusinessUnit", value: "hr" }],
    });
    assert.equal(evaluator.AssignWrites(EngineSecurityFx.Department, "hr", true, undefined).outcome, AssignOutcome.Unsupported);
    assert.equal(evaluator.AssignWrites(EngineSecurityFx.Employee, "nope", true, undefined).outcome, AssignOutcome.UnknownTeam);
});
