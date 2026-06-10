# AI 解析功能测试程序

## 功能介绍

这个测试程序用于完整测试 AI 高光解析功能的各个环节，包括：
- 检查设置文件和 API 配置
- 测试 API 连接
- 测试完整的视频分析流程
- 保存模型输出和解析结果

## 使用方法

### 1. 快速测试（只测试基础功能，跳过视频分析）

```bash
python test-ai-parser.py --quick
```

这会测试：
- 加载设置文件
- 检查 API 配置
- 测试 API 连接

### 2. 完整测试（使用默认视频）

```bash
python test-ai-parser.py
```

这会自动找到 `data/` 目录下的第一个视频并进行完整分析。

### 3. 指定视频文件测试

```bash
python test-ai-parser.py --video-file "path/to/video.mp4"
```

## 测试结果

测试完成后，结果会保存在 `test_output/` 目录下：
- `raw_model_response.json`: 模型的原始响应
- `normalized_result.json`: 规范化后的解析结果

## 注意事项

1. 视频文件大小不应超过 20MB（以确保 Base64 编码后上传稳定）
2. 确保 `data/model-settings.json` 中的 API 配置正确
3. 确保有可用的网络连接

## 问题排查

如果测试失败：
1. 首先运行快速测试检查 API 配置
2. 检查网络连接
3. 检查视频文件大小
4. 查看控制台输出的错误信息
