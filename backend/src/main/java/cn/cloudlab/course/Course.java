package cn.cloudlab.course;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "courses", uniqueConstraints = @UniqueConstraint(columnNames = "courseCode"))
public class Course {
  @Id private UUID id = UUID.randomUUID();
  @Column(nullable = false, length = 120) private String title;
  @Column(nullable = false, length = 48) private String courseCode;
  @Column(length = 1000) private String description = "";
  @Column(nullable = false, length = 40) private String teacherName;
  @Column(nullable = false, length = 20) private String status = "DRAFT";
  @Column(nullable = false, updatable = false) private Instant createdAt = Instant.now();
  protected Course() {}
  public Course(String title, String courseCode, String description, String teacherName) { this.title=title; this.courseCode=courseCode; this.description=description; this.teacherName=teacherName; }
  public UUID getId(){return id;} public String getTitle(){return title;} public String getCourseCode(){return courseCode;} public String getDescription(){return description;} public String getTeacherName(){return teacherName;} public String getStatus(){return status;} public Instant getCreatedAt(){return createdAt;}
  public void update(String title,String description,String status){this.title=title;this.description=description;this.status=status;}
}
