import { OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig, IOwnershipRuleConfig, IOwnershipSource, ITeamConfig, IMembershipConfig } from "@pragmatic-tech-ai/todl-identity";
import { BusinessUnitHierarchy } from "./business-unit-hierarchy.js";
import { MembershipResolver } from "./membership-resolver.js";
import { OwnershipResolver } from "./ownership-resolver.js";

export class MalformedSecurityModelError extends Error
{
    public constructor(message: string)
    {
        super(message);
        this.name = new.target.name;
    }
}

export class TenantSecurityModel
{
    public static readonly DefaultRootBusinessUnitId = "root";

    private static readonly DefaultRootName = "Root";
    private static readonly DuplicateTeamMessage = "team id is duplicated: ";
    private static readonly UnknownTeamBuMessage = "team references unknown business unit: ";
    private static readonly UnknownMembershipBuMessage = "membership references unknown business unit: ";
    private static readonly UnknownMembershipTeamMessage = "membership references unknown team: ";
    private static readonly EmptyConceptMessage = "ownership rule has an empty concept";
    private static readonly DuplicateConceptMessage = "ownership rule concept is duplicated: ";
    private static readonly UnknownOwningBuMessage = "ownership rule references unknown business unit: ";
    private static readonly UnknownSourceKindMessage = "ownership source has an unknown kind: ";
    private static readonly EmptySourceValueMessage = "ownership source has an empty value for concept: ";

    private constructor(
        private readonly hierarchy: BusinessUnitHierarchy,
        private readonly membership: MembershipResolver,
        private readonly ownership: OwnershipResolver)
    {
    }

    public static FromConfig(config: ISecurityModelConfig): TenantSecurityModel
    {
        const hierarchy = BusinessUnitHierarchy.FromConfig(config.businessUnits);
        const teamIds = TenantSecurityModel.ValidateTeams(config.teams, hierarchy);
        TenantSecurityModel.ValidateMembership(config.membership, hierarchy, teamIds);
        TenantSecurityModel.ValidateOwnership(config.ownershipRules, hierarchy);
        return new TenantSecurityModel(
            hierarchy,
            new MembershipResolver(config.membership, hierarchy),
            new OwnershipResolver(config.ownershipRules, hierarchy));
    }

    public static Empty(): TenantSecurityModel
    {
        const hierarchy = BusinessUnitHierarchy.FromConfig([
            { id: TenantSecurityModel.DefaultRootBusinessUnitId, name: TenantSecurityModel.DefaultRootName },
        ]);
        const membership: IMembershipConfig = { claimsMapping: [], overrides: [] };
        return new TenantSecurityModel(hierarchy, new MembershipResolver(membership, hierarchy), new OwnershipResolver([], hierarchy));
    }

    public Hierarchy(): BusinessUnitHierarchy
    {
        return this.hierarchy;
    }

    public Membership(): MembershipResolver
    {
        return this.membership;
    }

    public Ownership(): OwnershipResolver
    {
        return this.ownership;
    }

    private static ValidateTeams(teams: readonly ITeamConfig[], hierarchy: BusinessUnitHierarchy): ReadonlySet<string>
    {
        const ids = new Set<string>();
        for (const team of teams)
        {
            if (ids.has(team.id))
            {
                throw new MalformedSecurityModelError(TenantSecurityModel.DuplicateTeamMessage + team.id);
            }
            ids.add(team.id);
            if (team.owningBusinessUnit !== undefined && !hierarchy.Has(team.owningBusinessUnit))
            {
                throw new MalformedSecurityModelError(TenantSecurityModel.UnknownTeamBuMessage + team.owningBusinessUnit);
            }
        }
        return ids;
    }

    private static ValidateMembership(config: IMembershipConfig, hierarchy: BusinessUnitHierarchy, teamIds: ReadonlySet<string>): void
    {
        for (const rule of config.claimsMapping)
        {
            TenantSecurityModel.ValidateMembershipRefs(rule.homeBusinessUnit, rule.teams, hierarchy, teamIds);
        }
        for (const override of config.overrides)
        {
            TenantSecurityModel.ValidateMembershipRefs(override.homeBusinessUnit, override.teams, hierarchy, teamIds);
        }
    }

    private static ValidateMembershipRefs(home: string | undefined, teams: readonly string[] | undefined, hierarchy: BusinessUnitHierarchy, teamIds: ReadonlySet<string>): void
    {
        if (home !== undefined && !hierarchy.Has(home))
        {
            throw new MalformedSecurityModelError(TenantSecurityModel.UnknownMembershipBuMessage + home);
        }
        for (const team of teams ?? [])
        {
            if (!teamIds.has(team))
            {
                throw new MalformedSecurityModelError(TenantSecurityModel.UnknownMembershipTeamMessage + team);
            }
        }
    }

    private static ValidateOwnership(rules: readonly IOwnershipRuleConfig[], hierarchy: BusinessUnitHierarchy): void
    {
        const concepts = new Set<string>();
        for (const rule of rules)
        {
            if (rule.concept.length === 0)
            {
                throw new MalformedSecurityModelError(TenantSecurityModel.EmptyConceptMessage);
            }
            if (concepts.has(rule.concept))
            {
                throw new MalformedSecurityModelError(TenantSecurityModel.DuplicateConceptMessage + rule.concept);
            }
            concepts.add(rule.concept);
            TenantSecurityModel.ValidateSource(rule.owningBusinessUnit, rule.concept, hierarchy, true);
            if (rule.owner !== undefined)
            {
                TenantSecurityModel.ValidateSource(rule.owner, rule.concept, hierarchy, false);
            }
        }
    }

    private static ValidateSource(source: IOwnershipSource, concept: string, hierarchy: BusinessUnitHierarchy, isBusinessUnit: boolean): void
    {
        if (source.kind !== OwnershipSourceKind.Fixed && source.kind !== OwnershipSourceKind.FromField)
        {
            throw new MalformedSecurityModelError(TenantSecurityModel.UnknownSourceKindMessage + String(source.kind));
        }
        if (source.value.length === 0)
        {
            throw new MalformedSecurityModelError(TenantSecurityModel.EmptySourceValueMessage + concept);
        }
        if (isBusinessUnit && source.kind === OwnershipSourceKind.Fixed && !hierarchy.Has(source.value))
        {
            throw new MalformedSecurityModelError(TenantSecurityModel.UnknownOwningBuMessage + source.value);
        }
    }
}
