"""Lightweight character-motion design preflight; never a visual acceptance gate.

``validate_motion_contract(contract, prompt)`` returns ``list[str]``. Historical
contracts without schemaVersion are legacy 1; new prepare/submit calls must use
``require_schema_version=2``. Stop on any errors. No files, network or API calls.
Stationary layers are valid when described. This does not demand movement of
every body part, infer anatomy, or certify the resulting video.
"""

from collections.abc import Mapping
import re


REQUIRED_FIELDS = (
    "intent", "primaryMotion", "supportChain", "gazeHead", "secondaryMotion",
    "anchors", "timingLayers", "loopBoundary", "reviewOrder",
)
PROP_FIELDS = ("orientation", "use", "contact", "force")
MAX_PROMPT_CHARACTERS = 7000

_PARTS = {
    "head": r"\bhead\b|头部|头颈|头",
    "shoulders": r"\bshoulders?\b|双肩|肩部|肩膀|肩",
    "torso": r"\b(?:body|torso|trunk|chest)\b|躯干|上半身|身体|胸腹|胸部",
}
_FREEZE = re.compile(
    r"\b(?:frozen|freeze|freezing|immobile|immobilize|motionless)\b"
    r"|\b(?:stay|stays|remain|remains|keep|keeps|hold|holds|are|is|be|must|should)"
    r"\b.{0,100}?\b(?:still|fixed|locked|planted|stationary|static)\b"
    r"|\b(?:lock|fix)\b.{0,80}?\b(?:head|shoulders?|body|torso|chest)\b"
    r"|\b(?:do\s+not|don't|never|must\s+not)\s+move\b"
    r"|冻结|锁死|完全静止|保持不动|一动不动|固定不动|禁止.{0,24}运动|不要.{0,24}移动",
    re.IGNORECASE,
)
_NEGATED_FREEZE = re.compile(
    r"\b(?:do\s+not|don't|never|must\s+not|avoid|without|no)"
    r"\s+(?:explicitly\s+|entirely\s+|completely\s+)?"
    r"(?:freeze|freezing|lock|locking|immobilize|immobilizing)\b"
    r"|\b(?:not|never)\s+(?:frozen|immobile|motionless)\b"
    r"|(?:不要|不得|不可|避免|不应|不能).{0,12}(?:冻结|锁死|完全静止|保持不动|固定不动)",
    re.IGNORECASE,
)
_PROPERTY = re.compile(
    r"\b(?:head|shoulders?|body|torso|chest)\s+"
    r"(?:size|scale|volume|width|proportions?|colou?r|identity|registration)\b"
    r"|(?:头部|头|双肩|肩部|肩|身体|躯干|胸部)(?:大小|尺度|体积|宽度|比例|颜色)",
    re.IGNORECASE,
)


def _has_content(value):
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, Mapping):
        return any(_has_content(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_has_content(item) for item in value)
    # A boolean or number alone does not describe a motion-design decision.
    return False


def validate_motion_contract(contract, prompt, *, require_schema_version=None):
    """Return design errors; an empty list is NOT artwork/motion approval.

    The original nine fields accept nonblank text or nested lists/mappings
    containing text. Schema 2 adds propInteraction: exactly "none" for no prop,
    or a mapping describing orientation, use, contact and force. Missing version
    means legacy 1 for immutable-history verification only. New callers must
    request schema 2 explicitly; no historical prompt/spec should be rewritten.
    Optional ``globalMotion`` defaults to True; False is reserved for an
    explicitly intentional local/static performance. The lexical freeze guard
    catches common English/Chinese directives, not arbitrary paraphrases.
    """
    if not isinstance(contract, Mapping):
        return ["motion contract must be a mapping"]
    errors = [
        f"motion contract missing or empty field: {field}"
        for field in REQUIRED_FIELDS if not _has_content(contract.get(field))
    ]
    version = contract.get("schemaVersion", 1)
    if type(version) is not int or version not in (1, 2):
        errors.append("motion contract schemaVersion must be integer 1 or 2")
    if require_schema_version is not None:
        if type(require_schema_version) is not int or require_schema_version not in (1, 2):
            errors.append("require_schema_version must be integer 1 or 2")
        elif version != require_schema_version:
            errors.append(f"motion contract requires schemaVersion {require_schema_version}; got {version!r}")
    if version == 2:
        prop = contract.get("propInteraction")
        no_prop = isinstance(prop, str) and prop.strip().lower() == "none"
        if not no_prop:
            if not isinstance(prop, Mapping):
                errors.append("schema 2 propInteraction must be 'none' or a mapping of orientation/use/contact/force")
            else:
                errors.extend(
                    f"schema 2 propInteraction missing or empty field: {field}"
                    for field in PROP_FIELDS if not _has_content(prop.get(field))
                )
    global_motion = contract.get("globalMotion", True)
    if not isinstance(global_motion, bool):
        errors.append("motion contract globalMotion must be a boolean")
    if not isinstance(prompt, str) or not prompt.strip():
        errors.append("motion prompt must be nonempty text")
        return errors
    if len(prompt) > MAX_PROMPT_CHARACTERS:
        errors.append(
            f"motion prompt exceeds H3 maximum {MAX_PROMPT_CHARACTERS} characters: "
            f"got {len(prompt)}"
        )

    if global_motion is not False:
        frozen = set()
        # Keep comma-separated body-part lists together. Separate clauses can
        # freeze different parts; collect their union rather than just one list.
        for clause in re.split(
            r"[.;\n。；]+|\b(?:while|whereas|but|although)\b|但是|但|而",
            prompt, flags=re.IGNORECASE,
        ):
            clause = _PROPERTY.sub("", clause)
            if _NEGATED_FREEZE.search(clause) or not _FREEZE.search(clause):
                continue
            frozen.update(part for part, pattern in _PARTS.items()
                          if re.search(pattern, clause, re.IGNORECASE))
        if frozen == set(_PARTS):
            errors.append(
                "global motion conflicts with explicitly freezing all head, "
                "shoulders and torso; preserve scale/anchors without locking "
                "the whole support chain"
            )
    return errors
