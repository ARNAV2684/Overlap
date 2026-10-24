# generator.Dockerfile — The match generator as a Container Apps job
#
# Purpose: one job execution plays one synthetic match into Event Hubs at 20x; the web app's start button starts it
# Inputs:  build context = generator/; OVERLAP_FIRST_MATCH (the match number, set per execution by /api/start-match),
#          OVERLAP_EVENTHUBS_NAMESPACE and the identity settings from the job's environment
# Outputs: image <registry>/generator
# Spec:    generator/specs/live-and-batch.md §5; web/specs/realtime.md §8

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1 MPLBACKEND=Agg OVERLAP_FIRST_MATCH=3000
WORKDIR /app/generator
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
CMD ["sh", "-c", "exec uv run --frozen --no-dev python cli.py live --hubs azure --speed 20 --home CAL --away DTN --first-match \"$OVERLAP_FIRST_MATCH\" --seed \"$OVERLAP_FIRST_MATCH\""]
