export class HttpError extends Error {
  constructor(status, detail, headers = {}) {
    super(typeof detail === 'string' ? detail : 'Validation failed');
    this.status = status;
    this.detail = detail;
    this.headers = headers;
  }
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let detail = error.detail;
  if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    detail = 'Request body is too large';
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    detail = 'Invalid JSON body';
  } else if (error.name === 'MulterError') {
    status = 422;
    detail = 'Upload one image in the file field';
  }
  if (status < 400 || status > 599) status = 500;
  if (!detail)
    detail =
      status === 500 ? 'An unexpected server error occurred' : 'Request could not be processed';
  for (const [name, value] of Object.entries(error.headers || {})) res.set(name, value);
  res.status(status).json({ detail });
}
