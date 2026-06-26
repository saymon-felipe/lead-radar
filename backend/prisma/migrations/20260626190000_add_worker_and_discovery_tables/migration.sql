-- CreateTable
CREATE TABLE `worker_devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `device_id` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `organization_id` INTEGER NOT NULL,
    `environment` VARCHAR(191) NOT NULL,
    `app_version` VARCHAR(191) NOT NULL,
    `hostname` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `worker_devices_device_id_key`(`device_id`),
    INDEX `worker_devices_org_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `worker_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `worker_device_id` INTEGER NOT NULL,
    `access_token_hash` VARCHAR(191) NOT NULL,
    `refresh_token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `worker_sessions_access_token_hash_key`(`access_token_hash`),
    UNIQUE INDEX `worker_sessions_refresh_token_hash_key`(`refresh_token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `worker_heartbeats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `worker_device_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `cpu_usage` DOUBLE NULL,
    `ram_usage` DOUBLE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `worker_heartbeats_device_created_idx`(`worker_device_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discovery_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `organization_id` INTEGER NOT NULL,
    `worker_device_id` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL,
    `options` JSON NULL,
    `error` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `discovery_runs_org_status_idx`(`organization_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discovery_run_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_id` INTEGER NOT NULL,
    `sequence` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `lead_name` VARCHAR(191) NULL,
    `url` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `discovery_run_events_run_seq_idx`(`run_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discovery_run_artifacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `upload_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `worker_devices` ADD CONSTRAINT `worker_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worker_devices` ADD CONSTRAINT `worker_devices_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worker_sessions` ADD CONSTRAINT `worker_sessions_worker_device_id_fkey` FOREIGN KEY (`worker_device_id`) REFERENCES `worker_devices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worker_heartbeats` ADD CONSTRAINT `worker_heartbeats_worker_device_id_fkey` FOREIGN KEY (`worker_device_id`) REFERENCES `worker_devices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discovery_runs` ADD CONSTRAINT `discovery_runs_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `search_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discovery_runs` ADD CONSTRAINT `discovery_runs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discovery_runs` ADD CONSTRAINT `discovery_runs_worker_device_id_fkey` FOREIGN KEY (`worker_device_id`) REFERENCES `worker_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discovery_run_events` ADD CONSTRAINT `discovery_run_events_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discovery_run_artifacts` ADD CONSTRAINT `discovery_run_artifacts_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
