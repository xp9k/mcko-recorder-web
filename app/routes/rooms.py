from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.models import Room, Address
from app.schemas import RoomCreate, RoomUpdate, RoomOut

router = APIRouter(prefix="/rooms", tags=["rooms"])


def room_options():
    return [selectinload(Room.address), selectinload(Room.cameras)]


@router.get("", response_model=List[RoomOut])
async def list_rooms(address_id: int = None, db: AsyncSession = Depends(get_db)):
    query = select(Room).options(*room_options())
    if address_id:
        query = query.where(Room.address_id == address_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=RoomOut, status_code=201)
async def create_room(data: RoomCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(Room).where(Room.address_id == data.address_id, Room.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Room with this name already exists in this address")
    room = Room(**data.model_dump())
    db.add(room)
    await db.commit()
    result = await db.execute(
        select(Room).where(Room.id == room.id).options(*room_options())
    )
    return result.scalar_one()


@router.get("/{room_id}", response_model=RoomOut)
async def get_room(room_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Room).where(Room.id == room_id).options(*room_options())
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.patch("/{room_id}", response_model=RoomOut)
async def update_room(
    room_id: int, data: RoomUpdate, db: AsyncSession = Depends(get_db)
):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "name" and value != room.name:
            target_address_id = data.address_id if data.address_id is not None else room.address_id
            existing = await db.execute(
                select(Room).where(Room.address_id == target_address_id, Room.name == value)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Room with this name already exists in this address")
        if field == "address_id" and value != room.address_id and room.name:
            existing = await db.execute(
                select(Room).where(Room.address_id == value, Room.name == room.name)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Room with this name already exists in the target address")
        setattr(room, field, value)
    await db.commit()
    result = await db.execute(
        select(Room).where(Room.id == room_id).options(*room_options())
    )
    return result.scalar_one()


@router.delete("/{room_id}")
async def delete_room(room_id: int, db: AsyncSession = Depends(get_db)):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    await db.delete(room)
    await db.commit()
    return {"ok": True}
