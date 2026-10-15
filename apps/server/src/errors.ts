/** Error with an HTTP status; the app error handler sends `message` to the client for 4xx. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
