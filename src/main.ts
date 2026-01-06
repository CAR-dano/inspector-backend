import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as dns from 'dns';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    // Force IPv4 usage to avoid ETIMEDOUT/ENETUNREACH on dual-stack networks (Backblaze B2)
    dns.setDefaultResultOrder('ipv4first');

    const app = await NestFactory.create(AppModule);
    const logger = new Logger('Bootstrap');
    const configService = app.get(ConfigService);

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

    // Enable CORS if frontend and backend have different origins
    // Supports multiple origins separated by comma
    const clientUrl = configService.get<string>('CLIENT_BASE_URL');
    if (clientUrl) {
        const allowedOrigins = clientUrl.split(',').map(url => url.trim());
        logger.log(`Enabling CORS for origins: ${allowedOrigins.join(', ')}`);
        app.enableCors({
            origin: (origin, callback) => {
                // Allow requests with no origin (like mobile apps or curl)
                if (!origin) return callback(null, true);

                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error(`Origin ${origin} not allowed by CORS`));
                }
            },
            methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
            credentials: true,
        });
    } else {
        logger.warn(
            'CLIENT_BASE_URL not set in .env, enabling CORS for all origins (development only)',
        );
        app.enableCors();
    }

    const port = process.env.PORT || 3001; // Default to 3001 to avoid conflict if backend runs on 3000
    await app.listen(port);
    logger.log(`Inspector Backend Microservice running on port ${port}`);
}
bootstrap();
