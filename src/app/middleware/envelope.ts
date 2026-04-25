import type { ServerResponse } from "node:http";

// Consistent API response envelope. All routes go through sendOk / sendError
// so clients can rely on the same shape: { success: true, data } or
// { success: false, error: { message } }.

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: { message: string };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function sendOk<T>(
  res: ServerResponse,
  status: number,
  data: T,
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ success: true, data } satisfies ApiSuccess<T>));
}

export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      success: false,
      error: { message },
    } satisfies ApiFailure),
  );
}
