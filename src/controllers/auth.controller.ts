import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { SupabaseSessionDTO, UpdateProfileDTO } from '../types/auth.types';
import { UnauthorizedError } from '../utils/errors';

const authService = new AuthService();

function resolveSafeNextUrl(rawNext: unknown): string | null {
  if (typeof rawNext !== 'string' || !rawNext.trim()) return null;

  try {
    const nextUrl = new URL(rawNext.trim());
    const protocol = nextUrl.protocol.toLowerCase();
    const host = nextUrl.hostname.toLowerCase();

    if (protocol === 'menudo:') {
      return nextUrl.toString();
    }

    if ((protocol === 'https:' || protocol === 'http:') &&
        host !== 'localhost' &&
        host !== '127.0.0.1' &&
        host !== '0.0.0.0') {
      return nextUrl.toString();
    }
  } catch (_) {
    return null;
  }

  return null;
}

export async function confirmEmailRedirectPage(req: Request, res: Response): Promise<void> {
  const nextUrl = resolveSafeNextUrl(req.query.next);

  res
    .status(200)
    .type('html')
    .send(`<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Confirmando correo — Menudo</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f7faf7 0%, #eef6f1 100%);
        color: #111827;
      }
      main {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 520px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #d1d5db;
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 24px 60px rgba(6, 95, 70, 0.12);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #ecfdf5;
        color: #065f46;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      h1 {
        margin: 18px 0 10px;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: #4b5563;
        line-height: 1.6;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }
      .button {
        appearance: none;
        border: 0;
        border-radius: 14px;
        padding: 14px 18px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }
      .button-primary {
        background: #065f46;
        color: #ffffff;
      }
      .button-secondary {
        background: #ecfdf5;
        color: #065f46;
      }
      .hidden {
        display: none;
      }
      .hint {
        margin-top: 18px;
        font-size: 13px;
        color: #6b7280;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <div class="badge">Menudo</div>
        <h1 id="title">Confirmando tu correo</h1>
        <p id="message">Estamos validando tu enlace. En cuanto terminemos, te llevaremos al siguiente paso.</p>
        <div class="actions">
          <a
            id="open-link"
            class="button button-primary hidden"
            href="#"
          >
            Abrir Menudo
          </a>
          <a
            id="continue-link"
            class="button button-secondary hidden"
            href="#"
          >
            Continuar
          </a>
        </div>
        <p class="hint" id="hint">Si no pasa nada automáticamente, usa el botón cuando aparezca.</p>
      </section>
    </main>
    <script>
      const nextUrl = ${JSON.stringify(nextUrl)};
      const hash = window.location.hash || '';
      const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      const titleEl = document.getElementById('title');
      const messageEl = document.getElementById('message');
      const openLinkEl = document.getElementById('open-link');
      const continueLinkEl = document.getElementById('continue-link');
      const hintEl = document.getElementById('hint');

      const hasError = hashParams.has('error_code') || hashParams.has('error_description');
      const destination = nextUrl ? nextUrl + hash : null;

      if (hasError) {
        titleEl.textContent = 'No pudimos confirmar tu correo';
        messageEl.textContent = hashParams.get('error_description') || 'El enlace ya expiró o no es válido. Pide uno nuevo desde Menudo.';
        hintEl.textContent = 'Vuelve a la app y solicita otro correo de confirmación.';
      } else if (hashParams.has('access_token')) {
        titleEl.textContent = 'Correo confirmado';
        messageEl.textContent = destination
          ? 'Tu cuenta ya fue verificada. Vamos a abrir Menudo para que puedas entrar.'
          : 'Tu cuenta ya fue verificada. Ahora vuelve a Menudo y entra con tu correo y contraseña.';
      } else {
        messageEl.textContent = 'Estamos esperando la respuesta de confirmación. Si ya abriste el enlace completo desde tu correo, esta página se actualizará sola.';
      }

      if (destination) {
        if (destination.startsWith('menudo://')) {
          openLinkEl.href = destination;
          openLinkEl.classList.remove('hidden');
        } else {
          continueLinkEl.href = destination;
          continueLinkEl.classList.remove('hidden');
        }
      }

      if (!hasError && destination) {
        window.setTimeout(() => {
          window.location.replace(destination);
        }, 500);
      }
    </script>
  </body>
</html>`);
}

export async function session(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.supabaseUser) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }

    const result = await authService.syncSupabaseUser(
      req.supabaseUser,
      req.body as SupabaseSessionDTO,
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }
    const result = await authService.getProfile(req.userId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }
    const result = await authService.updateProfile(req.userId, req.body as UpdateProfileDTO);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function setDefaultBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    const presupuestoId = req.body.presupuesto_id === null ? null : Number(req.body.presupuesto_id);
    await authService.setDefaultBudget(req.userId, presupuestoId);
    res.json({ data: { presupuesto_default_id: presupuestoId } });
  } catch (error) {
    next(error);
  }
}
