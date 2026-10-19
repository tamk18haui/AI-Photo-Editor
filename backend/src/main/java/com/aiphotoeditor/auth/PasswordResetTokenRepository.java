package com.aiphotoeditor.auth;

import java.time.Instant;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from PasswordResetToken t join fetch t.user where t.tokenHash = :hash")
    Optional<PasswordResetToken> findForUpdate(@Param("hash") String hash);

    @Query("select count(t) from PasswordResetToken t where t.user.id = :userId and t.createdAt > :since")
    long countRecentlyIssued(@Param("userId") Long userId, @Param("since") Instant since);

    @Modifying
    @Query("update PasswordResetToken t set t.usedAt = :now where t.user.id = :userId and t.usedAt is null")
    int invalidateUnusedForUser(@Param("userId") Long userId, @Param("now") Instant now);
}
