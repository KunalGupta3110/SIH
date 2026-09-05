"""Compatibility entry point for run_ecosystem.py.

The completed backend lives in services.api_gateway.server. Re-exporting the
same FastAPI app keeps older launch commands working without maintaining two
different API implementations.
"""

from services.api_gateway.server import app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
