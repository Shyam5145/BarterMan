import { ApiError } from '../utils/http.js';

export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return next(new ApiError(400, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid request.', details));
  }
  req.body = result.data;
  return next();
};
