# stats.Dockerfile — The stats engine as a Container App
#
# Purpose: one always-on container that reads match events from Event Hubs and writes stats and moments to Cosmos DB
# Inputs:  build context = stats/; Azure settings from the container's environment (infra/modules/container-apps.bicep)
# Outputs: image <registry>/stats
# Spec:    infra/specs/resources.md §3

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1
WORKDIR /app/stats
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
CMD ["uv", "run", "--frozen", "--no-dev", "python", "main.py", "live"]
