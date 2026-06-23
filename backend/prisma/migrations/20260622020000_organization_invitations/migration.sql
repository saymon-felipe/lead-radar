CREATE TABLE `organization_invitations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `organization_id` INTEGER NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `role` ENUM('admin', 'manager', 'operator', 'viewer') NOT NULL DEFAULT 'operator',
  `token_hash` CHAR(64) NOT NULL,
  `invited_by` INTEGER NULL,
  `accepted_at` DATETIME(3) NULL,
  `accepted_by` INTEGER NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `organization_invitations_token_hash_key`(`token_hash`),
  INDEX `organization_invitations_org_email_idx`(`organization_id`, `email`),
  INDEX `organization_invitations_email_idx`(`email`),
  INDEX `organization_invitations_expires_at_idx`(`expires_at`),
  INDEX `organization_invitations_invited_by_idx`(`invited_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `organization_invitations`
  ADD CONSTRAINT `organization_invitations_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `organization_invitations`
  ADD CONSTRAINT `organization_invitations_invited_by_fkey`
  FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
