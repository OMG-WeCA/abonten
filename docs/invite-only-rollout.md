# Invite-only account admission rollout

The existing platform_admin role manages new-account admission. The admin supplies
only email and product account type (media partner, agency or brand). The recipient
verifies that email and supplies their own profile and company details. No company,
user or membership is created when an invitation is issued. Profile, organization,
owner membership, acceptance and their audits commit together when accepted.
The recipient cannot change the admitted account type or choose a privileged role.
There are no bearer invitation tokens. Existing users retain normal sign-in.

Apply additive migration InviteOnlyAdmission1760000007000 before starting the API.
It creates the invitation ledger, kind/account_type columns, nullable organization
binding for unaccepted account invitations, canonical email checks, pending-account
uniqueness and issuer/request-id deduplication. Existing users, memberships and roles
are not rewritten. The earlier organization-bound prototype was never deployed;
if any separately maintained environment has that prototype schema, prepare a
separate additive migration rather than assuming re-running this migration alters it.
No production migration has been run in this task.

New-account invitations expire after seven days. Resend renews pending/expired
invitations for seven days. Revoke cancels pending admission; accepted invitations
cannot be reused, resent or revoked. Membership removal and role changes retain
existing separate access controls. Existing-team invitations remain a distinct
organization/role-bound flow, subject to existing tenant role-assignment rules.
Platform staff roles cannot be selected through account admission or onboarding.

The admin form retains a stable request ID and the original email/type snapshot
through an uncertain response. A retry returns the existing invitation and sends
no duplicate email. A new organization is created only by accepted admission.
If an acceptance response is lost, the client reads the invitee-scoped invitation
and verified memberships; a retryable access check remains available when reads
are inconclusive. SMTP acceptance is recorded as Sent, not proof of inbox delivery.
Failures retain pending invitations for an explicit resend. Delivery updates are
revision-bound so earlier sends cannot overwrite later resends/revocations.

Before any separately authorized deployment: back up the database, apply the
additive migration, confirm an already-authorized platform administrator, verify
real SMTP and exercise account admission through inventory review. Do not run
seeders on shared data. No deployment, real invitations or new access grants are
authorized by this document. Real provider delivery remains unverified locally.
The partner-terms release policy is unchanged; no draft acceptance is activated.

Rollback must preserve invite-only admission. Older public self-service code would
reopen signup. Preserve ledger and accepted memberships; agree a recovery plan
rather than automatically dropping history. The down migration drops only the
new ledger and does not revoke users or memberships.
