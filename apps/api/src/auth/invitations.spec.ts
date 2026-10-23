import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { invitationState, invitationSignInUrl } from './invitations.service';
import { AcceptInvitationDto, CreateInvitationDto, MemberInvitationDto } from './invitations.dto';
test('invitation expiry never turns accepted or revoked admission back into pending', () => {
  const expiresAt = new Date('2026-10-22T12:00Z'),
    before = Date.parse('2026-10-22T11:59Z'),
    after = Date.parse('2026-10-22T12:00Z');
  assert.equal(invitationState({ status: 'pending', expiresAt }, before), 'pending');
  assert.equal(invitationState({ status: 'pending', expiresAt }, after), 'expired');
  for (const status of ['accepted', 'revoked'])
    assert.equal(invitationState({ status, expiresAt }, after), status);
});
test('acceptance input cannot replace email, role or organization binding', async () => {
  const errors = await validate(
    plainToInstance(AcceptInvitationDto, {
      locale: 'en',
      email: 'another@palmline.example',
      role: 'platform_admin',
      organizationId: 'other',
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  assert.equal(errors.length, 3);
  for (const expiresInDays of [0, 31, 1.5])
    assert.ok(
      (
        await validate(
          plainToInstance(MemberInvitationDto, {
            organizationId: 'a87c7112-b002-40e9-9291-72bd6dfd2b48',
            email: 'amina@palmline.example',
            role: 'org_owner',
            expiresInDays,
          }),
        )
      ).length,
    );
});

test('invitation email sign-in URL preserves a hosted prefix with an empty configured base path', () => {
  assert.equal(
    invitationSignInUrl('https://abonten.example/workspace/', ''),
    'https://abonten.example/workspace/sign-in',
  );
  assert.equal(
    invitationSignInUrl('https://abonten.example/workspace/?x=1#fragment', undefined),
    'https://abonten.example/workspace/sign-in',
  );
  assert.equal(
    invitationSignInUrl('https://abonten.example/', '/workspace/'),
    'https://abonten.example/workspace/sign-in',
  );
  assert.equal(
    invitationSignInUrl('https://abonten.example/', ''),
    'https://abonten.example/sign-in',
  );
});

test('new account invitation accepts only email and a supported product account type', async () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  assert.equal(
    (
      await validate(
        plainToInstance(CreateInvitationDto, {
          email: 'nora@harbourline.example',
          accountType: 'media_partner',
        }),
        options,
      )
    ).length,
    0,
  );
  for (const extra of [
    { name: 'Nora Bello' },
    { role: 'platform_admin' },
    { organizationId: 'a87c7112-b002-40e9-9291-72bd6dfd2b48' },
    { organization: { name: 'Harbourline Outdoor' } },
    { expiresInDays: 30 },
  ])
    assert.ok(
      (
        await validate(
          plainToInstance(CreateInvitationDto, {
            email: 'nora@harbourline.example',
            accountType: 'media_partner',
            ...extra,
          }),
          options,
        )
      ).length,
    );
  for (const accountType of ['platform', 'platform_admin', 'org_owner'])
    assert.ok(
      (
        await validate(
          plainToInstance(CreateInvitationDto, { email: 'nora@harbourline.example', accountType }),
          options,
        )
      ).length,
    );
  const acceptance = {
    profile: { name: 'Nora Bello' },
    organization: { name: 'Harbourline Outdoor', country: 'Nigeria', type: 'platform' },
    accountType: 'platform',
    role: 'platform_admin',
  };
  assert.ok((await validate(plainToInstance(AcceptInvitationDto, acceptance), options)).length);
});
