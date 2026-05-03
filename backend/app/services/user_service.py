import uuid
import bcrypt as _bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


def _hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


async def list_users(db: AsyncSession, skip: int = 0, limit: int = 100, role: str | None = None) -> list[User]:
    q = select(User)
    if role:
        q = q.where(User.role == role.upper())
    result = await db.execute(q.offset(skip).limit(limit))
    return list(result.scalars().all())


async def get_user(user_id: uuid.UUID, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(data: UserCreate, db: AsyncSession) -> User:
    fields = data.model_dump(exclude={"password"})
    fields["password_hash"] = _hash_password(data.password)
    fields["role"] = fields["role"].upper()
    user = User(**fields)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(user_id: uuid.UUID, data: UserUpdate, db: AsyncSession) -> User | None:
    user = await get_user(user_id, db)
    if not user:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user
