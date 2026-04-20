import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthService } from '../services/auth.service';
import {
  ChangePasswordDTO,
  PasswordRecoveryRequestDTO,
  SupabaseSessionDTO,
  UpdateProfileDTO,
} from '../types/auth.types';
import { UnauthorizedError } from '../utils/errors';

const authService = new AuthService();
const trustedRedirectHosts = new Set(
  [
    env.BACKEND_PUBLIC_URL ?? 'https://financeapp-backend-eight.vercel.app',
    env.FRONTEND_PUBLIC_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).hostname.toLowerCase();
      } catch (_) {
        return '';
      }
    })
    .filter(Boolean),
);

function resolveSafeNextUrl(rawNext: unknown): string | null {
  if (typeof rawNext !== 'string' || !rawNext.trim()) return null;

  try {
    const nextUrl = new URL(rawNext.trim());
    const protocol = nextUrl.protocol.toLowerCase();
    const host = nextUrl.hostname.toLowerCase();

    if (protocol === 'menudo:') {
      return nextUrl.toString();
    }

    if (protocol === 'https:' && trustedRedirectHosts.has(host)) {
      return nextUrl.toString();
    }
  } catch (_) {
    return null;
  }

  return null;
}

function applyBridgeHeaders(res: Response): Response {
  return res
    .set('Cache-Control', 'no-store, max-age=0')
    .set('Pragma', 'no-cache')
    .set('Referrer-Policy', 'no-referrer')
    .set('X-Robots-Tag', 'noindex, nofollow');
}

function renderAuthBridgePage({
  nextUrl,
  initialTitle,
  initialMessage,
  successTitle,
  successMessageWithDestination,
  successMessageWithoutDestination,
  errorTitle,
  errorFallbackMessage,
  errorHint,
}: {
  nextUrl: string | null;
  initialTitle: string;
  initialMessage: string;
  successTitle: string;
  successMessageWithDestination: string;
  successMessageWithoutDestination: string;
  errorTitle: string;
  errorFallbackMessage: string;
  errorHint: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#065f46" />
    <title>${initialTitle} — Menudo</title>
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
        <h1 id="title">${initialTitle}</h1>
        <p id="message">${initialMessage}</p>
        <div class="actions">
          <a id="open-link" class="button button-primary hidden" href="#">Abrir Menudo</a>
          <a id="continue-link" class="button button-secondary hidden" href="#">Continuar</a>
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
      const destination = (() => {
        if (!nextUrl) return null;
        if (!hash) return nextUrl;

        try {
          const parsedNextUrl = new URL(nextUrl);
          if (parsedNextUrl.protocol === 'menudo:') {
            const mergedParams = new URLSearchParams(parsedNextUrl.search);
            hashParams.forEach((value, key) => {
              if (!mergedParams.has(key)) {
                mergedParams.set(key, value);
              }
            });
            const query = mergedParams.toString();
            return parsedNextUrl.protocol +
              '//' +
              parsedNextUrl.host +
              parsedNextUrl.pathname +
              (query ? '?' + query : '') +
              hash;
          }
        } catch (_) {
          return nextUrl + hash;
        }

        return nextUrl + hash;
      })();

      if (hasError) {
        titleEl.textContent = ${JSON.stringify(errorTitle)};
        messageEl.textContent =
          hashParams.get('error_description') || ${JSON.stringify(errorFallbackMessage)};
        hintEl.textContent = ${JSON.stringify(errorHint)};
      } else if (hashParams.has('access_token')) {
        titleEl.textContent = ${JSON.stringify(successTitle)};
        messageEl.textContent = destination
          ? ${JSON.stringify(successMessageWithDestination)}
          : ${JSON.stringify(successMessageWithoutDestination)};
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
</html>`;
}

export async function confirmEmailRedirectPage(req: Request, res: Response): Promise<void> {
  const nextUrl = resolveSafeNextUrl(req.query.next);

  applyBridgeHeaders(res)
    .status(200)
    .type('html')
    .send(
      renderAuthBridgePage({
        nextUrl,
        initialTitle: 'Confirmando tu correo',
        initialMessage:
          'Estamos validando tu enlace. En cuanto terminemos, te llevaremos al siguiente paso.',
        successTitle: 'Correo confirmado',
        successMessageWithDestination:
          'Tu cuenta ya fue verificada. Vamos a abrir Menudo para que puedas entrar.',
        successMessageWithoutDestination:
          'Tu cuenta ya fue verificada. Ahora vuelve a Menudo y entra con tu correo y contraseña.',
        errorTitle: 'No pudimos confirmar tu correo',
        errorFallbackMessage:
          'El enlace ya expiró o no es válido. Pide uno nuevo desde Menudo.',
        errorHint: 'Vuelve a la app y solicita otro correo de confirmación.',
      }),
    );
}

export async function passwordRecoveryRedirectPage(req: Request, res: Response): Promise<void> {
  const nextUrl = resolveSafeNextUrl(req.query.next);

  applyBridgeHeaders(res)
    .status(200)
    .type('html')
    .send(
      renderAuthBridgePage({
        nextUrl,
        initialTitle: 'Preparando tu cambio de contraseña',
        initialMessage:
          'Estamos validando el enlace para que puedas crear una contraseña nueva.',
        successTitle: 'Listo para cambiar tu contraseña',
        successMessageWithDestination:
          'Tu enlace es válido. Vamos a abrir Menudo para que escribas tu nueva contraseña.',
        successMessageWithoutDestination:
          'Tu enlace es válido. Vuelve a Menudo para escribir tu nueva contraseña.',
        errorTitle: 'No pudimos abrir el cambio de contraseña',
        errorFallbackMessage:
          'El enlace ya expiró o no es válido. Solicita uno nuevo desde Menudo.',
        errorHint: 'Vuelve a la app y pide un enlace nuevo para recuperar tu acceso.',
      }),
    );
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

export async function requestPasswordRecovery(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const nextUrl = resolveSafeNextUrl(req.body?.next);
    await authService.requestPasswordRecovery({
      ...(req.body as PasswordRecoveryRequestDTO),
      next: nextUrl ?? undefined,
    });
    res.json({
      data: {
        sent: true,
        message:
          'Si la cuenta existe, enviamos un enlace para cambiar la contraseña.',
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }
    await authService.changePassword(req.userId, req.body as ChangePasswordDTO);
    res.json({ data: { updated: true } });
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

export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId || !req.supabaseAuthUserId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }

    await authService.deleteAccount(req.userId, req.supabaseAuthUserId);
    res.json({
      data: {
        deleted: true,
        message: 'La cuenta se eliminó correctamente.',
      },
    });
  } catch (error) {
    next(error);
  }
}
