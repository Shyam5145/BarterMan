import { ApiError } from '../utils/http.js';

export function notFound(req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', `No API route for ${req.method} ${req.originalUrl}.`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
  }

  if (err?.name === 'CastError') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That record does not exist.' } });
  }

  if (err?.name === 'ValidationError') {
    const first = Object.values(err.errors ?? {})[0];
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: first?.message ?? 'Invalid data.' } });
  }

  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That record already exists.' } });
  }

  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } });
}
