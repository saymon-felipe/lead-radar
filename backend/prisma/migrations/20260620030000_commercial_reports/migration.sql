CREATE TABLE `score_weight_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `version` VARCHAR(191) NOT NULL,
  `weights` JSON NOT NULL,
  `rationale` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

