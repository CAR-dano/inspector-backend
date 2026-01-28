import { Test, TestingModule } from '@nestjs/testing';
import { PhotosService } from './photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMock } from '@golevelup/ts-jest';

describe('PhotosService', () => {
    let service: PhotosService;
    let prismaService: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PhotosService,
                { provide: PrismaService, useValue: createMock<PrismaService>() },
            ],
        }).compile();

        service = module.get<PhotosService>(PhotosService);
        prismaService = module.get<PrismaService>(PrismaService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('addMultiplePhotos', () => {
        it('should add multiple photos in parallel', async () => {
            // Arrange
            const inspectionId = 'inspection-123';
            const files: any[] = [
                { filename: 'photo1.jpg', location: 'http://s3/photo1.jpg' },
                { filename: 'photo2.jpg', location: 'http://s3/photo2.jpg' },
            ];
            const metadata = JSON.stringify([
                { label: 'Front' },
                { label: 'Back' },
            ]);

            (prismaService.photo.create as jest.Mock).mockResolvedValue({ id: 'photo-id' });

            // Act
            await service.addMultiplePhotos(inspectionId, files, metadata);

            // Assert
            expect(prismaService.photo.create).toHaveBeenCalledTimes(2);
            // We can't strictly prove parallelism in unit test without delays, 
            // but we verify that the method logic calls create for each file.
            expect(prismaService.photo.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ path: 'http://s3/photo1.jpg', label: 'Front' })
            }));
            expect(prismaService.photo.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ path: 'http://s3/photo2.jpg', label: 'Back' })
            }));
        });

        it('should throw BadRequestException on invalid metadata JSON', async () => {
            await expect(service.addMultiplePhotos('id', [], '{invalid-json'))
                .rejects.toThrow('Invalid metadata JSON');
        });

        it('should throw BadRequestException on metadata not being an array', async () => {
            await expect(service.addMultiplePhotos('id', [], '{"foo":"bar"}'))
                .rejects.toThrow('Metadata must be an array');
        });
    });
});
