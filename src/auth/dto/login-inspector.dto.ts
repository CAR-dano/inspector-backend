
import { IsString, IsNotEmpty, Length, IsEmail } from 'class-validator';

export class LoginInspectorDto {
    @IsString()
    @IsNotEmpty()
    @Length(6, 6, { message: 'PIN must be exactly 6 digits' })
    pin: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;
}
