"""Validation errors must never echo submitted passwords or provider keys."""

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def validation_error(request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
                for error in exc.errors()
            ]
        },
    )
