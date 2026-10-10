"""Expected processing error with stable HTTP status and error code."""

class RunnerError(Exception):
    """Error returned to the Spring client without leaking internal file paths."""
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
