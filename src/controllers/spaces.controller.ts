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

export async function acceptInvitationPage(req: Request, res: Response): Promise<void> {
  const token = escapeHtml(String(req.params.token ?? ''));
  const email = escapeHtml(String(req.query.email ?? ''));
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Aceptar Invitación — WealthOS</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
    h2 { margin-top: 0; color: #1a1a1a; }
    p { color: #555; }
    button { background: #4F46E5; color: white; border: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 16px; }
    button:hover { background: #4338CA; }
    .msg { margin-top: 16px; font-weight: bold; }
    .success { color: #16a34a; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Invitación a WealthOS</h2>
    <p>Haz clic para unirte al presupuesto compartido.</p>
    <p><strong>${email}</strong></p>
    <button onclick="accept()">Aceptar Invitación</button>
    <div id="msg" class="msg"></div>
  </div>
  <script>
    async function accept() {
      const btn = document.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Procesando...';
      try {
        const res = await fetch('/invitations/${token}/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: '${email}' })
        });
        const json = await res.json();
        const msg = document.getElementById('msg');
        if (res.ok) {
          msg.className = 'msg success';
          msg.textContent = '¡Invitación aceptada! Ya puedes abrir la app.';
          btn.style.display = 'none';
        } else {
          msg.className = 'msg error';
          msg.textContent = json.message || 'Error al aceptar la invitación.';
          btn.disabled = false;
          btn.textContent = 'Aceptar Invitación';
        }
      } catch {
        document.getElementById('msg').className = 'msg error';
        document.getElementById('msg').textContent = 'Error de conexión.';
        btn.disabled = false;
        btn.textContent = 'Aceptar Invitación';
      }
    }
  </script>
</body>
</html>`);
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = String(req.params.token ?? '');
    const email = String(req.body.email ?? '');
    const data = await spacesService.acceptInvitation(token, email);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

