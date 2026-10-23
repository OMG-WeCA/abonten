export type EmailLocale = 'en' | 'fr';

export interface NotificationEmail {
  subject: string;
  html: string;
  text: string;
}

interface EmailContent {
  locale: EmailLocale;
  subject: string;
  preheader: string;
  title: string;
  paragraphs: string[];
  code?: string;
  details?: { label: string; value: string }[];
  action?: { label: string; url: string };
  note: string;
}

// Email clients cannot load the application's CSS. Keep the brand palette here
// and inline presentation styles so the message also works with images blocked.
const theme = {
  primary: '#E4002B',
  navy: '#0A0E27',
  background: '#F5F5F5',
  surface: '#FFFFFF',
  foreground: '#0A0A0A',
  muted: '#6B7280',
  secondary: '#374151',
  border: '#E5E7EB',
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

/** All content is plain text; callers cannot inject arbitrary HTML into emails. */
export function renderNotificationEmail(content: EmailContent): NotificationEmail {
  const { locale, action } = content;
  if (action) {
    const url = new URL(action.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Email action requires an HTTP(S) URL without embedded credentials');
    }
  }
  const fallback =
    locale === 'fr'
      ? 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :'
      : 'If the button does not work, copy this link into your browser:';
  const footer =
    locale === 'fr'
      ? 'Notification automatique d’Abonten.'
      : 'An automated notification from Abonten.';
  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;color:${theme.secondary};font-size:16px;line-height:26px;">${escapeHtml(text)}</p>`,
    )
    .join('');
  const details = (content.details ?? [])
    .map(
      ({ label, value }) =>
        `<tr><td style="padding:0 0 16px;"><p style="margin:0 0 4px;color:${theme.muted};font-size:13px;line-height:20px;">${escapeHtml(label)}</p><p style="margin:0;color:${theme.foreground};font-size:16px;line-height:24px;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(value)}</p></td></tr>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="${locale}" xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(content.subject)}</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse}a:focus{outline:2px solid ${theme.navy};outline-offset:3px}@media only screen and (max-width:480px){.email-content{padding:28px 24px!important}.email-header{padding:24px!important}.email-title{font-size:26px!important;line-height:34px!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background-color:${theme.background};font-family:Arial,Helvetica,sans-serif;color:${theme.foreground};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" style="background-color:${theme.background};"><tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" style="width:100%;max-width:600px;background-color:${theme.surface};border:1px solid ${theme.border};">
<tr><td height="4" style="height:4px;font-size:0;line-height:0;background-color:${theme.primary};">&nbsp;</td></tr>
<tr><td class="email-header" style="padding:28px 40px;background-color:${theme.navy};"><span style="color:${theme.surface};font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;line-height:30px;letter-spacing:1px;">ABONTEN</span></td></tr>
<tr><td class="email-content" style="padding:36px 40px 32px;">
<h1 class="email-title" style="margin:0 0 20px;color:${theme.foreground};font-size:30px;font-weight:700;line-height:38px;">${escapeHtml(content.title)}</h1>
${paragraphs}
${content.code ? `<table role="presentation" width="100%" style="margin:24px 0;background-color:${theme.background};border:1px solid ${theme.border};"><tr><td align="center" style="padding:24px 12px;"><p style="margin:0;color:${theme.navy};font-family:Arial,Helvetica,sans-serif;font-size:36px;line-height:44px;font-weight:700;letter-spacing:6px;">${escapeHtml(content.code)}</p></td></tr></table>` : ''}
${details ? `<table role="presentation" width="100%" style="margin:24px 0 8px;border-top:1px solid ${theme.border};"><tr><td height="20" style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>${details}</table>` : ''}
${action ? `<table role="presentation" style="margin:24px 0;"><tr><td align="center" bgcolor="${theme.primary}" style="background-color:${theme.primary};border-radius:6px;mso-padding-alt:15px 24px;"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:15px 24px;border:1px solid ${theme.primary};border-radius:6px;color:${theme.surface};font-size:16px;font-weight:700;line-height:22px;text-decoration:none;text-align:center;">${escapeHtml(action.label)}</a></td></tr></table>` : ''}
<p style="margin:24px 0 0;color:${theme.secondary};font-size:14px;line-height:22px;">${escapeHtml(content.note)}</p>
${action ? `<p style="margin:24px 0 8px;color:${theme.muted};font-size:12px;line-height:20px;">${fallback}</p><p style="margin:0;font-size:12px;line-height:20px;word-break:break-all;"><a href="${escapeHtml(action.url)}" style="color:${theme.secondary};text-decoration:underline;word-break:break-all;">${escapeHtml(action.url)}</a></p>` : ''}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" style="max-width:600px;"><tr><td align="center" style="padding:20px 16px;color:${theme.muted};font-size:12px;line-height:20px;">${footer}</td></tr></table>
</td></tr></table></body></html>`;
  const text = [
    'ABONTEN',
    content.title,
    ...content.paragraphs,
    content.code,
    ...(content.details ?? []).map(({ label, value }) => `${label}: ${value}`),
    action ? `${action.label}: ${action.url}` : undefined,
    content.note,
    footer,
  ]
    .filter((part) => part !== undefined && part !== '')
    .join('\n\n');
  return { subject: content.subject, html, text };
}
