
import { Injectable, Logger, InternalServerErrorException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { Prisma } from '@prisma/client';
import { format } from 'date-fns';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { InspectionBranchesService } from '../inspection-branches/inspection-branches.service';

@Injectable()
export class InspectionsService {
    private readonly logger = new Logger(InspectionsService.name);
    private readonly SYNC_INTERVAL = 10; // Sync to DB every 10 sequences

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private usersService: UsersService,
        private inspectionBranchesService: InspectionBranchesService,
    ) { }

    /**
     * Generate next inspection ID using Redis atomic counter with DB fallback
     */
    private async generateNextInspectionId(
        branchCode: string,
        inspectionDate: Date,
        tx?: Prisma.TransactionClient,
    ): Promise<string> {
        const datePrefix = format(inspectionDate, 'ddMMyyyy');
        const idPrefix = `${branchCode.toUpperCase()}-${datePrefix}-`;
        const cacheKey = `inspection:sequence:${branchCode.toUpperCase()}:${datePrefix}`;

        try {
            // Try Redis atomic counter first
            const redisHealthy = await this.redisService.isHealthy();

            if (redisHealthy) {
                this.logger.verbose('Using Redis for sequence generation');

                // Get or initialize counter from DB
                const currentCounter = await this.redisService.getCounter(cacheKey);

                if (currentCounter === null) {
                    // First time today - initialize from DB
                    this.logger.verbose('Initializing Redis counter from DB');
                    const dbRecord = await (tx || this.prisma).inspectionSequence.findUnique({
                        where: {
                            branchCode_datePrefix: {
                                branchCode: branchCode.toUpperCase(),
                                datePrefix,
                            },
                        },
                    });

                    const startSequence = dbRecord?.nextSequence || 0;
                    await this.redisService.set(cacheKey, startSequence.toString(), 86400); // 24h TTL
                }

                // Atomic increment in Redis
                const nextSequence = await this.redisService.increment(cacheKey, 86400);

                if (nextSequence !== null) {
                    // Periodic sync to DB (every 10 sequences)
                    if (nextSequence % this.SYNC_INTERVAL === 0) {
                        this.syncSequenceToDb(
                            branchCode.toUpperCase(),
                            datePrefix,
                            nextSequence,
                        ).catch((error) => {
                            this.logger.warn(`Failed to sync sequence to DB: ${error.message}`);
                        });
                    }

                    return `${idPrefix}${nextSequence.toString().padStart(3, '0')}`;
                }
            }
        } catch (error) {
            this.logger.warn(
                `Redis sequence generation failed, falling back to DB: ${(error as Error).message}`,
            );
        }

        // Fallback to DB-based sequence (original implementation)
        this.logger.verbose('Using DB for sequence generation (Redis unavailable or failed)');
        return this.generateNextInspectionIdFromDb(branchCode, datePrefix, tx);
    }

    /**
     * Original DB-based sequence generation (fallback)
     */
    private async generateNextInspectionIdFromDb(
        branchCode: string,
        datePrefix: string,
        tx?: Prisma.TransactionClient,
    ): Promise<string> {
        const idPrefix = `${branchCode.toUpperCase()}-${datePrefix}-`;
        const prismaClient = tx || this.prisma;

        const sequenceRecord = await prismaClient.inspectionSequence.upsert({
            where: {
                branchCode_datePrefix: {
                    branchCode: branchCode.toUpperCase(),
                    datePrefix,
                },
            },
            update: { nextSequence: { increment: 1 } },
            create: { branchCode: branchCode.toUpperCase(), datePrefix, nextSequence: 1 },
            select: { nextSequence: true },
        });

        const currentSequence = sequenceRecord.nextSequence;
        return `${idPrefix}${currentSequence.toString().padStart(3, '0')}`;
    }

    /**
     * Sync Redis counter to database (periodic backup)
     */
    private async syncSequenceToDb(
        branchCode: string,
        datePrefix: string,
        sequence: number,
    ): Promise<void> {
        try {
            await this.prisma.inspectionSequence.upsert({
                where: {
                    branchCode_datePrefix: { branchCode, datePrefix },
                },
                update: { nextSequence: sequence },
                create: { branchCode, datePrefix, nextSequence: sequence },
            });
            this.logger.verbose(`Synced sequence ${sequence} to DB for ${branchCode}-${datePrefix}`);
        } catch (error) {
            this.logger.error(
                `Failed to sync sequence to DB: ${(error as Error).message}`,
            );
        }
    }

    async create(createInspectionDto: CreateInspectionDto, inspectorId: string): Promise<{ id: string }> {
        const { identityDetails } = createInspectionDto;
        let effectiveInspectorId = inspectorId || identityDetails.namaInspektor;

        if (!effectiveInspectorId) throw new BadRequestException('Inspector ID is missing.');

        // Fetch Inspector and Branch
        const inspector = await this.usersService.findById(effectiveInspectorId);
        if (!inspector) throw new BadRequestException(`Inspector ${effectiveInspectorId} not found.`);

        let effectiveBranchCityUuid = inspector.inspectionBranchCityId || identityDetails.cabangInspeksi;
        if (!effectiveBranchCityUuid) throw new BadRequestException('Branch City ID is missing.');

        const branchCity = await this.inspectionBranchesService.findOne(effectiveBranchCityUuid);
        if (!branchCity) throw new BadRequestException(`Branch ${effectiveBranchCityUuid} not found.`);

        const inspectionDateObj = new Date(createInspectionDto.inspectionDate);

        return this.prisma.$transaction(async (tx) => {
            const customId = await this.generateNextInspectionId(branchCity.code, inspectionDateObj, tx);

            const dataToCreate: Prisma.InspectionCreateInput = {
                pretty_id: customId,
                inspector: { connect: { id: effectiveInspectorId } },
                branchCity: { connect: { id: effectiveBranchCityUuid } },
                vehiclePlateNumber: createInspectionDto.vehiclePlateNumber,
                inspectionDate: inspectionDateObj,
                overallRating: createInspectionDto.overallRating,
                identityDetails: {
                    namaInspektor: inspector.name,
                    namaCustomer: identityDetails.namaCustomer,
                    cabangInspeksi: branchCity.city,
                },
                vehicleData: (createInspectionDto.vehicleData as any) ?? Prisma.JsonNull,
                equipmentChecklist: (createInspectionDto.equipmentChecklist as any) ?? Prisma.JsonNull,
                inspectionSummary: (createInspectionDto.inspectionSummary as any) ?? Prisma.JsonNull,
                detailedAssessment: (createInspectionDto.detailedAssessment as any) ?? Prisma.JsonNull,
                bodyPaintThickness: (createInspectionDto.bodyPaintThickness as any) ?? Prisma.JsonNull,
                notesFontSizes: createInspectionDto.notesFontSizes ?? {},
            };

            const newInspection = await tx.inspection.create({ data: dataToCreate });
            return { id: newInspection.id };
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5000,
            timeout: 10000,
        });
    }
}
