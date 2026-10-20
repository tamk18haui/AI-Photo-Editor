package com.aiphotoeditor.user;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="users")
public class User {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 @Column(nullable=false,length=254,unique=true) public String email;
 @Column(name="password_hash",length=255) public String passwordHash;
 @Column(name="display_name",length=100) public String displayName;
 @Column(name="avatar_asset_id") public Long avatarAssetId;
 // N3_ADMIN_V1: Role and plan are independent, checked by the backend.
 @Column(name="account_role",nullable=false,length=16) public String accountRole="USER";
 @Column(name="account_status",nullable=false,length=16) public String accountStatus="ACTIVE";
 @Column(name="subscription_plan",nullable=false,length=16) public String subscriptionPlan="FREE";
 @Column(name="premium_until") public java.time.Instant premiumUntil;
 @Column(name="last_login_at") public java.time.Instant lastLoginAt;
 @Column(name="created_at",nullable=false) public Instant createdAt;
 @Column(name="updated_at",nullable=false) public Instant updatedAt;
 @PrePersist void onCreate(){createdAt=Instant.now();updatedAt=createdAt;}
 @PreUpdate void onUpdate(){updatedAt=Instant.now();}
}
