import { test } from "node:test";
import assert from "node:assert/strict";
import { PrivilegeAction, type ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";
import { FieldSecurityEvaluator, TenantSecurityModel } from "../../index.js";
import { EngineSecurityFx } from "./engine-security-fx.js";

class Fx
{
    public static Evaluator(config: ISecurityModelConfig): FieldSecurityEvaluator
    {
        const model = TenantSecurityModel.FromConfig(config, EngineSecurityFx.Directory());
        return FieldSecurityEvaluator.For(EngineSecurityFx.Security(), config.profileAssignments, config.profileOverrides, model.Membership());
    }
}

test("field security: profile via team grants read and update; override can revoke", () =>
{
    const fx = EngineSecurityFx;
    const dana = fx.User("dana");
    const sam = fx.User("sam");
    const open = Fx.Evaluator(fx.Config());
    assert.equal(open.CanReadField(dana, fx.Employee, fx.Salary), true);
    assert.equal(open.CanWriteField(dana, fx.Employee, fx.Salary, PrivilegeAction.Update), true);
    assert.equal(open.CanReadField(sam, fx.Employee, fx.Salary), false);
    const revoked = Fx.Evaluator({
        ...fx.Config(),
        profileOverrides: [{ profile: fx.Compensation, concept: fx.Employee, field: fx.Salary, read: false, update: true, create: false }],
    });
    assert.equal(revoked.CanReadField(dana, fx.Employee, fx.Salary), false);
});
