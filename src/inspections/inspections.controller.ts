
import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFiles, Logger, HttpCode, HttpStatus, Param, Req } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { PhotosService } from '../photos/photos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InspectorGuard } from '../auth/guards/inspector.guard';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { AddMultiplePhotosDto } from '../photos/dto/add-multiple-photos.dto';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

import { PhotoResponseDto } from '../photos/dto/photo-response.dto';

const MAX_PHOTOS = 10;

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
    @UseInterceptors(FilesInterceptor('photos', MAX_PHOTOS))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: AddMultiplePhotosDto })
    async addMultiplePhotos(
        @Param('id') id: string,
        @Body() dto: AddMultiplePhotosDto,
        @UploadedFiles(new FileValidationPipe()) files: Array<Express.Multer.File>,
    ) {
        const photos = await this.photosService.addMultiplePhotos(id, files, dto.metadata);

        // Use APP_URL from env or default to localhost
        const appUrl = process.env.APP_URL || 'http://localhost:3012';

        return photos.map(photo => {
            let fullPath = photo.path;
            // Normalize path: if not http (S3), assume local and prepend base URL
            if (photo.path && !photo.path.startsWith('http')) {
                fullPath = `${appUrl}/uploads/inspection-photos/${photo.path}`;
            }

            return new PhotoResponseDto({
                ...photo,
                path: fullPath,
                label: photo.label ?? '',
                category: photo.category ?? '',
                isMandatory: photo.isMandatory ?? false,
                needAttention: photo.needAttention ?? false,
            });
        });
    }
}

