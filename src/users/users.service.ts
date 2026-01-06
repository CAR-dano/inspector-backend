
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma, Role } from '@prisma/client';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) { }

    async findByEmail(email: string): Promise<User | null> {
        const cacheKey = `user:email:${email}`;

        try {
            // Check Redis cache
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                this.logger.verbose('User email cache hit');
                return JSON.parse(cached);
            }

            // Cache miss - query database
            this.logger.verbose('User email cache miss, querying database');
            const user = await this.prisma.user.findUnique({
                where: { email },
                include: { inspectionBranchCity: true },
            });

            // Cache result if found (1 hour TTL)
            if (user) {
                await this.redisService.set(
                    cacheKey,
                    JSON.stringify(user),
                    3600, // 1 hour
                ).catch(() => {
                    this.logger.warn('Failed to cache user by email');
                });
            }

            return user;
        } catch (error) {
            this.logger.error(`Error in findByEmail: ${(error as Error).message}`);
            // Fallback to database on error
            return this.prisma.user.findUnique({
                where: { email },
                include: { inspectionBranchCity: true },
            });
        }
    }

    async findById(id: string): Promise<User | null> {
        const cacheKey = `user:profile:${id}`;

        try {
            // Check Redis cache
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                this.logger.verbose('User profile cache hit');
                return JSON.parse(cached);
            }

            // Cache miss - query database
            this.logger.verbose('User profile cache miss, querying database');
            const user = await this.prisma.user.findUnique({
                where: { id },
                include: { inspectionBranchCity: true },
            });

            // Cache result if found (1 hour TTL)
            if (user) {
                await this.redisService.set(
                    cacheKey,
                    JSON.stringify(user),
                    3600, // 1 hour
                ).catch(() => {
                    this.logger.warn('Failed to cache user profile');
                });
            }

            return user;
        } catch (error) {
            this.logger.error(`Error in findById: ${(error as Error).message}`);
            // Fallback to database on error
            return this.prisma.user.findUnique({
                where: { id },
                include: { inspectionBranchCity: true },
            });
        }
    }

    async updateUser(id: string, data: Prisma.UserUpdateInput): Promise<User> {
        const updated = await this.prisma.user.update({
            where: { id },
            data,
        });

        // Invalidate cache after update
        await this.invalidateUserCache(id, updated.email);

        return updated;
    }

    /**
     * Invalidate user cache entries
     */
    private async invalidateUserCache(userId: string, email: string | null) {
        try {
            await Promise.all([
                this.redisService.delete(`user:profile:${userId}`),
                email ? this.redisService.delete(`user:email:${email}`) : Promise.resolve(),
                this.redisService.delete('users:inspectors:all'), // Also invalidate inspector list
            ]);
            this.logger.log(`Invalidated cache for user ${userId}`);
        } catch (error) {
            this.logger.warn(`Failed to invalidate user cache: ${(error as Error).message}`);
        }
    }

    async findAllInspectors(): Promise<User[]> {
        const cacheKey = 'users:inspectors:all';

        try {
            // Check Redis cache
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                this.logger.verbose('Inspector list cache hit');
                return JSON.parse(cached);
            }

            // Cache miss - query database
            this.logger.verbose('Inspector list cache miss, querying database');
            const inspectors = await this.prisma.user.findMany({
                where: { role: Role.INSPECTOR },
            });

            // Cache result (1 hour TTL)
            await this.redisService.set(
                cacheKey,
                JSON.stringify(inspectors),
                3600, // 1 hour
            ).catch(() => {
                this.logger.warn('Failed to cache inspector list');
            });

            return inspectors;
        } catch (error) {
            this.logger.error(`Error in findAllInspectors: ${(error as Error).message}`);
            // Fallback to database on error
            return this.prisma.user.findMany({
                where: { role: Role.INSPECTOR },
            });
        }
    }
}
