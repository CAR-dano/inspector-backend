import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InspectionBranchesService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.inspectionBranchCity.findMany(); // Using inspectionBranchCity table from schema
    }

    async findOne(id: string) {
        const branch = await this.prisma.inspectionBranchCity.findUnique({
            where: { id },
        });
        if (!branch) {
            throw new NotFoundException(`Branch with ID "${id}" not found`);
        }
        return branch;
    }
}
