from django.urls import path

from . import views


urlpatterns = [
    path("dramas", views.dramas),
    path("review/episodes", views.review_episodes),
    path("episodes/<str:episode_id>/highlights", views.episode_highlights),
    path("highlights/<str:highlight_id>", views.highlight_detail),
    path("episodes/<str:episode_id>/highlights/<str:highlight_id>", views.episode_highlight_delete),
    path("interactions", views.interactions),
    path("episodes/<str:episode_id>/activity-feed", views.activity_feed),
    path("episodes/<str:episode_id>/continuations", views.continuations),
    path("episodes/<str:episode_id>/video-branches", views.episode_video_branches),
    path("episodes/<str:episode_id>/video-branches/generate", views.generate_video_branches),
    path("episodes/<str:episode_id>/generated-videos", views.generated_videos),
    path("story-branches/<str:episode_id>", views.story_branches),
    path("video-branches/<str:package_id>", views.video_branch_detail),
    path("video-gen/submit", views.video_gen_submit),
    path("video-gen/tasks", views.video_gen_tasks),
    path("video-gen/downloads", views.video_gen_downloads),
    path("model/settings", views.model_settings),
    path("model/prompt", views.model_prompt),
    path("model/import", views.model_import),
    path("model/analyze", views.model_analyze_placeholder),
    path("effects/config", views.effects_config),
]
