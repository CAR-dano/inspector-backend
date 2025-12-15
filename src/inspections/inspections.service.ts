
import { Injectable, Logger, InternalServerErrorException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { Prisma } from '@prisma/client';
import { format } from 'date-fns';

@Injectable()
export class InspectionsService {
    private readonly logger = new Logger(InspectionsService.name);

    constructor(private prisma: PrismaService) { }

    private async generateNextInspectionId(branchCode: string, inspectionDate: Date, tx: Prisma.TransactionClient): Promise<string> {
        const datePrefix = format(inspectionDate, 'ddMMyyyy');
        const idPrefix = `${branchCode.toUpperCase()}-${datePrefix}-`;

        const sequenceRecord = await tx.inspectionSequence.upsert({
            where: { branchCode_datePrefix: { branchCode: branchCode.toUpperCase(), datePrefix } },
            update: { nextSequence: { increment: 1 } },
            create: { branchCode: branchCode.toUpperCase(), datePrefix, nextSequence: 1 },
            select: { nextSequence: true },
        });

        const currentSequence = sequenceRecord.nextSequence;
        return `${idPrefix}${currentSequence.toString().padStart(3, '0')}`;
    }

    async create(createInspectionDto: CreateInspectionDto, inspectorId: string): Promise<{ id: string }> {
        const { identityDetails } = createInspectionDto;
        let effectiveInspectorId = inspectorId || identityDetails.namaInspektor;

        if (!effectiveInspectorId) throw new BadRequestException('Inspector ID is missing.');

        // Fetch Inspector and Branch
        const inspector = await this.prisma.user.findUnique({
            where: { id: effectiveInspectorId },
            select: { name: true, inspectionBranchCityId: true },
        });
        if (!inspector) throw new BadRequestException(`Inspector ${effectiveInspectorId} not found.`);

        let effectiveBranchCityUuid = inspector.inspectionBranchCityId || identityDetails.cabangInspeksi;
        if (!effectiveBranchCityUuid) throw new BadRequestException('Branch City ID is missing.');

        const branchCity = await this.prisma.inspectionBranchCity.findUnique({
            where: { id: effectiveBranchCityUuid },
            select: { city: true, code: true },
        });
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
                vehicleData: createInspectionDto.vehicleData ?? Prisma.JsonNull,
                equipmentChecklist: createInspectionDto.equipmentChecklist ?? Prisma.JsonNull,
                inspectionSummary: createInspectionDto.inspectionSummary ?? Prisma.JsonNull,
                detailedAssessment: createInspectionDto.detailedAssessment ?? Prisma.JsonNull,
                bodyPaintThickness: createInspectionDto.bodyPaintThickness ?? Prisma.JsonNull,
                notesFontSizes: createInspectionDto.notesFontSizes ?? {},
            };

            const newInspection = await tx.inspection.create({ data: dataToCreate });
            return { id: newInspection.id };
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
        });
    }
}
