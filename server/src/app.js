import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.routes.js';
import { listingsRouter } from './routes/listings.routes.js';
import { usersRouter } from './routes/users.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: env.clientUrls }));
app.use(express.json({ limit: '100kb' }));

const health = (_req, res) => {
  res.json({ status: 'ok', message: 'Barterman API is running', timestamp: new Date().toISOString() });
};

app.get('/', (_req, res) => {
  res.json({ app: 'Barterman API', version: '1.0.0' });
});
app.get('/api/health', health); // kept for existing callers

const v1 = express.Router();
v1.get('/health', health);
v1.use('/auth', authRouter);
v1.use('/users', usersRouter);
v1.use('/listings', listingsRouter);
app.use('/api/v1', v1);

app.use('/api', notFound);
app.use(errorHandler);
