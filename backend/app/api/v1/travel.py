"""
Travel reimbursement router — convenience alias over /expenses filtered to type=travel.
Provides the approve/reject workflow expected by Accounts role.
"""
from datetime import date
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User
from app.models.expense import Expense
from app.models.attendance import Attendance
from app.schemas.expense import ExpenseOut, TravelClaimOut
from app.schemas.attendance import WaypointOut
from app.services import expense_service
from app.services.visibility import get_subordinate_ids

router = APIRouter()


@router.get("/", response_model=list[TravelClaimOut])
async def list_travel_claims(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list:
    """
    List travel expenses with staff name included.
    - OWNER / ACCOUNTS: see all staff travel claims
    - MANAGER: see claims for their direct subordinates
    - FIELD: see only their own claims
    """
    stmt = (
        select(Expense)
        .options(selectinload(Expense.user))
        .where(Expense.type == "travel")
        .order_by(Expense.date.desc())
    )

    if current_user.role in ("OWNER", "ACCOUNTS"):
        pass  # no extra filter — see everything
    elif current_user.role == "MANAGER":
        sub_ids = await get_subordinate_ids(current_user.id, db)
        visible = {current_user.id, *sub_ids}
        stmt = stmt.where(Expense.user_id.in_(visible))
    else:
        # FIELD and any other role — own claims only
        stmt = stmt.where(Expense.user_id == current_user.id)

    if status_filter:
        stmt = stmt.where(Expense.status == status_filter)
    if from_date:
        stmt = stmt.where(Expense.date >= from_date)
    if to_date:
        stmt = stmt.where(Expense.date <= to_date)

    result = await db.execute(stmt)
    expenses = result.scalars().all()

    return [
        TravelClaimOut(
            id=e.id,
            user_id=e.user_id,
            staff_name=e.user.name if e.user else "Unknown",
            date=e.date,
            description=e.description,
            amount=e.amount,
            km=e.km,
            rate=e.rate,
            status=e.status,
            approved_by=e.approved_by,
            created_at=e.created_at,
        )
        for e in expenses
    ]


@router.patch("/{expense_id}/approve", response_model=ExpenseOut)
async def approve_travel(
    expense_id: int,
    current_user: Annotated[User, Depends(require_roles("OWNER", "MANAGER", "ACCOUNTS"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> object:
    from app.schemas.expense import ExpenseUpdate
    expense = await expense_service.update_expense_status(expense_id, ExpenseUpdate(status="approved"), current_user.id, db)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel claim not found")
    return expense


@router.patch("/{expense_id}/reject", response_model=ExpenseOut)
async def reject_travel(
    expense_id: int,
    current_user: Annotated[User, Depends(require_roles("OWNER", "MANAGER", "ACCOUNTS"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> object:
    from app.schemas.expense import ExpenseUpdate
    expense = await expense_service.update_expense_status(expense_id, ExpenseUpdate(status="rejected"), current_user.id, db)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel claim not found")
    return expense


@router.get("/{expense_id}/route", response_model=list[WaypointOut])
async def get_travel_route(
    expense_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list:
    """
    Return GPS waypoints for a travel claim's journey day.
    Finds the attendance record for the claim owner on the claim date,
    then returns all waypoints ordered by timestamp.

    Access:
    - OWNER / ACCOUNTS: any claim
    - MANAGER: own claims + subordinate claims
    - FIELD: own claims only
    """
    # Load the expense with its user
    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.user))
        .where(Expense.id == expense_id, Expense.type == "travel")
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel claim not found")

    # Role-based access check
    if current_user.role in ("OWNER", "ACCOUNTS"):
        pass  # can see anything
    elif current_user.role == "MANAGER":
        sub_ids = await get_subordinate_ids(current_user.id, db)
        visible = {current_user.id, *sub_ids}
        if expense.user_id not in visible:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        if expense.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Find the attendance record for this user on the claim date
    att_result = await db.execute(
        select(Attendance)
        .options(selectinload(Attendance.waypoints))
        .where(
            Attendance.user_id == expense.user_id,
            Attendance.date == expense.date,
        )
    )
    attendance = att_result.scalar_one_or_none()
    if not attendance or not attendance.waypoints:
        return []

    # Return waypoints ordered by timestamp, filtering out (0,0) sentinels
    waypoints = sorted(
        [w for w in attendance.waypoints if not (float(w.lat) == 0 and float(w.lng) == 0)],
        key=lambda w: w.timestamp,
    )
    return waypoints
