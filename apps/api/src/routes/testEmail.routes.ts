
import { Router } from "express";
import { sendSecurityAlert } from "../utils/sendEmail";
import { env } from "../config/env";

const r = Router();

/**
 * GET /api/test-email
 * Dërgon një email prove për të testuar konfigurimin SMTP
 */
r.get("/", async (_req, res) => {
    try {
        await sendSecurityAlert(
            env.ADMIN_EMAIL || env.SMTP_USER,
            "📧 Test Email – Sistemi Ushtarak",
            `
        <h2 style="color:#2b4eff;">Testi i email-it</h2>
        <p>Ky është një email testues nga sistemi SMPU.</p>
        <p>Nëse e pranuat këtë email, konfigurimi Gmail po funksionon ✅.</p>
      `
        );

        return res.json({ ok: true, message: "Email u dërgua me sukses!" });
    } catch (err) {
        console.error("TEST EMAIL ERROR:", err);
        return res.status(500).json({ ok: false, error: "Email dështoi" });
    }
});

export default r;