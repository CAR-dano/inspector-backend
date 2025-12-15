
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PhotosModule } from './photos/photos.module';
import { InspectionsModule } from './inspections/inspections.module';
import { InspectionBranchesModule } from './inspection-branches/inspection-branches.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'uploads'), // Serve files from root 'uploads'
            serveRoot: '/uploads', // Access via http://host/uploads/...
        }),
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
