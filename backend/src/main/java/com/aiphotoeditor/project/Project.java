package com.aiphotoeditor.project;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="projects")
public class Project {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="owner_id") public com.aiphotoeditor.user.User owner;
 @Column(nullable=false,length=150) public String name;
 @Column(name="canvas_width",nullable=false) public int canvasWidth;
 @Column(name="canvas_height",nullable=false) public int canvasHeight;
 @Column(length=255) public String background;
 @Column(name="thumbnail_asset_id") public Long thumbnailAssetId;
 @Column(name="created_at",nullable=false) public Instant createdAt;
 @Column(name="updated_at",nullable=false) public Instant updatedAt;
 @Version @Column(nullable=false) public Long version;
 @PrePersist void onCreate(){createdAt=Instant.now();updatedAt=createdAt;}
 @PreUpdate void onUpdate(){updatedAt=Instant.now();}
}
