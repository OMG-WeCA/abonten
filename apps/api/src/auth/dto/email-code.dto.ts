import { IsEmail, IsString, Matches } from 'class-validator';

export class RequestEmailCodeDto {
  @IsEmail()
  email!: string;
}

export class VerifyEmailCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a six-digit number' })
  code!: string;
}
