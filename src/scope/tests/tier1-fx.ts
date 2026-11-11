import { MemberKind, ValueType, type IDefinitionDescription, type ISchemaDescription, type MemberInput } from "@pragmatic-tech-ai/graph";
import { SecurityAction, SecurityDepth, type IEdgeConcept, type IPackageRole, type IPackageSecurity } from "@pragmatic-tech-ai/todl";
import { ShareRight, SystemNames, TodlNames, type IEnvironmentSecurity } from "@pragmatic-tech-ai/todl/engine";
import {
    AccessLevel, BaseRole, IdpDirectorySnapshot, IdpUserState, Principal, PrincipalKind, PrivilegeAction,
    type IProfileAssignmentConfig, type IRoleOverrideConfig, type ISecurityModelConfig,
} from "@pragmatic-tech-ai/todl-identity";
import { TenantSecurityModel, type ITier1Catalog } from "../../index.js";

/** Options for one Tier1Fx environment setting. */
export interface ITier1FxOptions
{
    /** Project Manager reads Project at BU only (the environment override of spec §9.2). */
    readonly ManagerReadsBusinessUnit?: boolean;
    readonly ProfileAssignments?: readonly IProfileAssignmentConfig[];
}

/**
 * The tier-1 environment: system aspect Owned, todl.Element, todl.Term, ShareGrant; `hr.Employee` (owned; Name, secured
 * Salary and NationalId) and its subconcept `contractors.Contractor` (another package, no contributions); `projects`
 * Project and Task (owned) and the edge concept Assignment (from → Employee, to → Project); `sales.Account`, bound to the
 * `crm` connector. BUs contoso → sales, marketing; teams mkt (marketing; erin) and staff (sales; dana).
 */
export class Tier1Fx
{
    public static readonly Tenant = "env";
    public static readonly Version = "tier1-fx";
    public static readonly Employee = "hr.Employee";
    public static readonly Contractor = "contractors.Contractor";
    public static readonly Project = "projects.Project";
    public static readonly Task = "projects.Task";
    public static readonly Assignment = "projects.Assignment";
    public static readonly Account = "sales.Account";
    public static readonly Name = "Name";
    public static readonly Salary = "Salary";
    public static readonly NationalId = "NationalId";
    public static readonly ProjectOf = "project";
    public static readonly From = "from";
    public static readonly To = "to";
    public static readonly Crm = "crm";
    public static readonly SalaryReader = "hr.SalaryReader";
    public static readonly ProjectMember = "projects.ProjectMember";
    public static readonly ProjectManager = "projects.ProjectManager";
    public static readonly Contoso = "contoso";
    public static readonly Sales = "sales";
    public static readonly Marketing = "marketing";
    public static readonly Mkt = "mkt";
    public static readonly Staff = "staff";
    public static readonly Sam = "sam";
    public static readonly Rita = "rita";
    public static readonly Nora = "nora";
    public static readonly Dana = "dana";
    public static readonly Erin = "erin";
    public static readonly Alice = "alice";
    public static readonly Bob = "bob";
    public static readonly Carol = "carol";
    public static readonly Pat = "pat";
    public static readonly Admin = "admin";

    private static readonly HrModel = "hr";
    private static readonly ContractorsModel = "contractors";
    private static readonly ProjectsModel = "projects";
    private static readonly SalesModel = "sales";
    private static readonly SystemModel = "todl.system";
    private static readonly CoreModel = "todl";
    private static readonly Taxonomy = "taxonomy";
    private static readonly Broader = "broader";
    private static readonly ShareFlags: readonly string[] = Object.values(ShareRight);

    public static Catalog(): ITier1Catalog
    {
        const fx = Tier1Fx;
        const homes = new Map<string, string>([
            [SystemNames.Owned, fx.SystemModel], [SystemNames.ShareGrant, fx.SystemModel], [TodlNames.Element, fx.CoreModel],
            [TodlNames.Term, fx.CoreModel], [fx.Employee, fx.HrModel], [fx.Contractor, fx.ContractorsModel], [fx.Project, fx.ProjectsModel],
            [fx.Task, fx.ProjectsModel], [fx.Assignment, fx.ProjectsModel], [fx.Account, fx.SalesModel],
        ]);
        return { Description: fx.Description(), HomeModels: homes };
    }

    /** `bound`: false drops the crm binding, for an engine opened without that connector. */
    public static Description(bound: boolean = true): ISchemaDescription
    {
        const fx = Tier1Fx;
        const owned = [SystemNames.Owned];
        const definitions: IDefinitionDescription[] = [
            { Name: SystemNames.Owned, IsAspect: true, Parent: null, Aspects: [], Members: [fx.Text(SystemNames.Owner), fx.Text(SystemNames.OwningBusinessUnit)] },
            fx.Concept(TodlNames.Element, null, [], [fx.Text(TodlNames.Label)]),
            fx.Concept(TodlNames.Term, TodlNames.Element, [], [fx.Text(fx.Taxonomy), fx.Rel(fx.Broader, TodlNames.Term)]),
            fx.Concept(SystemNames.ShareGrant, TodlNames.Element, [], [
                fx.Rel(SystemNames.Record, TodlNames.Element), fx.Text(SystemNames.SubjectKind), fx.Text(SystemNames.SubjectId),
                ...fx.ShareFlags.map(f => ({ Name: f, Kind: MemberKind.Property, Type: ValueType.Boolean, Nullable: true })),
            ]),
            fx.Concept(fx.Employee, TodlNames.Element, owned, [fx.Text(fx.Name), fx.Text(fx.Salary), fx.Text(fx.NationalId)]),
            fx.Concept(fx.Contractor, fx.Employee, [], []),
            fx.Concept(fx.Project, TodlNames.Element, owned, [fx.Text(fx.Name)]),
            fx.Concept(fx.Task, TodlNames.Element, owned, [fx.Text(fx.Name), fx.Rel(fx.ProjectOf, fx.Project)]),
            fx.Concept(fx.Assignment, TodlNames.Element, [], [fx.Rel(fx.From, fx.Employee), fx.Rel(fx.To, fx.Project)]),
            fx.Concept(fx.Account, TodlNames.Element, [], [fx.Text(fx.Name)]),
        ];
        const bindings = bound ? [{ Model: fx.SalesModel, Concept: fx.Account, Connector: fx.Crm }] : [];
        return { Version: fx.Version, Definitions: definitions, Indexes: [], Seed: [], Bindings: bindings };
    }

    public static Security(): IEnvironmentSecurity
    {
        const fx = Tier1Fx;
        const packages = new Map<string, IPackageSecurity>([
            [fx.HrModel, fx.Hr()], [fx.ContractorsModel, fx.Package([fx.Contractor], [], [], [])], [fx.ProjectsModel, fx.Projects()],
        ]);
        const owned = new Set<string>([fx.Employee, fx.Contractor, fx.Project, fx.Task]);
        const edges: IEdgeConcept[] = [...packages.values()].flatMap(p => p.EdgeConcepts);
        return { Packages: packages, EdgeConcepts: edges, OwnedConcepts: () => owned };
    }

    public static Model(options: ITier1FxOptions = {}): TenantSecurityModel
    {
        return TenantSecurityModel.FromConfig(Tier1Fx.Config(options), Tier1Fx.Directory());
    }

    public static Config(options: ITier1FxOptions = {}): ISecurityModelConfig
    {
        const fx = Tier1Fx;
        const overrides: IRoleOverrideConfig[] = options.ManagerReadsBusinessUnit === true
            ? [{ role: fx.ProjectManager, concept: fx.Project, action: PrivilegeAction.Read, level: AccessLevel.BusinessUnit }]
            : [];
        return {
            businessUnits: [
                { id: fx.Contoso, name: fx.Contoso },
                { id: fx.Sales, name: fx.Sales, parent: fx.Contoso },
                { id: fx.Marketing, name: fx.Marketing, parent: fx.Contoso },
            ],
            users: [
                { principalId: fx.Sam, businessUnitId: fx.Sales },
                { principalId: fx.Rita, businessUnitId: fx.Sales },
                { principalId: fx.Dana, businessUnitId: fx.Sales },
                { principalId: fx.Erin, businessUnitId: fx.Sales },
                { principalId: fx.Alice, businessUnitId: fx.Sales },
                { principalId: fx.Bob, businessUnitId: fx.Marketing },
                { principalId: fx.Carol, businessUnitId: fx.Marketing },
                { principalId: fx.Pat, businessUnitId: fx.Contoso },
            ],
            teams: [
                { id: fx.Mkt, name: fx.Marketing, businessUnitId: fx.Marketing, idpGroups: [], manualMembers: [fx.Erin] },
                { id: fx.Staff, name: fx.Staff, businessUnitId: fx.Sales, idpGroups: [], manualMembers: [fx.Dana] },
            ],
            roleAssignments: [
                { role: BaseRole.SystemAdministrator, principalIds: [fx.Admin], teamIds: [] },
                { role: BaseRole.BasicUser, principalIds: [fx.Sam, fx.Erin, fx.Alice, fx.Dana], teamIds: [fx.Staff] },
                { role: BaseRole.Reader, principalIds: [fx.Rita], teamIds: [] },
                { role: fx.ProjectMember, principalIds: [fx.Alice, fx.Carol], teamIds: [] },
                { role: fx.ProjectManager, principalIds: [fx.Pat], teamIds: [fx.Mkt] },
            ],
            profileAssignments: options.ProfileAssignments ?? [],
            roleOverrides: overrides,
            profileOverrides: [],
        };
    }

    public static Directory(): IdpDirectorySnapshot
    {
        const fx = Tier1Fx;
        const users = new Map<string, IdpUserState>(
            [fx.Sam, fx.Rita, fx.Nora, fx.Erin, fx.Alice, fx.Bob, fx.Carol, fx.Pat, fx.Admin].map(u => [u, IdpUserState.Enabled]));
        users.set(fx.Dana, IdpUserState.Disabled);
        return new IdpDirectorySnapshot(new Date(0), true, users, new Map<string, readonly string[]>());
    }

    public static User(id: string): Principal
    {
        return new Principal(id, Tier1Fx.Tenant, PrincipalKind.User, new Map<string, string>(), []);
    }

    private static Hr(): IPackageSecurity
    {
        const fx = Tier1Fx;
        const contributions: IPackageRole[] = [
            { Name: BaseRole.BasicUser, Privileges: [fx.Grant(fx.Employee, SecurityAction.Read, SecurityDepth.BusinessUnit), fx.Grant(fx.Employee, SecurityAction.Update, SecurityDepth.User)] },
            { Name: BaseRole.Reader, Privileges: [fx.Grant(fx.Employee, SecurityAction.Read, SecurityDepth.BusinessUnit)] },
        ];
        const security = fx.Package([fx.Employee], [], contributions, []);
        return {
            ...security,
            SecuredFields: [{ Concept: fx.Employee, Field: fx.Salary }, { Concept: fx.Employee, Field: fx.NationalId }],
            FieldProfiles: [{ Name: fx.SalaryReader, Fields: [{ Concept: fx.Employee, Field: fx.Salary, Read: true, Update: false, Create: false }] }],
        };
    }

    private static Projects(): IPackageSecurity
    {
        const fx = Tier1Fx;
        const roles: IPackageRole[] = [
            {
                Name: fx.ProjectManager,
                Privileges: [
                    fx.Grant(fx.Project, SecurityAction.Read, SecurityDepth.BusinessUnitAndChildren),
                    fx.Grant(fx.Project, SecurityAction.Update, SecurityDepth.BusinessUnit),
                    fx.Grant(fx.Project, SecurityAction.Assign, SecurityDepth.BusinessUnit),
                    fx.Grant(fx.Task, SecurityAction.Read, SecurityDepth.BusinessUnitAndChildren),
                    fx.Grant(fx.Task, SecurityAction.Update, SecurityDepth.BusinessUnit),
                ],
            },
            {
                Name: fx.ProjectMember,
                Privileges: [
                    fx.Grant(fx.Project, SecurityAction.Read, SecurityDepth.User),
                    fx.Grant(fx.Project, SecurityAction.Update, SecurityDepth.User),
                    fx.Grant(fx.Task, SecurityAction.Read, SecurityDepth.User),
                    fx.Grant(fx.Task, SecurityAction.Update, SecurityDepth.User),
                ],
            },
        ];
        const contributions: IPackageRole[] = [
            {
                Name: BaseRole.BasicUser,
                Privileges: [
                    fx.Grant(fx.Project, SecurityAction.Read, SecurityDepth.User),
                    fx.Grant(fx.Project, SecurityAction.Append, SecurityDepth.User),
                    fx.Grant(fx.Project, SecurityAction.AppendTo, SecurityDepth.BusinessUnit),
                    fx.Grant(fx.Project, SecurityAction.Invoke, SecurityDepth.BusinessUnit),
                ],
            },
        ];
        return fx.Package([fx.Project, fx.Task], roles, contributions, [{ Concept: fx.Assignment, From: fx.From, To: fx.To }]);
    }

    private static Package(owned: readonly string[], roles: readonly IPackageRole[], contributions: readonly IPackageRole[], edges: readonly IEdgeConcept[]): IPackageSecurity
    {
        return { OwnedConcepts: owned, Roles: roles, BaseRoleContributions: contributions, SecuredFields: [], FieldProfiles: [], EdgeConcepts: edges };
    }

    private static Grant(concept: string, action: SecurityAction, depth: SecurityDepth): IPackageRole["Privileges"][number]
    {
        return { Concept: concept, Action: action, Depth: depth };
    }

    private static Concept(name: string, parent: string | null, aspects: readonly string[], members: readonly MemberInput[]): IDefinitionDescription
    {
        return { Name: name, IsAspect: false, Parent: parent, Aspects: aspects, Members: members };
    }

    private static Text(name: string): MemberInput
    {
        return { Name: name, Kind: MemberKind.Property, Type: ValueType.String, Nullable: true };
    }

    private static Rel(name: string, target: string): MemberInput
    {
        return { Name: name, Kind: MemberKind.Relationship, Targets: [target], Many: false, Ordered: false };
    }
}
