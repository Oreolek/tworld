
class MessageException(Exception):
    """An exception that generally means "Fail, and display this text back
    to the user." This is used in various contexts in both tweb and tworld.
    """
    pass

class ErrorMessageException(MessageException):
    """An exception that means "Fail, and display this text back to the
    user as an error message."
    """
    pass

# The following are only used during script code execution, and could
# be moved to two.* somewhere.

class SymbolError(LookupError):
    """Failure to find a symbol, when executing script code.
    """
    pass

class ExecutionException(Exception):
    """Internal code-flow exceptions in the script interpreter.
    """
    pass

class ReturnException(ExecutionException):
    pass

class LoopBodyException(ExecutionException):
    pass

class BreakException(LoopBodyException):
    pass

class ContinueException(LoopBodyException):
    pass
