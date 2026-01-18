# 日志系统部署和管理指南

## 概述

本文档详细说明了在Docker部署环境下如何配置和管理日志系统，确保日志持久化且不会占用过多硬盘空间。

## 1. 日志系统架构

### 1.1 日志文件类型

- **error-YYYY-MM-DD.log**: 错误级别日志（ERROR）
- **combined-YYYY-MM-DD.log**: 所有级别日志（INFO, WARN, ERROR, DEBUG）
- **exceptions.log**: 未捕获的异常日志
- **rejections.log**: 未处理的Promise拒绝日志

### 1.2 日志轮转策略

- **文件大小限制**: 每个日志文件最大5MB
- **保留时间**: 保留最近7天的日志文件
- **轮转频率**: 按天轮转，每天生成新文件

## 2. Docker部署配置

### 2.1 当前配置（已更新）

```yaml
# docker-compose.yml中的关键配置
services:
  app:
    environment:
      - LOG_LEVEL=info
      - LOG_DIR=/app/logs
      - LOG_MAX_SIZE=5m # 每个文件最大5MB
      - LOG_MAX_FILES=7d # 保留7天日志
    volumes:
      - ./logs:/app/logs # 日志目录挂载
    logging:
      driver: "json-file"
      options:
        max-size: "10m" # Docker容器日志最大10MB
        max-file: "3" # 保留3个容器日志文件
```

### 2.2 部署步骤

1. **创建日志目录**（在docker-compose.yml所在目录）：

   ```bash
   mkdir -p logs
   chmod 755 logs
   ```

2. **启动服务**：

   ```bash
   docker-compose up -d
   ```

3. **验证日志目录**：
   ```bash
   ls -la logs/
   ```

## 3. 硬盘空间管理

### 3.1 容量估算（30用户场景）

**每日日志量估算：**

- 每个用户平均每天：10个API请求
- 每个请求日志：约1KB（包含结构化数据）
- 每日总日志量：30用户 × 10请求 × 1KB = 300KB ≈ 0.3MB

**存储空间需求：**

- 每日：0.3MB
- 每周（7天）：2.1MB
- 每月（30天）：9MB

**实际配置下的最大占用：**

- 日志文件：7天 × 0.3MB = 2.1MB
- Docker容器日志：3文件 × 10MB = 30MB（最大）
- **总计最大占用：约32.1MB**

### 3.2 监控日志大小

**查看日志目录大小：**

```bash
# 查看日志目录总大小
du -sh logs/

# 查看各个日志文件大小
ls -lh logs/
```

**设置定期清理（可选）：**

```bash
# 每周清理超过7天的日志文件（添加到crontab）
0 2 * * 0 find /path/to/project/logs -name "*.log" -mtime +7 -delete
```

## 4. 环境变量配置说明

### 4.1 日志相关环境变量

| 变量名        | 默认值 | 说明                                 | 推荐值（30用户）    |
| ------------- | ------ | ------------------------------------ | ------------------- |
| LOG_LEVEL     | info   | 日志级别（debug, info, warn, error） | info                |
| LOG_DIR       | ./logs | 日志目录路径                         | /app/logs（Docker） |
| LOG_MAX_SIZE  | 5m     | 单个日志文件最大大小                 | 5m                  |
| LOG_MAX_FILES | 7d     | 保留日志文件的天数                   | 7d                  |

### 4.2 根据用户量调整

**用户量增长时的调整建议：**

| 用户量   | LOG_MAX_SIZE | LOG_MAX_FILES | 预计最大占用 |
| -------- | ------------ | ------------- | ------------ |
| 30用户   | 5m           | 7d            | 2.1MB        |
| 100用户  | 10m          | 14d           | 14MB         |
| 500用户  | 20m          | 30d           | 180MB        |
| 1000用户 | 50m          | 30d           | 450MB        |

## 5. 故障排查

### 5.1 常见问题

**问题1：日志文件不生成**

- 检查日志目录权限：`chmod 755 logs`
- 检查环境变量是否正确设置
- 检查Docker卷挂载是否成功

**问题2：日志文件过大**

- 检查实际用户量是否增长
- 调整LOG_MAX_SIZE和LOG_MAX_FILES
- 检查是否有异常的大量日志输出

**问题3：硬盘空间不足**

- 定期监控日志目录大小
- 考虑增加硬盘空间
- 调整日志保留策略

### 5.2 日志查看命令

```bash
# 查看最新的错误日志
tail -f logs/error-$(date +%Y-%m-%d).log

# 搜索特定用户的日志
grep "user:user123" logs/combined-*.log

# 查看今天的API请求统计
grep "GET\|POST\|PUT\|DELETE" logs/combined-$(date +%Y-%m-%d).log | wc -l
```

## 6. 最佳实践

### 6.1 开发环境

- 使用默认配置（5MB文件大小，7天保留）
- 定期清理测试日志
- 监控本地磁盘使用情况

### 6.2 生产环境

- 根据实际用户量调整配置
- 设置日志监控告警
- 定期备份重要日志
- 考虑使用集中式日志系统（如ELK Stack）

### 6.3 安全考虑

- 日志文件包含敏感信息，确保目录权限正确
- 定期审查日志内容
- 考虑日志加密存储（如果需要）

## 7. 扩展建议

### 7.1 集中式日志管理

当用户量增长到1000+时，建议：

1. 使用ELK Stack（Elasticsearch, Logstash, Kibana）
2. 或使用云日志服务（如AWS CloudWatch, Azure Monitor）
3. 实现实时日志监控和告警

### 7.2 性能优化

- 调整日志级别，减少不必要的DEBUG日志
- 使用异步日志写入
- 考虑日志采样（sampling）减少日志量

---

**最后更新：** 2026-01-18  
**适用版本：** 后端v1.0+  
**维护者：** 后端开发团队
