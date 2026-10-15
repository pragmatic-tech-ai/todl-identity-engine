import { PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import type { IFieldSecurityConfig, IFieldProfileConfig, IFieldGrantConfig, IFieldProfileAssignmentConfig, Principal } from "@pragmatic-tech-ai/todl-identity";
import type { MembershipResolver } from "./membership-resolver.js";

export class MalformedFieldSecurityError extends Error
{
    public constructor(message: string)
    {
        super(message);
        this.name = new.target.name;
    }
}

export class FieldSecurityEvaluator
{
    private static readonly GroupsChannel = "group";
    private static readonly KeySeparator = "\u0000";
    private static readonly DuplicateFieldMessage = "secured field is duplicated: ";
    private static readonly DuplicateProfileMessage = "field profile id is duplicated: ";
    private static readonly EmptyConceptMessage = "secured field has an empty concept";
    private static readonly EmptyFieldMessage = "secured field has an empty field name";
    private static readonly UnknownProfileMessage = "field profile assignment references an unknown profile: ";

    private constructor(
        private readonly secured: ReadonlySet<string>,
        private readonly profilesById: ReadonlyMap<string, IFieldProfileConfig>,
        private readonly assignment: IFieldProfileAssignmentConfig,
        private readonly membership: MembershipResolver | undefined)
    {
    }

    public static Open(): FieldSecurityEvaluator
    {
        return new FieldSecurityEvaluator(new Set<string>(), new Map<string, IFieldProfileConfig>(), { claimsMapping: [], overrides: [], teamProfiles: [] }, undefined);
    }

    public static FromConfig(config: IFieldSecurityConfig, membership: MembershipResolver): FieldSecurityEvaluator
    {
        const secured = new Set<string>();
        for (const field of config.securedFields)
        {
            if (field.concept.length === 0)
            {
                throw new MalformedFieldSecurityError(FieldSecurityEvaluator.EmptyConceptMessage);
            }
            if (field.field.length === 0)
            {
                throw new MalformedFieldSecurityError(FieldSecurityEvaluator.EmptyFieldMessage);
            }
            const key = FieldSecurityEvaluator.Key(field.concept, field.field);
            if (secured.has(key))
            {
                throw new MalformedFieldSecurityError(FieldSecurityEvaluator.DuplicateFieldMessage + key);
            }
            secured.add(key);
        }
        const profilesById = new Map<string, IFieldProfileConfig>();
        for (const profile of config.profiles)
        {
            if (profilesById.has(profile.id))
            {
                throw new MalformedFieldSecurityError(FieldSecurityEvaluator.DuplicateProfileMessage + profile.id);
            }
            profilesById.set(profile.id, profile);
        }
        FieldSecurityEvaluator.ValidateAssignment(config.profileAssignment, profilesById);
        return new FieldSecurityEvaluator(secured, profilesById, config.profileAssignment, membership);
    }

    public HasSecuredFields(): boolean
    {
        return this.secured.size > 0;
    }

    public IsSecured(concept: string, field: string): boolean
    {
        return this.secured.has(FieldSecurityEvaluator.Key(concept, field));
    }

    public CanReadField(principal: Principal, concept: string, field: string): boolean
    {
        return this.Granted(principal, concept, field, PrivilegeAction.Read);
    }

    public CanWriteField(principal: Principal, concept: string, field: string, action: PrivilegeAction): boolean
    {
        return this.Granted(principal, concept, field, action);
    }

    private Granted(principal: Principal, concept: string, field: string, action: PrivilegeAction): boolean
    {
        if (!this.IsSecured(concept, field))
        {
            return true;
        }
        for (const profileId of this.AssignedProfiles(principal))
        {
            const profile = this.profilesById.get(profileId);
            if (profile === undefined)
            {
                continue;
            }
            for (const grant of profile.grants)
            {
                if (grant.concept === concept && grant.field === field && FieldSecurityEvaluator.Allows(grant, action))
                {
                    return true;
                }
            }
        }
        return false;
    }

    private static Allows(grant: IFieldGrantConfig, action: PrivilegeAction): boolean
    {
        if (action === PrivilegeAction.Read)
        {
            return grant.read === true;
        }
        if (action === PrivilegeAction.Update)
        {
            return grant.update === true;
        }
        if (action === PrivilegeAction.Create)
        {
            return grant.create === true;
        }
        return false;
    }

    private AssignedProfiles(principal: Principal): ReadonlySet<string>
    {
        const out = new Set<string>();
        for (const rule of this.assignment.claimsMapping)
        {
            if (FieldSecurityEvaluator.Matches(rule.claim, rule.value, principal))
            {
                for (const profile of rule.profiles)
                {
                    out.add(profile);
                }
            }
        }
        for (const override of this.assignment.overrides)
        {
            if (override.principalId === principal.Id)
            {
                for (const profile of override.profiles)
                {
                    out.add(profile);
                }
            }
        }
        if (this.membership !== undefined)
        {
            const teams = this.membership.Resolve(principal).teams;
            for (const grant of this.assignment.teamProfiles)
            {
                if (teams.includes(grant.teamId))
                {
                    for (const profile of grant.profiles)
                    {
                        out.add(profile);
                    }
                }
            }
        }
        return out;
    }

    private static Matches(claim: string, value: string, principal: Principal): boolean
    {
        return claim === FieldSecurityEvaluator.GroupsChannel ? principal.HasGroup(value) : principal.Claim(claim) === value;
    }

    private static ValidateAssignment(assignment: IFieldProfileAssignmentConfig, profilesById: ReadonlyMap<string, IFieldProfileConfig>): void
    {
        const channels: readonly (readonly string[])[] = [
            ...assignment.claimsMapping.map(r => r.profiles),
            ...assignment.overrides.map(o => o.profiles),
            ...assignment.teamProfiles.map(t => t.profiles),
        ];
        for (const profiles of channels)
        {
            for (const id of profiles)
            {
                if (!profilesById.has(id))
                {
                    throw new MalformedFieldSecurityError(FieldSecurityEvaluator.UnknownProfileMessage + id);
                }
            }
        }
    }

    private static Key(concept: string, field: string): string
    {
        return concept + FieldSecurityEvaluator.KeySeparator + field;
    }
}
