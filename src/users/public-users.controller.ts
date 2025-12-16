import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('Public Users')
@Controller('public/users')
export class PublicUsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('inspectors')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get all inspector users' })
    @ApiResponse({ status: 200, description: 'List of inspector users.', type: [UserResponseDto] })
    async findAllInspectors(): Promise<UserResponseDto[]> {
        const users = await this.usersService.findAllInspectors();
        return users.map(user => new UserResponseDto(user));
    }
}
