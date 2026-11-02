// E-mails transacionais. Curtos, com uma ação só e o link também em texto puro.
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function layout(title: string, body: string, cta: { label: string; url: string }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F2F5F4;font-family:Arial,sans-serif;color:#15201E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #D3DCD9;border-radius:14px">
<tr><td style="padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#56645F">Gutta Project</p>
<h1 style="margin:0 0 16px;font-size:22px">${esc(title)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">${body}</p>
<a href="${esc(cta.url)}" style="display:inline-block;background:#0B6B63;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${esc(cta.label)}</a>
<p style="margin:24px 0 0;font-size:13px;color:#56645F">Se o botão não funcionar, copie este endereço no navegador:<br>${esc(cta.url)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function verificationEmail(name: string, url: string) {
  const subject = 'Confirme seu e-mail no Gutta';
  const body = `Oi, ${esc(name)}. Falta só confirmar que este e-mail é seu. O link vale por 1 hora.`;
  return {
    subject,
    html: layout(subject, body, { label: 'Confirmar e-mail', url }),
    text: `Oi, ${name}. Confirme seu e-mail no Gutta (o link vale por 1 hora):\n${url}`,
    tag: 'verify_email',
  };
}

export function resetPasswordEmail(name: string, url: string) {
  const subject = 'Redefina sua senha do Gutta';
  const body = `Oi, ${esc(name)}. Recebemos um pedido para redefinir sua senha. Se não foi você, ignore este e-mail: nada muda. O link vale por 1 hora.`;
  return {
    subject,
    html: layout(subject, body, { label: 'Criar nova senha', url }),
    text: `Oi, ${name}. Para criar uma nova senha no Gutta (link válido por 1 hora):\n${url}\n\nSe não foi você, ignore este e-mail.`,
    tag: 'reset_password',
  };
}
