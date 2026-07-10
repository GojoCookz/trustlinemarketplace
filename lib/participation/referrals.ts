const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 6;

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}
