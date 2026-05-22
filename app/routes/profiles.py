from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.models import Profile
from app.schemas import ProfileCreate, ProfileUpdate, ProfileOut

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("", response_model=List[ProfileOut])
async def list_profiles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile))
    return result.scalars().all()


@router.post("", response_model=ProfileOut, status_code=201)
async def create_profile(data: ProfileCreate, db: AsyncSession = Depends(get_db)):
    existing_name = await db.execute(select(Profile).where(Profile.name == data.name))
    if existing_name.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Profile with this name already exists")
    existing_username = await db.execute(select(Profile).where(Profile.username == data.username))
    if existing_username.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Profile with this username already exists")
    profile = Profile(**data.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.patch("/{profile_id}", response_model=ProfileOut)
async def update_profile(
    profile_id: int, data: ProfileUpdate, db: AsyncSession = Depends(get_db)
):
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "name" and value != profile.name:
            existing = await db.execute(select(Profile).where(Profile.name == value))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Profile with this name already exists")
        if field == "username" and value != profile.username:
            existing = await db.execute(select(Profile).where(Profile.username == value))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Profile with this username already exists")
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}")
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.delete(profile)
    await db.commit()
    return {"ok": True}
