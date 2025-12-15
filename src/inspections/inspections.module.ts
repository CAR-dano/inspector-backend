
import { Module } from '@nestjs/common';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { PhotosModule } from '../photos/photos.module';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { s3StorageConfig } from '../common/configs/s3-storage.config';

@Module({
    imports: [
        PhotosModule,
        MulterModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                storage: s3StorageConfig(configService),
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [InspectionsController],
    providers: [InspectionsService],
})
export class InspectionsModule { }
