import { isDeepStrictEqual } from "node:util";
import { Compare, CompareOp, ConceptIs, In, Not, Or, Predicate, PredicateKind } from "@pragmatic-tech-ai/graph";
import { SystemNames } from "@pragmatic-tech-ai/todl/engine";
import { AccessLevel, type Principal, type PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import type { AccessDepthEvaluator } from "../security/access-depth-evaluator.js";

/** Predicate composition of the tier-1 compile rules (spec C6, program ruling R4): one flat Or, and the own-concept guard. */
export class Tier1Predicates
{
    /**
     * One Or over `terms`: False terms dropped, True anywhere is True, structurally identical terms kept once, a single
     * remaining term unwrapped, none is False. Kinds are compared, not instances, so predicates from another module copy
     * of the engine (TODL's ShareGrantScope) compose the same way.
     */
    public static AnyOf(terms: readonly Predicate[]): Predicate
    {
        const kept: Predicate[] = [];
        for (const term of terms)
        {
            if (term.Kind === PredicateKind.True)
            {
                return Predicate.True;
            }
            if (term.Kind === PredicateKind.False || kept.some(k => isDeepStrictEqual(k, term)))
            {
                continue;
            }
            kept.push(term);
        }
        if (kept.length === 0)
        {
            return Predicate.False;
        }
        return kept.length === 1 ? kept[0] : new Or(kept);
    }

    /** The R93 own-concept guard: a rule on `concept` that never judges its subconcepts' or aspect carriers' instances. */
    public static Guard(concept: string, p: Predicate): Predicate
    {
        if (p.Kind === PredicateKind.True)
        {
            return Predicate.True;
        }
        const others = new Not(new ConceptIs(concept));
        return p.Kind === PredicateKind.False ? others : new Or([others, p]);
    }
}

/**
 * One principal's per-role-source depth terms over the fixed system fields (spec §5, PR5). Internal to the scope
 * compiler, which appends the share widening to the terms before the Or is collapsed; not exported from the package.
 */
export class Tier1Depth
{
    private constructor(
        private readonly evaluator: AccessDepthEvaluator,
        private readonly principal: Principal,
        private readonly active: boolean,
        private readonly administrator: boolean,
        private readonly owners: readonly string[])
    {
    }

    public static For(evaluator: AccessDepthEvaluator, principal: Principal): Tier1Depth
    {
        const active = evaluator.Model().IsActive(principal);
        const administrator = active && evaluator.IsSystemAdministrator(principal);
        const owners = active ? [principal.Id, ...evaluator.MembershipOf(principal).teams] : [];
        return new Tier1Depth(evaluator, principal, active, administrator, owners);
    }

    public IsSystemAdministrator(): boolean
    {
        return this.administrator;
    }

    /** The highest depth over every role source from the role table (a System Administrator holds none there); None when inactive. */
    public TableLevel(action: PrivilegeAction, concept: string): AccessLevel
    {
        return this.active ? this.evaluator.EffectiveLevel(this.principal, action, concept) : AccessLevel.None;
    }

    /** One DepthAt term per role source, uncollapsed; a System Administrator is the caller's special case. */
    public Terms(action: PrivilegeAction, concept: string): readonly Predicate[]
    {
        if (!this.active)
        {
            return [];
        }
        const owned = this.evaluator.IsOwned(concept);
        return this.evaluator.RoleSources(this.principal).map(s => this.DepthAt(owned, this.evaluator.SourceLevel(s, action, concept), s.BusinessUnitId));
    }

    private DepthAt(owned: boolean, level: AccessLevel, unit: string): Predicate
    {
        if (level === AccessLevel.Organization)
        {
            return Predicate.True;
        }
        if (!owned)
        {
            return Predicate.False;
        }
        switch (level)
        {
            case AccessLevel.BusinessUnitAndChildren:
                return new In(SystemNames.OwningBusinessUnit, [unit, ...this.evaluator.Model().Hierarchy().DescendantsOf(unit)]);
            case AccessLevel.BusinessUnit:
                return new Compare(SystemNames.OwningBusinessUnit, CompareOp.Eq, unit);
            case AccessLevel.User:
                return new In(SystemNames.Owner, this.owners);
            default:
                return Predicate.False;
        }
    }
}

/**
 * One principal's tier-1 grants over the fixed system fields (spec §5, PR5): the depth each role source grants, as
 * unguarded predicates on `owner` / `owningBusinessUnit`. For the checks an AccessScope cannot express (share, invoke).
 */
export class Tier1Grants
{
    private constructor(private readonly depth: Tier1Depth)
    {
    }

    /** @internal Built only by Tier1ScopeCompiler.Grants; Tier1Depth is not part of the package surface. */
    public static For(depth: Tier1Depth): Tier1Grants
    {
        return new Tier1Grants(depth);
    }

    public IsSystemAdministrator(): boolean
    {
        return this.depth.IsSystemAdministrator();
    }

    /** The principal's highest depth over every role source; Organization for a System Administrator, None when inactive. */
    public Level(action: PrivilegeAction, concept: string): AccessLevel
    {
        return this.depth.IsSystemAdministrator() ? AccessLevel.Organization : this.depth.TableLevel(action, concept);
    }

    /** Depth(K, a): the records of `concept` the action reaches, unguarded and without shares. True for a System Administrator. */
    public Covers(action: PrivilegeAction, concept: string): Predicate
    {
        if (this.depth.IsSystemAdministrator())
        {
            return Predicate.True;
        }
        return Tier1Predicates.AnyOf(this.depth.Terms(action, concept));
    }
}
