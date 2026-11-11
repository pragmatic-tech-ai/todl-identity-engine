/** Why a part of the environment setting was dropped or read differently (numeric, append-only). */
export enum Tier1DiagnosticCode
{
    UnknownAssignedRole = 1,
    UnknownAssignedProfile,
    OverrideUnknownRole,
    OverrideUnknownConcept,
    OverrideUnknownProfile,
    OverrideUnknownField,
    NonOrganizationDepthOnUnownedConcept,
    UnplacedPrincipalWithRoles,
    OverridePlatformConcept,
}

/** One dropped or reinterpreted entry of the environment setting against the deployed packages. */
export class Tier1Diagnostic
{
    public constructor(
        public readonly Code: Tier1DiagnosticCode,
        public readonly Subject: string,
        public readonly Message: string)
    {
    }
}
