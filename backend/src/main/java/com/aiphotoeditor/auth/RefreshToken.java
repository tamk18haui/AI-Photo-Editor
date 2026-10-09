package com.aiphotoeditor.auth;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
@Entity @Table(name="refresh_tokens")
public class RefreshToken {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") public com.aiphotoeditor.user.User user;
 @JdbcTypeCode(SqlTypes.CHAR)
 @Column(name="token_hash",nullable=false,length=64,unique=true) public String tokenHash;
 @Column(name="expires_at",nullable=false) public Instant expiresAt;
 @Column(name="revoked_at") public Instant revokedAt;
 @Column(name="created_at",nullable=false) public Instant createdAt;
}
