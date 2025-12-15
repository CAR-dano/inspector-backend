
import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFiles, Logger, HttpCode, HttpStatus, Param, Req } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { PhotosService } from '../photos/photos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InspectorGuard } from '../auth/guards/inspector.guard';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { AddMultiplePhotosDto } from '../photos/dto/add-multiple-photos.dto';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

import { PhotoResponseDto } from '../photos/dto/photo-response.dto';

const MAX_PHOTOS = 10;
const UPLOAD_PATH = './uploads/inspection-photos';

const photoStorageConfig = diskStorage({
    destination: UPLOAD_PATH,
    filename: (req, file, callback) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const extension = extname(file.originalname);
        const safeOriginalName = file.originalname.split('.')[0].replace(/[^a-z0-9]/gi, '-').toLowerCase();
        callback(null, `${safeOriginalName}-${uniqueSuffix}${extension}`);
    },
});

@ApiTags('Inspections')
@Controller('inspections')
export class InspectionsController {
    private readonly logger = new Logger(InspectionsController.name);

    constructor(
        private readonly inspectionsService: InspectionsService,
        private readonly photosService: PhotosService,
    ) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @UseGuards(JwtAuthGuard) // Assuming JWT is used after login? Or Inspector pin guard?
    // User flow: Login -> Token -> Create. So JwtAuthGuard.
    // Although user plan said "Login -> Token", so this should be protected by JWT.
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create inspection (Inspector only)' })
    async create(@Body() createInspectionDto: CreateInspectionDto, @Req() req: any) {
        const user = req.user;
        return this.inspectionsService.create(createInspectionDto, user.id);
    }

    @Post(':id/photos/multiple')
    @HttpCode(HttpStatus.CREATED)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @UseInterceptors(FilesInterceptor('photos', MAX_PHOTOS, { storage: photoStorageConfig }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: AddMultiplePhotosDto })
    async addMultiplePhotos(
        @Param('id') id: string,
        @Body() dto: AddMultiplePhotosDto,
        @UploadedFiles(new FileValidationPipe()) files: Array<Express.Multer.File>,
    ) {
        const photos = await this.photosService.addMultiplePhotos(id, files, dto.metadata);
        return photos.map(photo => new PhotoResponseDto({
            ...photo,
            label: photo.label ?? '',
            category: photo.category ?? '',
            isMandatory: photo.isMandatory ?? false,
            needAttention: photo.needAttention ?? false,
            // Map other potential nulls if necessary, or ensure DTO allows nulls.
            // Since DTO defines them as required non-null types (by default in TS if not ?), we provide defaults.
        }));
    }
}

