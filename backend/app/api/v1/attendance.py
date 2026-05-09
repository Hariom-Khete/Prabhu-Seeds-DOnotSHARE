from datetime import date as _date
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.attendance import Attendance
from app.models.user import User
from app.schemas.attendance import CheckInRequest, CheckOutRequest, WaypointCreate, AttendanceOut, AttendanceListOut, WaypointOut, TeamAttendanceOut
from app.services import attendance_service

DEPT_LABEL = {
    "FIELD":    "Field Ops",
    "MANAGER":  "Management",
    "ACCOUNTS": "Accounts",
    "OWNER":    "HQ",
}

router = APIRouter()


@router.get("/today", response_model=AttendanceOut | None)
async def get_today(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> object:
    return await attendance_service.get_today_attendance(current_user.id, db)


@router.post("/check-in", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
async def check_in(
    body: CheckInRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> object:
    try:
        return await attendance_service.check_in(current_user.id, body, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/check-out", response_model=AttendanceOut)
async def check_out(
    body: CheckOutRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> object:
    try:
        return await attendance_service.check_out(current_user.id, body, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/waypoints", response_model=WaypointOut, status_code=status.HTTP_201_CREATED)
async def add_waypoint(
    body: WaypointCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> object:
    # Verify the attendance record belongs to the requesting user
    att_result = await db.execute(
        select(Attendance).where(Attendance.id == body.attendance_id)
    )
    attendance = att_result.scalar_one_or_none()
    if not attendance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
    if attendance.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot add waypoints to another user's attendance")
    try:
        return await attendance_service.add_waypoint(body, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.get("/team", response_model=list[TeamAttendanceOut])
async def team_attendance(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list:
    """
    Return all field staff attendance records for a given date.
    Owner sees everyone; manager sees only their direct subordinates.
    """
    if current_user.role not in ("OWNER", "MANAGER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    try:
        target_date = _date.fromisoformat(date) if date else _date.today()
    except (ValueError, TypeError):
        target_date = _date.today()

    stmt = (
        select(Attendance, User)
        .join(User, Attendance.user_id == User.id)
        .where(
            Attendance.date == target_date,
            User.role.in_(["FIELD", "MANAGER"]),
            User.is_active.is_(True),
        )
        .order_by(Attendance.check_in.asc().nulls_last())
        .offset(skip)
        .limit(limit)
    )

    if current_user.role == "MANAGER":
        stmt = stmt.where(User.manager_id == current_user.id)

    result = await db.execute(stmt)
    rows = result.all()

    return [
        TeamAttendanceOut(
            id=att.id,
            user_id=att.user_id,
            name=user.name,
            department=DEPT_LABEL.get(user.role, user.role.title()),
            date=att.date,
            check_in=att.check_in,
            check_out=att.check_out,
            km=att.km,
            status=att.status,
        )
        for att, user in rows
    ]


@router.get("/", response_model=list[AttendanceListOut])
async def list_attendance(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
    month: str | None = None,   # "YYYY-MM"
) -> list:
    """List attendance records for the current user, optionally filtered by month."""
    import calendar as _cal
    from datetime import date as _date
    from sqlalchemy import select
    from app.models.attendance import Attendance

    query = select(Attendance).where(Attendance.user_id == current_user.id)

    if month:
        try:
            y, m = int(month[:4]), int(month[5:7])
            month_start = _date(y, m, 1)
            month_end = _date(y, m, _cal.monthrange(y, m)[1])
            query = query.where(Attendance.date >= month_start, Attendance.date <= month_end)
        except (ValueError, IndexError):
            pass

    result = await db.execute(
        query.order_by(Attendance.date.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/report")
async def attendance_report(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: str | None = None,   # "YYYY-MM"  — defaults to current month
) -> dict:
    """Per-day attendance calendar + summary for the current user."""
    import calendar as _cal
    from datetime import date as _date
    from sqlalchemy import select
    from app.models.attendance import Attendance

    today = _date.today()
    try:
        y, m = (int(month[:4]), int(month[5:7])) if month else (today.year, today.month)
    except (ValueError, AttributeError):
        y, m = today.year, today.month

    month_start = _date(y, m, 1)
    month_end = _date(y, m, _cal.monthrange(y, m)[1])

    result = await db.execute(
        select(Attendance)
        .where(
            Attendance.user_id == current_user.id,
            Attendance.date >= month_start,
            Attendance.date <= month_end,
        )
        .order_by(Attendance.date)
    )
    records = result.scalars().all()

    calendar_days = [
        {
            "date": r.date.isoformat(),
            "attendance_pct": 100 if r.check_in else 0,
            "check_in": r.check_in.isoformat() if r.check_in else None,
            "check_out": r.check_out.isoformat() if r.check_out else None,
            "km": float(r.km),
            "status": r.status,
        }
        for r in records
    ]

    present = sum(1 for r in records if r.check_in)
    km_total = sum(float(r.km) for r in records)

    return {
        "total": len(records),
        "present": present,
        "km_total": round(km_total, 1),
        "calendar_days": calendar_days,
    }
