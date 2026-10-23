import { renderNotificationEmail, type EmailLocale } from '../common/notification-email';
import type { InvitationEntity } from './entities/invitation.entity';

const accountLabels: Record<string, [string, string]> = {
  media_partner: ['Media partner', 'Partenaire média'],
  agency: ['Agency', 'Agence'],
  brand: ['Brand', 'Marque'],
};
const roleLabels: Record<string, [string, string]> = {
  org_owner: ['Organization owner', 'Propriétaire de l’organisation'],
  org_admin: ['Organization administrator', 'Administrateur de l’organisation'],
  inventory_manager: ['Inventory manager', 'Gestionnaire d’inventaire'],
  field_operator: ['Field operator', 'Agent de terrain'],
  planner: ['Planner', 'Planificateur'],
  planner_admin: ['Planning administrator', 'Administrateur de la planification'],
  client_viewer: ['Client viewer', 'Lecteur client'],
  client_admin: ['Client administrator', 'Administrateur client'],
  platform_admin: ['Platform administrator', 'Administrateur de la plateforme'],
};

export function invitationEmail(
  invite: Pick<InvitationEntity, 'kind' | 'accountType' | 'role' | 'locale' | 'expiresAt'>,
  organizationName: string | null,
  signInUrl: string,
) {
  const locale: EmailLocale = invite.locale === 'fr' ? 'fr' : 'en';
  const fr = locale === 'fr';
  const index = fr ? 1 : 0;
  const title = fr ? 'Votre invitation à Abonten' : 'Your invitation to Abonten';
  const expiry =
    new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hourCycle: 'h23',
    }).format(new Date(invite.expiresAt)) + ' (UTC)';
  const details =
    invite.kind === 'account'
      ? [
          {
            label: fr ? 'Type de compte' : 'Account type',
            value:
              accountLabels[invite.accountType ?? '']?.[index] ??
              (fr ? 'Compte Abonten' : 'Abonten account'),
          },
        ]
      : [
          { label: fr ? 'Organisation' : 'Organization', value: organizationName ?? 'Abonten' },
          {
            label: fr ? 'Rôle' : 'Role',
            value: roleLabels[invite.role]?.[index] ?? invite.role.replaceAll('_', ' '),
          },
        ];
  details.push({ label: fr ? 'Valable jusqu’au' : 'Valid until', value: expiry });
  return renderNotificationEmail({
    locale,
    subject: title,
    title,
    preheader: fr
      ? 'Connectez-vous pour consulter et accepter votre invitation.'
      : 'Sign in to review and accept your invitation.',
    paragraphs: [
      fr
        ? 'Vous avez reçu une invitation à rejoindre Abonten.'
        : 'You have been invited to join Abonten.',
      fr
        ? 'Connectez-vous avec cette adresse email, puis acceptez votre invitation.'
        : 'Sign in with this email address, then accept your invitation.',
      ...(invite.kind === 'account'
        ? [
            fr
              ? 'Vous renseignerez votre profil et les informations de votre entreprise à cette étape.'
              : 'You’ll complete your profile and company details when you accept.',
          ]
        : []),
    ],
    details,
    action: { label: fr ? 'Consulter l’invitation' : 'View invitation', url: signInUrl },
    note: fr
      ? 'Si vous n’attendiez pas cette invitation, vous pouvez ignorer cet email.'
      : 'If you weren’t expecting this invitation, you can ignore this email.',
  });
}
