-- CreateIndex
CREATE INDEX "SyncRun_syncProfileId_status_idx" ON "SyncRun"("syncProfileId", "status");

-- Enforce one RUNNING run per profile
CREATE UNIQUE INDEX "SyncRun_running_profile_unique"
ON "SyncRun"("syncProfileId")
WHERE status = 'RUNNING';
