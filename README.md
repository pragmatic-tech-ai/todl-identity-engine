# @pragmatic-tech-ai/todl-identity-engine

The bridge engine that binds the TODL security model to the
`@pragmatic-tech-ai/todl-identity` authorization model. It depends on the core
packages (`todl`, `todl-identity`) and `graph`, so that neither core package has to
depend on the other.

Surface:

- `SecurityVocabulary`: exhaustive value maps from TODL's `SecurityAction` /
  `SecurityDepth` to identity's `PrivilegeAction` / `AccessLevel`; an unmapped
  value throws.
- Tier-1 security evaluation over the environment's package security (S1
  `IEnvironmentSecurity`) and its C5 setting: `TenantSecurityModel`,
  `MembershipResolver`, `EffectiveRoleTable`, `AccessDepthEvaluator` and
  `FieldSecurityEvaluator`; dropped setting entries surface as `Tier1Diagnostic`.

Business-unit hierarchy lives in `@pragmatic-tech-ai/todl-identity`. Packages are
consumed from their root barrels and via compiled `dist` output.
