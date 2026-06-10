from django.db import models


class Drama(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    title = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, null=True)
    poster_url = models.CharField(max_length=1024, blank=True, null=True)
    episode_count = models.IntegerField(default=0)
    status = models.CharField(max_length=32, default="active")
    metadata = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dramas"


class Episode(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    drama = models.ForeignKey(Drama, on_delete=models.CASCADE, related_name="episodes")
    episode_key = models.CharField(max_length=512, unique=True)
    title = models.CharField(max_length=255)
    episode_index = models.IntegerField(blank=True, null=True)
    file_name = models.CharField(max_length=255)
    storage_type = models.CharField(max_length=32, default="local")
    video_url = models.CharField(max_length=1024)
    local_path = models.CharField(max_length=1024, blank=True, null=True)
    duration_sec = models.DecimalField(max_digits=10, decimal_places=3, blank=True, null=True)
    file_size = models.BigIntegerField(blank=True, null=True)
    file_hash = models.CharField(max_length=128, blank=True, null=True)
    mime_type = models.CharField(max_length=80, default="video/mp4")
    status = models.CharField(max_length=32, default="ready")
    metadata = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "episodes"
        indexes = [
            models.Index(fields=["drama", "episode_index"]),
            models.Index(fields=["status"]),
        ]


class Highlight(models.Model):
    id = models.CharField(max_length=80, primary_key=True)
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, blank=True, null=True, related_name="highlights")
    episode_key = models.CharField(max_length=512)
    start_time = models.DecimalField(max_digits=10, decimal_places=3)
    end_time = models.DecimalField(max_digits=10, decimal_places=3)
    type = models.CharField(max_length=64)
    emotion = models.CharField(max_length=64, blank=True, null=True)
    intensity = models.DecimalField(max_digits=5, decimal_places=3, default=0)
    confidence = models.DecimalField(max_digits=5, decimal_places=3, default=0)
    summary = models.TextField()
    suggestions = models.JSONField(blank=True, null=True)
    status = models.CharField(max_length=32, default="draft")
    model_source = models.CharField(max_length=128, blank=True, null=True)
    model_reason = models.TextField(blank=True, null=True)
    trigger_score = models.IntegerField(blank=True, null=True)
    effect_config = models.JSONField(blank=True, null=True)
    raw_payload = models.JSONField(blank=True, null=True)
    imported_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "highlights"
        indexes = [
            models.Index(fields=["episode_key", "start_time", "end_time"]),
            models.Index(fields=["episode_key", "status"]),
            models.Index(fields=["type"]),
        ]


class Interaction(models.Model):
    highlight = models.ForeignKey(Highlight, on_delete=models.CASCADE, related_name="interactions")
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, blank=True, null=True)
    episode_key = models.CharField(max_length=512, blank=True, null=True)
    event_type = models.CharField(max_length=64, default="click")
    reaction = models.CharField(max_length=255, blank=True, null=True)
    button_text = models.CharField(max_length=255, blank=True, null=True)
    user_id = models.CharField(max_length=128, blank=True, null=True)
    device_id = models.CharField(max_length=128, blank=True, null=True)
    user_agent = models.CharField(max_length=512, blank=True, null=True)
    client_time = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(blank=True, null=True)

    class Meta:
        db_table = "interactions"
        indexes = [
            models.Index(fields=["highlight", "created_at"]),
            models.Index(fields=["episode_key", "created_at"]),
            models.Index(fields=["user_id"]),
        ]


class ModelRun(models.Model):
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, blank=True, null=True)
    episode_key = models.CharField(max_length=512, blank=True, null=True)
    task_type = models.CharField(max_length=64)
    model_source = models.CharField(max_length=128, blank=True, null=True)
    prompt = models.TextField(blank=True, null=True)
    request_payload = models.JSONField(blank=True, null=True)
    raw_response = models.TextField(blank=True, null=True)
    parsed_result = models.JSONField(blank=True, null=True)
    status = models.CharField(max_length=32, default="pending")
    error_message = models.TextField(blank=True, null=True)
    latency_ms = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "model_runs"


class Continuation(models.Model):
    id = models.CharField(max_length=80, primary_key=True)
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, blank=True, null=True)
    episode_key = models.CharField(max_length=512)
    trigger_highlight = models.ForeignKey(Highlight, on_delete=models.SET_NULL, blank=True, null=True)
    title = models.CharField(max_length=255)
    setup = models.TextField(blank=True, null=True)
    branches = models.JSONField()
    status = models.CharField(max_length=32, default="draft")
    model_source = models.CharField(max_length=128, blank=True, null=True)
    raw_model_output = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "continuations"


class VideoBranch(models.Model):
    id = models.CharField(max_length=80, primary_key=True)
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, blank=True, null=True)
    episode_key = models.CharField(max_length=512)
    title = models.CharField(max_length=255)
    setup = models.TextField(blank=True, null=True)
    interaction_nodes = models.JSONField()
    status = models.CharField(max_length=32, default="draft")
    model_source = models.CharField(max_length=128, blank=True, null=True)
    raw_model_output = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "video_branches"
        indexes = [models.Index(fields=["episode_key", "status"])]


class VideoGenerationTask(models.Model):
    id = models.CharField(max_length=80, primary_key=True)
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, blank=True, null=True)
    episode_key = models.CharField(max_length=512, blank=True, null=True)
    video_branch = models.ForeignKey(VideoBranch, on_delete=models.SET_NULL, blank=True, null=True)
    provider = models.CharField(max_length=64, blank=True, null=True)
    provider_task_id = models.CharField(max_length=128, blank=True, null=True)
    model = models.CharField(max_length=128, blank=True, null=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    video_prompt = models.TextField()
    status = models.CharField(max_length=32, default="pending")
    progress = models.IntegerField(default=0)
    video_url = models.CharField(max_length=1024, blank=True, null=True)
    local_file = models.CharField(max_length=1024, blank=True, null=True)
    thumbnail_url = models.CharField(max_length=1024, blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    request_payload = models.JSONField(blank=True, null=True)
    response_payload = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "video_generation_tasks"


class AppSetting(models.Model):
    setting_key = models.CharField(max_length=128, primary_key=True)
    setting_value = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "app_settings"
