import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { IOidcProfile } from 'passport-azure-ad';
import type { UserEntity } from './entities/user.entity';
import {
  isMicrosoftIssuerAllowed,
  microsoftAuthAvailability,
  microsoftTenantIssuers,
} from './microsoft-auth.config';
import { AuthController, microsoftCallbackUrl } from './auth.controller';
import { MicrosoftAuthService } from './microsoft-auth.service';
import type { UserIdentityService } from './user-identity.service';

function createSubject() {
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Person',
    status: 'active',
  } as UserEntity;
  const identityProfiles: unknown[] = [];
  const identities = {
    async findOrCreateFromMicrosoft(profile: unknown) {
      identityProfiles.push(profile);
      return user;
    },
  };
  const cfg = { get: () => undefined } as unknown as ConfigService;
  const service = new MicrosoftAuthService(cfg, identities as unknown as UserIdentityService);
  return { service, user, identityProfiles };
}

function profile(email: string): IOidcProfile {
  return {
    oid: 'microsoft-subject',
    displayName: 'Person',
    emails: [{ value: email }],
  } as unknown as IOidcProfile;
}

describe('MicrosoftAuthService configuration trust', () => {
  it('enables authorization-code sign-in only with complete usable credentials', () => {
    const complete = {
      tenantId: '11111111-2222-3333-4444-555555555555',
      clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      clientSecret: 'a-realistic-client-secret-value',
    };
    assert.equal(microsoftAuthAvailability(complete).enabled, true);
    for (const incomplete of [
      { ...complete, tenantId: '' },
      { ...complete, clientId: '' },
      { ...complete, clientSecret: '' },
      { ...complete, clientSecret: 'short' },
      { ...complete, clientSecret: 'change-me-in-dev' },
    ]) {
      const availability = microsoftAuthAvailability(incomplete);
      assert.equal(availability.enabled, false);
      assert.match(availability.unavailableReason ?? '', /client secret is missing or invalid/);
    }
  });

  it('keeps the public sign-in config disabled when the client secret is incomplete', () => {
    const values: Record<string, string> = {
      'azureAd.tenantId': 'tenant-id',
      'azureAd.clientId': 'client-id',
      'azureAd.clientSecret': '',
    };
    const controller = new AuthController(
      {} as never,
      {} as never,
      { get: (key: string) => values[key] } as unknown as ConfigService,
    );
    const incomplete = controller.config();
    assert.equal(incomplete.microsoftEnabled, false);
    assert.match(
      incomplete.microsoftUnavailableReason ?? '',
      /client secret is missing or invalid/,
    );

    values['azureAd.clientSecret'] = 'a-realistic-client-secret-value';
    const complete = controller.config();
    assert.equal(complete.microsoftEnabled, true);
    assert.equal(complete.microsoftUnavailableReason, undefined);
  });

  it('carries the active organization through the base-path-aware Microsoft callback', async () => {
    const user = { id: 'user-1', email: 'person@example.com' } as UserEntity;
    const auth = {
      async issueTokens() {
        return {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          activeOrgId: 'org-2',
          user,
        };
      },
    };
    let redirectedTo = '';
    const redirectConfig: Record<string, string> = {
      'web.baseUrl': 'https://app.example.test',
      'web.basePath': '/preview',
    };
    const controller = new AuthController(
      auth as never,
      {} as never,
      { get: (key: string) => redirectConfig[key] } as unknown as ConfigService,
    );

    await controller.microsoftCallback(
      {
        user,
        headers: {},
        get: () => undefined,
        ip: '127.0.0.1',
      } as never,
      {
        redirect: (url: string) => {
          redirectedTo = url;
        },
      } as never,
    );

    const callback = new URL(redirectedTo);
    const session = new URLSearchParams(callback.hash.slice(1));
    assert.equal(callback.pathname, '/preview/auth/microsoft/callback');
    assert.equal(session.get('activeOrgId'), 'org-2');
    assert.equal(session.get('accessToken'), 'access-token');
    assert.equal(session.get('refreshToken'), 'refresh-token');
  });

  it('preserves a legacy path in WEB_BASE_URL without duplicating an explicit base path', () => {
    assert.equal(
      microsoftCallbackUrl('https://app.example.test/legacy/').pathname,
      '/legacy/auth/microsoft/callback',
    );
    assert.equal(
      microsoftCallbackUrl('https://app.example.test/preview', '/preview').pathname,
      '/preview/auth/microsoft/callback',
    );
  });

  it('allows only the configured tenant issuer and rejects unexpected issuers', () => {
    const tenantId = '11111111-2222-3333-4444-555555555555';
    assert.deepEqual(microsoftTenantIssuers(tenantId), [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
    ]);
    assert.equal(
      isMicrosoftIssuerAllowed(`https://login.microsoftonline.com/${tenantId}/v2.0`, tenantId),
      true,
    );
    assert.equal(
      isMicrosoftIssuerAllowed('https://login.microsoftonline.com/common/v2.0', tenantId),
      false,
    );
    assert.equal(isMicrosoftIssuerAllowed('https://issuer.example.test', tenantId), false);
  });
});

describe('MicrosoftAuthService invitation-only organization access', () => {
  it('proves identity without creating domain-derived memberships', async () => {
    const cases = [
      ['brand domain', 'person@brand.example'],
      ['media-partner domain', 'person@partner.example'],
      ['platform domain', 'person@platform.example'],
      ['arbitrary domain', 'person@arbitrary.example'],
      ['ambiguous shared domain', 'person@shared.example'],
    ] as const;

    for (const [, email] of cases) {
      const { service, user, identityProfiles } = createSubject();
      assert.equal(await service.findOrCreateFromMicrosoft(profile(email)), user);
      assert.deepEqual(identityProfiles, [{ email, name: 'Person', subject: 'microsoft-subject' }]);
    }
  });

  it('returns the existing invited user without changing the administrator-approved role', async () => {
    const approvedMembership = {
      userId: 'user-1',
      organizationId: 'brand-org',
      role: 'client_viewer',
      status: 'active',
    };
    const { service, user } = createSubject();

    assert.equal(await service.findOrCreateFromMicrosoft(profile(user.email)), user);
    assert.deepEqual(approvedMembership, {
      userId: 'user-1',
      organizationId: 'brand-org',
      role: 'client_viewer',
      status: 'active',
    });
  });
});
