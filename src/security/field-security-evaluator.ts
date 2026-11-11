import type { IEnvironmentSecurity } from "@pragmatic-tech-ai/todl/engine";
import { PrivilegeAction, type IProfileAssignmentConfig, type IProfileOverrideConfig, type Principal } from "@pragmatic-tech-ai/todl-identity";
import type { MembershipResolver } from "./membership-resolver.js";
import { Tier1Diagnostic, Tier1DiagnosticCode } from "./tier1-diagnostic.js";

interface IFieldRights
{
    readonly Read: boolean;
    readonly Update: boolean;
    readonly Create: boolean;
}

/**
 * Field-level security over the packages' secured fields: a profile's rights are its package defaults with the
 * environment's profile overrides on top, and a profile reaches a principal directly or through an active team.
 */
export class FieldSecurityEvaluator
{
    private static readonly KeySeparator = "\u0000";
    private static readonly FieldSeparator = ".";
    private static readonly UnknownAssignedMessage = "profile assignment names a profile no deployed package defines: ";
    private static readonly OverrideUnknownProfileMessage = "profile override names a profile no deployed package defines: ";
    private static readonly OverrideUnknownFieldMessage = "profile override names a field no deployed package secures: ";

    private constructor(
        private readonly secured: ReadonlyMap<string, { readonly Concept: string; readonly Field: string }>,
        private readonly profiles: ReadonlyMap<string, ReadonlyMap<string, IFieldRights>>,
        private readonly assignments: readonly IProfileAssignmentConfig[],
        private readonly membership: MembershipResolver | undefined,
        private readonly diagnostics: readonly Tier1Diagnostic[])
    {
    }

    /** No secured fields: every field is readable and writable. */
    public static Open(): FieldSecurityEvaluator
    {
        return new FieldSecurityEvaluator(new Map(), new Map(), [], undefined, []);
    }

    public static For(security: IEnvironmentSecurity, assignments: readonly IProfileAssignmentConfig[], overrides: readonly IProfileOverrideConfig[], membership: MembershipResolver): FieldSecurityEvaluator
    {
        const secured = new Map<string, { readonly Concept: string; readonly Field: string }>();
        const profiles = new Map<string, Map<string, IFieldRights>>();
        for (const id of [...security.Packages.keys()].sort())
        {
            const pkg = security.Packages.get(id);
            for (const field of pkg?.SecuredFields ?? [])
            {
                secured.set(FieldSecurityEvaluator.Key(field.Concept, field.Field), { Concept: field.Concept, Field: field.Field });
            }
            for (const profile of pkg?.FieldProfiles ?? [])
            {
                const rights = profiles.get(profile.Name) ?? new Map<string, IFieldRights>();
                for (const entry of profile.Fields)
                {
                    rights.set(FieldSecurityEvaluator.Key(entry.Concept, entry.Field), { Read: entry.Read, Update: entry.Update, Create: entry.Create });
                }
                profiles.set(profile.Name, rights);
            }
        }
        const diagnostics: Tier1Diagnostic[] = [];
        for (const override of overrides)
        {
            const rights = profiles.get(override.profile);
            const key = FieldSecurityEvaluator.Key(override.concept, override.field);
            if (rights === undefined)
            {
                FieldSecurityEvaluator.Report(diagnostics, Tier1DiagnosticCode.OverrideUnknownProfile, override.profile, FieldSecurityEvaluator.OverrideUnknownProfileMessage);
                continue;
            }
            if (!secured.has(key))
            {
                const subject = override.concept + FieldSecurityEvaluator.FieldSeparator + override.field;
                FieldSecurityEvaluator.Report(diagnostics, Tier1DiagnosticCode.OverrideUnknownField, subject, FieldSecurityEvaluator.OverrideUnknownFieldMessage);
                continue;
            }
            rights.set(key, { Read: override.read, Update: override.update, Create: override.create });
        }
        const kept: IProfileAssignmentConfig[] = [];
        for (const assignment of assignments)
        {
            if (!profiles.has(assignment.profile))
            {
                FieldSecurityEvaluator.Report(diagnostics, Tier1DiagnosticCode.UnknownAssignedProfile, assignment.profile, FieldSecurityEvaluator.UnknownAssignedMessage);
                continue;
            }
            kept.push(assignment);
        }
        return new FieldSecurityEvaluator(secured, profiles, kept, membership, diagnostics);
    }

    public IsSecured(concept: string, field: string): boolean
    {
        return this.secured.has(FieldSecurityEvaluator.Key(concept, field));
    }

    public SecuredFields(): readonly { readonly Concept: string; readonly Field: string }[]
    {
        return [...this.secured.values()];
    }

    public CanReadField(principal: Principal, concept: string, field: string): boolean
    {
        return this.Granted(principal, concept, field, PrivilegeAction.Read);
    }

    public CanWriteField(principal: Principal, concept: string, field: string, action: PrivilegeAction.Create | PrivilegeAction.Update): boolean
    {
        return this.Granted(principal, concept, field, action);
    }

    public Diagnostics(): readonly Tier1Diagnostic[]
    {
        return this.diagnostics;
    }

    private Granted(principal: Principal, concept: string, field: string, action: PrivilegeAction): boolean
    {
        const key = FieldSecurityEvaluator.Key(concept, field);
        if (!this.secured.has(key))
        {
            return true;
        }
        for (const profile of this.ProfilesOf(principal))
        {
            const rights = this.profiles.get(profile)?.get(key);
            if (rights !== undefined && FieldSecurityEvaluator.Allows(rights, action))
            {
                return true;
            }
        }
        return false;
    }

    private ProfilesOf(principal: Principal): ReadonlySet<string>
    {
        const teams = this.membership?.Resolve(principal).teams ?? [];
        const out = new Set<string>();
        for (const assignment of this.assignments)
        {
            if (assignment.principalIds.includes(principal.Id) || assignment.teamIds.some(t => teams.includes(t)))
            {
                out.add(assignment.profile);
            }
        }
        return out;
    }

    private static Allows(rights: IFieldRights, action: PrivilegeAction): boolean
    {
        if (action === PrivilegeAction.Read)
        {
            return rights.Read;
        }
        if (action === PrivilegeAction.Update)
        {
            return rights.Update;
        }
        if (action === PrivilegeAction.Create)
        {
            return rights.Create;
        }
        return false;
    }

    private static Report(diagnostics: Tier1Diagnostic[], code: Tier1DiagnosticCode, subject: string, message: string): void
    {
        diagnostics.push(new Tier1Diagnostic(code, subject, message + subject));
    }

    private static Key(concept: string, field: string): string
    {
        return concept + FieldSecurityEvaluator.KeySeparator + field;
    }
}
