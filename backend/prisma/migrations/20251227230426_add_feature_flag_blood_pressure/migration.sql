-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SyncProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "withingsConfigDir" TEXT NOT NULL,
    "garminAccountId" TEXT,
    "trainerroadAccountId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enableBloodPressure" BOOLEAN NOT NULL DEFAULT false,
    "scheduleCron" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncProfile_garminAccountId_fkey" FOREIGN KEY ("garminAccountId") REFERENCES "ServiceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncProfile_trainerroadAccountId_fkey" FOREIGN KEY ("trainerroadAccountId") REFERENCES "ServiceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SyncProfile" ("createdAt", "enabled", "garminAccountId", "id", "name", "ownerUserId", "scheduleCron", "trainerroadAccountId", "updatedAt", "withingsConfigDir") SELECT "createdAt", "enabled", "garminAccountId", "id", "name", "ownerUserId", "scheduleCron", "trainerroadAccountId", "updatedAt", "withingsConfigDir" FROM "SyncProfile";
DROP TABLE "SyncProfile";
ALTER TABLE "new_SyncProfile" RENAME TO "SyncProfile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
