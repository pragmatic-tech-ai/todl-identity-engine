import { AccessDefault, AccessScope, Predicate, type IEndpointMembers, type IReadOnlyMembers, type IWriteRules } from "@pragmatic-tech-ai/graph";
import { ShareGrantScope, ShareRight, SystemNames, TodlNames, type IEnvironmentSecurity, type IShareSubjects } from "@pragmatic-tech-ai/todl/engine";
import { AccessLevel, PrivilegeAction, type Principal } from "@pragmatic-tech-ai/todl-identity";
import { AccessDepthEvaluator } from "../security/access-depth-evaluator.js";
import type { TenantSecurityModel } from "../security/tenant-security-model.js";
import type { Tier1Diagnostic } from "../security/tier1-diagnostic.js";
import { Tier1Catalog, type ITier1Catalog } from "./tier1-catalog.js";
import { Tier1Depth, Tier1Grants, Tier1Predicates } from "./tier1-grants.js";

/** The per-principal inputs of one compile. */
class CompileContext
{
    public constructor(
        public readonly Principal: Principal,
        public readonly Evaluator: AccessDepthEvaluator,
        public readonly Depth: Tier1Depth,
        public readonly Subjects: IShareSubjects,
        public readonly Stored: ReadonlySet<string>,
        public readonly Edges: ReadonlySet<string>)
    {
    }
}

/**
 * Contract C6: an environment's package security and its C5 setting, for one principal, as one engine AccessScope over
 * the fixed system fields only (spec §5; no decision reads an app-declared field). External concepts get no entries (§6).
 */
export class Tier1ScopeCompiler
{
    private static readonly SystemFields: ReadonlySet<string> = new Set<string>([SystemNames.Owner, SystemNames.OwningBusinessUnit]);

    /** The scope a principal reads and writes under (rules 1-6). */
    public static Compile(principal: Principal, security: IEnvironmentSecurity, model: TenantSecurityModel, catalog: ITier1Catalog): AccessScope
    {
        return Tier1ScopeCompiler.Build(principal, security, model, catalog, false);
    }

    /** The scope assign runs under (rule 7, PR2): Update gated by the assign depth, the system fields writable. */
    public static CompileAssign(principal: Principal, security: IEnvironmentSecurity, model: TenantSecurityModel, catalog: ITier1Catalog): AccessScope
    {
        return Tier1ScopeCompiler.Build(principal, security, model, catalog, true);
    }

    public static Grants(principal: Principal, security: IEnvironmentSecurity, model: TenantSecurityModel, catalog: ITier1Catalog): Tier1Grants
    {
        return Tier1Grants.For(Tier1Depth.For(Tier1ScopeCompiler.Evaluator(security, model, catalog), principal));
    }

    /** Every dropped or reinterpreted entry of the environment setting against the deployed packages. */
    public static Diagnose(security: IEnvironmentSecurity, model: TenantSecurityModel, catalog: ITier1Catalog): readonly Tier1Diagnostic[]
    {
        return Tier1ScopeCompiler.Evaluator(security, model, catalog).Diagnostics();
    }

    private static Evaluator(security: IEnvironmentSecurity, model: TenantSecurityModel, catalog: ITier1Catalog): AccessDepthEvaluator
    {
        return AccessDepthEvaluator.For(security, model, Tier1Catalog.EngineStoredConcepts(catalog));
    }

    private static Build(principal: Principal, security: IEnvironmentSecurity, model: TenantSecurityModel, catalog: ITier1Catalog, assign: boolean): AccessScope
    {
        if (!model.IsActive(principal))
        {
            return AccessScope.Build({ Default: AccessDefault.Deny });
        }
        const stored = Tier1Catalog.EngineStoredConcepts(catalog);
        const evaluator = AccessDepthEvaluator.For(security, model, stored);
        const depth = Tier1Depth.For(evaluator, principal);
        if (depth.IsSystemAdministrator())
        {
            return assign ? AccessScope.Build({ Default: AccessDefault.Allow }) : Tier1ScopeCompiler.Administrator();
        }
        const subjects: IShareSubjects = { PrincipalId: principal.Id, Teams: evaluator.MembershipOf(principal).teams };
        const edges = new Set<string>(security.EdgeConcepts.map(e => e.Concept));
        const context = new CompileContext(principal, evaluator, depth, subjects, stored, edges);
        const rows = new Map<string, Predicate>();
        const writes = new Map<string, IWriteRules>();
        for (const concept of stored)
        {
            if (Tier1ScopeCompiler.IsGoverned(concept, edges))
            {
                rows.set(concept, Tier1ScopeCompiler.Rows(context, concept));
                writes.set(concept, Tier1ScopeCompiler.Writes(context, concept, assign));
            }
        }
        const hidden = Tier1ScopeCompiler.FieldSecurity(context, writes);
        Tier1ScopeCompiler.Platform(context, rows, writes);
        if (!assign)
        {
            writes.set(SystemNames.Owned, { ReadOnly: Tier1ScopeCompiler.SystemReadOnly() });
        }
        return AccessScope.Build({ Default: AccessDefault.Allow, Rows: rows, Hidden: hidden, Writes: writes, Endpoints: Tier1ScopeCompiler.Endpoints(context, security) });
    }

    /** Rule 2 (PR1): reads unrestricted; the system fields are written only by assign. */
    private static Administrator(): AccessScope
    {
        const writes = new Map<string, IWriteRules>([[SystemNames.Owned, { ReadOnly: Tier1ScopeCompiler.SystemReadOnly() }]]);
        return AccessScope.Build({ Default: AccessDefault.Allow, Writes: writes });
    }

    private static SystemReadOnly(): IReadOnlyMembers
    {
        return { Create: Tier1ScopeCompiler.SystemFields, Update: Tier1ScopeCompiler.SystemFields };
    }

    /** Rule 3 applies to every engine-stored concept but the platform vocabulary, the share grant and the edge concepts. */
    private static IsGoverned(concept: string, edges: ReadonlySet<string>): boolean
    {
        return concept !== TodlNames.Element && concept !== TodlNames.Term && concept !== SystemNames.ShareGrant && !edges.has(concept);
    }

    private static Rows(context: CompileContext, concept: string): Predicate
    {
        return Tier1ScopeCompiler.Guarded(context, concept, PrivilegeAction.Read, ShareRight.Read);
    }

    private static Writes(context: CompileContext, concept: string, assign: boolean): IWriteRules
    {
        const owned = context.Evaluator.IsOwned(concept);
        const update = assign && owned
            ? Tier1ScopeCompiler.Guarded(context, concept, PrivilegeAction.Assign, ShareRight.Assign)
            : Tier1ScopeCompiler.Guarded(context, concept, PrivilegeAction.Update, ShareRight.Update);
        return {
            Create: Tier1ScopeCompiler.Guarded(context, concept, PrivilegeAction.Create, undefined),
            Update: update,
            Delete: Tier1ScopeCompiler.Guarded(context, concept, PrivilegeAction.Delete, ShareRight.Delete),
            Append: Tier1ScopeCompiler.Guarded(context, concept, PrivilegeAction.Append, undefined),
            AppendTo: Tier1ScopeCompiler.Guarded(context, concept, PrivilegeAction.AppendTo, undefined),
        };
    }

    /**
     * G(K, Or(Depth(K, a), W(r))). W, the share widening, applies only to an owned K the principal holds the privilege on
     * at some depth (ruling R3, Dataverse: a share takes effect only for a grantee holding the privilege).
     */
    private static Guarded(context: CompileContext, concept: string, action: PrivilegeAction, right: ShareRight | undefined): Predicate
    {
        const terms: Predicate[] = [...context.Depth.Terms(action, concept)];
        if (right !== undefined && context.Evaluator.IsOwned(concept) && context.Depth.TableLevel(action, concept) !== AccessLevel.None)
        {
            terms.push(ShareGrantScope.Widening(context.Subjects, right));
        }
        return Tier1Predicates.Guard(concept, Tier1Predicates.AnyOf(terms));
    }

    /**
     * Rule 4: an unreadable secured field is hidden on its declaring concept (Hidden inherits to subconcepts); a readable
     * one without update or create is read-only at that stage. An edge concept has no Writes entry of its own (rule 6), so
     * its read-only fields get a ReadOnly-only entry: no predicates, so its endpoints' Append / AppendTo still gate it (R23).
     */
    private static FieldSecurity(context: CompileContext, writes: Map<string, IWriteRules>): ReadonlyMap<string, ReadonlySet<string>>
    {
        const hidden = new Map<string, Set<string>>();
        const readOnly = new Map<string, { Create: Set<string>; Update: Set<string> }>();
        const fields = context.Evaluator.FieldSecurity();
        for (const secured of fields.SecuredFields())
        {
            if (!context.Stored.has(secured.Concept))
            {
                continue;
            }
            if (!fields.CanReadField(context.Principal, secured.Concept, secured.Field))
            {
                Tier1ScopeCompiler.Entry(hidden, secured.Concept, () => new Set<string>()).add(secured.Field);
                continue;
            }
            const stages = Tier1ScopeCompiler.Entry(readOnly, secured.Concept, () => ({ Create: new Set<string>(), Update: new Set<string>() }));
            if (!fields.CanWriteField(context.Principal, secured.Concept, secured.Field, PrivilegeAction.Create))
            {
                stages.Create.add(secured.Field);
            }
            if (!fields.CanWriteField(context.Principal, secured.Concept, secured.Field, PrivilegeAction.Update))
            {
                stages.Update.add(secured.Field);
            }
        }
        for (const [concept, stages] of readOnly)
        {
            if (stages.Create.size === 0 && stages.Update.size === 0)
            {
                continue;
            }
            const rules = writes.get(concept);
            if (rules !== undefined)
            {
                writes.set(concept, { ...rules, ReadOnly: stages });
            }
            else if (context.Edges.has(concept))
            {
                writes.set(concept, { ReadOnly: stages });
            }
        }
        return hidden;
    }

    /** Rule 6 (PR6, T10, R21, R22): the platform vocabulary is readable by all and writable by none; grants are the share service's. */
    private static Platform(context: CompileContext, rows: Map<string, Predicate>, writes: Map<string, IWriteRules>): void
    {
        for (const concept of [TodlNames.Element, TodlNames.Term, SystemNames.ShareGrant])
        {
            if (context.Stored.has(concept))
            {
                // Vocabulary relinks (a term's broader) are vocabulary writes, so no Append; records stay linkable to terms, so
                // no AppendTo on Term/Element. A grant's record is never relinked by its grantee (R22): AppendTo too.
                const none = Tier1Predicates.Guard(concept, Predicate.False);
                const rules: IWriteRules = { Create: none, Update: none, Delete: none, Append: none };
                writes.set(concept, concept === SystemNames.ShareGrant ? { ...rules, AppendTo: none } : rules);
            }
        }
        if (context.Stored.has(TodlNames.Term))
        {
            rows.set(TodlNames.Term, Predicate.True);
        }
        if (context.Stored.has(SystemNames.ShareGrant))
        {
            rows.set(SystemNames.ShareGrant, Tier1Predicates.Guard(SystemNames.ShareGrant, ShareGrantScope.GrantRows(context.Subjects)));
        }
    }

    /** Rule 6 (PR4): an edge concept is governed by its endpoints' visibility and their Append / AppendTo rules only. */
    private static Endpoints(context: CompileContext, security: IEnvironmentSecurity): ReadonlyMap<string, IEndpointMembers>
    {
        const out = new Map<string, IEndpointMembers>();
        for (const edge of security.EdgeConcepts)
        {
            if (context.Stored.has(edge.Concept))
            {
                out.set(edge.Concept, { From: edge.From, To: edge.To });
            }
        }
        return out;
    }

    private static Entry<T>(map: Map<string, T>, key: string, create: () => T): T
    {
        let value = map.get(key);
        if (value === undefined)
        {
            value = create();
            map.set(key, value);
        }
        return value;
    }
}
