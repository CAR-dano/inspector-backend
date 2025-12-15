
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PhotosModule } from './photos/photos.module';
import { InspectionsModule } from './inspections/inspections.module';
import { InspectionBranchesModule } from './inspection-branches/inspection-branches.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        UsersModule,
        PhotosModule,
        InspectionsModule,
        InspectionBranchesModule,
    ],
})
export class AppModule { }
