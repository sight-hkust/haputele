from datetime import timedelta

from livekit import api

from ..config import settings
from ..errors import unprocessable


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
