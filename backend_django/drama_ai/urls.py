from django.urls import include, path, re_path

from content import views


urlpatterns = [
    path("api/", include("content.urls")),
    path("", views.frontend_index),
    path("review.html", views.frontend_review),
    path("media/<path:relative_path>", views.media_file),
    re_path(r"^(?P<relative_path>app\.js|review\.js|styles\.css|[^/]+\.(?:png|jpg|jpeg|gif|webp|svg|ico))$", views.public_file),
]
