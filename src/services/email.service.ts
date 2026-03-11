import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);

export class EmailService {
  async sendSpaceInvitation(toEmail: string, inviterName: string, spaceName: string, token: string) {
    const inviteLink = `https://finance.bot.dlcsoft.dev/invitations/${token}/accept?email=${encodeURIComponent(
      toEmail,
    )}`;

    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: toEmail,
      subject: `Has sido invitado al espacio "${spaceName}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>¡Hola!</h2>
          <p><strong>${inviterName}</strong> te ha invitado a unirte a su espacio de finanzas <strong>"${spaceName}"</strong> en FinanceApp.</p>
          <p>Al unirte, podrás ver y gestionar transacciones y presupuestos de forma colaborativa.</p>
          <div style="margin: 30px 0;">
            <a href="${inviteLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Aceptar Invitación
            </a>
          </div>
          <p>Si no esperabas esta invitación, puedes ignorar este correo.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">FinanceApp - Tu gestión financiera inteligente</p>
        </div>
      `,
    });

    if (error) {
      console.error('Error enviando email con Resend:', error);
      throw new Error('No se pudo enviar el correo de invitación.');
    }

    return data;
  }
}
