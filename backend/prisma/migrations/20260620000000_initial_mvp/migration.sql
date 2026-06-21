CREATE TABLE `users` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL DEFAULT 'admin',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `users_email_key`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `search_campaigns` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `niche` VARCHAR(191) NOT NULL,
  `city` VARCHAR(191) NOT NULL,
  `state` VARCHAR(191) NOT NULL,
  `country` VARCHAR(191) NOT NULL DEFAULT 'BR',
  `status` ENUM('draft', 'running', 'paused', 'completed', 'failed') NOT NULL DEFAULT 'draft',
  `target_quantity` INTEGER NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `leads` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaign_id` INTEGER NULL,
  `business_name` VARCHAR(191) NOT NULL,
  `person_name` VARCHAR(191) NULL,
  `niche` VARCHAR(191) NOT NULL,
  `document_number` VARCHAR(191) NULL,
  `document_status` VARCHAR(191) NULL,
  `professional_registry` VARCHAR(191) NULL,
  `city` VARCHAR(191) NOT NULL,
  `state` VARCHAR(191) NOT NULL,
  `country` VARCHAR(191) NOT NULL DEFAULT 'BR',
  `address` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `whatsapp` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `website_url` VARCHAR(191) NULL,
  `instagram_url` VARCHAR(191) NULL,
  `facebook_url` VARCHAR(191) NULL,
  `linkedin_url` VARCHAR(191) NULL,
  `google_maps_url` VARCHAR(191) NULL,
  `source` VARCHAR(191) NULL DEFAULT 'manual',
  `raw_data_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_scores` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `objective_score` INTEGER NOT NULL,
  `ai_commercial_score` INTEGER NULL,
  `digital_presence_score` INTEGER NULL,
  `embedding_similarity_score` INTEGER NULL,
  `final_score` INTEGER NOT NULL,
  `temperature` ENUM('hot', 'warm', 'medium', 'cold', 'discard') NOT NULL,
  `recommended_offer` ENUM('landing_page', 'institutional_site', 'redesign', 'seo_local', 'google_business_optimization', 'digital_presence_organization', 'maintenance', 'no_offer') NOT NULL,
  `score_breakdown_json` JSON NOT NULL,
  `ai_reasoning` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_ai_reviews` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NULL,
  `analysis_type` VARCHAR(64) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `prompt_version` VARCHAR(64) NOT NULL,
  `input_hash` CHAR(64) NOT NULL,
  `input_json` JSON NOT NULL,
  `output_json` JSON NOT NULL,
  `tokens_input` INTEGER NULL,
  `tokens_output` INTEGER NULL,
  `cost_estimate` DECIMAL(10, 6) NULL,
  `summary` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_analysis_cache` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `analysis_type` VARCHAR(64) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `prompt_version` VARCHAR(64) NOT NULL,
  `input_hash` CHAR(64) NOT NULL,
  `input_json` JSON NOT NULL,
  `output_json` JSON NOT NULL,
  `tokens_input` INTEGER NULL,
  `tokens_output` INTEGER NULL,
  `cost_estimate` DECIMAL(10, 6) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ai_analysis_cache_unique`(`entity_type`, `entity_id`, `analysis_type`, `model`, `prompt_version`, `input_hash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commercial_interactions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `status` ENUM('not_contacted', 'contacted', 'replied', 'interested', 'meeting_scheduled', 'proposal_sent', 'won', 'lost', 'no_response', 'invalid_contact') NOT NULL,
  `contact_channel` VARCHAR(191) NULL,
  `contacted_at` DATETIME(3) NULL,
  `response_at` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `next_action_at` DATETIME(3) NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `generated_messages` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `message_type` VARCHAR(191) NOT NULL,
  `channel` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `tone` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `search_campaigns` ADD CONSTRAINT `search_campaigns_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `leads` ADD CONSTRAINT `leads_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `search_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `lead_scores` ADD CONSTRAINT `lead_scores_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_ai_reviews` ADD CONSTRAINT `lead_ai_reviews_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `commercial_interactions` ADD CONSTRAINT `commercial_interactions_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commercial_interactions` ADD CONSTRAINT `commercial_interactions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `generated_messages` ADD CONSTRAINT `generated_messages_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
