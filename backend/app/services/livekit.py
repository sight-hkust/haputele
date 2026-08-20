from __future__ import annotations

import asyncio
import logging
import threading
from datetime import timedelta

from livekit import api

from ..config import settings
from ..errors import unprocessable

_logger = logging.getLogger("haputele.livekit")


def mint_token(room: str, identity: str, name: str) -> tuple[str, str]:
    if not (settings.LIVEKIT_URL and settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET):
        raise unprocessable("livekit_not_configured")

    jwt = (
        api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(name)
        .with_ttl(timedelta(hours=2))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )
    return jwt, settings.LIVEKIT_URL


def room_for_appointment(appointment_id: int) -> str:
    return f"appt-{appointment_id}"


def _livekit_configured() -> bool:
    return bool(
        settings.LIVEKIT_URL
        and settings.LIVEKIT_API_KEY
        and settings.LIVEKIT_API_SECRET
    )


def _http_url(url: str) -> str:
    """RoomService talks HTTP(S); browser clients talk WSS on the same host."""
    if url.startswith("wss://"):
        return "https://" + url[len("wss://") :]
    if url.startswith("ws://"):
        return "http://" + url[len("ws://") :]
    return url


def delete_room_best_effort(appointment_id: int) -> None:
    """Close the appointment's LiveKit room if one exists.

    Cancel must succeed even when LiveKit is unconfigured, the room is already
    gone, or the API call fails — so this never raises and never blocks the
    request on the network.
    """
    if not _livekit_configured():
        return
    room = room_for_appointment(appointment_id)
    threading.Thread(
        target=_delete_room_sync,
        args=(room,),
        name=f"livekit-delete-{room}",
        daemon=True,
    ).start()


def _delete_room_sync(room: str) -> None:
    try:
        asyncio.run(_delete_room(room))
    except Exception:
        _logger.warning("failed to delete LiveKit room %s", room, exc_info=True)


async def _delete_room(room: str) -> None:
    lk = api.LiveKitAPI(
        _http_url(settings.LIVEKIT_URL),
        settings.LIVEKIT_API_KEY,
        settings.LIVEKIT_API_SECRET,
    )
    try:
        await lk.room.delete_room(api.DeleteRoomRequest(room=room))
    finally:
        await lk.aclose()
