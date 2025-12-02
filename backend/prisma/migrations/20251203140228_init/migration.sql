-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    CONSTRAINT "ServiceAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "withingsConfigDir" TEXT NOT NULL,
    "garminAccountId" TEXT,
    "trainerroadAccountId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleCron" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncProfile_garminAccountId_fkey" FOREIGN KEY ("garminAccountId") REFERENCES "ServiceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncProfile_trainerroadAccountId_fkey" FOREIGN KEY ("trainerroadAccountId") REFERENCES "ServiceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syncProfileId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "exitCode" INTEGER,
    "logFilePath" TEXT,
    "errorMessage" TEXT,
    CONSTRAINT "SyncRun_syncProfileId_fkey" FOREIGN KEY ("syncProfileId") REFERENCES "SyncProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
