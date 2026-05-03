import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, ForeignKey, TIMESTAMP, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    surname: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, nullable=False)  # OWNER|MANAGER|FIELD|ACCOUNTS
    manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    hq: Mapped[str | None] = mapped_column(String, nullable=True)
    mobile: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    ppk_rate: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"))

    # Relationships
    manager: Mapped["User | None"] = relationship("User", remote_side="User.id", foreign_keys=[manager_id])
    subordinates: Mapped[list["User"]] = relationship("User", foreign_keys=[manager_id], back_populates="manager")
    district_assignments: Mapped[list["DistrictAssignment"]] = relationship("DistrictAssignment", back_populates="user")  # type: ignore[name-defined]
    dealer_assignments: Mapped[list["DealerAssignment"]] = relationship("DealerAssignment", back_populates="user")  # type: ignore[name-defined]
