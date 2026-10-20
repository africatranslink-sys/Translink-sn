const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const renderMailTemplate = ({
  title,
  eyebrow = 'TRANSLINK-AFRICA LOGISTIQUE',
  name,
  intro,
  content = '',
  actionLabel,
  actionUrl,
  accentColor = '#FF6A3D'
}) => `
<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#F5F7FA;font-family:Arial,Helvetica,sans-serif;color:#121C2D">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F7FA;padding:32px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce5e8;border-top:5px solid #FF6A3D;border-radius:12px;overflow:hidden">
            <tr>
              <td style="padding:24px 32px;background:#121C2D;color:#ffffff">
                <div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#FF9A78">${escapeHtml(eyebrow)}</div>
                <div style="margin-top:8px;font-size:24px;font-weight:700">TRANSLINK-AFRICA</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                <h1 style="margin:0 0 18px;color:#121C2D;font-size:23px;line-height:1.3">${escapeHtml(title)}</h1>
                <p style="margin:0 0 20px;color:#526772;font-size:15px;line-height:1.7">Bonjour <strong>${escapeHtml(name || 'utilisateur')}</strong>,<br>${escapeHtml(intro)}</p>
                ${content}
                ${actionUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px auto 0"><tr><td align="center" bgcolor="${escapeHtml(accentColor)}" style="border-radius:6px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 22px;color:#121C2D;text-decoration:none;font-size:14px;font-weight:bold">${escapeHtml(actionLabel)}</a></td></tr></table>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid #edf1f2;color:#71818a;font-size:12px;line-height:1.6">Cet e-mail a été envoyé automatiquement par Translink-Africa. Merci de ne pas répondre directement à ce message.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

module.exports = { escapeHtml, renderMailTemplate };