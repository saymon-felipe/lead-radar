CREATE TABLE `lead_embeddings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NULL,
  `embedding_type` VARCHAR(191) NOT NULL,
  `source_text` TEXT NOT NULL,
  `embedding_vector` JSON NOT NULL,
  `model` VARCHAR(191) NOT NULL,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `discovery_candidates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaign_id` INTEGER NOT NULL,
  `lead_id` INTEGER NULL,
  `title` VARCHAR(191) NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `snippet` TEXT NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `priority` VARCHAR(191) NOT NULL,
  `is_potential_lead` BOOLEAN NOT NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `lead_embeddings` ADD CONSTRAINT `lead_embeddings_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `discovery_candidates` ADD CONSTRAINT `discovery_candidates_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `search_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `discovery_candidates` ADD CONSTRAINT `discovery_candidates_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

