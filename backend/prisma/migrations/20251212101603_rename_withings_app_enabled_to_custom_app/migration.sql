/*
  Warnings:

  - You are about to drop the column `withingsAppEnabled` on the `Settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "logLevel" TEXT NOT NULL DEFAULT 'info',
    "withingsClientId" TEXT,
    "withingsConsumerSecret" TEXT,
    "withingsCustomApp" BOOLEAN NOT NULL DEFAULT false,
    "apiTimeout" INTEGER NOT NULL DEFAULT 30,
    "timeFormat" TEXT NOT NULL DEFAULT '24h',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("apiTimeout", "dateFormat", "id", "logLevel", "timeFormat", "updatedAt", "withingsClientId", "withingsConsumerSecret") SELECT "apiTimeout", "dateFormat", "id", "logLevel", "timeFormat", "updatedAt", "withingsClientId", "withingsConsumerSecret" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
