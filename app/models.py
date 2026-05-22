from datetime import time
from typing import Optional

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Address(Base):
    __tablename__ = "addresses"
    __table_args__ = (UniqueConstraint("name", name="uq_addresses_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str]

    rooms: Mapped[list["Room"]] = relationship(
        back_populates="address", cascade="all, delete-orphan"
    )


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("address_id", "name", name="uq_rooms_address_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    address_id: Mapped[int] = mapped_column(ForeignKey("addresses.id"))
    name: Mapped[str]

    address: Mapped["Address"] = relationship(back_populates="rooms")
    cameras: Mapped[list["Camera"]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        UniqueConstraint("name", name="uq_profiles_name"),
        UniqueConstraint("username", name="uq_profiles_username"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str]
    username: Mapped[str]
    password: Mapped[str]

    cameras: Mapped[list["Camera"]] = relationship(back_populates="profile")


class Camera(Base):
    __tablename__ = "cameras"
    __table_args__ = (UniqueConstraint("ip_address", "port", "stream_path", name="uq_cameras_endpoint"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str]
    ip_address: Mapped[str]
    port: Mapped[int] = mapped_column(default=554)
    stream_path: Mapped[str] = mapped_column(default="/stream")
    description: Mapped[Optional[str]] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    profile_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("profiles.id"), nullable=True
    )
    room_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("rooms.id"), nullable=True
    )

    profile: Mapped[Optional["Profile"]] = relationship(back_populates="cameras")
    room: Mapped[Optional["Room"]] = relationship(back_populates="cameras")
    bindings: Mapped[list["ScheduleBinding"]] = relationship(
        back_populates="camera", cascade="all, delete-orphan"
    )

    @property
    def stream_url(self) -> str:
        if self.profile is not None:
            return (
                f"rtsp://{self.profile.username}:{self.profile.password}"
                f"@{self.ip_address}:{self.port}{self.stream_path}"
            )
        return f"rtsp://{self.ip_address}:{self.port}{self.stream_path}"


class ScheduleTemplate(Base):
    __tablename__ = "schedule_templates"
    __table_args__ = (
        UniqueConstraint("day_of_week", "start_time", "end_time", name="uq_schedule_templates_slot"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str]
    day_of_week: Mapped[int]
    start_time: Mapped[time]
    end_time: Mapped[time]
    is_active: Mapped[bool] = mapped_column(default=True)

    bindings: Mapped[list["ScheduleBinding"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class ScheduleBinding(Base):
    __tablename__ = "schedule_bindings"
    __table_args__ = (UniqueConstraint("template_id", "camera_id", name="uq_schedule_bindings_template_camera"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("schedule_templates.id"))
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id"))

    template: Mapped["ScheduleTemplate"] = relationship(back_populates="bindings")
    camera: Mapped["Camera"] = relationship(back_populates="bindings")
