import uuid
import logging
import asyncio
from enum import Enum
from datetime import datetime, timezone
from typing import Optional, Callable, Awaitable

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Job:
    def __init__(self, job_type: str, params: dict):
        self.id = uuid.uuid4().hex[:12]
        self.type = job_type
        self.params = params
        self.status = JobStatus.PENDING
        self.result = None
        self.error = None
        self.created_at = datetime.now(timezone.utc)
        self.updated_at = None


class InMemoryQueue:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._handlers: dict[str, Callable] = {}

    def register(self, job_type: str, handler: Callable):
        self._handlers[job_type] = handler

    def submit(self, job_type: str, params: dict) -> Job:
        if job_type not in self._handlers:
            raise ValueError(f"No handler for job type: {job_type}")

        job = Job(job_type, params)
        self._jobs[job.id] = job
        logger.info(f"Job submitted: {job.id} ({job_type})")

        asyncio.create_task(self._process(job))
        return job

    def get(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    async def _process(self, job: Job):
        try:
            job.status = JobStatus.PROCESSING
            job.updated_at = datetime.now(timezone.utc)
            logger.info(f"Job processing: {job.id} ({job.type})")

            handler = self._handlers[job.type]
            if asyncio.iscoroutinefunction(handler):
                result = await handler(job.params)
            else:
                result = await asyncio.to_thread(handler, job.params)

            job.result = result
            job.status = JobStatus.COMPLETED
            logger.info(f"Job completed: {job.id}")

        except Exception as e:
            job.error = str(e)
            job.status = JobStatus.FAILED
            logger.exception(f"Job failed: {job.id}")

        finally:
            job.updated_at = datetime.now(timezone.utc)


queue = InMemoryQueue()
