CREATE TABLE `organizations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `organizations_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `organization_members` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `organization_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `role` ENUM('admin', 'manager', 'operator', 'viewer') NOT NULL DEFAULT 'admin',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `organization_members_org_user_unique`(`organization_id`, `user_id`),
  INDEX `organization_members_user_id_idx`(`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `organizations` (`name`, `slug`, `updated_at`)
VALUES ('Lead Radar Default', 'lead-radar-default', CURRENT_TIMESTAMP(3));

SET @default_org_id = LAST_INSERT_ID();

INSERT INTO `organization_members` (`organization_id`, `user_id`, `role`, `updated_at`)
SELECT @default_org_id, `id`, 'admin', CURRENT_TIMESTAMP(3)
FROM `users`;

ALTER TABLE `search_campaigns` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `leads` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `lead_digital_presence` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `lead_website_snapshots` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `lead_social_snapshots` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `lead_embeddings` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `discovery_candidates` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `score_weight_versions` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `lead_scores` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `lead_ai_reviews` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `ai_analysis_cache` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `commercial_interactions` ADD COLUMN `organization_id` INTEGER NULL;
ALTER TABLE `generated_messages` ADD COLUMN `organization_id` INTEGER NULL;

UPDATE `search_campaigns` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `leads` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `lead_digital_presence` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `lead_website_snapshots` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `lead_social_snapshots` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `lead_embeddings` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `discovery_candidates` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `score_weight_versions` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `lead_scores` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `lead_ai_reviews` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `ai_analysis_cache` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `commercial_interactions` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;
UPDATE `generated_messages` SET `organization_id` = @default_org_id WHERE `organization_id` IS NULL;

ALTER TABLE `search_campaigns` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `leads` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `lead_digital_presence` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `lead_website_snapshots` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `lead_social_snapshots` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `lead_embeddings` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `discovery_candidates` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `score_weight_versions` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `lead_scores` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `lead_ai_reviews` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `ai_analysis_cache` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `commercial_interactions` MODIFY `organization_id` INTEGER NOT NULL;
ALTER TABLE `generated_messages` MODIFY `organization_id` INTEGER NOT NULL;

ALTER TABLE `ai_analysis_cache` DROP INDEX `ai_analysis_cache_unique`;
ALTER TABLE `ai_analysis_cache`
  ADD UNIQUE INDEX `ai_analysis_cache_unique`(`organization_id`, `entity_type`, `entity_id`, `analysis_type`, `model`, `prompt_version`, `input_hash`);

CREATE TABLE `job_runs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `organization_id` INTEGER NOT NULL,
  `requested_by` INTEGER NULL,
  `operation` VARCHAR(64) NOT NULL,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `input_hash` CHAR(64) NOT NULL,
  `status` ENUM('queued', 'running', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
  `input_json` JSON NULL,
  `output_json` JSON NULL,
  `error` TEXT NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `job_runs_org_operation_idempotency_unique`(`organization_id`, `operation`, `idempotency_key`),
  INDEX `job_runs_org_status_created_idx`(`organization_id`, `status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `search_campaigns_org_status_idx` ON `search_campaigns`(`organization_id`, `status`);
CREATE INDEX `search_campaigns_org_created_at_idx` ON `search_campaigns`(`organization_id`, `created_at`);
CREATE INDEX `leads_org_campaign_idx` ON `leads`(`organization_id`, `campaign_id`);
CREATE INDEX `leads_org_city_idx` ON `leads`(`organization_id`, `city`);
CREATE INDEX `leads_org_niche_idx` ON `leads`(`organization_id`, `niche`);
CREATE INDEX `lead_digital_presence_org_idx` ON `lead_digital_presence`(`organization_id`);
CREATE INDEX `lead_website_snapshots_org_lead_created_idx` ON `lead_website_snapshots`(`organization_id`, `lead_id`, `created_at`);
CREATE INDEX `lead_social_snapshots_org_lead_created_idx` ON `lead_social_snapshots`(`organization_id`, `lead_id`, `created_at`);
CREATE INDEX `lead_embeddings_org_type_idx` ON `lead_embeddings`(`organization_id`, `embedding_type`);
CREATE INDEX `discovery_candidates_org_campaign_status_idx` ON `discovery_candidates`(`organization_id`, `campaign_id`, `status`);
CREATE INDEX `score_weight_versions_org_created_idx` ON `score_weight_versions`(`organization_id`, `created_at`);
CREATE INDEX `lead_scores_org_temperature_idx` ON `lead_scores`(`organization_id`, `temperature`);
CREATE INDEX `lead_scores_org_offer_idx` ON `lead_scores`(`organization_id`, `recommended_offer`);
CREATE INDEX `lead_scores_org_lead_created_idx` ON `lead_scores`(`organization_id`, `lead_id`, `created_at`);
CREATE INDEX `lead_ai_reviews_org_type_created_idx` ON `lead_ai_reviews`(`organization_id`, `analysis_type`, `created_at`);
CREATE INDEX `commercial_interactions_org_status_idx` ON `commercial_interactions`(`organization_id`, `status`);
CREATE INDEX `commercial_interactions_org_lead_updated_idx` ON `commercial_interactions`(`organization_id`, `lead_id`, `updated_at`);
CREATE INDEX `generated_messages_org_lead_created_idx` ON `generated_messages`(`organization_id`, `lead_id`, `created_at`);

ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `search_campaigns` ADD CONSTRAINT `search_campaigns_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `leads` ADD CONSTRAINT `leads_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_digital_presence` ADD CONSTRAINT `lead_digital_presence_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_website_snapshots` ADD CONSTRAINT `lead_website_snapshots_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_social_snapshots` ADD CONSTRAINT `lead_social_snapshots_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_embeddings` ADD CONSTRAINT `lead_embeddings_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `discovery_candidates` ADD CONSTRAINT `discovery_candidates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `score_weight_versions` ADD CONSTRAINT `score_weight_versions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_scores` ADD CONSTRAINT `lead_scores_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_ai_reviews` ADD CONSTRAINT `lead_ai_reviews_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ai_analysis_cache` ADD CONSTRAINT `ai_analysis_cache_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commercial_interactions` ADD CONSTRAINT `commercial_interactions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `generated_messages` ADD CONSTRAINT `generated_messages_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `job_runs` ADD CONSTRAINT `job_runs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `job_runs` ADD CONSTRAINT `job_runs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
