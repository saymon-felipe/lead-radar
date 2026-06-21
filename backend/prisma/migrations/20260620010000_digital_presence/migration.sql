CREATE TABLE `lead_digital_presence` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `has_website` BOOLEAN NOT NULL DEFAULT false,
  `website_url` VARCHAR(191) NULL,
  `website_platform` VARCHAR(191) NULL,
  `has_instagram` BOOLEAN NOT NULL DEFAULT false,
  `has_facebook` BOOLEAN NOT NULL DEFAULT false,
  `has_linkedin` BOOLEAN NOT NULL DEFAULT false,
  `has_google_maps` BOOLEAN NOT NULL DEFAULT false,
  `has_whatsapp` BOOLEAN NOT NULL DEFAULT false,
  `has_linktree` BOOLEAN NOT NULL DEFAULT false,
  `has_only_social_media` BOOLEAN NOT NULL DEFAULT false,
  `website_http_status` INTEGER NULL,
  `website_load_time_ms` INTEGER NULL,
  `website_has_ssl` BOOLEAN NULL,
  `website_is_mobile_friendly` BOOLEAN NULL,
  `website_has_cta` BOOLEAN NULL,
  `website_has_whatsapp_cta` BOOLEAN NULL,
  `website_has_contact_form` BOOLEAN NULL,
  `website_has_seo_title` BOOLEAN NULL,
  `website_has_meta_description` BOOLEAN NULL,
  `website_detected_issues_json` JSON NOT NULL,
  `website_quality_score` INTEGER NULL,
  `social_presence_score` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `lead_digital_presence_lead_id_key`(`lead_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_website_snapshots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `http_status` INTEGER NULL,
  `title` VARCHAR(191) NULL,
  `meta_description` TEXT NULL,
  `h1` VARCHAR(191) NULL,
  `headings_json` JSON NOT NULL,
  `text_summary` TEXT NULL,
  `text_sample` TEXT NULL,
  `platform` VARCHAR(191) NULL,
  `has_ssl` BOOLEAN NOT NULL DEFAULT false,
  `load_time_ms` INTEGER NULL,
  `has_whatsapp` BOOLEAN NOT NULL DEFAULT false,
  `has_contact_form` BOOLEAN NOT NULL DEFAULT false,
  `has_cta` BOOLEAN NOT NULL DEFAULT false,
  `has_location` BOOLEAN NOT NULL DEFAULT false,
  `has_services` BOOLEAN NOT NULL DEFAULT false,
  `has_testimonials` BOOLEAN NOT NULL DEFAULT false,
  `detected_issues_json` JSON NOT NULL,
  `raw_metrics_json` JSON NOT NULL,
  `snapshot_hash` VARCHAR(191) NOT NULL,
  `ai_review_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_social_snapshots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `platform` VARCHAR(191) NOT NULL,
  `profile_url` VARCHAR(191) NOT NULL,
  `bio_text` TEXT NULL,
  `external_link` VARCHAR(191) NULL,
  `has_whatsapp` BOOLEAN NOT NULL DEFAULT false,
  `has_website_link` BOOLEAN NOT NULL DEFAULT false,
  `estimated_post_count` INTEGER NULL,
  `last_activity_signal` VARCHAR(191) NULL,
  `content_signals_json` JSON NOT NULL,
  `raw_metrics_json` JSON NOT NULL,
  `snapshot_hash` VARCHAR(191) NOT NULL,
  `ai_review_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `lead_digital_presence` ADD CONSTRAINT `lead_digital_presence_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_website_snapshots` ADD CONSTRAINT `lead_website_snapshots_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `lead_social_snapshots` ADD CONSTRAINT `lead_social_snapshots_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

