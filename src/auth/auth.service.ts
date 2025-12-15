
import { Injectable, Logger, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { User, Role } from '@prisma/client';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import * as bcrypt from 'bcrypt'; // Ensure bcrypt is installed
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    async validateInspector(pin: string, email: string): Promise<Omit<User, 'password' | 'googleId' | 'pin'> | null> {
        const user = await this.usersService.findByEmail(email);

        if (!user || user.role !== Role.INSPECTOR || !user.pin) {
            return null;
        }

        const isPinMatching = await bcrypt.compare(pin, user.pin);

        if (isPinMatching) {
            const { password, googleId, pin: userPin, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: { id: string; email: string | null; role: Role; name?: string | null; username?: string | null }) {
        const payload: JwtPayload = {
            sub: user.id,
            email: user.email ?? undefined,
            role: user.role,
            name: user.name ?? undefined,
            username: user.username ?? undefined,
        };

        const secret = this.configService.getOrThrow<string>('JWT_SECRET');
        const expiresIn = this.configService.getOrThrow<string>('JWT_EXPIRATION_TIME');

        const accessToken = this.jwtService.sign(payload, { secret, expiresIn: expiresIn as any });

        // Refresh token logic
        const refreshTokenSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
        const refreshTokenExpiresIn = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRATION_TIME');

        const refreshToken = this.jwtService.sign(payload, {
            secret: refreshTokenSecret,
            expiresIn: refreshTokenExpiresIn as any,
        });

        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        await this.usersService.updateUser(user.id, {
            refreshToken: hashedRefreshToken,
        });

        return { accessToken, refreshToken };
    }

    async refreshTokens(userId: string) {
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new UnauthorizedException('Access Denied');
        }
        return this.login(user); // Generates new tokens and updates DB
    }

    async isTokenBlacklisted(token: string): Promise<boolean> {
        const blacklisted = await this.prisma.blacklistedToken.findUnique({
            where: { token },
        });
        return !!blacklisted;
    }
}
