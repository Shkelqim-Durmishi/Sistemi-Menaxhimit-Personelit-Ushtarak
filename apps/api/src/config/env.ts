import 'dotenv/config';

export const env = {
  PORT: Number(process.env.PORT || 4000),

  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smpu',

  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',

  // 📧 SMTP / Email
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 465),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',

  // ku me i dërgu alarmet e sigurisë
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
};