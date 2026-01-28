import { Module } from '@nestjs/common';
import { InspectionBranchesService } from './inspection-branches.service';
import { InspectionBranchesController } from './inspection-branches.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [InspectionBranchesController],
    providers: [InspectionBranchesService],
    exports: [InspectionBranchesService],
})
export class InspectionBranchesModule { }
