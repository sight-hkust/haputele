from fastapi import HTTPException


def http_error(status: int, code: str, **extra) -> HTTPException:
    body = {"error": code, **extra}
    return HTTPException(status_code=status, detail=body)


def conflict(code: str, **extra) -> HTTPException:
    return http_error(409, code, **extra)


def unprocessable(code: str, **extra) -> HTTPException:
    return http_error(422, code, **extra)


def forbidden(code: str = "forbidden") -> HTTPException:
    return http_error(403, code)


def not_found(code: str = "not_found") -> HTTPException:
    return http_error(404, code)


def unauthorized(code: str = "unauthorized") -> HTTPException:
    return http_error(401, code)
