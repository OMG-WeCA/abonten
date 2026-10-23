import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { signInEmail } from '../auth/sign-in-copy';
import { invitationEmail } from '../auth/invitation-email';
import { invitationSignInUrl } from '../auth/invitations.service';
import { renderNotificationEmail } from './notification-email';

const expiresAt = new Date('2026-10-30T16:45:00Z');
const url = invitationSignInUrl('https://abonten.example', '/workspace');

describe('Abonten notification emails', () => {
  for (const locale of ['en', 'fr'] as const) {
    it(`preserves the sign-in code and expiry in HTML and plain text (${locale})`, () => {
      const email = signInEmail('012345', 10, locale);
      assert.match(email.html, new RegExp(`<html lang="${locale}"`));
      assert.match(email.html, />012345</);
      assert.match(email.text, /\b012345\b/);
      assert.match(email.text, /10 minutes/);
      assert.match(email.text, locale === 'fr' ? /Ne partagez jamais/ : /Never share/);
      assert.ok(!email.html.includes('<img'), 'core content does not require remote images');
      assert.ok(!email.html.includes('<script'));
    });
    for (const accountType of ['media_partner', 'agency', 'brand']) {
      it(`renders the ${accountType} invitation with the real sign-in destination (${locale})`, () => {
        const email = invitationEmail(
          { kind: 'account', accountType, role: 'org_owner', locale, expiresAt },
          null,
          url,
        );
        assert.match(email.html, /href="https:\/\/abonten.example\/workspace\/sign-in"/);
        assert.ok(email.text.includes(url));
        assert.match(email.text, /16:45 \(UTC\)/);
        assert.match(
          email.text,
          locale === 'fr' ? /profil.*entreprise/ : /profile and company details/,
        );
        assert.ok(!email.text.includes('org_owner'));
        if (locale === 'fr') assert.ok(!email.text.includes('Abonten as'));
      });
    }
  }
  it('escapes organization content without changing the plain-text meaning or role', () => {
    const organization = 'Ridgeway & Coast <img src=x onerror=alert(1)> "Outdoor"';
    const email = invitationEmail(
      { kind: 'membership', accountType: null, role: 'inventory_manager', locale: 'fr', expiresAt },
      organization,
      url,
    );
    assert.match(email.html, /Ridgeway &amp; Coast &lt;img/);
    assert.ok(!email.html.includes('<img'));
    assert.ok(email.text.includes(organization));
    assert.match(email.text, /Gestionnaire d’inventaire/);
    assert.ok(!email.text.includes('profil et les informations'));
  });
  it('rejects executable action links and links containing credentials', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'https://user:secret@example.com',
    ]) {
      assert.throws(() =>
        renderNotificationEmail({
          locale: 'en',
          subject: 'Invitation',
          preheader: 'Join',
          title: 'Invitation',
          paragraphs: [],
          note: '',
          action: { label: 'Open', url },
        }),
      );
    }
  });
  it('escapes URL attributes while preserving the plain-text fallback', () => {
    const link = 'https://abonten.example/sign-in?first=1&second="quoted"';
    const email = invitationEmail(
      { kind: 'account', accountType: 'agency', role: 'org_owner', locale: 'en', expiresAt },
      null,
      link,
    );
    assert.ok(email.html.includes('first=1&amp;second=&quot;quoted&quot;'));
    assert.ok(email.text.includes(link));
  });
});
