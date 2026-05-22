from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.models import Address, Room
from app.schemas import AddressCreate, AddressUpdate, AddressOut

router = APIRouter(prefix="/addresses", tags=["addresses"])


def addr_options():
    return selectinload(Address.rooms).selectinload(Room.cameras)


@router.get("", response_model=List[AddressOut])
async def list_addresses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Address).options(addr_options()))
    return result.scalars().all()


@router.post("", response_model=AddressOut, status_code=201)
async def create_address(data: AddressCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Address).where(Address.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Address with this name already exists")
    addr = Address(name=data.name)
    db.add(addr)
    await db.commit()
    result = await db.execute(
        select(Address).where(Address.id == addr.id).options(addr_options())
    )
    return result.scalar_one()


@router.get("/{address_id}", response_model=AddressOut)
async def get_address(address_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Address).where(Address.id == address_id).options(addr_options())
    )
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    return addr


@router.patch("/{address_id}", response_model=AddressOut)
async def update_address(
    address_id: int, data: AddressUpdate, db: AsyncSession = Depends(get_db)
):
    addr = await db.get(Address, address_id)
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    if data.name is not None and data.name != addr.name:
        existing = await db.execute(select(Address).where(Address.name == data.name))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Address with this name already exists")
        addr.name = data.name
    await db.commit()
    result = await db.execute(
        select(Address).where(Address.id == address_id).options(addr_options())
    )
    return result.scalar_one()


@router.delete("/{address_id}")
async def delete_address(address_id: int, db: AsyncSession = Depends(get_db)):
    addr = await db.get(Address, address_id)
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.delete(addr)
    await db.commit()
    return {"ok": True}
