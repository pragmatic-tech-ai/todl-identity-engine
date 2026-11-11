import type { IPackageRole } from "@pragmatic-tech-ai/todl";
import type { IEnvironmentSecurity } from "@pragmatic-tech-ai/todl/engine";
import { AccessLevel, BaseRole, type IRoleOverrideConfig, type PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import { SecurityVocabulary } from "./security-vocabulary.js";
import { Tier1Diagnostic, Tier1DiagnosticCode } from "./tier1-diagnostic.js";

/**
 * Every role of an environment with its effective depth per (concept, action): the base roles (always present) and every
 * package role, with package defaults (own roles and base-role contributions) and the environment's role overrides on top.
 */
export class EffectiveRoleTable
{
    private static readonly LevelOrder: readonly AccessLevel[] =
    [
        AccessLevel.None,
        AccessLevel.User,
        AccessLevel.BusinessUnit,
        AccessLevel.BusinessUnitAndChildren,
        AccessLevel.Organization,
    ];

    private static readonly BaseRoles: ReadonlySet<string> = new Set<string>(Object.values(BaseRole));

    private static readonly KeySeparator = "\u0000";
    private static readonly SubjectSeparator = "/";
    private static readonly UnknownRoleMessage = "role override names a role no deployed package or the platform defines: ";
    private static readonly UnknownConceptMessage = "role override names a concept that is not engine-stored in this environment: ";
    private static readonly UnownedDepthMessage = "a concept without the ownership aspect takes only none or organization; read as none: ";

    private readonly diagnostics: Tier1Diagnostic[] = [];

    private constructor(private readonly roles: Map<string, Map<string, AccessLevel>>)
    {
    }

    /**
     * `concepts` are the engine-stored concepts minus the edge concepts: an override on any other concept is dropped.
     * On a concept outside `security.OwnedConcepts()` a depth other than none or organization is read as none.
     */
    public static Build(security: IEnvironmentSecurity, overrides: readonly IRoleOverrideConfig[], concepts: ReadonlySet<string>): EffectiveRoleTable
    {
        const roles = new Map<string, Map<string, AccessLevel>>();
        for (const role of EffectiveRoleTable.BaseRoles)
        {
            roles.set(role, new Map<string, AccessLevel>());
        }
        const packages = [...security.Packages.keys()].sort();
        for (const id of packages)
        {
            for (const role of security.Packages.get(id)?.Roles ?? [])
            {
                EffectiveRoleTable.Merge(roles, role);
            }
        }
        for (const id of packages)
        {
            for (const contribution of security.Packages.get(id)?.BaseRoleContributions ?? [])
            {
                if (EffectiveRoleTable.BaseRoles.has(contribution.Name))
                {
                    EffectiveRoleTable.Merge(roles, contribution);
                }
            }
        }
        const table = new EffectiveRoleTable(roles);
        table.ApplyOverrides(overrides, concepts);
        table.ClampUnowned(security.OwnedConcepts());
        return table;
    }

    /** The higher of two depths. */
    public static Max(a: AccessLevel, b: AccessLevel): AccessLevel
    {
        return EffectiveRoleTable.LevelOrder.indexOf(b) > EffectiveRoleTable.LevelOrder.indexOf(a) ? b : a;
    }

    public HasRole(role: string): boolean
    {
        return this.roles.has(role);
    }

    public Level(role: string, concept: string, action: PrivilegeAction): AccessLevel
    {
        return this.roles.get(role)?.get(EffectiveRoleTable.Key(concept, action)) ?? AccessLevel.None;
    }

    public Diagnostics(): readonly Tier1Diagnostic[]
    {
        return this.diagnostics;
    }

    // Adds a package role or a base-role contribution; contributions reach only base roles (Build checks the name).
    private static Merge(roles: Map<string, Map<string, AccessLevel>>, role: IPackageRole): void
    {
        let levels = roles.get(role.Name);
        if (levels === undefined)
        {
            levels = new Map<string, AccessLevel>();
            roles.set(role.Name, levels);
        }
        for (const privilege of role.Privileges)
        {
            const key = EffectiveRoleTable.Key(privilege.Concept, SecurityVocabulary.ActionOf(privilege.Action));
            const level = SecurityVocabulary.DepthOf(privilege.Depth);
            levels.set(key, EffectiveRoleTable.Max(levels.get(key) ?? AccessLevel.None, level));
        }
    }

    private ApplyOverrides(overrides: readonly IRoleOverrideConfig[], concepts: ReadonlySet<string>): void
    {
        for (const override of overrides)
        {
            const levels = this.roles.get(override.role);
            if (levels === undefined)
            {
                this.Report(Tier1DiagnosticCode.OverrideUnknownRole, override.role, EffectiveRoleTable.UnknownRoleMessage);
                continue;
            }
            if (!concepts.has(override.concept))
            {
                this.Report(Tier1DiagnosticCode.OverrideUnknownConcept, override.concept, EffectiveRoleTable.UnknownConceptMessage);
                continue;
            }
            levels.set(EffectiveRoleTable.Key(override.concept, override.action), override.level);
        }
    }

    private ClampUnowned(owned: ReadonlySet<string>): void
    {
        for (const [role, levels] of this.roles)
        {
            for (const [key, level] of levels)
            {
                const [concept, action] = key.split(EffectiveRoleTable.KeySeparator);
                if (owned.has(concept) || level === AccessLevel.None || level === AccessLevel.Organization)
                {
                    continue;
                }
                levels.set(key, AccessLevel.None);
                const subject = [role, concept, action].join(EffectiveRoleTable.SubjectSeparator);
                this.Report(Tier1DiagnosticCode.NonOrganizationDepthOnUnownedConcept, subject, EffectiveRoleTable.UnownedDepthMessage);
            }
        }
    }

    private Report(code: Tier1DiagnosticCode, subject: string, message: string): void
    {
        this.diagnostics.push(new Tier1Diagnostic(code, subject, message + subject));
    }

    private static Key(concept: string, action: PrivilegeAction): string
    {
        return concept + EffectiveRoleTable.KeySeparator + action;
    }
}
