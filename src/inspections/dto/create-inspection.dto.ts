
import { IsString, IsDateString, IsObject, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Simplified DTOs for nested checks (Use stricter DTOs if required)
class IdentityDetailsDto {
    @IsString() @IsNotEmpty() namaInspektor: string;
    @IsString() @IsNotEmpty() namaCustomer: string;
    @IsString() @IsNotEmpty() cabangInspeksi: string;
}

export class CreateInspectionDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    vehiclePlateNumber: string;

    @ApiProperty()
    @IsDateString()
    @IsNotEmpty()
    inspectionDate: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    overallRating: string;

    @ApiProperty()
    @IsObject()
    identityDetails: IdentityDetailsDto;

    @ApiProperty()
    @IsOptional() @IsObject()
    vehicleData: any;

    @ApiProperty()
    @IsOptional() @IsObject()
    equipmentChecklist: any;

    @ApiProperty()
    @IsOptional() @IsObject()
    inspectionSummary: any;

    @ApiProperty()
    @IsOptional() @IsObject()
    detailedAssessment: any;

    @ApiProperty()
    @IsOptional() @IsObject()
    bodyPaintThickness: any;

    @ApiProperty()
    @IsOptional() @IsObject()
    notesFontSizes?: object;
}
