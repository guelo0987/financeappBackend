import { NextFunction, Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import { SpacesService } from '../services/spaces.service';

const spacesService = new SpacesService();

function requireUserId(req: Request): number {
  if (!req.userId) throw new UnauthorizedError('UNAUTHORIZED', 'No autorizado.');
  return req.userId;
}

function parsePositiveInt(value: unknown, label: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError('VALIDACION_ERROR', `${label} inválido.`);
  }
  return parsed;
}

export async function listSpaces(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.listSpaces(requireUserId(req));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getSpace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.getSpace(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function deleteSpace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.deleteSpace(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.listMembers(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.updateMemberRole(
      requireUserId(req),
      parsePositiveInt(req.params.id, 'spaceId'),
      parsePositiveInt(req.params.userId, 'userId'),
      String(req.body.rol ?? ''),
    );
    res.json({ data: { actualizado: true } });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.removeMember(
      requireUserId(req),
      parsePositiveInt(req.params.id, 'spaceId'),
      parsePositiveInt(req.params.userId, 'userId'),
    );
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function listInvitations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.listInvitations(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function cancelInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.cancelInvitation(
      requireUserId(req),
      parsePositiveInt(req.params.id, 'spaceId'),
      parsePositiveInt(req.params.invId, 'invitationId'),
    );
    res.json({ data: { cancelada: true } });
  } catch (error) {
    next(error);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInvitationDocument(options: {
  title: string;
  description: string;
  email?: string | null;
  detail?: string | null;
  actionHtml?: string;
  tone?: 'default' | 'success' | 'error';
}): string {
  const title = escapeHtml(options.title);
  const description = escapeHtml(options.description);
  const email = options.email ? escapeHtml(options.email) : '';
  const detail = options.detail ? escapeHtml(options.detail) : '';
  const toneClass = options.tone === 'success' ? 'success' : options.tone === 'error' ? 'error' : 'default';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — Menudo</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f4f6;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
      --primary: #4F46E5;
      --primary-dark: #4338CA;
      --success: #15803d;
      --error: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background:
        radial-gradient(circle at top, rgba(79,70,229,0.08), transparent 30%),
        var(--bg);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
    }
    .card {
      width: min(100%, 440px);
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
    }
    .stack {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }
    .email {
      padding: 12px 16px;
      border-radius: 16px;
      background: #f8fafc;
      border: 1px solid var(--border);
      color: var(--text);
      font-weight: 700;
      word-break: break-word;
    }
    .detail {
      font-size: 13px;
      font-weight: 600;
    }
    .detail.default { color: var(--muted); }
    .detail.success { color: var(--success); }
    .detail.error { color: var(--error); }
    form { margin: 0; }
    button, .link-button {
      width: 100%;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 48px;
      padding: 14px 18px;
      border: 0;
      border-radius: 14px;
      background: var(--primary);
      color: white;
      font-size: 15px;
      font-weight: 800;
      text-decoration: none;
      cursor: pointer;
    }
    button:hover, .link-button:hover {
      background: var(--primary-dark);
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <div class="stack">
      <p>${description}</p>
      ${email ? `<div class="email">${email}</div>` : ''}
      ${detail ? `<div class="detail ${toneClass}">${detail}</div>` : ''}
      ${options.actionHtml ?? ''}
    </div>
  </div>
</body>
</html>`;
}

export async function acceptInvitationPage(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token ?? '');
  const invitation = await spacesService.getInvitationPreview(token);

  if (!invitation) {
    res.status(404).send(
      renderInvitationDocument({
        title: 'Invitación no encontrada',
        description: 'Este enlace ya no existe o fue invalidado.',
        tone: 'error',
      }),
    );
    return;
  }

  const expired = new Date(invitation.expira_en).getTime() < Date.now();
  const status = invitation.estado;
  const detail = invitation.espacio_nombre
    ? `Presupuesto: ${invitation.espacio_nombre}`
    : null;

  if (status !== 'pendiente' || expired) {
    const title = expired || status === 'expirada'
      ? 'Invitación expirada'
      : status === 'aceptada'
      ? 'Invitación ya aceptada'
      : 'Invitación no disponible';

    const description = expired || status === 'expirada'
      ? 'La invitación ya venció. Pide que te envíen una nueva.'
      : status === 'aceptada'
      ? 'Este acceso ya fue aceptado con la cuenta invitada.'
      : 'La invitación ya no está disponible.';

    res.status(status === 'aceptada' ? 200 : 410).send(
      renderInvitationDocument({
        title,
        description,
        email: invitation.email_invitado,
        detail,
        tone: status === 'aceptada' ? 'success' : 'error',
      }),
    );
    return;
  }

  res.send(
    renderInvitationDocument({
      title: 'Invitación a Menudo',
      description: 'Acepta esta invitación para unirte al presupuesto compartido con el correo que fue invitado.',
      email: invitation.email_invitado,
      detail,
      actionHtml: `<form method="POST" action="/invitations/${escapeHtml(token)}/accept"><button type="submit">Aceptar invitación</button></form>`,
    }),
  );
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = String(req.params.token ?? '');
    const data = await spacesService.acceptInvitation(token);
    const wantsHtml = !req.is('application/json') && req.accepts('html');

    if (wantsHtml) {
      res.send(
        renderInvitationDocument({
          title: 'Invitación aceptada',
          description: 'Ya puedes abrir Menudo con la cuenta invitada para ver el presupuesto compartido.',
          email: data.email_invitado,
          detail: 'El acceso se agregó correctamente.',
          tone: 'success',
        }),
      );
      return;
    }

    res.json({ data });
  } catch (error) {
    const wantsHtml = !req.is('application/json') && req.accepts('html');
    if (wantsHtml) {
      const message = error instanceof Error ? error.message : 'No pudimos aceptar la invitación.';
      res.status(400).send(
        renderInvitationDocument({
          title: 'No pudimos aceptar la invitación',
          description: message,
          tone: 'error',
        }),
      );
      return;
    }

    next(error);
  }
}
