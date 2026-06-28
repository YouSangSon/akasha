const THRESHOLD_PATTERN = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;

export function resolveEvalThreshold(
  env: NodeJS.ProcessEnv,
  name: "EVAL_RECALL_THRESHOLD" | "EVAL_MRR_THRESHOLD",
  fallback: number,
): number {
  const rawValue = env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const value = rawValue.trim();
  if (!THRESHOLD_PATTERN.test(value)) {
    throw new Error(
      `${name} must be a decimal number from 0 to 1 when provided`,
    );
  }

  return Number(value);
}
