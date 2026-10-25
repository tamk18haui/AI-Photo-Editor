package com.aiphotoeditor.job;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Database queries for the shared AI Jobs schema. */
public interface AiJobRepository extends JpaRepository<AiJob, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<AiJob> findFirstByStatusAndProviderOrderByCreatedAtAsc(
            AiJobStatus status, String provider);

    List<AiJob> findByCreatedByUserIdOrderByCreatedAtDesc(Long userId);
    List<AiJob> findByCreatedByUserIdAndProjectIdOrderByCreatedAtDesc(Long userId, Long projectId);
    List<AiJob> findByStatus(AiJobStatus status);
    Optional<AiJob> findByCreatedByUserIdAndProjectIdAndIdempotencyKey(
            Long userId, Long projectId, String idempotencyKey);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from AiJob j where j.id = :id")
    Optional<AiJob> findLockedById(@Param("id") Long id);
}
