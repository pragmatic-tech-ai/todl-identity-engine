import { BusinessUnitHierarchy, IdpDirectorySnapshot, SecurityModelValidator, TeamMembershipRows, type ISecurityModelConfig, type Principal } from "@pragmatic-tech-ai/todl-identity";
import { MembershipResolver } from "./membership-resolver.js";

/** Where a principal sits in the business-unit tree. */
export interface IPrincipalPlacement
{
    readonly PrincipalId: string;
    readonly HomeBusinessUnitId: string;
}

/** An environment's organisation facts: the validated C5 setting, its business-unit tree, the IdP directory and team membership. */
export class TenantSecurityModel
{
    public static readonly DefaultRootBusinessUnitId = "root";

    private static readonly DefaultRootName = "Root";

    private readonly teamUnits: ReadonlyMap<string, string>;

    private constructor(
        private readonly config: ISecurityModelConfig,
        private readonly hierarchy: BusinessUnitHierarchy,
        private readonly directory: IdpDirectorySnapshot,
        private readonly membership: MembershipResolver)
    {
        this.teamUnits = new Map<string, string>(config.teams.map(t => [t.id, t.businessUnitId]));
    }

    /** Throws InvalidSecurityModelError when the setting is not valid. */
    public static FromConfig(config: ISecurityModelConfig, directory: IdpDirectorySnapshot): TenantSecurityModel
    {
        SecurityModelValidator.AssertValid(config);
        const hierarchy = BusinessUnitHierarchy.FromConfig(config.businessUnits);
        const membership = new MembershipResolver(config, hierarchy, TeamMembershipRows.For(config, directory));
        return new TenantSecurityModel(config, hierarchy, directory, membership);
    }

    /** A root-only tree, nobody placed, no teams, on a non-authoritative directory. */
    public static Empty(): TenantSecurityModel
    {
        const config: ISecurityModelConfig = {
            businessUnits: [{ id: TenantSecurityModel.DefaultRootBusinessUnitId, name: TenantSecurityModel.DefaultRootName }],
            users: [],
            teams: [],
            roleAssignments: [],
            profileAssignments: [],
            roleOverrides: [],
            profileOverrides: [],
        };
        return TenantSecurityModel.FromConfig(config, IdpDirectorySnapshot.NonAuthoritative(new Date(0)));
    }

    public Config(): ISecurityModelConfig
    {
        return this.config;
    }

    public Hierarchy(): BusinessUnitHierarchy
    {
        return this.hierarchy;
    }

    public Directory(): IdpDirectorySnapshot
    {
        return this.directory;
    }

    public Membership(): MembershipResolver
    {
        return this.membership;
    }

    /** False when the IdP records the user as disabled or deleted; such a principal holds nothing. */
    public IsActive(principal: Principal): boolean
    {
        return this.directory.IsActive(principal);
    }

    /** A principal without a placement, and the system principal, sit at the root (C7). */
    public PlacementOf(principal: Principal): IPrincipalPlacement
    {
        return { PrincipalId: principal.Id, HomeBusinessUnitId: this.membership.Resolve(principal).homeBusinessUnit };
    }

    public TeamBusinessUnit(teamId: string): string | undefined
    {
        return this.teamUnits.get(teamId);
    }
}
