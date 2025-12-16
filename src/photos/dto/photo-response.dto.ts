
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PhotoResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    path: string;

    @ApiProperty()
    label: string;

    @ApiProperty()
    category: string;

    @ApiProperty()
    isMandatory: boolean;

    @ApiProperty()
    needAttention: boolean;

    @ApiProperty()
    originalLabel: string | null;

    @ApiProperty()
    createdAt: Date;

    constructor(partial: Partial<PhotoResponseDto>) {
        Object.assign(this, partial);
    }
}
