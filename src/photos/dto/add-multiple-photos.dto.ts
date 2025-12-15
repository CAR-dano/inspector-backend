
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsJSON } from 'class-validator';

export class AddMultiplePhotosDto {
    @ApiProperty({
        type: 'string',
        format: 'json',
        description: 'REQUIRED: JSON string array of metadata ({label?: string, needAttention?: boolean, category?: string, isMandatory?: boolean}) matching file upload order.',
        example: '[{"label":"Baret 1","needAttention":true, "category": "exterior", "isMandatory": false},{"category": "interior", "isMandatory": true}]',
    })
    @IsString()
    @IsNotEmpty()
    @IsJSON()
    metadata: string;
}
