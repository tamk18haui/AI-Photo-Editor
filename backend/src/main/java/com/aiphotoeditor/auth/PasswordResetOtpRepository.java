package com.aiphotoeditor.auth;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetOtpRepository extends JpaRepository<PasswordResetOtp, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PasswordResetOtp> findTopByUser_IdOrderByCreatedAtDescIdDesc(Long userId);

    @Query("select count(o) from PasswordResetOtp o where o.user.id = :userId and o.createdAt > :since")
    long countRecentlyIssued(@Param("userId") Long userId, @Param("since") Instant since);

    @Modifying
    @Query("update PasswordResetOtp o set o.usedAt = :now where o.user.id = :userId and o.usedAt is null")
    int invalidateUnusedForUser(@Param("userId") Long userId, @Param("now") Instant now);
}
