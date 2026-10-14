import type { IMembershipConfig, IMembershipClaimRule, IMembershipOverride, Principal } from "@pragmatic-tech-ai/todl-identity";
import type { BusinessUnitHierarchy } from "./business-unit-hierarchy.js";

export interface IMembership
{
    readonly homeBusinessUnit: string;
    readonly teams: readonly string[];
}

export class MembershipResolver
{
    private static readonly GroupsChannel = "group";

    public constructor(
        private readonly config: IMembershipConfig,
        private readonly hierarchy: BusinessUnitHierarchy)
    {
    }

    public Resolve(principal: Principal): IMembership
    {
        let home: string | undefined = undefined;
        const teams = new Set<string>();
        for (const rule of this.config.claimsMapping)
        {
            if (!MembershipResolver.Matches(rule, principal))
            {
                continue;
            }
            if (home === undefined && rule.homeBusinessUnit !== undefined)
            {
                home = rule.homeBusinessUnit;
            }
            for (const team of rule.teams ?? [])
            {
                teams.add(team);
            }
        }
        let resolvedTeams: readonly string[] = [...teams];
        const override = this.OverrideFor(principal.Id);
        if (override !== undefined)
        {
            if (override.homeBusinessUnit !== undefined)
            {
                home = override.homeBusinessUnit;
            }
            if (override.teams !== undefined)
            {
                resolvedTeams = [...override.teams];
            }
        }
        return { homeBusinessUnit: home ?? this.hierarchy.RootId(), teams: resolvedTeams };
    }

    private static Matches(rule: IMembershipClaimRule, principal: Principal): boolean
    {
        if (rule.claim === MembershipResolver.GroupsChannel)
        {
            return principal.HasGroup(rule.value);
        }
        return principal.Claim(rule.claim) === rule.value;
    }

    private OverrideFor(principalId: string): IMembershipOverride | undefined
    {
        for (const override of this.config.overrides)
        {
            if (override.principalId === principalId)
            {
                return override;
            }
        }
        return undefined;
    }
}
