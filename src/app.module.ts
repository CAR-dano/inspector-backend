
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
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'uploads'), // Serve files from root 'uploads'
            serveRoot: '/uploads', // Access via http://host/uploads/...
        }),
        ConfigModule.forRoot({ isGlobal: true }),
        RedisModule, // Import explicitly for Throttler dependency

        ThrottlerModule.forRootAsync({
            imports: [RedisModule],
            inject: [RedisService],
            useFactory: (redisService: RedisService) => ({
                throttlers: [
                    {
                        ttl: 60000, // 1 minute
                        limit: 60,  // 60 requests
                    },
                ],
                storage: new RedisThrottlerStorage(redisService),
            }),
        }),

        PrismaModule,
        AuthModule,
        UsersModule,
        PhotosModule,
        InspectionsModule,
        InspectionBranchesModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule { }
