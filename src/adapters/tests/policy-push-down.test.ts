import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository, PolicyNodeKind, PolicyRefRoot, PolicyCompareOp, PolicyBoolOp, QueryCompareOp } from "@pragmatic-tech-ai/todl";
import type { PolicyPredicate, PolicyOperand, QueryFilter } from "@pragmatic-tech-ai/todl";
import { Action, Principal, PrincipalKind } from "@pragmatic-tech-ai/todl-identity";
import { PolicyEffect, PolicyActionKind, PolicyCatalog } from "../../policy/policy-catalog.js";
import type { PolicyRule } from "../../policy/policy-catalog.js";
import { PolicyPushDown } from "../policy-push-down.js";
import { PolicyQueryFilterProvider } from "../policy-query-filter-provider.js";

class PushFixture
{
    public static readonly Concept = "account";
    public static readonly Region = "region";
    public static readonly Tier = "tier";
    public static readonly Dept = "dept";

    public static Entity(member: string): PolicyOperand
    {
        return { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Entity, member };
    }

    public static Claim(member: string): PolicyOperand
    {
        return { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Principal, member };
    }

    public static Lit(value: string): PolicyOperand
    {
        return { kind: PolicyNodeKind.Literal, value };
    }

    public static Cmp(op: PolicyCompareOp, left: PolicyOperand, right: PolicyOperand): PolicyPredicate
    {
        return { kind: PolicyNodeKind.Compare, op, left, right };
    }

    public static EqLit(member: string, value: string): PolicyPredicate
    {
        return PushFixture.Cmp(PolicyCompareOp.Eq, PushFixture.Entity(member), PushFixture.Lit(value));
    }

    public static Bool(op: PolicyBoolOp, left: PolicyPredicate, right: PolicyPredicate): PolicyPredicate
    {
        return { kind: PolicyNodeKind.Bool, op, left, right };
    }

    public static Rule(effect: PolicyEffect, predicate: PolicyPredicate, action: PolicyActionKind = PolicyActionKind.Read): PolicyRule
    {
        return { Effect: effect, Action: action, Predicate: predicate };
    }

    public static Who(claims: [string, string][] = []): Principal
    {
        return new Principal("u1", "t1", PrincipalKind.User, new Map(claims), []);
    }

    public static Push(rules: PolicyRule[], who: Principal = PushFixture.Who()): QueryFilter | undefined
    {
        return PolicyPushDown.EligibleFilter(rules, PolicyActionKind.Read, who);
    }

    public static Catalog(): PolicyCatalog
    {
        const r = new Repository();
        const b = r.builder();
        b.definePrimitive("string");
        b.defineConcept(PushFixture.Concept);
        b.addField(PushFixture.Concept, PushFixture.Region, "string");
        const predicate = { kind: 2, op: 0, left: { kind: 0, root: 1, member: PushFixture.Region }, right: { kind: 1, value: "eu" } };
        b.definePolicy(`${PushFixture.Concept}@policy`, PushFixture.Concept, JSON.stringify([{ effect: "allow", action: "read", predicate }]));
        b.commit();
        return PolicyCatalog.FromRepository(r);
    }
}

const EuEq = { Field: "region", Op: QueryCompareOp.Eq, Value: "eu" };

test("single allow eq pushes Eq", () =>
{
    assert.deepEqual(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, PushFixture.EqLit("region", "eu"))]), { All: [EuEq] });
});

test("only Eq-resulting comparisons are pushed", () =>
{
    const neq = (v: string): PolicyPredicate => PushFixture.Cmp(PolicyCompareOp.Neq, PushFixture.Entity("region"), PushFixture.Lit(v));
    assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, neq("eu"))]), undefined);
    assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Deny, PushFixture.EqLit("region", "us"))]), undefined);
    assert.deepEqual(PushFixture.Push([PushFixture.Rule(PolicyEffect.Deny, neq("us"))]),
        { All: [{ Field: "region", Op: QueryCompareOp.Eq, Value: "us" }] });
    assert.deepEqual(PushFixture.Push([
        PushFixture.Rule(PolicyEffect.Allow, PushFixture.EqLit("region", "eu")),
        PushFixture.Rule(PolicyEffect.Deny, PushFixture.EqLit("region", "us")),
    ]), { All: [EuEq] });
});

test("two allow rules are not pushed", () =>
{
    assert.equal(PushFixture.Push([
        PushFixture.Rule(PolicyEffect.Allow, PushFixture.EqLit("region", "eu")),
        PushFixture.Rule(PolicyEffect.Allow, PushFixture.EqLit("region", "us")),
    ]), undefined);
});

test("or / not / membership are not pushed", () =>
{
    const a = PushFixture.EqLit("region", "eu");
    const b = PushFixture.EqLit("tier", "paid");
    const or = PushFixture.Bool(PolicyBoolOp.Or, a, b);
    const not: PolicyPredicate = { kind: PolicyNodeKind.Not, operand: a } as unknown as PolicyPredicate;
    const mem: PolicyPredicate = { kind: PolicyNodeKind.Membership, left: PushFixture.Lit("x"), right: PushFixture.Claim("groups") } as unknown as PolicyPredicate;
    for (const p of [or, not, mem, PushFixture.Bool(PolicyBoolOp.And, a, or)])
    {
        assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, p)]), undefined);
    }
});

test("principal claim constant resolves; unresolved is not pushed", () =>
{
    const p = PushFixture.Cmp(PolicyCompareOp.Eq, PushFixture.Entity("region"), PushFixture.Claim("dept"));
    assert.deepEqual(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, p)], PushFixture.Who([["dept", "sales"]])),
        { All: [{ Field: "region", Op: QueryCompareOp.Eq, Value: "sales" }] });
    assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, p)]), undefined);
});

test("deny and-tree is not pushed; allow and-tree is", () =>
{
    const and = PushFixture.Bool(PolicyBoolOp.And, PushFixture.EqLit("region", "eu"), PushFixture.EqLit("tier", "paid"));
    assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Deny, and)]), undefined);
    assert.deepEqual(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, and)]),
        { All: [EuEq, { Field: "tier", Op: QueryCompareOp.Eq, Value: "paid" }] });
});

test("no rules for the action, entity-vs-entity, literal-vs-literal are not pushed", () =>
{
    assert.equal(PushFixture.Push([]), undefined);
    assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, PushFixture.EqLit("region", "eu"), PolicyActionKind.Write)]), undefined);
    const ee = PushFixture.Cmp(PolicyCompareOp.Eq, PushFixture.Entity("a"), PushFixture.Entity("b"));
    assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, ee)]), undefined);
    const ll = PushFixture.Cmp(PolicyCompareOp.Eq, PushFixture.Lit("a"), PushFixture.Lit("b"));
    assert.equal(PushFixture.Push([PushFixture.Rule(PolicyEffect.Allow, ll)]), undefined);
});

test("provider maps action and concept", () =>
{
    const catalog = PushFixture.Catalog();
    const who = PushFixture.Who();
    const read = new PolicyQueryFilterProvider(catalog, who, Action.Read);
    assert.deepEqual(read.WhereFor(PushFixture.Concept), { All: [EuEq] });
    assert.equal(read.WhereFor("nope"), undefined);
    assert.equal(new PolicyQueryFilterProvider(catalog, who, Action.Write).WhereFor(PushFixture.Concept), undefined);
    assert.equal(new PolicyQueryFilterProvider(catalog, who, Action.Delete).WhereFor(PushFixture.Concept), undefined);
});
