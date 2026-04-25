from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.call_tasks"]
)

celery_app.conf.task_routes = {"app.tasks.call_tasks.*": "main-queue"}
celery_app.conf.update(task_track_started=True)