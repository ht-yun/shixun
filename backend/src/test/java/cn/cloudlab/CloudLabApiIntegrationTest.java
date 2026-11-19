package cn.cloudlab;

import cn.cloudlab.course.CourseRepository;
import cn.cloudlab.lab.LabTemplateRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:cloudlabtest;DB_CLOSE_DELAY=-1",
  "spring.jpa.hibernate.ddl-auto=create-drop",
  "spring.h2.console.enabled=false"
})
@AutoConfigureMockMvc
class CloudLabApiIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired LabTemplateRepository labs;
  @Autowired CourseRepository courses;

  @BeforeEach
  void clearDatabase() {
    labs.deleteAll();
    courses.deleteAll();
  }

  @Test
  void healthAndEmptyCollectionsAreAvailable() throws Exception {
    mvc.perform(get("/api/health"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("UP"));
    mvc.perform(get("/api/courses"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$", hasSize(0)));
    mvc.perform(get("/api/labs"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void courseAndLabCrudIncludingCascadeDeleteWork() throws Exception {
    String courseBody = """
      {"title":"Linux 基础","courseCode":"LINUX-01","description":"基础课程","teacherName":"李老师"}
      """;
    String createdCourse = mvc.perform(post("/api/courses").contentType(MediaType.APPLICATION_JSON).content(courseBody))
      .andExpect(status().isCreated())
      .andExpect(jsonPath("$.status").value("DRAFT"))
      .andReturn().getResponse().getContentAsString();
    UUID courseId = UUID.fromString(json.readTree(createdCourse).get("id").asText());

    String labBody = """
      {"courseId":"%s","title":"文件权限实践","operationMode":"TERMINAL","maxMinutes":120,"instructions":"创建 notes.txt"}
      """.formatted(courseId);
    String createdLab = mvc.perform(post("/api/labs").contentType(MediaType.APPLICATION_JSON).content(labBody))
      .andExpect(status().isCreated())
      .andExpect(jsonPath("$.courseId").value(courseId.toString()))
      .andReturn().getResponse().getContentAsString();
    UUID labId = UUID.fromString(json.readTree(createdLab).get("id").asText());

    mvc.perform(get("/api/labs").param("courseId", courseId.toString()))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$", hasSize(1)));

    String update = """
      {"title":"文件权限实践","operationMode":"TERMINAL","maxMinutes":90,"instructions":"创建文件并设置权限","evaluationConfig":"{}","status":"PUBLISHED"}
      """;
    mvc.perform(put("/api/labs/{id}", labId).contentType(MediaType.APPLICATION_JSON).content(update))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("PUBLISHED"))
      .andExpect(jsonPath("$.maxMinutes").value(90));

    mvc.perform(delete("/api/courses/{id}", courseId)).andExpect(status().isNoContent());
    mvc.perform(get("/api/courses/{id}", courseId)).andExpect(status().isNotFound());
    mvc.perform(get("/api/labs/{id}", labId)).andExpect(status().isNotFound());
  }

  @Test
  void validationAndConflictsReturnClientErrors() throws Exception {
    mvc.perform(post("/api/courses").contentType(MediaType.APPLICATION_JSON).content("{}"))
      .andExpect(status().isBadRequest());

    String body = """
      {"title":"课程一","courseCode":"SAME-CODE","description":"","teacherName":"教师"}
      """;
    mvc.perform(post("/api/courses").contentType(MediaType.APPLICATION_JSON).content(body))
      .andExpect(status().isCreated());
    mvc.perform(post("/api/courses").contentType(MediaType.APPLICATION_JSON).content(body))
      .andExpect(status().isConflict());

    String missingCourseLab = """
      {"courseId":"%s","title":"无效实验","operationMode":"TERMINAL","maxMinutes":60,"instructions":""}
      """.formatted(UUID.randomUUID());
    mvc.perform(post("/api/labs").contentType(MediaType.APPLICATION_JSON).content(missingCourseLab))
      .andExpect(status().isBadRequest());
  }

  @Test
  void labCanBeDeletedDirectly() throws Exception {
    JsonNode course = json.readTree(mvc.perform(post("/api/courses")
      .contentType(MediaType.APPLICATION_JSON)
      .content("{\"title\":\"课程\",\"courseCode\":\"C-1\",\"description\":\"\",\"teacherName\":\"教师\"}"))
      .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    JsonNode lab = json.readTree(mvc.perform(post("/api/labs")
      .contentType(MediaType.APPLICATION_JSON)
      .content("{\"courseId\":\"" + course.get("id").asText() + "\",\"title\":\"实验\",\"operationMode\":\"TERMINAL\",\"maxMinutes\":60,\"instructions\":\"\"}"))
      .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    mvc.perform(delete("/api/labs/{id}", lab.get("id").asText())).andExpect(status().isNoContent());
    mvc.perform(get("/api/labs/{id}", lab.get("id").asText())).andExpect(status().isNotFound());
  }
}
