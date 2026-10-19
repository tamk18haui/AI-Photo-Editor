export type PasswordCheck = { id: string; label: string; valid: boolean };

export function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { id: 'length', label: 'Từ 8 đến 200 ký tự', valid: password.length >= 8 && password.length <= 200 },
    { id: 'upper', label: 'Có ít nhất 1 chữ in hoa', valid: /\p{Lu}/u.test(password) },
    { id: 'lower', label: 'Có ít nhất 1 chữ thường', valid: /\p{Ll}/u.test(password) },
    { id: 'digit', label: 'Có ít nhất 1 chữ số', valid: /\p{Nd}/u.test(password) },
    { id: 'special', label: 'Có ít nhất 1 ký tự đặc biệt (!, @, #...)', valid: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return getPasswordChecks(password).every((check) => check.valid);
}
