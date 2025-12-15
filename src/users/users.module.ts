
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { PublicUsersController } from './public-users.controller';

@Module({
    providers: [UsersService],
    exports: [UsersService],
    controllers: [PublicUsersController]
})
export class UsersModule { }
