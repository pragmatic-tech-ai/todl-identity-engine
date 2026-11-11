import { SystemPrincipal, type BusinessUnitHierarchy, type IdpDirectorySnapshot, type ISecurityModelConfig, type Principal, type TeamMembershipRows } from "@pragmatic-tech-ai/todl-identity";

export interface IMembership
{
    readonly homeBusinessUnit: string;
    readonly teams: readonly string[];
}

/** A principal's home unit (its placement, else the root) and its active teams (synced ∪ manual rows of active identities). */
export class MembershipResolver
{
    private readonly placements: ReadonlyMap<string, string>;

    public constructor(
        config: ISecurityModelConfig,
        private readonly hierarchy: BusinessUnitHierarchy,
        private readonly rows: TeamMembershipRows,
        private readonly directory: IdpDirectorySnapshot)
    {
        this.placements = new Map<string, string>(config.users.map(u => [u.principalId, u.businessUnitId]));
    }

    public Resolve(principal: Principal): IMembership
    {
        return { homeBusinessUnit: this.HomeOf(principal), teams: this.rows.TeamsOf(principal) };
    }

    /** False when the IdP records the user as disabled or deleted. */
    public IsActive(principal: Principal): boolean
    {
        return this.directory.IsActive(principal);
    }

    /** The system principal, and a principal without a placement, sit at the root (C7). */
    private HomeOf(principal: Principal): string
    {
        if (SystemPrincipal.Is(principal))
        {
            return this.hierarchy.RootId();
        }
        return this.placements.get(principal.Id) ?? this.hierarchy.RootId();
    }
}
