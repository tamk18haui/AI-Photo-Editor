package com.aiphotoeditor.auth;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="oauth_accounts")
public class OauthAccount {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") public com.aiphotoeditor.user.User user;
 @Column(nullable=false,length=20) public String provider;
 @Column(name="provider_subject",nullable=false,length=255) public String providerSubject;
 @Column(name="provider_email",length=254) public String providerEmail;
 @Column(name="created_at",nullable=false) public Instant createdAt;
}
