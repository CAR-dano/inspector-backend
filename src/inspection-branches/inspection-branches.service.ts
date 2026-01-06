import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class InspectionBranchesService {
    private readonly logger = new Logger(InspectionBranchesService.name);

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
    ) { }

    async findAll() {
        const cacheKey = 'branches:all';

        try {
            // Check Redis cache
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                this.logger.verbose('Branch list cache hit');
                return JSON.parse(cached);
            }

            // Cache miss - query database
            this.logger.verbose('Branch list cache miss, querying database');
            const branches = await this.prisma.inspectionBranchCity.findMany();

            // Cache result (24 hours TTL - data rarely changes)
            await this.redisService.set(
                cacheKey,
                JSON.stringify(branches),
                86400, // 24 hours
            ).catch(() => {
                this.logger.warn('Failed to cache branch list');
            });

            return branches;
        } catch (error) {
            this.logger.error(`Error in findAll: ${(error as Error).message}`);
            // Fallback to database on error
            return this.prisma.inspectionBranchCity.findMany();
        }
    }

    async findOne(id: string) {
        const cacheKey = `branches:${id}`;

        try {
            // Check Redis cache
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                this.logger.verbose('Branch cache hit');
                return JSON.parse(cached);
            }

            // Cache miss - query database
            this.logger.verbose('Branch cache miss, querying database');
            const branch = await this.prisma.inspectionBranchCity.findUnique({
                where: { id },
            });

            if (!branch) {
                throw new NotFoundException(`Branch with ID "${id}" not found`);
            }

            // Cache result (24 hours TTL)
            await this.redisService.set(
                cacheKey,
                JSON.stringify(branch),
                86400, // 24 hours
            ).catch(() => {
                this.logger.warn('Failed to cache branch');
            });

            return branch;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Error in findOne: ${(error as Error).message}`);
            // Fallback to database on error
            const branch = await this.prisma.inspectionBranchCity.findUnique({
                where: { id },
            });
            if (!branch) {
                throw new NotFoundException(`Branch with ID "${id}" not found`);
            }
            return branch;
        }
    }

    /**
     * Invalidate branch cache (call when branch is created/updated)
     */
    async invalidateBranchCache(branchId?: string) {
        try {
            const promises = [this.redisService.delete('branches:all')];
            if (branchId) {
                promises.push(this.redisService.delete(`branches:${branchId}`));
            }
            await Promise.all(promises);
            this.logger.log('Invalidated branch cache');
        } catch (error) {
            this.logger.warn(`Failed to invalidate branch cache: ${(error as Error).message}`);
        }
    }
}
