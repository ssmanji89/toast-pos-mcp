# Toast Authentication and Capability Source Contract

**Status:** current source contract for T2-002  
**Last reviewed:** 2026-08-16  
**Supersedes:** the opaque-token/advisory-scope implementation note in `toast-api-reporting-landscape.md`  
**Scope:** Standard API preflight only; this is not report-success semantics

## Why this document supersedes the earlier note

T1-003 was implemented while the repository's foundation research did not yet have a sourced authentication response schema. That research therefore recorded the access token conservatively as an opaque bearer string and warned that the shape was an implementation assumption.

Current Toast authentication documentation now provides a stronger source contract: `accessToken` is a JWT and its payload contains the API client's provisioned scope list. Current Partners API documentation also exposes the scopes granted for each individual restaurant connection. T2-002 must use both facts; keeping the old opaque/advisory model would now be less accurate than the public source material.

The old subsection remains in the foundation document as historical context and is explicitly marked stale. This document is the current authority for capability implementation and review.

## Authority 1: current JWT provisioned scopes

The `OAuthTokenManager` remains the sole owner of the raw bearer token. It:

1. obtains and caches the access token through the existing client-credentials lifecycle;
2. decodes the JWT payload inside `auth.ts`;
3. validates the documented scope claim as a string or string array;
4. validates bounded safe scope syntax and de-duplicates exact scope strings;
5. exposes only a frozen scope array through `getProvisionedScopes()`.

The capability layer never receives a second raw token copy. A malformed JWT, missing scope claim, invalid scope item, or otherwise unusable claim fails closed as a sanitized authentication error rather than degrading into an empty permissive set.

A JWT-provisioned scope means the API client is provisioned for that scope. It does **not** prove that every restaurant connection grants it or that a specific endpoint call will succeed.

## Authority 2: selected restaurant connection scopes

The corrected T2-001 production source model retrieves accessible restaurant connections through the credential-wide Partners read. Each active sanitized connection retains the documented `scopes` list as `ToastLocation.connectionScopes` after restaurant detail hydration.

That array is specific to the selected restaurant connection. It is held in the same immutable location context as restaurant GUID, timezone, closeout hour, currency, and management-group context. T2-002 does not create another WeakMap or restaurant-scope cache.

A connection scope means that scope is granted on that restaurant connection. It does **not** prove the current JWT still provisions the client globally or that the endpoint response will succeed.

## Deterministic preflight set

For one selected active restaurant:

```text
eligible scopes = JWT provisioned scopes ∩ restaurant connection scopes
```

A required scope absent from either authority is a deterministic `missing_scope` preflight denial. The result records which authority is missing it:

- `missingProvisionedScopes`
- `missingConnectionScopes`
- union `missingScopes`

Unknown but syntactically valid scope strings are preserved. Scope comparison remains exact/case-sensitive for provisioning/grants because the source strings are authority data, while product-policy exclusion matching is case-insensitive so a differently cased internal declaration cannot bypass the guest-data boundary.

## Product exclusions are a third, local policy gate

`guest.pi:read` and `delivery_info.address:read` are Standard API OAuth scopes that this product refuses to request/use for reporting even if both Toast authorities grant them. A required excluded scope produces `excluded_scope_required` before a data call.

Analytics guest-payment endpoints and payload fields such as `cardFingerprint` are not modeled as Standard OAuth scope strings. Their exclusion belongs at the future Analytics request/source boundary; pretending they are scopes would create a false control.

## `eligible` means attempt, never report success

Capability preflight answers only whether the bounded Standard read is eligible to be attempted based on known scope authorities and product policy.

`eligible` does not prove:

- restaurant accessibility beyond the selected validated location context;
- endpoint/version support;
- subscription/product entitlement;
- data completeness;
- pagination integrity;
- report success.

Those claims are established only by the actual bounded request and subsequent validation/report envelope.

## Why generic HTTP 403 is not cached as a scope fact

Current Toast response documentation gives several reasons an API request can produce HTTP 403, including inaccessible restaurant, insufficient scope, and unsupported Standard API operation/version. The shared transport intentionally discards arbitrary upstream response bodies and retains only sanitized status/request-id metadata.

Therefore a generic endpoint 403 cannot safely be attributed to one required scope. T2-002 is stateless with respect to observed endpoint failures. A 403 remains a request/report denial for that invocation; it never poisons or mutates a credential-wide or location-wide scope cache.

## Location isolation consequence

The same JWT scope set can legitimately yield different preflight results for two restaurants because their connection-scope sets can differ. Capability context is therefore constructed from the exact selected `ToastLocation`, not merely a restaurant GUID string supplied alongside a global scope array.

This closes the failure mode where a globally provisioned `orders:read` scope could incorrectly authorize preflight for a restaurant connection that does not grant `orders:read`.

## No persistent authorization state

T2-002 stores no:

- observed grants;
- observed denials;
- generic 403 interpretations;
- token strings;
- duplicate restaurant-scope registry;
- durable capability cache.

Every capability context is derived from the current token manager and current selected immutable location context.

## Sources

- Toast authentication reference: access-token JWT and scope claim
- Toast Standard API scopes reference
- Toast Partners accessible-restaurants API: per-restaurant connection scope list
- Toast responses/errors reference: 403 is not uniquely attributable to one scope

DOX: updated for the current capability authority and consumption contract.
