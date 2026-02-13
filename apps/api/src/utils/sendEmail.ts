import nodemailer from "nodemailer";
import { env } from "../config/env";

export async function sendSecurityAlert(
    to: string,
    subject: string,
    html: string
) {
    console.log("📧 sendSecurityAlert called with:");
    console.log("  TO:", to);
    console.log("  SMTP_HOST:", env.SMTP_HOST);
    console.log("  SMTP_PORT:", env.SMTP_PORT);
    console.log("  SMTP_USER:", JSON.stringify(env.SMTP_USER));
    console.log("  SMTP_PASS exists?:", env.SMTP_PASS ? "YES" : "NO");

    const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT),
        secure: true, // 465
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    });

    try {
        const info = await transporter.sendMail({
            from: `"Sistemi Ushtarak" <${env.SMTP_USER}>`,
            to,
            subject,
            html,
        });

        console.log("✅ Email u dërgua!");
        console.log("  messageId:", info.messageId);
        console.log("  response:", info.response);

        return info;
    } catch (err) {
        console.error("❌ Gabim gjatë dërgimit të email-it:", err);
        throw err;
    }
}