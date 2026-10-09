package com.aiphotoeditor.auth;
import java.util.Optional;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.Instant;
public interface RefreshTokenRepository extends JpaRepository<RefreshToken,Long> {
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select t from RefreshToken t join fetch t.user where t.tokenHash=:hash")
 Optional<RefreshToken> findForUpdate(@Param("hash") String hash);
 @Modifying @Query("update RefreshToken t set t.revokedAt=:now where t.user.id=:userId and t.revokedAt is null")
 int revokeAll(@Param("userId") Long userId,@Param("now") Instant now);
}
