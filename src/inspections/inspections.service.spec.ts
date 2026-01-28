import { Test, TestingModule } from '@nestjs/testing';
import { InspectionsService } from './inspections.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { InspectionBranchesService } from '../inspection-branches/inspection-branches.service';
import { createMock } from '@golevelup/ts-jest';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { Prisma } from '@prisma/client';

describe('InspectionsService', () => {
    let service: InspectionsService;
    let prismaService: PrismaService;
    let redisService: RedisService;
    let usersService: UsersService;
    let branchesService: InspectionBranchesService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InspectionsService,
                { provide: PrismaService, useValue: createMock<PrismaService>() },
                { provide: RedisService, useValue: createMock<RedisService>() },
                { provide: UsersService, useValue: createMock<UsersService>() },
                { provide: InspectionBranchesService, useValue: createMock<InspectionBranchesService>() },
            ],
        }).compile();

        service = module.get<InspectionsService>(InspectionsService);
        prismaService = module.get<PrismaService>(PrismaService);
        redisService = module.get<RedisService>(RedisService);
        usersService = module.get<UsersService>(UsersService);
        branchesService = module.get<InspectionBranchesService>(InspectionBranchesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create an inspection successfully with Redis sequence generation', async () => {
            // Arrange
            const dto: CreateInspectionDto = {
                inspectionDate: new Date('2025-01-20').toISOString(),
                vehiclePlateNumber: 'B 1234 CD',
                overallRating: 'Good',
                identityDetails: {
                    namaCustomer: 'John Doe',
                    cabangInspeksi: 'Yogyakarta',
                },
                // ... other fields
            } as any;
            const inspectorId = 'inspector-uuid';
            const inspector = { id: inspectorId, name: 'Inspector Budi', inspectionBranchCityId: 'branch-uuid' };
            const branch = { id: 'branch-uuid', city: 'Yogyakarta', code: 'YOG' };

            (usersService.findById as jest.Mock).mockResolvedValue(inspector);
            (branchesService.findOne as jest.Mock).mockResolvedValue(branch);

            // Redis Mock for Sequence
            (redisService.isHealthy as jest.Mock).mockResolvedValue(true);
            (redisService.getCounter as jest.Mock).mockResolvedValue(5);
            (redisService.increment as jest.Mock).mockResolvedValue(6);

            // Prisma Mock
            const txMock = {
                inspection: {
                    create: jest.fn().mockResolvedValue({ id: 'new-inspection-id' }),
                },
            };
            (prismaService.$transaction as jest.Mock).mockImplementation((cb) => cb(txMock));

            // Act
            const result = await service.create(dto, inspectorId);

            // Assert
            expect(result).toEqual({ id: 'new-inspection-id' });
            expect(usersService.findById).toHaveBeenCalledWith(inspectorId);
            expect(branchesService.findOne).toHaveBeenCalledWith(inspector.inspectionBranchCityId);

            // Verify sequence logic
            expect(redisService.increment).toHaveBeenCalled();

            // Verify DB creation
            expect(txMock.inspection.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    pretty_id: 'YOG-20012025-006', // Expected generated ID
                    vehiclePlateNumber: 'B 1234 CD',
                })
            }));
        });

        it('should fallback to DB sequence when Redis is unhealthy', async () => {
            // Arrange
            const dto: CreateInspectionDto = {
                inspectionDate: new Date('2025-01-20').toISOString(),
                vehiclePlateNumber: 'B 1234 CD',
                identityDetails: { namaCustomer: 'John', cabangInspeksi: 'Yogyakarta' },
            } as any;
            const inspectorId = 'inspector-uuid';
            const inspector = { id: inspectorId, name: 'Inspector Budi', inspectionBranchCityId: 'branch-uuid' };
            const branch = { id: 'branch-uuid', city: 'Yogyakarta', code: 'YOG' };

            (usersService.findById as jest.Mock).mockResolvedValue(inspector);
            (branchesService.findOne as jest.Mock).mockResolvedValue(branch);

            // Redis Mock - Unhealthy
            (redisService.isHealthy as jest.Mock).mockResolvedValue(false);

            // Prisma Mock
            const txMock = {
                inspection: { create: jest.fn().mockResolvedValue({ id: 'new-inspection-id' }) },
                inspectionSequence: {
                    upsert: jest.fn().mockResolvedValue({ nextSequence: 99 }) // DB sequence
                }
            };
            (prismaService.$transaction as jest.Mock).mockImplementation((cb) => cb(txMock));

            // Act
            await service.create(dto, inspectorId);

            // Assert
            expect(redisService.increment).not.toHaveBeenCalled();
            expect(txMock.inspectionSequence.upsert).toHaveBeenCalled();
            expect(txMock.inspection.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    pretty_id: 'YOG-20012025-099'
                })
            }));
        });

        it('should throw BadRequestException if inspector not found', async () => {
            (usersService.findById as jest.Mock).mockResolvedValue(null);

            const dto = { identityDetails: { namaInspektor: 'Unknown' } } as any;

            await expect(service.create(dto, 'unknown-id'))
                .rejects.toThrow('Inspector unknown-id not found.');
        });

        it('should throw BadRequestException if branch not found', async () => {
            const inspector = { id: 'uuid', inspectionBranchCityId: 'invalid-branch' };
            (usersService.findById as jest.Mock).mockResolvedValue(inspector);
            (branchesService.findOne as jest.Mock).mockResolvedValue(null);

            const dto = { identityDetails: { namaCustomer: 'John' } } as any;

            await expect(service.create(dto, 'uuid'))
                .rejects.toThrow('Branch invalid-branch not found.');
        });
    });
});
