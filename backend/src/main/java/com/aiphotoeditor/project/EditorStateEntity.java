package com.aiphotoeditor.project;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="editor_states")
public class EditorStateEntity {
 @Id @Column(name="project_id") public Long projectId;
 @OneToOne(fetch=FetchType.LAZY) @MapsId @JoinColumn(name="project_id") public Project project;
 @Column(name="schema_version",nullable=false) public int schemaVersion=1;
 @JdbcTypeCode(SqlTypes.JSON) @Column(name="state_json",columnDefinition="json",nullable=false) public JsonNode stateJson;
 @Column(name="state_version",nullable=false) public Long stateVersion=1L;
 @Version @Column(name="lock_version",nullable=false) public Long lockVersion;
 @Column(name="created_at",nullable=false) public Instant createdAt;
 @Column(name="updated_at",nullable=false) public Instant updatedAt;
 @PrePersist void onCreate(){if(createdAt==null)createdAt=Instant.now();if(updatedAt==null)updatedAt=createdAt;}
 @PreUpdate void onUpdate(){if(updatedAt==null)updatedAt=Instant.now();}
}
