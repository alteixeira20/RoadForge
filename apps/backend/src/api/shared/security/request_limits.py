"""Shared request body limits."""

# Matches the browser import limit and nginx's request size limit.
REQUEST_BODY_MAX_BYTES = 5 * 1024 * 1024
