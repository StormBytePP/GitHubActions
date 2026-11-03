import json
import shlex
import sys


def main():
    lexer = shlex.shlex(sys.argv[1], posix=True)
    lexer.whitespace_split = True
    lexer.commenters = ""
    lexer.escape = ""
    try:
        arguments = list(lexer)
    except ValueError as error:
        print(f"::error::Invalid {sys.argv[2]}: {error}", file=sys.stderr)
        return 1
    print(json.dumps(arguments))
    return 0


if __name__ == "__main__":
    sys.exit(main())
