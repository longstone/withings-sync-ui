-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "logLevel" TEXT NOT NULL DEFAULT 'info',
    "withingsClientId" TEXT,
    "withingsConsumerSecret" TEXT,
    "apiTimeout" INTEGER NOT NULL DEFAULT 30,
    "timeFormat" TEXT NOT NULL DEFAULT '24h',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "updatedAt" DATETIME NOT NULL
);
