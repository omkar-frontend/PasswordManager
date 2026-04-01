export type UserSecurityRow = {
  user_id: string;
  salt: string;
  check_cipher: string;
  check_iv: string;
};
