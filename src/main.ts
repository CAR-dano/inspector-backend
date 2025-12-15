import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as dns from 'dns';

async function bootstrap() {
    // Force IPv4 usage to avoid ETIMEDOUT/ENETUNREACH on dual-stack networks (Backblaze B2)
    dns.setDefaultResultOrder('ipv4first');

    const app = await NestFactory.create(AppModule);
    const logger = new Logger('Bootstrap');

    // Ensure upload directories exist
    const uploadDirs = ['./uploads/inspection-photos'];
    uploadDirs.forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logger.log(`Created directory: ${dir}`);
        }
    });

    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    const port = process.env.PORT || 3001; // Default to 3001 to avoid conflict if backend runs on 3000
    await app.listen(port);
    logger.log(`Inspector Backend Microservice running on port ${port}`);
}
bootstrap();
