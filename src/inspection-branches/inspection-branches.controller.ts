import { Controller, Get, Param, HttpStatus, HttpCode } from '@nestjs/common';
import { InspectionBranchesService } from './inspection-branches.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Inspection Branches')
@Controller('inspection-branches')
export class InspectionBranchesController {
    constructor(private readonly inspectionBranchesService: InspectionBranchesService) { }

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get all inspection branches' })
    @ApiResponse({ status: 200, description: 'List of all inspection branches.' })
    async findAll() {
        return this.inspectionBranchesService.findAll();
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get an inspection branch by ID' })
    @ApiParam({ name: 'id', type: String })
    @ApiResponse({ status: 200, description: 'The inspection branch details.' })
    @ApiResponse({ status: 404, description: 'Branch not found.' })
    async findOne(@Param('id') id: string) {
        return this.inspectionBranchesService.findOne(id);
    }
}
