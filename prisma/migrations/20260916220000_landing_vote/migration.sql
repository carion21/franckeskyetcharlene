-- Réponses à la question d'accueil, pour arbitrer entre les trois
-- déclinaisons de la landing (PRD §1.1).
--
-- Table anonyme : ni IP, ni user-agent, ni lien vers un Rsvp. Seuls comptent
-- la version choisie et la date.

-- CreateTable
CREATE TABLE `LandingVote` (
    `id` VARCHAR(191) NOT NULL,
    `version` VARCHAR(8) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LandingVote_version_idx`(`version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
