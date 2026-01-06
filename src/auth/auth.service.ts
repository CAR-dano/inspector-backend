
import { Injectable, Logger, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { User, Role } from '@prisma/client';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import * as bcrypt from 'bcrypt'; // Ensure bcrypt is installed
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
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

    /**
     * Checks if a given token is present in the blacklist.
     * Uses Redis cache with automatic fallback to PostgreSQL database.
     *
     * @param token The JWT string to check.
     * @returns A promise that resolves to true if the token is blacklisted, false otherwise.
     */
    async isTokenBlacklisted(token: string): Promise<boolean> {
        this.logger.verbose(`Checking if token is blacklisted.`);

        try {
            // Try Redis first (fast path)
            const cachedResult = await this.redisService.get(`blacklist:${token}`);
            if (cachedResult !== null) {
                this.logger.verbose('Token blacklist check: Redis cache hit');
                return cachedResult === 'true';
            }

            // Redis miss or unavailable - fallback to database
            this.logger.verbose(
                'Token blacklist check: Redis miss, checking database',
            );
            const blacklisted = await this.prisma.blacklistedToken.findUnique({
                where: { token },
            });

            // Cache the result in Redis for next time (if Redis is available)
            if (blacklisted) {
                const ttl = Math.floor(
                    (blacklisted.expiresAt.getTime() - Date.now()) / 1000,
                );
                if (ttl > 0) {
                    await this.redisService
                        .set(`blacklist:${token}`, 'true', ttl)
                        .catch(() => {
                            this.logger.warn('Failed to cache blacklist result in Redis');
                        });
                }
            }

            return !!blacklisted;
        } catch (error) {
            this.logger.error(
                `Error checking blacklist: ${(error as Error).message}`,
            );

            // If Redis fails, try database as fallback
            try {
                const blacklisted = await this.prisma.blacklistedToken.findUnique({
                    where: { token },
                });
                return !!blacklisted;
            } catch (dbError) {
                this.logger.error(
                    `Database fallback also failed: ${(dbError as Error).message}`,
                );
                throw new InternalServerErrorException(
                    'Failed to check token blacklist.',
                );
            }
        }
    }

    /**
     * Blacklists a given JWT token by storing it in both Redis and database.
     * Uses dual-write strategy for resilience and performance.
     *
     * @param token The JWT string to blacklist.
     * @param expiresAt The expiration date of the token.
     */
    async blacklistToken(token: string, expiresAt: Date): Promise<void> {
        this.logger.log(
            `Blacklisting token that expires at: ${expiresAt.toISOString()}`,
        );

        const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

        try {
            // Write to both Redis and Database (dual-write for resilience)
            const results = await Promise.allSettled([
                // Write to Redis (fast, with TTL)
                this.redisService.set(`blacklist:${token}`, 'true', ttl),

                // Write to Database (persistent, for fallback)
                this.prisma.blacklistedToken.create({
                    data: { token, expiresAt },
                }),
            ]);

            const [redisResult, dbResult] = results;

            if (redisResult.status === 'rejected') {
                this.logger.warn(`Redis write failed: ${redisResult.reason}`);
            }

            if (dbResult.status === 'rejected') {
                this.logger.warn(`Database write failed: ${dbResult.reason}`);
            }

            // Success if at least one write succeeded
            if (
                redisResult.status === 'fulfilled' ||
                dbResult.status === 'fulfilled'
            ) {
                this.logger.log('Token successfully blacklisted');
            } else {
                throw new Error('Both Redis and Database writes failed');
            }
        } catch (error) {
            this.logger.error(
                `Failed to blacklist token: ${(error as Error).message}`,
            );
            throw new InternalServerErrorException('Failed to blacklist token.');
        }
    }
}
