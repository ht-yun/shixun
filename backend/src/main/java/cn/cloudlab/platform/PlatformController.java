package cn.cloudlab.platform;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class PlatformController {
  @Value("${cloudlab.cloud-adapter.enabled}") boolean cloudEnabled;
  @Value("${cloudlab.cloud-adapter.provider}") String provider;
  @GetMapping("/health") public Map<String,Object> health(){return Map.of("status","UP","time", Instant.now());}
  @GetMapping("/cloud/adapter-status") public Map<String,Object> adapter(){return Map.of("configured",cloudEnabled,"provider",provider,"message",cloudEnabled?"云资源适配器已配置":"尚未配置云资源；课程和实验管理功能可正常使用");}
}
