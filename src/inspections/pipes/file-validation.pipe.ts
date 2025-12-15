
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { extname } from 'path';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = /^image\/(jpg|jpeg|png)$/;
const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png)$/i;

@Injectable()
export class FileValidationPipe implements PipeTransform {
    private readonly logger = new Logger(FileValidationPipe.name);

    async transform(files: Express.Multer.File | Express.Multer.File[], metadata: ArgumentMetadata) {
        if (!files) throw new BadRequestException('File upload is required.');

        if (Array.isArray(files)) {
            if (files.length === 0) throw new BadRequestException('At least one file must be uploaded.');
            for (const file of files) await this.validateFile(file);
        } else {
            await this.validateFile(files);
        }
        return files;
    }

    private async validateFile(file: Express.Multer.File): Promise<void> {
        if (!file || !file.path) throw new BadRequestException('Invalid file uploaded.');
        if (file.size > MAX_FILE_SIZE_BYTES) {
            await this.cleanupFile(file.path);
            throw new BadRequestException(`File "${file.originalname}" exceeds 5 MB.`);
        }
        if (!ALLOWED_MIME_TYPES.test(file.mimetype) || !ALLOWED_EXTENSIONS.test(extname(file.originalname))) {
            await this.cleanupFile(file.path);
            throw new BadRequestException(`File "${file.originalname}" has invalid type.`);
        }

        try {
            const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<typeof import('file-type')>);
            const buffer = await fs.readFile(file.path);
            const type = await fileTypeFromBuffer(buffer);
            if (!type || !ALLOWED_MIME_TYPES.test(type.mime)) {
                await this.cleanupFile(file.path);
                throw new BadRequestException(`File content of "${file.originalname}" mismatch.`);
            }
        } catch (error) {
            await this.cleanupFile(file.path);
            this.logger.error(`Validation failed for ${file.originalname}:`, error);
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException('Could not validate file type.');
        }
    }

    private async cleanupFile(filePath: string): Promise<void> {
        try { await fs.unlink(filePath); } catch (e) { }
    }
}
