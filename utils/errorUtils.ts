/**
 * 从任意异常对象中提取可读的错误原因
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message?: unknown }).message);
  return String(err ?? '未知错误');
}
