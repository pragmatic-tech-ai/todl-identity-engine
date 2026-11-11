# @pragmatic-tech-ai/todl-identity-engine

The bridge engine that binds the TODL security model to the
`@pragmatic-tech-ai/todl-identity` authorization model. It depends on the core
packages (`todl`, `todl-identity`) and `graph`, so that neither core package has to
depend on the other.

Surface:

- `SecurityVocabulary`: exhaustive value maps from TODL's `SecurityAction` /
  `SecurityDepth` to identity's `PrivilegeAction` / `AccessLevel`; an unmapped
  value throws.
- Tier-1 security evaluation: `TenantSecurityModel`, `MembershipResolver`,
  `OwnershipResolver`, `AccessDepthEvaluator` and `FieldSecurityEvaluator`.

Business-unit hierarchy lives in `@pragmatic-tech-ai/todl-identity`. Packages are
consumed from their root barrels and via compiled `dist` output.
