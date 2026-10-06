import { IsEmail, IsString, Matches, IsOptional, IsIn } from 'class-validator';

export class RequestEmailCodeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';
}

export class VerifyEmailCodeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a six-digit number' })
  code!: string;
}
