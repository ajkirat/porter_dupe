// Indian mobile numbers are typed as 10 digits; anything starting with "+" is taken as-is.
export function toE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  return `+91${digits.slice(-10)}`;
}

export function isValidIndianMobile(input: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(toE164(input));
}
