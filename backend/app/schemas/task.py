import uuid
from datetime import date as _Date, datetime
from decimal import Decimal
from pydantic import BaseModel


class TaskRecordCreate(BaseModel):
    village: str | None = None
    tehsil: str | None = None
    district: str | None = None
    farmer_name: str | None = None
    farmer_contact: str | None = None
    land_acres: Decimal | None = None
    photo_url: str | None = None
    lat: float | None = None
    lng: float | None = None


class TaskRecordOut(BaseModel):
    id: int
    task_id: int
    submitted_by: uuid.UUID | None
    submitted_by_name: str | None = None
    village: str | None
    tehsil: str | None
    district: str | None
    farmer_name: str | None
    farmer_contact: str | None
    land_acres: Decimal | None
    photo_url: str | None
    lat: float | None = None
    lng: float | None = None
    submitted_at: datetime

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str
    assignment_type: str = "singular"         # singular | group
    assigned_to: uuid.UUID | None = None      # used when assignment_type == singular
    members: list[uuid.UUID] = []             # used when assignment_type == group
    district_id: str | None = None
    dept: str | None = None
    season: str | None = None                 # Pre-Season | Post-Season
    activity_type: str | None = None
    state: str | None = None
    territory: str | None = None
    location: str | None = None               # required for Production/R&D pre-season
    crop: str | None = None
    product: str | None = None
    month: str | None = None
    target: int = 1
    unit: str = "NOS"
    deadline: _Date | None = None
    repeat_count: int = 1
    description: str | None = None


class TaskUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
    target: int | None = None
    deadline: _Date | None = None
    repeat_count: int | None = None
    assigned_to: uuid.UUID | None = None
    dept: str | None = None
    season: str | None = None
    activity_type: str | None = None
    state: str | None = None
    territory: str | None = None
    location: str | None = None
    crop: str | None = None
    product: str | None = None
    month: str | None = None
    unit: str | None = None
    description: str | None = None
    assignment_type: str | None = None
    members: list[uuid.UUID] | None = None  # replaces all existing members when provided


class TaskOut(BaseModel):
    id: int
    title: str
    created_by: uuid.UUID | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None = None
    district_id: str | None
    dept: str | None
    season: str | None = None
    activity_type: str | None
    state: str | None = None
    territory: str | None = None
    location: str | None = None
    crop: str | None
    product: str | None
    month: str | None = None
    target: int
    unit: str
    status: str
    deadline: _Date | None
    started_at: _Date | None
    created_at: datetime
    repeat_count: int = 1
    record_count: int = 0
    my_record_count: int = 0           # requesting user's own submission count
    member_completions: dict[str, int] = {}  # str(user_id) -> their submission count
    description: str | None = None
    assignment_type: str = "singular"
    members: list[uuid.UUID] = []
    member_names: list[str] = []

    model_config = {"from_attributes": True}

    @property
    def completions_remaining(self) -> int:
        return max(0, self.repeat_count - self.my_record_count)

    @property
    def is_fully_complete(self) -> bool:
        if self.assignment_type == "group" and self.member_completions:
            return all(c >= self.repeat_count for c in self.member_completions.values())
        return self.record_count >= self.repeat_count


class TaskMeta(BaseModel):
    total: int
    pending: int
    active: int
    efficiency: int


class TaskListResponse(BaseModel):
    tasks: list[TaskOut]
    meta: TaskMeta
