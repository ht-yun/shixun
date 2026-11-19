package cn.cloudlab.lab;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "lab_templates")
public class LabTemplate {
  @Id private UUID id=UUID.randomUUID();
  @Column(nullable=false) private UUID courseId;
  @Column(nullable=false,length=120) private String title;
  @Column(nullable=false,length=30) private String operationMode;
  @Column(nullable=false) private Integer maxMinutes;
  @Column(nullable=false,length=20) private String status="DRAFT";
  @Lob private String instructions="";
  @Lob private String evaluationConfig="{\"publicTests\":[],\"rubric\":[]}";
  @Column(nullable=false,updatable=false) private Instant createdAt=Instant.now();
  protected LabTemplate(){}
  public LabTemplate(UUID courseId,String title,String operationMode,Integer maxMinutes,String instructions){this.courseId=courseId;this.title=title;this.operationMode=operationMode;this.maxMinutes=maxMinutes;this.instructions=instructions;}
  public UUID getId(){return id;} public UUID getCourseId(){return courseId;} public String getTitle(){return title;} public String getOperationMode(){return operationMode;} public Integer getMaxMinutes(){return maxMinutes;} public String getStatus(){return status;} public String getInstructions(){return instructions;} public String getEvaluationConfig(){return evaluationConfig;} public Instant getCreatedAt(){return createdAt;}
  public void update(String title,String mode,Integer maxMinutes,String instructions,String evaluationConfig,String status){this.title=title;this.operationMode=mode;this.maxMinutes=maxMinutes;this.instructions=instructions;this.evaluationConfig=evaluationConfig;this.status=status;}
}
