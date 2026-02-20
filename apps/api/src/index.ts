// apps/api/src/index.ts

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { env } from './config/env';
import { connectDB } from './lib/db';

// ROUTES
import authRoutes from './routes/auth.routes';
import reportRoutes from './routes/reports.routes';
import peopleRoutes from './routes/people.routes';
import metaRoutes from './routes/meta.routes';
import categoriesRoutes from './routes/categories.routes';
import usersRoutes from './routes/users.routes';
import unitsRoutes from './routes/units.routes';
import loginAuditRoutes from './routes/loginAudit.routes';
import requestsRoutes from './routes/requests.routes';
import vehicleRoutes from './routes/vehicles.routes';
import systemNoticeRoutes from './routes/systemNotice.routes';
import meRoutes from './routes/me.routes';

// *** ROUTA TESTUESE PER EMAIL ***
import testEmailRoutes from './routes/testEmail.routes';

const app = express();

/**
 * I themi Express-it me i besu X-Forwarded-For
 * nëse API është pas proxy (CloudPanel, NGINX, etj.)
 */
app.set('trust proxy', true);

/**
 * ✅ Helmet:
 * - crossOriginResourcePolicy "cross-origin" e lejon <img> nga origin tjetër (5173) me e marrë nga 4000
 * - (opsionale) crossOriginEmbedderPolicy false për dev (shmang bllokime të panevojshme)
 */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(morgan('dev'));

// ✅ rrit limit për JSON (p.sh. base64 ose payload më të mëdha)
app.use(express.json({ limit: '10mb' }));

// ✅ lejo urlencoded (për forma / fields)
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// ✅ CORS
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

// ✅ SERVE UPLOADS (fotot + pdf)
// Kjo e ekspozon folderin uploads në: http://HOST:PORT/uploads/...
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// REGISTER ROUTES
app.use('/api/meta', metaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/categories', categoriesRoutes);

app.use('/api/users', usersRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/login-audit', loginAuditRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/test-email', testEmailRoutes);
app.use('/api/system-notice', systemNoticeRoutes);
app.use('/api/me', meRoutes);

// START SERVER
connectDB(env.MONGODB_URI).then(() => {
  app.listen(env.PORT, () => console.log(`API running on port ${env.PORT}`));
});