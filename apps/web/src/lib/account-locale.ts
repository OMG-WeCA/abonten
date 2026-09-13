export type AccountLocale = 'en' | 'fr';

export const accountCopy = {
  en: {
    workspace: {
      loading: 'Checking your workspace…',
      recoveryHeading: 'We couldn’t load your account.',
      recoveryDetail: 'Your session is still saved. Check your connection, then try again.',
      retry: 'Try again',
      retrying: 'Trying again…',
      activeOrganization: 'Active organization',
      switchError: 'We couldn’t switch organizations. Your current workspace is unchanged.',
      dashboard: 'Abonten dashboard',
      navigation: 'Workspace',
      home: 'Home',
      settings: 'Settings',
      signOut: 'Sign out',
    },
    dashboard: {
      media_partner: {
        name: 'Partner workspace',
        lead: 'Your account is ready for the partner workspace.',
        detail:
          'Inventory and availability work will appear here when that part of Abonten opens for your organization.',
      },
      agency: {
        name: 'Planner workspace',
        lead: 'Your agency context is set.',
        detail:
          'Campaign planning and marketplace tools are not part of this account release. Your settings are ready when those tools arrive.',
      },
      brand: {
        name: 'Client workspace',
        lead: 'Your client context is set.',
        detail:
          'Campaign monitoring and proof views will appear here once campaigns are connected to your organization.',
      },
      platform: {
        name: 'Platform workspace',
        lead: 'Your operator context is set.',
        detail:
          'Platform work is controlled by your assigned access. This account area does not impersonate or expose tenant data.',
      },
      reviewSettings: 'Review account settings',
      signedInAs: 'You’re signed in as',
      activeOrganization: 'Active organization:',
      cleanStart: 'A clean starting point',
      cleanStartDetail:
        'This release sets up identity, access, and organization context. It doesn’t create placeholder campaigns, sites, or proof records.',
      accessNoted: 'Access noted',
      fieldAccess: 'Field capture access is assigned to this account.',
      orgAccess: 'You can update this organization’s current defaults.',
      platformAccess: 'Platform administration is authorized for this context.',
    },
    onboarding: {
      accountSetup: 'Account setup',
      heading: 'Tell us where you work.',
      intro: 'Your profile travels with you. Your organization sets the workspace context.',
      profileStep: 'Your profile',
      organizationStep: 'Your organization',
      workspaceStep: 'Enter your workspace',
      yourProfile: 'Your profile',
      yourOrganization: 'Your organization',
      name: 'Name',
      phone: 'Phone',
      language: 'Language',
      timezone: 'Timezone',
      organizationName: 'Organization name',
      organizationNameExample: 'e.g. Accra Outdoor Media',
      workFor: 'I work for',
      mediaPartner: 'A media partner',
      agency: 'An agency',
      brand: 'A brand',
      country: 'Country',
      defaultCurrency: 'Default currency',
      currencyHelp: 'This is the default for new work. It won’t change any historical amounts.',
      saving: 'Saving setup…',
      enterWorkspace: 'Enter workspace',
      saveError: 'We could not save your setup. Please try again.',
      requiredFields: 'Enter your name and organization name.',
    },
    settings: {
      heading: 'Your account, in one place.',
      intro:
        'Change your personal defaults, organization context, and passwordless sign-in sessions.',
      tabLabel: 'Settings sections',
      profile: 'Profile',
      preferences: 'Preferences',
      organization: 'Organization',
      security: 'Security',
      profileSaved: 'Profile saved.',
      preferencesSaved: 'Preferences saved.',
      organizationSaved: 'Organization settings saved. Historical amounts were not changed.',
      photoSaved: 'Profile photo saved.',
      photoError: 'Choose a PNG, JPEG, or WebP image under 5 MB.',
      genericError: 'Something went wrong. Please try again.',
      profileDetail: 'Your contact details stay attached to your account, not one organization.',
      yourProfile: 'Your profile',
      changePhoto: 'Change photo',
      photoFormat: 'PNG, JPEG, or WebP · up to 5 MB',
      name: 'Name',
      phone: 'Phone',
      saveProfile: 'Save profile',
      preferencesDetail:
        'Dates and times follow this timezone. The product language follows your account.',
      language: 'Language',
      timezone: 'Timezone',
      savePreferences: 'Save preferences',
      organizationDefaults: 'Organization defaults',
      organizationDetail:
        'These values apply to new work. Existing quoted or booked amounts keep their original currency.',
      organizationName: 'Organization name',
      country: 'Country',
      defaultCurrency: 'Default currency',
      organizationLanguage: 'Organization default language',
      saveOrganization: 'Save organization settings',
      securityDetail:
        'Abonten uses emailed sign-in codes. There is no password or security toggle to maintain here.',
      activeSessions: 'Active sessions',
      sessionsDetail: 'Each sign-in creates a session that expires automatically.',
      signedIn: 'Signed in',
      expires: 'Expires',
      signOutEverywhere: 'Sign out everywhere',
      signOutDetail:
        'This ends every session, including this one. You’ll need a new email code to come back.',
      confirmSignOutEverywhere: 'Confirm sign out everywhere',
      saving: 'Saving…',
    },
  },
  fr: {
    workspace: {
      loading: 'Vérification de votre espace…',
      recoveryHeading: 'Impossible de charger votre compte.',
      recoveryDetail:
        'Votre session est toujours enregistrée. Vérifiez votre connexion, puis réessayez.',
      retry: 'Réessayer',
      retrying: 'Nouvelle tentative…',
      activeOrganization: 'Organisation active',
      switchError: 'Impossible de changer d’organisation. Votre espace actuel reste inchangé.',
      dashboard: 'Tableau de bord Abonten',
      navigation: 'Espace de travail',
      home: 'Accueil',
      settings: 'Paramètres',
      signOut: 'Se déconnecter',
    },
    dashboard: {
      media_partner: {
        name: 'Espace partenaire',
        lead: 'Votre compte est prêt pour l’espace partenaire.',
        detail:
          'Les fonctions d’inventaire et de disponibilité apparaîtront ici lorsqu’elles seront ouvertes pour votre organisation.',
      },
      agency: {
        name: 'Espace planification',
        lead: 'Le contexte de votre agence est configuré.',
        detail:
          'La planification des campagnes et la place de marché ne font pas partie de cette version. Vos paramètres seront prêts à leur arrivée.',
      },
      brand: {
        name: 'Espace client',
        lead: 'Le contexte de votre marque est configuré.',
        detail:
          'Le suivi des campagnes et les vues de preuve apparaîtront lorsque des campagnes seront associées à votre organisation.',
      },
      platform: {
        name: 'Espace plateforme',
        lead: 'Votre contexte opérateur est configuré.',
        detail:
          'Le travail de plateforme dépend des accès qui vous sont attribués. Cet espace n’usurpe ni n’expose les données des organisations.',
      },
      reviewSettings: 'Vérifier les paramètres du compte',
      signedInAs: 'Vous êtes connecté·e en tant que',
      activeOrganization: 'Organisation active :',
      cleanStart: 'Un point de départ clair',
      cleanStartDetail:
        'Cette version établit l’identité, les accès et le contexte d’organisation. Elle ne crée pas de campagnes, de sites ou de preuves fictifs.',
      accessNoted: 'Accès attribués',
      fieldAccess: 'L’accès à la capture terrain est attribué à ce compte.',
      orgAccess: 'Vous pouvez modifier les paramètres actuels de cette organisation.',
      platformAccess: 'L’administration de la plateforme est autorisée dans ce contexte.',
    },
    onboarding: {
      accountSetup: 'Configuration du compte',
      heading: 'Dites-nous où vous travaillez.',
      intro: 'Votre profil vous suit. Votre organisation définit le contexte de votre espace.',
      profileStep: 'Votre profil',
      organizationStep: 'Votre organisation',
      workspaceStep: 'Accéder à votre espace',
      yourProfile: 'Votre profil',
      yourOrganization: 'Votre organisation',
      name: 'Nom',
      phone: 'Téléphone',
      language: 'Langue',
      timezone: 'Fuseau horaire',
      organizationName: 'Nom de l’organisation',
      organizationNameExample: 'ex. Accra Outdoor Media',
      workFor: 'Je travaille pour',
      mediaPartner: 'Un partenaire média',
      agency: 'Une agence',
      brand: 'Une marque',
      country: 'Pays',
      defaultCurrency: 'Devise par défaut',
      currencyHelp:
        'C’est la valeur par défaut pour les nouveaux travaux. Elle ne modifie aucun montant historique.',
      saving: 'Enregistrement…',
      enterWorkspace: 'Accéder à l’espace',
      saveError: 'Nous n’avons pas pu enregistrer votre configuration. Réessayez.',
      requiredFields: 'Saisissez votre nom et le nom de votre organisation.',
    },
    settings: {
      heading: 'Votre compte, au même endroit.',
      intro:
        'Modifiez vos préférences, le contexte de votre organisation et vos sessions sans mot de passe.',
      tabLabel: 'Sections des paramètres',
      profile: 'Profil',
      preferences: 'Préférences',
      organization: 'Organisation',
      security: 'Sécurité',
      profileSaved: 'Profil enregistré.',
      preferencesSaved: 'Préférences enregistrées.',
      organizationSaved:
        'Paramètres de l’organisation enregistrés. Les montants historiques ne sont pas modifiés.',
      photoSaved: 'Photo de profil enregistrée.',
      photoError: 'Choisissez une image PNG, JPEG ou WebP de moins de 5 Mo.',
      genericError: 'Un problème est survenu. Réessayez.',
      profileDetail:
        'Vos coordonnées restent liées à votre compte, et non à une seule organisation.',
      yourProfile: 'Votre profil',
      changePhoto: 'Modifier la photo',
      photoFormat: 'PNG, JPEG ou WebP · jusqu’à 5 Mo',
      name: 'Nom',
      phone: 'Téléphone',
      saveProfile: 'Enregistrer le profil',
      preferencesDetail:
        'Les dates et heures suivent ce fuseau horaire. La langue du produit suit votre compte.',
      language: 'Langue',
      timezone: 'Fuseau horaire',
      savePreferences: 'Enregistrer les préférences',
      organizationDefaults: 'Valeurs par défaut de l’organisation',
      organizationDetail:
        'Ces valeurs s’appliquent aux nouveaux travaux. Les montants déjà devisés ou réservés conservent leur devise d’origine.',
      organizationName: 'Nom de l’organisation',
      country: 'Pays',
      defaultCurrency: 'Devise par défaut',
      organizationLanguage: 'Langue par défaut de l’organisation',
      saveOrganization: 'Enregistrer les paramètres de l’organisation',
      securityDetail:
        'Abonten utilise des codes de connexion envoyés par email. Il n’y a ni mot de passe ni réglage de sécurité à entretenir ici.',
      activeSessions: 'Sessions actives',
      sessionsDetail: 'Chaque connexion crée une session qui expire automatiquement.',
      signedIn: 'Connecté le',
      expires: 'Expire le',
      signOutEverywhere: 'Se déconnecter partout',
      signOutDetail:
        'Cette action termine toutes les sessions, y compris celle-ci. Vous devrez demander un nouveau code pour revenir.',
      confirmSignOutEverywhere: 'Confirmer la déconnexion partout',
      saving: 'Enregistrement…',
    },
  },
} as const;

export function getAccountCopy(locale: AccountLocale | undefined) {
  return accountCopy[locale === 'fr' ? 'fr' : 'en'];
}

export function formatAccountDate(
  value: string,
  locale: AccountLocale | undefined,
  timezone: string | undefined,
): string {
  try {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC',
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value));
  }
}
