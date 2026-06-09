/** Shared test type for JSON API responses — avoids `as any` in integration tests. */
export interface ApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}
