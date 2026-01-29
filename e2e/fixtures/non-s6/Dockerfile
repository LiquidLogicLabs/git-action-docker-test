FROM alpine:3.20

# Keep the container running and emit a startup line.
CMD ["sh", "-c", "echo 'non-s6 fixture started' && tail -f /dev/null"]

# Simple always-healthy healthcheck so the action can validate healthchecks.
HEALTHCHECK --interval=1s --timeout=1s --start-period=1s --retries=5 \
  CMD sh -c 'exit 0'
