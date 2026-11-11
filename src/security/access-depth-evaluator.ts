import { SystemNames, type IEnvironmentSecurity } from "@pragmatic-tech-ai/todl/engine";
import { AccessLevel, BaseRole, SystemPrincipal, type IRoleAssignmentConfig, type Principal, type PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import { EffectiveRoleTable } from "./effective-role-table.js";
import { FieldSecurityEvaluator } from "./field-security-evaluator.js";
import type { IMembership } from "./membership-resolver.js";
import { TenantSecurityModel } from "./tenant-security-model.js";
import { Tier1Diagnostic, Tier1DiagnosticCode } from "./tier1-diagnostic.js";

export enum AssignOutcome
{
    Writes = "writes",
    Unsupported = "unsupported",
    UnknownTeam = "unknownTeam",
    UnknownBusinessUnit = "unknownBusinessUnit",
    OwningBusinessUnitRequired = "owningBusinessUnitRequired",
}

export interface IAssignComputation
{
    readonly outcome: AssignOutcome;
    readonly writes: readonly { field: string; value: string }[];
}

/**
 * The roles one principal holds from one source (PR5, Dataverse semantics): the roles assigned to it directly, evaluated
 * against its home unit, or the roles held through one active team, evaluated against that team's unit.
 */
export class RoleSource
{
    public constructor(
        public readonly Roles: ReadonlySet<string>,
        public readonly BusinessUnitId: string,
        public readonly TeamId: string | undefined)
    {
    }
}

/** Tier-1 role evaluation for one environment: effective roles per principal and source, and the depth each grants. */
export class AccessDepthEvaluator
{
    private static readonly UnknownAssignedRoleMessage = "role assignment names a role no deployed package or the platform defines: ";
    private static readonly UnplacedPrincipalMessage = "principal holds direct role assignments but has no business-unit placement; evaluated at the root: ";

    private constructor(
        private readonly security: IEnvironmentSecurity,
        private readonly model: TenantSecurityModel,
        private readonly table: EffectiveRoleTable,
        private readonly assignments: readonly IRoleAssignmentConfig[],
        private readonly fieldSecurity: FieldSecurityEvaluator,
        private readonly diagnostics: readonly Tier1Diagnostic[])
    {
    }

    /** `concepts` are the environment's engine-stored concepts; its edge concepts are left out of the role table. */
    public static For(security: IEnvironmentSecurity, model: TenantSecurityModel, concepts: ReadonlySet<string>): AccessDepthEvaluator
    {
        const config = model.Config();
        const edges = new Set<string>(security.EdgeConcepts.map(e => e.Concept));
        const nodes = new Set<string>([...concepts].filter(c => !edges.has(c)));
        const table = EffectiveRoleTable.Build(security, config.roleOverrides, nodes);
        const diagnostics: Tier1Diagnostic[] = [...table.Diagnostics()];
        const assignments: IRoleAssignmentConfig[] = [];
        for (const assignment of config.roleAssignments)
        {
            if (!table.HasRole(assignment.role))
            {
                const message = AccessDepthEvaluator.UnknownAssignedRoleMessage + assignment.role;
                diagnostics.push(new Tier1Diagnostic(Tier1DiagnosticCode.UnknownAssignedRole, assignment.role, message));
                continue;
            }
            assignments.push(assignment);
        }
        AccessDepthEvaluator.ReportUnplaced(config.users.map(u => u.principalId), assignments, diagnostics);
        const fieldSecurity = FieldSecurityEvaluator.For(security, config.profileAssignments, config.profileOverrides, model.Membership());
        diagnostics.push(...fieldSecurity.Diagnostics());
        return new AccessDepthEvaluator(security, model, table, assignments, fieldSecurity, diagnostics);
    }

    /** A directly assigned principal without a placement sits at the root, so its BU depths read organisation-wide (C7). */
    private static ReportUnplaced(placed: readonly string[], assignments: readonly IRoleAssignmentConfig[], diagnostics: Tier1Diagnostic[]): void
    {
        const known = new Set<string>(placed);
        for (const assignment of assignments)
        {
            for (const principalId of assignment.principalIds)
            {
                if (known.has(principalId))
                {
                    continue;
                }
                known.add(principalId);
                const message = AccessDepthEvaluator.UnplacedPrincipalMessage + principalId;
                diagnostics.push(new Tier1Diagnostic(Tier1DiagnosticCode.UnplacedPrincipalWithRoles, principalId, message));
            }
        }
    }

    /** No packages, no setting: only the system principal holds anything. */
    public static DenyAll(): AccessDepthEvaluator
    {
        const security: IEnvironmentSecurity = { Packages: new Map(), EdgeConcepts: [], OwnedConcepts: () => new Set<string>() };
        return AccessDepthEvaluator.For(security, TenantSecurityModel.Empty(), new Set<string>());
    }

    public EffectiveRoles(principal: Principal): ReadonlySet<string>
    {
        const roles = new Set<string>();
        for (const source of this.RoleSources(principal))
        {
            for (const role of source.Roles)
            {
                roles.add(role);
            }
        }
        return roles;
    }

    /** The direct source first, then one source per active team holding a role, by team id; sources without roles are left out. */
    public RoleSources(principal: Principal): readonly RoleSource[]
    {
        if (!this.model.IsActive(principal))
        {
            return [];
        }
        const sources: RoleSource[] = [];
        const direct = new Set<string>();
        for (const assignment of this.assignments)
        {
            if (assignment.principalIds.includes(principal.Id))
            {
                direct.add(assignment.role);
            }
        }
        if (SystemPrincipal.Is(principal))
        {
            direct.add(BaseRole.SystemAdministrator);
        }
        if (direct.size > 0)
        {
            sources.push(new RoleSource(direct, this.model.PlacementOf(principal).HomeBusinessUnitId, undefined));
        }
        for (const team of [...this.MembershipOf(principal).teams].sort())
        {
            const unit = this.model.TeamBusinessUnit(team);
            if (unit === undefined)
            {
                continue;
            }
            const roles = new Set<string>();
            for (const assignment of this.assignments)
            {
                if (assignment.teamIds.includes(team))
                {
                    roles.add(assignment.role);
                }
            }
            if (roles.size > 0)
            {
                sources.push(new RoleSource(roles, unit, team));
            }
        }
        return sources;
    }

    /** The highest depth any of the source's roles grants for the action on the concept. */
    public SourceLevel(source: RoleSource, action: PrivilegeAction, concept: string): AccessLevel
    {
        let best = AccessLevel.None;
        for (const role of source.Roles)
        {
            best = EffectiveRoleTable.Max(best, this.table.Level(role, concept, action));
        }
        return best;
    }

    public IsSystemAdministrator(principal: Principal): boolean
    {
        return this.EffectiveRoles(principal).has(BaseRole.SystemAdministrator);
    }

    /** The highest depth over every source; never used to pick a business unit (PR5). */
    public EffectiveLevel(principal: Principal, action: PrivilegeAction, concept: string): AccessLevel
    {
        let best = AccessLevel.None;
        for (const source of this.RoleSources(principal))
        {
            best = EffectiveRoleTable.Max(best, this.SourceLevel(source, action, concept));
        }
        return best;
    }

    /** Whether the concept takes the ownership aspect in this environment (inherited ownership included). */
    public IsOwned(concept: string): boolean
    {
        return this.security.OwnedConcepts().has(concept);
    }

    public MembershipOf(principal: Principal): IMembership
    {
        return this.model.Membership().Resolve(principal);
    }

    /**
     * The system-field writes of assigning a record to an owner (spec §4.4). The unit is derived first: a team owner gets
     * its team's unit, the system principal the root, a placed user its placement; a contradicting `owningBu` is ignored.
     * Only an unplaced user takes the explicit `owningBu`, which must exist; with neither it is OwningBusinessUnitRequired.
     */
    public AssignWrites(environmentId: string, concept: string, ownerId: string, ownerIsTeam: boolean, owningBu: string | undefined): IAssignComputation
    {
        if (!this.IsOwned(concept))
        {
            return { outcome: AssignOutcome.Unsupported, writes: [] };
        }
        const teamUnit = ownerIsTeam ? this.model.TeamBusinessUnit(ownerId) : undefined;
        if (ownerIsTeam && teamUnit === undefined)
        {
            return { outcome: AssignOutcome.UnknownTeam, writes: [] };
        }
        let bu = ownerIsTeam ? teamUnit : this.UserUnitOf(ownerId, environmentId);
        if (bu === undefined)
        {
            if (owningBu === undefined)
            {
                return { outcome: AssignOutcome.OwningBusinessUnitRequired, writes: [] };
            }
            if (!this.model.Hierarchy().Has(owningBu))
            {
                return { outcome: AssignOutcome.UnknownBusinessUnit, writes: [] };
            }
            bu = owningBu;
        }
        return {
            outcome: AssignOutcome.Writes,
            writes: [{ field: SystemNames.Owner, value: ownerId }, { field: SystemNames.OwningBusinessUnit, value: bu }],
        };
    }

    public Model(): TenantSecurityModel
    {
        return this.model;
    }

    public FieldSecurity(): FieldSecurityEvaluator
    {
        return this.fieldSecurity;
    }

    /** Every dropped or reinterpreted entry of the setting: role table, role assignments and field security. */
    public Diagnostics(): readonly Tier1Diagnostic[]
    {
        return this.diagnostics;
    }

    // An assign names a user by id only: the environment's system principal sits at the root, an unplaced user has no
    // resolvable unit.
    private UserUnitOf(principalId: string, environmentId: string): string | undefined
    {
        if (SystemPrincipal.IsId(principalId, environmentId))
        {
            return this.model.Hierarchy().RootId();
        }
        return this.model.Config().users.find(u => u.principalId === principalId)?.businessUnitId;
    }
}
