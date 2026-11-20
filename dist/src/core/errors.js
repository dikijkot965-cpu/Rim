export class RimError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'RimError'; this.code = code;
    this.retryable = Boolean(options.retryable);
    this.correlationId = options.correlationId || null;
  }
}
export const normalizeError = (error, correlationId) => {
  if (error instanceof RimError) return error;
  return new RimError(error?.code || 'UNEXPECTED', error?.message || 'Неизвестная ошибка', { cause: error, correlationId });
};
