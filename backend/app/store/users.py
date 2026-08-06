import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import bcrypt

logger = logging.getLogger(__name__)


class User:
    def __init__(self, email: str, name: str, password_hash: str):
        self.id = uuid.uuid4().hex[:12]
        self.email = email
        self.name = name
        self.password_hash = password_hash
        self.avatar_url: Optional[str] = None
        self.credits = 10
        self.role = "user"
        self.created_at = datetime.now(timezone.utc)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "avatar_url": self.avatar_url,
            "credits": self.credits,
            "role": self.role,
            "created_at": self.created_at.isoformat(),
        }

    def to_public_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "avatar_url": self.avatar_url,
            "role": self.role,
        }

    def verify_password(self, password: str) -> bool:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            self.password_hash.encode("utf-8"),
        )


class InMemoryUserStore:
    def __init__(self):
        self._users: dict[str, User] = {}
        self._email_index: dict[str, str] = {}

    def create(self, email: str, name: str, password: str) -> User:
        email_lower = email.lower().strip()
        if email_lower in self._email_index:
            raise ValueError("Email already registered")

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")

        user = User(email=email_lower, name=name, password_hash=password_hash)
        self._users[user.id] = user
        self._email_index[email_lower] = user.id
        logger.info(f"User created: {user.email} ({user.id})")
        return user

    def get_by_id(self, user_id: str) -> Optional[User]:
        return self._users.get(user_id)

    def get_by_email(self, email: str) -> Optional[User]:
        email_lower = email.lower().strip()
        user_id = self._email_index.get(email_lower)
        if user_id:
            return self._users.get(user_id)
        return None

    def authenticate(self, email: str, password: str) -> Optional[User]:
        user = self.get_by_email(email)
        if user and user.verify_password(password):
            return user
        return None

    def add_credits(self, user_id: str, amount: int) -> Optional[int]:
        user = self._users.get(user_id)
        if user:
            user.credits += amount
            logger.info(f"Credits added: +{amount} for user {user_id} (now {user.credits})")
            return user.credits
        return None

    def deduct_credits(self, user_id: str, amount: int = 1) -> bool:
        user = self._users.get(user_id)
        if user and user.credits >= amount:
            user.credits -= amount
            logger.info(f"Credits deducted: -{amount} for user {user_id} (now {user.credits})")
            return True
        return False

    def get_credits(self, user_id: str) -> int:
        user = self._users.get(user_id)
        return user.credits if user else 0


user_store = InMemoryUserStore()
