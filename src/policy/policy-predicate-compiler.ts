import { PolicyNodeKind, PolicyRefRoot, PolicyBoolOp, PolicyCompareOp } from "@pragmatic-tech-ai/todl";
import type { PolicyPredicate } from "@pragmatic-tech-ai/todl";
import type { Principal, EntityPredicate, EntityView } from "@pragmatic-tech-ai/todl-identity";
import { PolicyEffect } from "./policy-catalog.js";
import type { PolicyRule, PolicyActionKind } from "./policy-catalog.js";

type PolicyOperand = Extract<PolicyPredicate, { kind: PolicyNodeKind.Compare }>["left"];

export class PolicyPredicateCompiler
{
    private static readonly GroupsMember = "groups";

    // Compile one predicate against a fixed principal into a boolean test over an entity view.
    public static Compile(predicate: PolicyPredicate, principal: Principal): EntityPredicate
    {
        return { Matches: (view: EntityView) => PolicyPredicateCompiler.Evaluate(predicate, view, principal) };
    }

    // Fuse a concept's rules for an action into one filter (deny-overrides, allow-required-when-present).
    public static CompileRuleSet(rules: readonly PolicyRule[], action: PolicyActionKind, principal: Principal): EntityPredicate
    {
        const forAction = rules.filter(rule => rule.Action === action);
        const allows = forAction.filter(rule => rule.Effect === PolicyEffect.Allow).map(rule => PolicyPredicateCompiler.Compile(rule.Predicate, principal));
        const denies = forAction.filter(rule => rule.Effect === PolicyEffect.Deny).map(rule => PolicyPredicateCompiler.Compile(rule.Predicate, principal));
        return {
            Matches: (view: EntityView) =>
                denies.every(d => !d.Matches(view)) && (allows.length === 0 || allows.some(a => a.Matches(view))),
        };
    }

    private static Operand(operand: PolicyOperand, view: EntityView, principal: Principal): unknown
    {
        if (operand.kind === PolicyNodeKind.Literal)
        {
            return operand.value;
        }
        if (operand.root === PolicyRefRoot.Entity)
        {
            return view.Member(operand.member);
        }
        return operand.member === PolicyPredicateCompiler.GroupsMember ? principal.Groups : principal.Claim(operand.member);
    }

    private static Evaluate(predicate: PolicyPredicate, view: EntityView, principal: Principal): boolean
    {
        switch (predicate.kind)
        {
            case PolicyNodeKind.Compare:
            {
                // An absent claim/field is undefined: === literal is false, !== literal is true (intended).
                const left = PolicyPredicateCompiler.Operand(predicate.left, view, principal);
                const right = PolicyPredicateCompiler.Operand(predicate.right, view, principal);
                return predicate.op === PolicyCompareOp.Eq ? left === right : left !== right;
            }
            case PolicyNodeKind.Membership:
            {
                const collection = PolicyPredicateCompiler.Operand(predicate.collection, view, principal);
                if (!Array.isArray(collection))
                {
                    return false;
                }
                return collection.includes(PolicyPredicateCompiler.Operand(predicate.item, view, principal));
            }
            case PolicyNodeKind.Bool:
            {
                const left = PolicyPredicateCompiler.Evaluate(predicate.left, view, principal);
                if (predicate.op === PolicyBoolOp.And)
                {
                    return left && PolicyPredicateCompiler.Evaluate(predicate.right, view, principal);
                }
                return left || PolicyPredicateCompiler.Evaluate(predicate.right, view, principal);
            }
            case PolicyNodeKind.Not:
                return !PolicyPredicateCompiler.Evaluate(predicate.operand, view, principal);
        }
    }
}
