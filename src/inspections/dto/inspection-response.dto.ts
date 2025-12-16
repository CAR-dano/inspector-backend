/*
 * --------------------------------------------------------------------------
 * File: inspection-response.dto.ts
 * Project: inspector-backend
 * Copyright © 2025 PT. Inspeksi Mobil Jogja
 * --------------------------------------------------------------------------
 * Description: Data Transfer Object (DTO) representing the structure of a complete
 * Inspection record when returned by API endpoints.
 * --------------------------------------------------------------------------
 */
import { Inspection, Prisma } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) representing a photo associated with an inspection.
 */
export class PhotoDetailResponseDTO {
    @ApiProperty({
        example: 'add815ce-d602-4e49-a360-e6012e23cead',
        description: 'The unique identifier (UUID) for the photo record.',
    })
    id: string;

    @ApiProperty({
        example: '2a2b508c-c0c5-4d41-9341-2cdc88635c8a',
        description: 'The UUID of the inspection this photo belongs to.',
    })
    inspectionId: string;

    @ApiProperty({
        example: '1748917020710-compressed-1748917126971-729831521.jpg',
        description: 'The file path of the photo.',
    })
    path: string;

    @ApiProperty({
        example: 'Foto Tambahan',
        description: 'The label assigned to the photo.',
        nullable: true,
    })
    label: string | null;

    @ApiProperty({
        example: 'General Tambahan',
        description: 'The category of the photo.',
        nullable: true,
    })
    category: string | null;

    @ApiProperty({
        example: false,
        description: 'Indicates if the photo is mandatory.',
        nullable: true,
    })
    isMandatory: boolean | null;

    @ApiProperty({
        example: null,
        description: 'The original label of the photo.',
        nullable: true,
    })
    originalLabel: string | null;

    @ApiProperty({
        example: false,
        description: 'Indicates if the photo needs attention.',
        nullable: true,
    })
    needAttention: boolean | null;

    @ApiProperty({
        example: true,
        description:
            'Indicates if the photo should be displayed in the PDF report.',
    })
    displayInPdf: boolean;

    @ApiProperty({
        example: '2025-06-03T02:18:46.983Z',
        description: 'The timestamp when the photo record was created.',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2025-06-03T02:18:46.983Z',
        description: 'The timestamp when the photo record was last updated.',
    })
    updatedAt: Date;

    constructor(partial: Partial<PhotoDetailResponseDTO>) {
        Object.assign(this, partial);
    }
}

/**
 * Data Transfer Object (DTO) representing a complete Inspection record for API responses.
 */
export class InspectionResponseDto {
    @ApiProperty({ description: 'The unique identifier (UUID) for the inspection record.' })
    id: string;

    @ApiProperty({ description: 'The UUID of the user (Inspector) who submitted this inspection.', nullable: true })
    submittedByUserId: string | null;

    @ApiProperty({ description: 'The UUID of the user (Reviewer) who last reviewed this inspection.', nullable: true })
    reviewerId: string | null;

    @ApiProperty({ description: 'The license plate number of the inspected vehicle.', nullable: true })
    vehiclePlateNumber: string | null;

    @ApiProperty({ description: 'The date and time the inspection occurred.', nullable: true })
    inspectionDate: Date | null;

    @ApiProperty({ description: 'The overall rating assigned during the inspection.', nullable: true })
    overallRating: string | null;

    @ApiProperty({ description: 'The current status of the inspection in its lifecycle.' })
    status: string;

    @ApiProperty({ description: 'Identity details from the inspection form.', nullable: true })
    identityDetails: Prisma.JsonValue | null;

    @ApiProperty({ description: 'Vehicle details from the inspection form.', nullable: true })
    vehicleData: Prisma.JsonValue | null;

    @ApiProperty({ description: 'Checklist results for equipment from the inspection form.', nullable: true })
    equipmentChecklist: Prisma.JsonValue | null;

    @ApiProperty({ description: 'Summary results from the inspection form.', nullable: true })
    inspectionSummary: Prisma.JsonValue | null;

    @ApiProperty({ description: 'Detailed assessment scores from the inspection form.', nullable: true })
    detailedAssessment: Prisma.JsonValue | null;

    @ApiProperty({ description: 'Body paint thickness measurements from the inspection form.', nullable: true })
    bodyPaintThickness: Prisma.JsonValue | null;

    @ApiProperty({
        description: 'Metadata for photos associated with this inspection.',
        type: PhotoDetailResponseDTO,
        isArray: true,
    })
    photos: PhotoDetailResponseDTO[];

    @ApiProperty({ description: 'URL pointing to the generated PDF report file.', nullable: true })
    urlPdf: string | null;

    @ApiProperty({ description: 'Unique Cardano NFT Asset ID.', nullable: true })
    nftAssetId: string | null;

    @ApiProperty({ description: 'Cardano transaction hash for the NFT minting.', nullable: true })
    blockchainTxHash: string | null;

    @ApiProperty({ description: 'Cryptographic hash of the generated PDF report file.', nullable: true })
    pdfFileHash: string | null;

    @ApiProperty({ description: 'Timestamp when the inspection was archived.', nullable: true })
    archivedAt: Date | null;

    @ApiProperty({ description: 'Timestamp when the inspection was deactivated.', nullable: true })
    deactivatedAt: Date | null;

    @ApiProperty({ description: 'Map of note field paths to their desired font sizes.', nullable: true })
    notesFontSizes: Prisma.JsonValue | null;

    @ApiProperty({ description: 'Timestamp when this inspection record was created.' })
    createdAt: Date;

    @ApiProperty({ description: 'Timestamp when this inspection record was last updated.' })
    updatedAt: Date;

    @ApiProperty({ description: 'Unique human-readable identifier for the inspection.' })
    pretty_id: string;

    @ApiProperty({ description: 'The UUID of the inspector.', nullable: true })
    inspectorId: string | null;

    constructor(
        partial: Partial<
            Inspection & { photos: Partial<PhotoDetailResponseDTO>[] }
        >,
    ) {
        Object.assign(this, partial);

        if (partial.photos && Array.isArray(partial.photos)) {
            this.photos = partial.photos.map(
                (photo) => new PhotoDetailResponseDTO(photo),
            );
        } else {
            this.photos = [];
        }
    }
}
