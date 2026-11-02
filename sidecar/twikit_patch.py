"""Monkey-patch for twikit's ClientTransaction (twikit is unmaintained).

X changed the ondemand.s lookup on 2026-03-18: the HTML now stores the
chunk name map (`,N:"ondemand.s"`) separately from the hash map
(`,N:"hash"`), so the old single regex finds nothing and every request
dies with "Couldn't get KEY_BYTE indices". Mirrors upstream PRs #410/#416:
try the old inline format first, fall back to the two-step chunk lookup.
"""
import re

from twikit import user as _user_mod
from twikit.x_client_transaction import transaction as _tx

_CHUNK_NAME_REGEX = re.compile(r',(\d+):"ondemand\.s"')


async def _get_indices(self, home_page_response, session, headers):
    key_byte_indices = []
    response = self.validate_response(home_page_response) or self.home_page_response
    text = str(response)

    m = _tx.ON_DEMAND_FILE_REGEX.search(text)  # old inline format
    if not m:
        nm = _CHUNK_NAME_REGEX.search(text)    # new split format
        if nm:
            m = re.search(r',{}:"([0-9a-f]+)"'.format(nm.group(1)), text)
    if m:
        url = f"https://abs.twimg.com/responsive-web/client-web/ondemand.s.{m.group(1)}a.js"
        on_demand = await session.request(method="GET", url=url, headers=headers)
        for item in _tx.INDICES_REGEX.finditer(str(on_demand.text)):
            key_byte_indices.append(item.group(2))

    if not key_byte_indices:
        raise Exception("Couldn't get KEY_BYTE indices")
    key_byte_indices = list(map(int, key_byte_indices))
    return key_byte_indices[0], key_byte_indices[1:]


class _AD(dict):
    """Auto-vivifying dict: missing keys return an empty _AD, which falsies
    and iterates like an empty list — swallows X's removed legacy fields."""

    def __missing__(self, k):
        v = _AD()
        self[k] = v
        return v


def _ad(o):
    if isinstance(o, dict):
        return _AD({k: _ad(v) for k, v in o.items()})
    if isinstance(o, list):
        return [_ad(v) for v in o]
    return o


_orig_user_init = _user_mod.User.__init__


def _user_init(self, client, data):
    # X keeps dropping keys from user.legacy (urls, withheld_in_countries,
    # ...) — wrap it so every hard legacy['...'] access auto-defaults.
    if isinstance(data, dict) and not isinstance(data.get("legacy"), _AD):
        data["legacy"] = _ad(data.get("legacy"))
    return _orig_user_init(self, client, data)


def apply() -> None:
    _tx.ClientTransaction.get_indices = _get_indices
    _user_mod.User.__init__ = _user_init
