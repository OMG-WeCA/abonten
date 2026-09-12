export interface RequestEmailCodeInput {
  email: string;
}

export interface VerifyEmailCodeInput {
  email: string;
  /** A six-digit code sent to the requested email address. */
  code: string;
}

export interface EmailCodeRequestAccepted {
  accepted: true;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}
