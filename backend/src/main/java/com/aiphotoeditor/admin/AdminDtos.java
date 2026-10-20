package com.aiphotoeditor.admin;

import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;

public final class AdminDtos {
    private AdminDtos() {}
    public record AdminMe(long id, String email, String displayName, String role) {}
    public record AdminUser(long id, String email, String displayName, String role, String status,
                            String plan, Instant premiumUntil, Instant createdAt, Instant lastLoginAt,
                            long projectsCount, long aiJobsCount) {}
    public record Page<T>(List<T> items, long totalElements, int page, int size, int totalPages) {}
    public record ChangeRole(@NotBlank String role) {}
    public record ChangeStatus(@NotBlank String status) {}
    public record ChangePlan(@NotBlank String plan, Instant premiumUntil) {}
    public record DayMetric(String day, long requests, long activeUsers, long signups) {}
    public record Dashboard(long usersTotal, long usersActive, long usersBlocked, long admins,
                            long premiumActive, long newUsers7d, long projectsTotal, long assetsTotal,
                            long totalStorageBytes, long aiJobsTotal, long aiJobsCompleted,
                            long editSaves7d, long apiRequestsToday, long apiRequests7d,
                            long activeUsers7d, List<DayMetric> trend) {}
    public record AuditItem(long id, long actorUserId, String actorEmail, long targetUserId,
                            String targetEmail, String action, String detail, Instant createdAt) {}
}
