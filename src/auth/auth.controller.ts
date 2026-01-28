
import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { InspectorGuard } from './guards/inspector.guard';
import { LoginInspectorDto } from './dto/login-inspector.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { User } from '@prisma/client';

@ApiTags('Auth (Inspector)')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login/inspector')
    @UseGuards(InspectorGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login for inspectors with PIN' })
    @ApiBody({ type: LoginInspectorDto })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Login successful, JWT returned.',
        type: LoginResponseDto,
    })
    async loginInspector(@Req() req: any): Promise<LoginResponseDto> {
        const { accessToken, refreshToken } = await this.authService.login(req.user);
        return {
            accessToken,
            refreshToken,
            user: new UserResponseDto(req.user),
        };
    }

    @Post('refresh')
    @UseGuards(JwtRefreshGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Refresh access token' })
    @ApiBearerAuth()
    async refreshTokens(@Req() req: any) {
        const userId = req.user['id'];
        return this.authService.refreshTokens(userId);
    }

    @Get('check-token')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Check if token is valid' })
    @ApiBearerAuth()
    checkTokenValidity() {
        return { message: 'Token is valid' };
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Logout and invalidate token' })
    @ApiBearerAuth()
    async logout(@Req() req: any) {
        // Extract token directly from header since req.user is just the payload
        // JwtStrategy already validated the signature and expiration
        const authHeader = req.headers.authorization;
        if (!authHeader) return; // Should be caught by Guard, but safety check

        const token = authHeader.split(' ')[1];

        // Use expiration from the validated payload
        // payload.exp is in seconds, convert to Milliseconds
        const expiresAt = new Date(req.user['exp'] * 1000);

        await this.authService.blacklistToken(token, expiresAt);

        return { message: 'Logged out successfully' };
    }
}
