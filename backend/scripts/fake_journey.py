"""
Fake journey seeder — Field Agent 1 (9777777777)
Route: Mhow (Dr Ambedkar Nagar) → Indore  (~25 km)

Creates for TODAY:
  - An attendance record  (check-in 08:30, check-out 17:00)
  - 14 GPS waypoints along the Mhow → Indore road
  - A travel expense claim (status = pending)

Safe to re-run — deletes today's existing attendance + expense for this user
before inserting fresh data.

Usage:
    cd C:/Users/acer/Desktop/Prabhu-Seeds/backend
    venv\\Scripts\\activate
    python scripts/fake_journey.py
"""

import asyncio
import sys
import os
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select, delete

from app.core.config import settings
from app.models.user import User
from app.models.attendance import Attendance, GpsWaypoint
from app.models.expense import Expense

# ── Route: Mhow → Indore ─────────────────────────────────────────────────────
# Real road waypoints (NH-52 / Mhow-Indore Road)
WAYPOINTS = [
    # (lat, lng, label, type)
    (22.5556, 75.7637, "Mhow — Check In",         "checkin"),
    (22.5680, 75.7690, None,                        "stop"),
    (22.5810, 75.7745, "Khajrana area",             "stop"),
    (22.5960, 75.7800, None,                        "stop"),
    (22.6120, 75.7855, "Tejpur turnoff",            "stop"),
    (22.6290, 75.7910, None,                        "stop"),
    (22.6440, 75.7960, "Sanwer Naka",               "stop"),
    (22.6580, 75.8005, None,                        "stop"),
    (22.6720, 75.8060, "Rau",                       "stop"),
    (22.6860, 75.8130, None,                        "stop"),
    (22.6980, 75.8220, "Vijay Nagar",               "stop"),
    (22.7060, 75.8340, None,                        "stop"),
    (22.7130, 75.8460, "Palasia",                   "stop"),
    (22.7196, 75.8577, "Indore — Journey End",      "checkout"),
]

# Journey: 08:30 start, one waypoint every ~25 minutes
START_HOUR   = 8
START_MINUTE = 30
INTERVAL_MIN = 25

# Travel rate
RATE_PER_KM = Decimal("3.25")


def haversine_km(lat1, lng1, lat2, lng2):
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def total_km(waypoints):
    km = 0.0
    for i in range(1, len(waypoints)):
        km += haversine_km(waypoints[i-1][0], waypoints[i-1][1], waypoints[i][0], waypoints[i][1])
    return km


async def seed():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    today = date.today()

    async with Session() as db:
        # ── Find field agent ─────────────────────────────────────────────────
        result = await db.execute(select(User).where(User.mobile == "9300000001"))
        agent = result.scalar_one_or_none()
        if not agent:
            print("ERROR: Field Agent 1 (9300000001) not found.")
            return

        print(f"Field Agent: {agent.name} ({agent.id})")
        print(f"Journey date: {today}")

        # ── Remove existing attendance + expenses for today ───────────────────
        att_result = await db.execute(
            select(Attendance).where(
                Attendance.user_id == agent.id,
                Attendance.date == today,
            )
        )
        existing_att = att_result.scalar_one_or_none()
        if existing_att:
            await db.execute(
                delete(Expense).where(
                    Expense.user_id == agent.id,
                    Expense.date == today,
                    Expense.type == "travel",
                )
            )
            await db.execute(
                delete(Attendance).where(Attendance.id == existing_att.id)
            )
            await db.commit()
            print("Cleared existing attendance + travel expense for today.")

        # ── Build timestamps ─────────────────────────────────────────────────
        tz = timezone(timedelta(hours=5, minutes=30))  # IST
        base = datetime(today.year, today.month, today.day, START_HOUR, START_MINUTE, 0, tzinfo=tz)
        timestamps = [base + timedelta(minutes=i * INTERVAL_MIN) for i in range(len(WAYPOINTS))]

        check_in_time  = timestamps[0]
        check_out_time = timestamps[-1] + timedelta(minutes=30)  # 30 min after last waypoint

        # ── Create attendance record ─────────────────────────────────────────
        attendance = Attendance(
            user_id   = agent.id,
            date      = today,
            check_in  = check_in_time,
            check_out = check_out_time,
            km        = Decimal(str(round(total_km(WAYPOINTS), 1))),
            status    = "done",
        )
        db.add(attendance)
        await db.flush()  # get attendance.id

        # ── Create GPS waypoints ─────────────────────────────────────────────
        for i, (lat, lng, label, wtype) in enumerate(WAYPOINTS):
            db.add(GpsWaypoint(
                attendance_id = attendance.id,
                lat           = Decimal(str(lat)),
                lng           = Decimal(str(lng)),
                timestamp     = timestamps[i],
                stop_label    = label,
                type          = wtype,
            ))

        await db.flush()

        # ── Compute distance + amount ────────────────────────────────────────
        km_travelled = Decimal(str(round(total_km(WAYPOINTS), 1)))
        amount       = round(km_travelled * RATE_PER_KM, 2)

        dep_str = check_in_time.strftime("%H:%M")
        arr_str = timestamps[-1].strftime("%H:%M")

        # ── Create travel expense claim ──────────────────────────────────────
        expense = Expense(
            user_id     = agent.id,
            date        = today,
            type        = "travel",
            description = f"Mhow to Indore | {today.strftime('%d %b %Y')} | Dep: {dep_str} -> Arr: {arr_str}",
            amount      = amount,
            km          = km_travelled,
            rate        = RATE_PER_KM,
            status      = "pending",
        )
        db.add(expense)
        await db.commit()

        print(f"\nJourney seeded successfully!")
        print(f"  Route     : Mhow -> Indore")
        print(f"  Waypoints : {len(WAYPOINTS)}")
        print(f"  Distance  : {km_travelled} km")
        print(f"  Amount    : Rs.{amount}")
        print(f"  Departure : {dep_str} IST")
        print(f"  Arrival   : {arr_str} IST")
        print(f"  Status    : pending")
        print(f"\nLog in as Owner/Manager and go to Travel Claims to see it.")
        print(f"Click 'View Route' to see the GPS track on the map.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
