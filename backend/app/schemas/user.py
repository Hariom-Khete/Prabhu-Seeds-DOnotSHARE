import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class UserBase(BaseModel):
    name: str
    surname: str | None = None
    email: str | None = None
    role: str
    state: str | None = None
    hq: str | None = None
    mobile: str
    ppk_rate: Decimal | None = None
    manager_id: uuid.UUID | None = None


class UserCreate(UserBase):
    password: str  # plain-text; hashed before storage


class UserUpdate(BaseModel):
    name: str | None = None
    surname: str | None = None
    email: str | None = None
    role: str | None = None
    state: str | None = None
    hq: str | None = None
    ppk_rate: Decimal | None = None
    manager_id: uuid.UUID | None = None
    is_active: bool | None = None


class UserOut(UserBase):
    id: uuid.UUID
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserWithSubordinates(UserOut):
    subordinate_ids: list[str] = []
