-- Le téléphone devient la clé d'unicité des confirmations (PRD §3.1).
-- L'email passe optionnel : une colonne nullable ne peut pas porter cette
-- garantie, alors que chaque invité a un numéro.
-- Stocké en 10 chiffres sans espaces, la normalisation étant faite côté serveur.

-- AlterTable
ALTER TABLE `Rsvp` MODIFY `email` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Rsvp_telephone_key` ON `Rsvp`(`telephone`);

-- Table de sessions administrée par express-mysql-session.
-- Déclarée ici pour qu'elle figure dans l'historique des migrations : sans
-- cela, chaque `prisma migrate dev` la signale comme dérive et propose de
-- réinitialiser la base.
CREATE TABLE IF NOT EXISTS `sessions` (
    `session_id` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `expires` INT UNSIGNED NOT NULL,
    `data` MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
