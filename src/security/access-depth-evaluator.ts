import type { IInstanceView } from "@pragmatic-tech-ai/todl";
import { PrivilegeAction, AccessLevel } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig, IRoleConfig, IPrivilegeConfig, IRoleAssignmentConfig, ITeamConfig, Principal } from "@pragmatic-tech-ai/todl-identity";
import { TenantSecurityModel } from "./tenant-security-model.js";
import type { FieldSecurityEvaluator } from "./field-security-evaluator.js";
import type { IMembership } from "./membership-resolver.js";

export class MalformedRolesError extends Error
{
    public constructor(message: string)
    {
        super(message);
        this.name = new.target.name;
    }
}

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

export class AccessDepthEvaluator
{
    private static readonly GroupsChannel = "group";
    private static readonly LevelOrder: readonly AccessLevel[] =
    [
        AccessLevel.None,
        AccessLevel.User,
        AccessLevel.BusinessUnit,
        AccessLevel.BusinessUnitAndChildren,
        AccessLevel.Organization,
    ];

    private static readonly DuplicateRoleMessage = "role id is duplicated: ";
    private static readonly EmptyConceptMessage = "privilege has an empty concept in role: ";
    private static readonly UnknownActionMessage = "privilege has an unknown action in role: ";
    private static readonly UnknownLevelMessage = "privilege has an unknown level in role: ";
    private static readonly UnknownRoleRefMessage = "role assignment references an unknown role: ";
    private static readonly UnknownTeamRefMessage = "team-role grant references an unknown team: ";
    private static readonly DuplicateOverrideMessage = "role assignment has a duplicate override for principal: ";

    private constructor(
        private readonly model: TenantSecurityModel,
        private readonly rolesById: ReadonlyMap<string, IRoleConfig>,
        private readonly assignment: IRoleAssignmentConfig,
        private readonly teamOwningBusinessUnit: ReadonlyMap<string, string>,
        private readonly knownTeams: ReadonlySet<string>,
        private readonly governedConcepts: ReadonlySet<string>)
    {
    }

    public static FromConfig(config: ISecurityModelConfig): AccessDepthEvaluator
    {
        const model = TenantSecurityModel.FromConfig(config);
        const roles = config.roles ?? [];
        const assignment = config.roleAssignment ?? { claimsMapping: [], overrides: [], teamRoles: [] };
        const rolesById = AccessDepthEvaluator.IndexRoles(roles);
        AccessDepthEvaluator.ValidateAssignment(assignment, rolesById, config.teams);
        const teamOwningBusinessUnit = new Map<string, string>();
        const knownTeams = new Set<string>();
        for (const team of config.teams)
        {
            knownTeams.add(team.id);
            if (team.owningBusinessUnit !== undefined)
            {
                teamOwningBusinessUnit.set(team.id, team.owningBusinessUnit);
            }
        }
        const governed = new Set<string>();
        for (const role of roles)
        {
            for (const privilege of role.privileges)
            {
                governed.add(privilege.concept);
            }
        }
        for (const rule of config.ownershipRules ?? [])
        {
            governed.add(rule.concept);
        }
        return new AccessDepthEvaluator(model, rolesById, assignment, teamOwningBusinessUnit, knownTeams, governed);
    }

    public static DenyAll(): AccessDepthEvaluator
    {
        return new AccessDepthEvaluator(
            TenantSecurityModel.Empty(),
            new Map<string, IRoleConfig>(),
            { claimsMapping: [], overrides: [], teamRoles: [] },
            new Map<string, string>(),
            new Set<string>(),
            new Set<string>());
    }

    public GovernedConcepts(): ReadonlySet<string>
    {
        return this.governedConcepts;
    }

    public EffectiveRoles(principal: Principal): ReadonlySet<string>
    {
        const roles = new Set<string>(this.DirectRoles(principal));
        const membership = this.model.Membership().Resolve(principal);
        for (const teamId of membership.teams)
        {
            for (const grant of this.assignment.teamRoles)
            {
                if (grant.teamId === teamId)
                {
                    for (const role of grant.roles)
                    {
                        roles.add(role);
                    }
                }
            }
        }
        return roles;
    }

    public EffectiveLevel(principal: Principal, action: PrivilegeAction, concept: string): AccessLevel
    {
        let best = AccessLevel.None;
        for (const roleId of this.EffectiveRoles(principal))
        {
            const role = this.rolesById.get(roleId);
            if (role === undefined)
            {
                continue;
            }
            for (const privilege of role.privileges)
            {
                if (privilege.action === action && privilege.concept === concept)
                {
                    best = AccessDepthEvaluator.Max(best, privilege.level);
                }
            }
        }
        return best;
    }

    public Allows(principal: Principal, action: PrivilegeAction, view: IInstanceView): boolean
    {
        const level = this.EffectiveLevel(principal, action, view.Concept);
        if (level === AccessLevel.None)
        {
            return false;
        }
        if (level === AccessLevel.Organization)
        {
            return true;
        }
        const ownership = this.model.Ownership().Resolve(view);
        const membership = this.model.Membership().Resolve(principal);
        if (level === AccessLevel.User)
        {
            if (ownership.owner === undefined)
            {
                return false;
            }
            return ownership.owner === principal.Id || membership.teams.includes(ownership.owner);
        }
        const reach = this.ReachBusinessUnits(membership.homeBusinessUnit, membership.teams);
        if (level === AccessLevel.BusinessUnit)
        {
            return reach.has(ownership.owningBusinessUnit);
        }
        const hierarchy = this.model.Hierarchy();
        for (const scope of reach)
        {
            if (hierarchy.Contains(scope, ownership.owningBusinessUnit))
            {
                return true;
            }
        }
        return false;
    }

    public CreateDefaults(principal: Principal, concept: string): readonly { field: string; value: string }[]
    {
        const home = this.model.Membership().Resolve(principal).homeBusinessUnit;
        return this.model.Ownership().CreateFieldDefaults(concept, principal.Id, home);
    }

    public FieldSecurity(): FieldSecurityEvaluator
    {
        return this.model.FieldSecurity();
    }

    public MembershipOf(principal: Principal): IMembership
    {
        return this.model.Membership().Resolve(principal);
    }

    public IsKnownTeam(teamId: string): boolean
    {
        return this.knownTeams.has(teamId);
    }

    public AssignWrites(concept: string, ownerId: string, ownerIsTeam: boolean, owningBu: string | undefined): IAssignComputation
    {
        const ownership = this.model.Ownership();
        if (ownership.OwnerField(concept) === undefined)
        {
            return { outcome: AssignOutcome.Unsupported, writes: [] };
        }
        if (ownerIsTeam && !this.IsKnownTeam(ownerId))
        {
            return { outcome: AssignOutcome.UnknownTeam, writes: [] };
        }
        let bu: string | undefined;
        if (owningBu !== undefined)
        {
            if (!this.model.Hierarchy().Has(owningBu))
            {
                return { outcome: AssignOutcome.UnknownBusinessUnit, writes: [] };
            }
            bu = owningBu;
        }
        else if (ownerIsTeam)
        {
            bu = this.teamOwningBusinessUnit.get(ownerId);
        }
        else
        {
            bu = undefined;
        }
        if (ownership.BusinessUnitField(concept) !== undefined && bu === undefined)
        {
            return { outcome: AssignOutcome.OwningBusinessUnitRequired, writes: [] };
        }
        return { outcome: AssignOutcome.Writes, writes: ownership.CreateFieldDefaults(concept, ownerId, bu ?? "") };
    }

    private DirectRoles(principal: Principal): readonly string[]
    {
        for (const override of this.assignment.overrides)
        {
            if (override.principalId === principal.Id)
            {
                return override.roles;
            }
        }
        const roles = new Set<string>();
        for (const rule of this.assignment.claimsMapping)
        {
            if (AccessDepthEvaluator.Matches(rule.claim, rule.value, principal))
            {
                for (const role of rule.roles)
                {
                    roles.add(role);
                }
            }
        }
        return [...roles];
    }

    private ReachBusinessUnits(homeBusinessUnit: string, teams: readonly string[]): ReadonlySet<string>
    {
        const reach = new Set<string>([homeBusinessUnit]);
        for (const teamId of teams)
        {
            const bu = this.teamOwningBusinessUnit.get(teamId);
            if (bu !== undefined)
            {
                reach.add(bu);
            }
        }
        return reach;
    }

    private static Matches(claim: string, value: string, principal: Principal): boolean
    {
        if (claim === AccessDepthEvaluator.GroupsChannel)
        {
            return principal.HasGroup(value);
        }
        return principal.Claim(claim) === value;
    }

    private static Max(a: AccessLevel, b: AccessLevel): AccessLevel
    {
        return AccessDepthEvaluator.LevelOrder.indexOf(b) > AccessDepthEvaluator.LevelOrder.indexOf(a) ? b : a;
    }

    private static IndexRoles(roles: readonly IRoleConfig[]): ReadonlyMap<string, IRoleConfig>
    {
        const byId = new Map<string, IRoleConfig>();
        for (const role of roles)
        {
            if (byId.has(role.id))
            {
                throw new MalformedRolesError(AccessDepthEvaluator.DuplicateRoleMessage + role.id);
            }
            for (const privilege of role.privileges)
            {
                AccessDepthEvaluator.ValidatePrivilege(privilege, role.id);
            }
            byId.set(role.id, role);
        }
        return byId;
    }

    private static ValidatePrivilege(privilege: IPrivilegeConfig, roleId: string): void
    {
        if (privilege.concept.length === 0)
        {
            throw new MalformedRolesError(AccessDepthEvaluator.EmptyConceptMessage + roleId);
        }
        if (!Object.values(PrivilegeAction).includes(privilege.action))
        {
            throw new MalformedRolesError(AccessDepthEvaluator.UnknownActionMessage + roleId);
        }
        if (AccessDepthEvaluator.LevelOrder.indexOf(privilege.level) < 0)
        {
            throw new MalformedRolesError(AccessDepthEvaluator.UnknownLevelMessage + roleId);
        }
    }

    private static ValidateAssignment(assignment: IRoleAssignmentConfig, rolesById: ReadonlyMap<string, IRoleConfig>, teams: readonly ITeamConfig[]): void
    {
        const teamIds = new Set<string>();
        for (const team of teams)
        {
            teamIds.add(team.id);
        }
        for (const rule of assignment.claimsMapping)
        {
            AccessDepthEvaluator.AssertKnownRoles(rule.roles, rolesById);
        }
        const seenPrincipals = new Set<string>();
        for (const override of assignment.overrides)
        {
            if (seenPrincipals.has(override.principalId))
            {
                throw new MalformedRolesError(AccessDepthEvaluator.DuplicateOverrideMessage + override.principalId);
            }
            seenPrincipals.add(override.principalId);
            AccessDepthEvaluator.AssertKnownRoles(override.roles, rolesById);
        }
        for (const grant of assignment.teamRoles)
        {
            if (!teamIds.has(grant.teamId))
            {
                throw new MalformedRolesError(AccessDepthEvaluator.UnknownTeamRefMessage + grant.teamId);
            }
            AccessDepthEvaluator.AssertKnownRoles(grant.roles, rolesById);
        }
    }

    private static AssertKnownRoles(roles: readonly string[], rolesById: ReadonlyMap<string, IRoleConfig>): void
    {
        for (const role of roles)
        {
            if (!rolesById.has(role))
            {
                throw new MalformedRolesError(AccessDepthEvaluator.UnknownRoleRefMessage + role);
            }
        }
    }
}
