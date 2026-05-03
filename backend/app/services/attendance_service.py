import uuid
from datetime import date as date_type, datetime, timezone
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.attendance import Attendance, GpsWaypoint
from app.schemas.attendance import CheckInRequest, CheckOutRequest, WaypointCreate
from app.integrations.google_maps import calculate_route_km

DAILY_KM_LIMIT = 21.0


async def check_in(user_id: uuid.UUID, data: CheckInRequest, db: AsyncSession) -> Attendance:
    today = date_type.today()

    result = await db.execute(
        select(Attendance)
        .options(selectinload(Attendance.waypoints))
        .where(Attendance.user_id == user_id, Attendance.date == today)
    )
    existing = result.scalar_one_or_none()

    def _has_valid_gps(lat, lng) -> bool:
        """Return True only if coordinates are a real non-zero GPS fix."""
        try:
            return not (float(lat) == 0.0 and float(lng) == 0.0)
        except (TypeError, ValueError):
            return False

    if existing:
        if existing.check_out is None:
            # Already active — record was loaded with selectinload above, safe to return as-is.
            return existing
        # Previous session completed — allow re-check-in by resetting the record
        existing.check_in = datetime.now(timezone.utc)
        existing.check_out = None
        existing.km = Decimal("0")
        existing.status = "active"
        if _has_valid_gps(data.lat, data.lng):
            waypoint = GpsWaypoint(
                attendance_id=existing.id,
                lat=data.lat,
                lng=data.lng,
                timestamp=existing.check_in,
                type="checkin",
                stop_label="Check In",
            )
            db.add(waypoint)
        await db.commit()
        result2 = await db.execute(
            select(Attendance)
            .options(selectinload(Attendance.waypoints))
            .where(Attendance.id == existing.id)
        )
        return result2.scalar_one()

    attendance = Attendance(user_id=user_id, date=today, check_in=datetime.now(timezone.utc))
    db.add(attendance)
    await db.flush()

    if _has_valid_gps(data.lat, data.lng):
        waypoint = GpsWaypoint(
            attendance_id=attendance.id,
            lat=data.lat,
            lng=data.lng,
            timestamp=attendance.check_in,
            type="checkin",
            stop_label="Check In",
        )
        db.add(waypoint)
    await db.commit()

    # Re-query with selectinload so waypoints are eagerly loaded for serialization.
    result2 = await db.execute(
        select(Attendance)
        .options(selectinload(Attendance.waypoints))
        .where(Attendance.id == attendance.id)
    )
    return result2.scalar_one()


async def check_out(user_id: uuid.UUID, data: CheckOutRequest, db: AsyncSession) -> Attendance:
    today = date_type.today()
    result = await db.execute(
        select(Attendance)
        .options(selectinload(Attendance.waypoints))
        .where(Attendance.user_id == user_id, Attendance.date == today)
    )
    attendance = result.scalar_one_or_none()
    if not attendance:
        raise ValueError("No check-in found for today")

    checkout_time = datetime.now(timezone.utc)

    # Add checkout waypoint only when GPS is valid — (0,0) would wildly distort the route
    extra_wps: list[GpsWaypoint] = []
    if not (float(data.lat) == 0.0 and float(data.lng) == 0.0):
        checkout_wp = GpsWaypoint(
            attendance_id=attendance.id,
            lat=data.lat,
            lng=data.lng,
            timestamp=checkout_time,
            type="checkout",
            stop_label="Check Out",
        )
        db.add(checkout_wp)
        await db.flush()  # persist before distance calc
        extra_wps = [checkout_wp]

    # Auto-calculate km: sum Haversine distances across all waypoints
    all_wps = sorted(
        [*attendance.waypoints, *extra_wps],
        key=lambda w: w.timestamp,
    )
    if len(all_wps) >= 2:
        coords = [(float(w.lat), float(w.lng)) for w in all_wps]
        # Only count legs >= 100 m — filters GPS drift from stationary heartbeats
        computed_km = calculate_route_km(coords, min_leg_m=100)
    else:
        # Only one waypoint (check-in = check-out spot) — no movement
        computed_km = 0.0

    attendance.check_out = checkout_time
    attendance.km = Decimal(str(computed_km))
    attendance.status = "done"

    await db.commit()
    result2 = await db.execute(
        select(Attendance)
        .options(selectinload(Attendance.waypoints))
        .where(Attendance.id == attendance.id)
    )
    return result2.scalar_one()


async def add_waypoint(data: WaypointCreate, db: AsyncSession) -> GpsWaypoint:
    if float(data.lat) == 0.0 and float(data.lng) == 0.0:
        raise ValueError("Invalid GPS coordinates (0, 0) — waypoint not saved")
    wp = GpsWaypoint(**data.model_dump())
    db.add(wp)
    await db.commit()
    await db.refresh(wp)
    return wp


async def get_today_attendance(user_id: uuid.UUID, db: AsyncSession) -> Attendance | None:
    result = await db.execute(
        select(Attendance)
        .options(selectinload(Attendance.waypoints))
        .where(Attendance.user_id == user_id, Attendance.date == date_type.today())
    )
    return result.scalar_one_or_none()
