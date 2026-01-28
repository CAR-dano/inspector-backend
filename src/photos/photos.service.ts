
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Photo } from '@prisma/client';

interface PhotoMetadata {
    label?: string;
    needAttention?: boolean;
    category?: string;
    isMandatory?: boolean;
    originalLabel?: string;
    displayInPdf?: boolean;
}

@Injectable()
export class PhotosService {
    private readonly logger = new Logger(PhotosService.name);

    constructor(private readonly prisma: PrismaService) { }

    async addMultiplePhotos(
        inspectionId: string,
        files: Express.Multer.File[],
        metadataJson: string,
    ): Promise<Photo[]> {
        let metadataList: PhotoMetadata[] = [];
        try {
            metadataList = JSON.parse(metadataJson);
        } catch (e) {
            throw new BadRequestException('Invalid metadata JSON');
        }

        if (!Array.isArray(metadataList)) {
            throw new BadRequestException('Metadata must be an array');
        }

        // Allow metadata length to differ from files length? 
        // Usually they should match, or at least have enough metadata for files if order matters.
        // The DTO says "matching file upload order".
        if (metadataList.length !== files.length) {
            this.logger.warn(`Mismatch metadata count (${metadataList.length}) vs files (${files.length}). Proceeding but might be inconsistent.`);
        }



        // Use transaction if needed, but for files loop it's okay to do promise.all or sequential
        // Sequential to ensure ordering matching
        // Parallelize database inserts using Promise.all
        // This significantly improves performance for batched uploads (e.g., 10 photos/request)
        const photoPromises = files.map(async (file, i) => {
            const meta = metadataList[i] || {};

            // Determine path: use S3 location if available (B2), fallback to filename (Local)
            const filePath = (file as any).location || (file as any).key || file.filename;

            return this.prisma.photo.create({
                data: {
                    inspectionId,
                    path: filePath,
                    label: meta.label || "Tambahan",
                    category: meta.category || "General",
                    isMandatory: meta.isMandatory || false,
                    needAttention: meta.needAttention || false,
                    originalLabel: meta.originalLabel,
                    displayInPdf: meta.displayInPdf !== undefined ? meta.displayInPdf : true
                }
            });
        });

        const createdPhotos = await Promise.all(photoPromises);

        return createdPhotos;
    }
}
