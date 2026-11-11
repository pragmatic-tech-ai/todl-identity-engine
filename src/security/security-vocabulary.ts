import { SecurityAction, SecurityDepth } from "@pragmatic-tech-ai/todl";
import { PrivilegeAction, AccessLevel } from "@pragmatic-tech-ai/todl-identity";

/** Exhaustive value maps between the compiler's security vocabulary (todl) and the identity model's (todl-identity). */
export class SecurityVocabulary
{
    private static readonly ActionMap: ReadonlyMap<SecurityAction, PrivilegeAction> = new Map<SecurityAction, PrivilegeAction>([
        [SecurityAction.Create, PrivilegeAction.Create],
        [SecurityAction.Read, PrivilegeAction.Read],
        [SecurityAction.Update, PrivilegeAction.Update],
        [SecurityAction.Delete, PrivilegeAction.Delete],
        [SecurityAction.Append, PrivilegeAction.Append],
        [SecurityAction.AppendTo, PrivilegeAction.AppendTo],
        [SecurityAction.Assign, PrivilegeAction.Assign],
        [SecurityAction.Share, PrivilegeAction.Share],
        [SecurityAction.Invoke, PrivilegeAction.Invoke],
    ]);

    private static readonly DepthMap: ReadonlyMap<SecurityDepth, AccessLevel> = new Map<SecurityDepth, AccessLevel>([
        [SecurityDepth.None, AccessLevel.None],
        [SecurityDepth.User, AccessLevel.User],
        [SecurityDepth.BusinessUnit, AccessLevel.BusinessUnit],
        [SecurityDepth.BusinessUnitAndChildren, AccessLevel.BusinessUnitAndChildren],
        [SecurityDepth.Organization, AccessLevel.Organization],
    ]);

    private static readonly UnmappedActionMessage = "Unmapped security action: ";
    private static readonly UnmappedDepthMessage = "Unmapped security depth: ";

    public static ActionOf(action: SecurityAction): PrivilegeAction
    {
        const mapped = SecurityVocabulary.ActionMap.get(action);
        if (mapped === undefined) throw new Error(SecurityVocabulary.UnmappedActionMessage + String(action));
        return mapped;
    }

    public static DepthOf(depth: SecurityDepth): AccessLevel
    {
        const mapped = SecurityVocabulary.DepthMap.get(depth);
        if (mapped === undefined) throw new Error(SecurityVocabulary.UnmappedDepthMessage + String(depth));
        return mapped;
    }

    public static Actions(): ReadonlyMap<SecurityAction, PrivilegeAction>
    {
        return SecurityVocabulary.ActionMap;
    }

    public static Depths(): ReadonlyMap<SecurityDepth, AccessLevel>
    {
        return SecurityVocabulary.DepthMap;
    }
}
