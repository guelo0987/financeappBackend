import { Request, Response } from 'express';
import { env } from '../config/env';

const publicBaseUrl = env.FRONTEND_PUBLIC_URL ?? env.BACKEND_PUBLIC_URL ?? 'https://financeapp-backend-eight.vercel.app';
const supportEmail = env.SUPPORT_EMAIL ?? env.EMAIL_FROM;

function renderPage({
  title,
  eyebrow,
  intro,
  sections,
}: {
  title: string;
  eyebrow: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
}): string {
  const cards = sections
    .map(
      (section) => `
        <section class="card">
          <h2>${section.title}</h2>
          <p>${section.body}</p>
        </section>
      `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} — Menudo</title>
    <meta name="theme-color" content="#065f46" />
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f7faf7 0%, #eef6f1 100%);
        color: #111827;
      }
      main {
        max-width: 820px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      .hero {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #d1d5db;
        border-radius: 28px;
        padding: 28px;
        box-shadow: 0 24px 60px rgba(6, 95, 70, 0.10);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 12px;
        border-radius: 999px;
        background: #ecfdf5;
        color: #065f46;
        font-size: 13px;
        font-weight: 700;
      }
      h1 {
        margin: 18px 0 10px;
        font-size: 32px;
        line-height: 1.08;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      p {
        margin: 0;
        color: #4b5563;
        line-height: 1.65;
      }
      .grid {
        display: grid;
        gap: 16px;
        margin-top: 20px;
      }
      .card {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #d1d5db;
        border-radius: 24px;
        padding: 22px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 13px 18px;
        border-radius: 14px;
        text-decoration: none;
        font-weight: 700;
      }
      .button-primary {
        background: #065f46;
        color: #ffffff;
      }
      .button-secondary {
        background: #ecfdf5;
        color: #065f46;
      }
      .footer {
        margin-top: 20px;
        font-size: 13px;
        color: #6b7280;
      }
      @media (max-width: 640px) {
        main {
          padding: 20px 16px 40px;
        }
        .hero,
        .card {
          border-radius: 22px;
          padding: 20px;
        }
        h1 {
          font-size: 28px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="badge">${eyebrow}</div>
        <h1>${title}</h1>
        <p>${intro}</p>
        <div class="actions">
          <a class="button button-primary" href="mailto:${supportEmail}">Escribir a soporte</a>
          <a class="button button-secondary" href="${publicBaseUrl}/privacy-choices">Privacidad y cuenta</a>
        </div>
        <p class="footer">Soporte: ${supportEmail}</p>
      </section>
      <div class="grid">
        ${cards}
      </div>
    </main>
  </body>
</html>`;
}

export function supportPage(_req: Request, res: Response): void {
  res
    .status(200)
    .type('html')
    .send(
      renderPage({
        title: 'Centro de ayuda',
        eyebrow: 'Soporte',
        intro:
          'Si necesitas ayuda con Menudo, tienes un problema de acceso o quieres reportar un error, puedes escribirnos y te responderemos por correo.',
        sections: [
          {
            title: 'Cómo pedir ayuda',
            body: 'Incluye el correo de tu cuenta, una breve descripción del problema y, si aplica, una captura. Eso nos permite responder más rápido y sin hacerte repetir pasos.',
          },
          {
            title: 'Problemas de acceso',
            body: 'Si no puedes entrar, primero intenta recuperar tu contraseña desde Menudo. Si el enlace no funciona o tu correo no llega, escríbenos para revisarlo.',
          },
          {
            title: 'Suscripciones y cobros',
            body: 'Las suscripciones gestionadas por Apple se administran desde tu cuenta de App Store. Si necesitas ayuda con un cobro o una cancelación, indícanos la fecha y el plan.',
          },
        ],
      }),
    );
}

export function privacyPage(_req: Request, res: Response): void {
  res
    .status(200)
    .type('html')
    .send(
      renderPage({
        title: 'Política de privacidad',
        eyebrow: 'Privacidad',
        intro:
          'Menudo usa la información mínima necesaria para crear tu cuenta, mostrar tus finanzas y mantener funciones como presupuestos compartidos, alertas y suscripciones.',
        sections: [
          {
            title: 'Qué datos usamos',
            body: 'Podemos procesar tu nombre, correo, moneda base, meta financiera, presupuestos, categorías, carteras, transacciones, invitaciones y estado de suscripción. Si eliges iniciar con Apple, también procesamos la información que Apple comparte para autenticarte.',
          },
          {
            title: 'Para qué los usamos',
            body: 'Usamos esos datos para autenticar tu cuenta, sincronizar tu perfil, registrar movimientos, mostrar reportes, enviar invitaciones y operar funciones esenciales de la app.',
          },
          {
            title: 'Privacidad y control',
            body: 'Puedes actualizar tu perfil desde la app y solicitar la eliminación de tu cuenta desde Menudo. Si ciertos datos deben conservarse por motivos legales, fiscales o de seguridad, lo haremos solo por el tiempo necesario.',
          },
        ],
      }),
    );
}

export function termsPage(_req: Request, res: Response): void {
  res
    .status(200)
    .type('html')
    .send(
      renderPage({
        title: 'Términos de servicio',
        eyebrow: 'Términos',
        intro:
          'Al usar Menudo, aceptas utilizar la app de manera responsable y proporcionar información veraz para crear y administrar tu cuenta.',
        sections: [
          {
            title: 'Uso de la cuenta',
            body: 'Eres responsable de mantener la seguridad de tu acceso, de la información que registras y de revisar con cuidado cualquier presupuesto o invitación compartida que aceptes.',
          },
          {
            title: 'Suscripciones',
            body: 'Si activas un plan de pago, la facturación y las renovaciones se gestionan por Apple o por el proveedor correspondiente. Cancelar una suscripción no borra automáticamente tu cuenta.',
          },
          {
            title: 'Disponibilidad',
            body: 'Trabajamos para mantener Menudo disponible y segura, pero algunas funciones pueden cambiar, mejorar o dejar de estar disponibles con el tiempo.',
          },
        ],
      }),
    );
}

export function privacyChoicesPage(_req: Request, res: Response): void {
  res
    .status(200)
    .type('html')
    .send(
      renderPage({
        title: 'Privacidad y control de cuenta',
        eyebrow: 'Tus opciones',
        intro:
          'Desde Menudo puedes actualizar tu perfil, pedir un nuevo enlace para cambiar tu contraseña y eliminar tu cuenta directamente desde la app.',
        sections: [
          {
            title: 'Eliminar cuenta',
            body: 'Abre Menudo, entra en Ajustes, luego Mi perfil, y usa la opción Eliminar cuenta. Si tienes una suscripción activa, revisa primero la gestión de suscripciones de Apple para evitar cargos futuros.',
          },
          {
            title: 'Cambiar contraseña',
            body: 'Si usas correo y contraseña, puedes pedir un enlace nuevo desde la pantalla de inicio de sesión o desde tu perfil en la sección de seguridad.',
          },
          {
            title: 'Ayuda adicional',
            body: `Si necesitas apoyo con privacidad, acceso o soporte general, escríbenos a ${supportEmail}.`,
          },
        ],
      }),
    );
}
