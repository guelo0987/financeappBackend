import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);

export class EmailService {
  async sendBudgetInvitation(toEmail: string, inviterName: string, budgetName: string, token: string) {
    const baseUrl = (env.BACKEND_PUBLIC_URL ?? 'https://financeapp-backend-eight.vercel.app').replace(/\/+$/, '');
    const inviteLink = `${baseUrl}/invitations/${token}/accept`;

    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: toEmail,
      subject: `${inviterName} te invitó al presupuesto "${budgetName}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>¡Hola!</h2>
          <p><strong>${inviterName}</strong> te ha invitado a colaborar en el presupuesto <strong>"${budgetName}"</strong>.</p>
          <p>Al aceptar, podrás ver y registrar transacciones dentro de ese presupuesto de forma compartida.</p>
          <div style="margin: 30px 0;">
            <a href="${inviteLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Aceptar Invitación
            </a>
          </div>
          <p>Si no esperabas esta invitación, puedes ignorar este correo.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Menudo - Tu gestión financiera inteligente</p>
        </div>
      `,
    });

    if (error) {
      console.error('Error enviando email con Resend:', error);
      throw new Error('No se pudo enviar el correo de invitación.');
    }

    console.log(
      JSON.stringify({
        level: 'info',
        msg: '[email] invitation queued',
        toEmail,
        emailId: data?.id ?? null,
      }),
    );

    return data;
  }
}
