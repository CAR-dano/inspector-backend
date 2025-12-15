
import { Module } from '@nestjs/common';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { PhotosModule } from '../photos/photos.module';

@Module({
    imports: [PhotosModule],
    controllers: [InspectionsController],
    providers: [InspectionsService],
})
export class InspectionsModule { }
