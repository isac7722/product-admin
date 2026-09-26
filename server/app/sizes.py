"""Managed size vocabulary, legacy migration, and reviewed product code changes."""

import unicodedata
from sqlite3 import Connection

from fastapi import APIRouter, HTTPException
from pydantic import Field, field_validator

from app.models import Model
from app.storage import all_docs, get_doc, record_history, save_doc, transaction

router = APIRouter(prefix="/api/sizes", tags=["sizes"])


class Size(Model):
    """Editable size settings and the exact product versions reviewed for a rename."""

    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=240)
    sort_order: int = Field(default=0, ge=0, le=9999)
    active: bool = True
    product_versions: dict[str, int] | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        """Use the same code-safe labels as products, including Q/K."""
        value = unicodedata.normalize("NFC", value).strip()
        if not value or "-" in value or any(unicodedata.category(c).startswith("C") for c in value):
            raise ValueError("사이즈 이름은 비어 있거나 하이픈(-)·제어문자를 포함할 수 없습니다.")
        return value


def migrate_sizes() -> None:
    """Link legacy products once without changing labels, codes, IDs, or other data."""
    with transaction() as db:
        sizes = {s["name"]: s for s in all_docs(db, "sizes")}
        for product in all_docs(db, "products"):
            if product.get("size_id"):
                continue
            name = product["size"]
            if name not in sizes:
                sizes[name] = save_doc(
                    db, "sizes", {"name": name, "description": "", "sort_order": len(sizes), "active": True}
                )
            save_doc(db, "products", {**product, "size_id": sizes[name]["id"]}, product["id"], product["version"])


def resolve_size(db: Connection, name: str, identifier: str | None, old: dict | None) -> dict:
    """Reject unregistered or inactive selections while allowing unchanged retired sizes."""
    size = (
        get_doc(db, "sizes", identifier)
        if identifier
        else next((s for s in all_docs(db, "sizes") if s["name"] == name), None)
    )
    if not size:
        raise HTTPException(
            422, f"등록되지 않은 사이즈 '{name}'입니다. 설정에서 추가하거나 등록된 사이즈를 선택하세요."
        )
    if size["name"] != name:
        raise HTTPException(409, "사이즈 이름이 변경되었습니다. 목록을 새로고침하고 다시 선택하세요.")
    if not size["active"] and not (old and old.get("size_id") == size["id"]):
        raise HTTPException(422, "사용 중지된 사이즈입니다. 사용 중인 사이즈를 선택하세요.")
    return size


def size_preview(db: Connection, identifier: str, payload: Size) -> dict:
    """Validate settings and return the complete set of affected product codes."""
    old = get_doc(db, "sizes", identifier)
    if old["version"] != payload.version:
        raise HTTPException(
            409, {"message": "사이즈 설정이 변경되었습니다. 새로고침 후 다시 확인하세요.", "current": old}
        )
    if any(s["id"] != identifier and s["name"].casefold() == payload.name.casefold() for s in all_docs(db, "sizes")):
        raise HTTPException(409, "이미 등록된 사이즈 이름입니다. 사용 중지된 항목도 확인하세요.")
    products = all_docs(db, "products")
    affected = [p for p in products if p.get("size_id") == identifier]
    other_codes = {p["code"] for p in products if p.get("size_id") != identifier}
    changes = []
    for product in affected:
        code = f"{product['prefix']}-{product['color']}-{payload.name}"
        if code in other_codes:
            raise HTTPException(409, f"제품코드 {code}가 이미 있습니다. 다른 사이즈 이름을 사용하세요.")
        changes.append({"id": product["id"], "version": product["version"], "before": product["code"], "after": code})
    return {"products": changes, "product_versions": {p["id"]: p["version"] for p in affected}}


@router.get("")
def list_sizes() -> list[dict]:
    """Include inactive settings so existing products can still display their values."""
    with transaction() as db:
        products = all_docs(db, "products")
        counts: dict[str, int] = {}
        for product in products:
            key = product.get("size_id", "")
            counts[key] = counts.get(key, 0) + 1
        return [
            {**s, "usage_count": counts.get(s["id"], 0)}
            for s in sorted(all_docs(db, "sizes"), key=lambda s: (s["sort_order"], s["name"]))
        ]


@router.post("", status_code=201)
def create_size(payload: Size) -> dict:
    """Add a unique option explicitly; products never create options implicitly."""
    with transaction() as db:
        if any(s["name"].casefold() == payload.name.casefold() for s in all_docs(db, "sizes")):
            raise HTTPException(409, "이미 등록된 사이즈 이름입니다. 사용 중지된 항목도 확인하세요.")
        return save_doc(db, "sizes", payload.model_dump(exclude={"version", "product_versions"}))


@router.post("/{identifier}/preview")
def preview_size(identifier: str, payload: Size) -> dict:
    """Review name changes before updating linked product codes."""
    with transaction() as db:
        return size_preview(db, identifier, payload)


@router.put("/{identifier}")
def update_size(identifier: str, payload: Size) -> dict:
    """Rename a size and every linked product atomically after an up-to-date preview."""
    with transaction() as db:
        preview = size_preview(db, identifier, payload)
        old = get_doc(db, "sizes", identifier)
        if old["name"] != payload.name:
            if preview["products"] and payload.product_versions != preview["product_versions"]:
                raise HTTPException(
                    409, "연결된 제품이 변경되었거나 코드 변경 확인이 필요합니다. 미리보기를 다시 확인하세요."
                )
            for change in preview["products"]:
                product = get_doc(db, "products", change["id"])
                updated = save_doc(
                    db,
                    "products",
                    {**product, "size": payload.name, "code": change["after"]},
                    product["id"],
                    product["version"],
                )
                record_history(db, product["id"], product, updated, ["size", "code"], "사이즈 설정 이름 변경")
        saved = save_doc(
            db, "sizes", payload.model_dump(exclude={"version", "product_versions"}), identifier, payload.version
        )
        record_history(db, identifier, old, saved, ["name", "description", "sort_order", "active"], "사이즈 설정 변경")
        return saved
