
import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { InspectorGuard } from './guards/inspector.guard';
import { LoginInspectorDto } from './dto/login-inspector.dto';
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
    async loginInspector(@Req() req: any) {
        return this.authService.login(req.user);
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
}
