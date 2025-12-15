import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Public Users')
@Controller('public/users')
export class PublicUsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('inspectors')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get all inspector users' })
    @ApiResponse({ status: 200, description: 'List of inspector users.' })
    async findAllInspectors() {
        const users = await this.usersService.findAllInspectors();
        // Return specialized DTO if needed, or mask sensitive fields
        return users.map(user => {
            const { password, refreshToken, pin, googleId, ...result } = user;
            return result;
        });
    }
}
