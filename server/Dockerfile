FROM python:3.12-slim-bookworm AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.1 /uv /usr/local/bin/uv
WORKDIR /app/server
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
COPY server/pyproject.toml server/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/server/.venv/bin:$PATH" \
    PRODUCT_ADMIN_STORAGE=/app/.local
WORKDIR /app/server
COPY --from=build /app/server/.venv ./.venv
COPY server/app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
