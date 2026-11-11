import { SecurityAction, SecurityDepth, type IEdgeConcept, type IPackageSecurity } from "@pragmatic-tech-ai/todl";
import type { IEnvironmentSecurity } from "@pragmatic-tech-ai/todl/engine";
import { BaseRole, IdpDirectorySnapshot, IdpUserState, Principal, PrincipalKind, type ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";

/** The `hr` (spec §9.1) and `projects` (spec §9.2) environment, as plain C2/C5 object literals. */
export class EngineSecurityFx
{
    public static readonly Tenant = "env";
    public static readonly Employee = "hr.Employee";
    public static readonly Department = "hr.Department";
    public static readonly Project = "projects.Project";
    public static readonly Task = "projects.Task";
    public static readonly TaskOfProject = "projects.TaskOfProject";
    public static readonly Salary = "Salary";
    public static readonly NationalId = "NationalId";
    public static readonly Compensation = "hr.Compensation";
    public static readonly ProjectMember = "projects.ProjectMember";
    public static readonly ProjectManager = "projects.ProjectManager";

    public static Hr(): IPackageSecurity
    {
        const fx = EngineSecurityFx;
        return {
            OwnedConcepts: [fx.Employee],
            Roles: [],
            BaseRoleContributions: [
                {
                    Name: BaseRole.BasicUser,
                    Privileges: [
                        { Concept: fx.Employee, Action: SecurityAction.Read, Depth: SecurityDepth.BusinessUnit },
                        { Concept: fx.Employee, Action: SecurityAction.Update, Depth: SecurityDepth.User },
                    ],
                },
                { Name: BaseRole.Reader, Privileges: [{ Concept: fx.Employee, Action: SecurityAction.Read, Depth: SecurityDepth.BusinessUnit }] },
            ],
            SecuredFields: [{ Concept: fx.Employee, Field: fx.Salary }, { Concept: fx.Employee, Field: fx.NationalId }],
            FieldProfiles: [
                { Name: fx.Compensation, Fields: [{ Concept: fx.Employee, Field: fx.Salary, Read: true, Update: true, Create: false }] },
            ],
            EdgeConcepts: [],
        };
    }

    public static Projects(): IPackageSecurity
    {
        const fx = EngineSecurityFx;
        return {
            OwnedConcepts: [fx.Project, fx.Task],
            Roles: [
                {
                    Name: fx.ProjectManager,
                    Privileges: [
                        { Concept: fx.Project, Action: SecurityAction.Read, Depth: SecurityDepth.BusinessUnitAndChildren },
                        { Concept: fx.Project, Action: SecurityAction.Update, Depth: SecurityDepth.BusinessUnit },
                        { Concept: fx.Task, Action: SecurityAction.Read, Depth: SecurityDepth.BusinessUnitAndChildren },
                        { Concept: fx.Task, Action: SecurityAction.Update, Depth: SecurityDepth.BusinessUnit },
                    ],
                },
                {
                    Name: fx.ProjectMember,
                    Privileges: [
                        { Concept: fx.Project, Action: SecurityAction.Read, Depth: SecurityDepth.User },
                        { Concept: fx.Project, Action: SecurityAction.Update, Depth: SecurityDepth.User },
                        { Concept: fx.Task, Action: SecurityAction.Read, Depth: SecurityDepth.User },
                        { Concept: fx.Task, Action: SecurityAction.Update, Depth: SecurityDepth.User },
                    ],
                },
            ],
            BaseRoleContributions: [],
            SecuredFields: [],
            FieldProfiles: [],
            EdgeConcepts: [{ Concept: fx.TaskOfProject, From: "task", To: "project" }],
        };
    }

    public static Security(packages?: ReadonlyMap<string, IPackageSecurity>): IEnvironmentSecurity
    {
        const chosen = packages ?? new Map<string, IPackageSecurity>([["hr", EngineSecurityFx.Hr()], ["projects", EngineSecurityFx.Projects()]]);
        const owned = new Set<string>();
        const edges: IEdgeConcept[] = [];
        for (const pkg of chosen.values())
        {
            for (const concept of pkg.OwnedConcepts)
            {
                owned.add(concept);
            }
            edges.push(...pkg.EdgeConcepts);
        }
        return { Packages: chosen, EdgeConcepts: edges, OwnedConcepts: () => owned };
    }

    /** Every engine-stored concept of the environment, the edge concept included. */
    public static StoredConcepts(): ReadonlySet<string>
    {
        const fx = EngineSecurityFx;
        return new Set<string>([fx.Employee, fx.Department, fx.Project, fx.Task, fx.TaskOfProject]);
    }

    public static Config(): ISecurityModelConfig
    {
        return {
            businessUnits: [
                { id: "contoso", name: "Contoso" },
                { id: "sales", name: "Sales", parent: "contoso" },
                { id: "hr", name: "HR", parent: "contoso" },
                { id: "marketing", name: "Marketing", parent: "contoso" },
            ],
            users: [
                { principalId: "sam", businessUnitId: "sales" },
                { principalId: "erin", businessUnitId: "sales" },
                { principalId: "bob", businessUnitId: "marketing" },
                { principalId: "dana", businessUnitId: "hr" },
            ],
            teams: [
                { id: "hr", name: "HR", businessUnitId: "hr", idpGroups: ["hr-staff"], manualMembers: ["dana"] },
                { id: "managers", name: "Managers", businessUnitId: "marketing", idpGroups: ["managers"], manualMembers: [] },
                { id: "mkt", name: "Marketing", businessUnitId: "marketing", idpGroups: [], manualMembers: ["erin"] },
            ],
            roleAssignments: [
                { role: BaseRole.BasicUser, principalIds: ["sam", "erin"], teamIds: [] },
                { role: EngineSecurityFx.ProjectManager, principalIds: [], teamIds: ["managers", "mkt"] },
            ],
            profileAssignments: [{ profile: EngineSecurityFx.Compensation, principalIds: [], teamIds: ["hr"] }],
            roleOverrides: [],
            profileOverrides: [],
        };
    }

    public static Directory(bobState: IdpUserState = IdpUserState.Enabled): IdpDirectorySnapshot
    {
        const users = new Map<string, IdpUserState>([
            ["sam", IdpUserState.Enabled], ["erin", IdpUserState.Enabled], ["bob", bobState], ["dana", IdpUserState.Enabled],
        ]);
        const groups = new Map<string, readonly string[]>([["hr-staff", []], ["managers", ["bob"]]]);
        return new IdpDirectorySnapshot(new Date(0), true, users, groups);
    }

    public static User(id: string): Principal
    {
        return new Principal(id, EngineSecurityFx.Tenant, PrincipalKind.User, new Map<string, string>(), []);
    }
}
