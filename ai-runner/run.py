"""Start the private Python image processor using the automatically loaded .env."""

import uvicorn
from core import config


if __name__ == "__main__":
    # Function: Read the port from config after .env has been loaded.
    # The internal runner must never bind to a public network interface.
    uvicorn.run(
        "api.routes:app",
        host="127.0.0.1",
        port=config.RUNNER_PORT,
        workers=1,
        reload=False,
    )
