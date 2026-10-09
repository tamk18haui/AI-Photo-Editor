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
 @Column(name="created_at",nullable=false) public Instant createdAt;
 @Column(name="updated_at",nullable=false) public Instant updatedAt;
 @PrePersist void onCreate(){createdAt=Instant.now();updatedAt=createdAt;}
 @PreUpdate void onUpdate(){updatedAt=Instant.now();}
}
