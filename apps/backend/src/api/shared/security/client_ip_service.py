from __future__ import annotations

from ipaddress import IPv4Address, IPv6Address, ip_address, ip_network

from fastapi import Request

from api.config import get_settings


def extract_client_ip(request: Request) -> str:
    peer_ip = _peer_ip(request)
    if not _is_trusted_proxy(peer_ip):
        return peer_ip

    forwarded_for = _first_forwarded_for(request.headers.get("x-forwarded-for"))
    if forwarded_for is not None:
        return forwarded_for

    real_ip = _valid_ip(request.headers.get("x-real-ip"))
    if real_ip is not None:
        return str(real_ip)

    return peer_ip


def _peer_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _is_trusted_proxy(peer_ip: str) -> bool:
    address = _valid_ip(peer_ip)
    if address is None:
        return False

    for trusted in get_settings().trusted_proxy_ips:
        if address in ip_network(trusted, strict=False):
            return True
    return False


def _first_forwarded_for(value: str | None) -> str | None:
    if not value:
        return None
    first = value.split(",", 1)[0].strip()
    address = _valid_ip(first)
    return str(address) if address is not None else None


def _valid_ip(value: str | None) -> IPv4Address | IPv6Address | None:
    if not value:
        return None
    try:
        return ip_address(value.strip())
    except ValueError:
        return None
